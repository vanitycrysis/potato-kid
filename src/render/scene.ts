import { Application, Container, FederatedPointerEvent, Graphics, type Texture } from 'pixi.js';
import type { Content } from '../content/types';
import { Game, type Command, type GameEvent } from '../sim/game';
import { createRng } from '../sim/rng';
import { STEP, type Bounds, type Kid } from '../sim/world';
import { KidView } from './kidView';
import { buildPlaceholderTextures } from './placeholderArt';

/** World layout (ENGINEERING_PLAN.md §5): 1080 wide, 1920 safe band, 240 bleed above and below. */
export const WORLD_WIDTH = 1080;
export const SAFE_HEIGHT = 1920;
export const BLEED = 240;
const HUD_TOP = 160;
const TRAY_BOTTOM = 280;
const SIDE_MARGIN = 70;

export const PLAY_BOUNDS: Bounds = {
  minX: SIDE_MARGIN,
  minY: HUD_TOP + 300, // below the Garden and leaving room for a kid's height
  maxX: WORLD_WIDTH - SIDE_MARGIN,
  maxY: SAFE_HEIGHT - TRAY_BOTTOM,
};

/** The Garden sits top-centre; kids emerge just below it. */
export const GARDEN = { x: WORLD_WIDTH / 2, y: HUD_TOP + 200 };

/** How far above the finger a held kid floats, so the finger doesn't hide it (world units). */
const HOLD_LIFT = 70;

interface Prev {
  x: number;
  y: number;
}

interface Drag {
  kidId: number;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
}

/**
 * Owns the Pixi stage for the map. Runs the fixed-step game, turns pointer
 * input into commands, and interpolates kid positions between steps.
 */
export class MapScene {
  readonly game: Game;
  /** Called with every sim event, after the scene has handled it. */
  onEvent: (e: GameEvent) => void = () => {};
  private readonly camera = new Container();
  private readonly kidLayer = new Container({ sortableChildren: true });
  private readonly views = new Map<number, KidView>();
  private readonly prev = new Map<number, Prev>();
  private readonly textures: Map<string, Texture>;
  private readonly pending: Command[] = [];
  private drag: Drag | undefined;
  private acc = 0;

  constructor(
    private readonly app: Application,
    content: Content,
    seed: number,
  ) {
    this.game = new Game(content, PLAY_BOUNDS, GARDEN, seed);
    this.textures = buildPlaceholderTextures(app.renderer, content.kids);
    this.camera.addChild(drawPlaceholderBackground(), drawPlaceholderGarden(), this.kidLayer);
    app.stage.addChild(this.camera);
    for (const kid of this.game.state.world.kids) this.addView(kid);

    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;
    app.stage.on('globalpointermove', (e) => this.onPointerMove(e));
    app.stage.on('pointerup', (e) => this.endDrag(e, 'drop'));
    app.stage.on('pointerupoutside', (e) => this.endDrag(e, 'drop'));
    app.stage.on('pointercancel', (e) => this.endDrag(e, 'cancelDrag'));
    // Leaving the app mid-drag counts as a cancelled touch (plan §2).
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.drag) this.cancelActiveDrag();
    });

    this.layout();
    app.renderer.on('resize', () => this.layout());
    app.ticker.add((t) => this.frame(t.deltaMS / 1000));
  }

  /** Test hook: world → screen (CSS px) for a kid's ground point. */
  screenPointOf(kidId: number): { x: number; y: number } | undefined {
    const view = this.views.get(kidId);
    if (!view) return undefined;
    const p = this.camera.toGlobal(view.root.position);
    return { x: p.x, y: p.y };
  }

  /** Debug/test hook (only exposed with `?debug=1`): place a kid at a world point. */
  debugAdd(type: string, x: number, y: number): number {
    const kid = this.game.debugAddKid(type, x, y);
    this.addView(kid);
    return kid.id;
  }

  /** Test hook: world → screen for an arbitrary world point. */
  worldToScreen(x: number, y: number): { x: number; y: number } {
    const p = this.camera.toGlobal({ x, y });
    return { x: p.x, y: p.y };
  }

  /**
   * Fits the whole 1080 × 1920 safe band on screen and centres it. On phones in
   * portrait the width is the limit (the usual case); on short or landscape
   * viewports the height is, and the background bleed fills the sides. This
   * keeps every playable position visible (Codex review, PR #4).
   */
  private layout(): void {
    const { width, height } = this.app.screen;
    const scale = Math.min(width / WORLD_WIDTH, height / SAFE_HEIGHT);
    this.camera.scale.set(scale);
    this.camera.x = (width - WORLD_WIDTH * scale) / 2;
    this.camera.y = (height - SAFE_HEIGHT * scale) / 2;
    this.app.stage.hitArea = this.app.screen;
  }

  private addView(kid: Kid): KidView {
    const view = new KidView(kid, this.textures);
    view.root.eventMode = 'static';
    view.root.cursor = 'grab';
    view.root.on('pointerdown', (e) => this.startDrag(kid.id, e));
    this.views.set(kid.id, view);
    this.prev.set(kid.id, { x: kid.x, y: kid.y });
    this.kidLayer.addChild(view.root);
    return view;
  }

  private removeView(kidId: number): void {
    this.views.get(kidId)?.destroy();
    this.views.delete(kidId);
    this.prev.delete(kidId);
  }

  // --- Input -------------------------------------------------------------

  private toWorld(e: FederatedPointerEvent): { x: number; y: number } {
    // Uses the camera transform of the last rendered frame: what you see is what you hit.
    const p = this.camera.toLocal(e.global);
    return { x: p.x, y: p.y };
  }

  private startDrag(kidId: number, e: FederatedPointerEvent): void {
    if (this.drag) return; // one kid at a time; a second finger is ignored
    const kid = this.game.state.world.kids.find((k) => k.id === kidId);
    if (!kid) return;
    const w = this.toWorld(e);
    this.drag = { kidId, pointerId: e.pointerId, startX: kid.x, startY: kid.y, x: w.x, y: w.y + HOLD_LIFT };
    this.pending.push({ type: 'pickUp', kidId });
    this.views.get(kidId)?.setHeld(true);
  }

  private onPointerMove(e: FederatedPointerEvent): void {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    const w = this.toWorld(e);
    this.drag.x = w.x;
    this.drag.y = w.y + HOLD_LIFT;
  }

  private endDrag(e: FederatedPointerEvent, kind: 'drop' | 'cancelDrag'): void {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    if (kind === 'cancelDrag') {
      this.cancelActiveDrag();
      return;
    }
    const w = this.toWorld(e);
    this.finishDrag({ type: 'drop', kidId: this.drag.kidId, x: w.x, y: w.y + HOLD_LIFT });
  }

  private cancelActiveDrag(): void {
    if (!this.drag) return;
    const { kidId, startX, startY } = this.drag;
    this.finishDrag({ type: 'cancelDrag', kidId, x: startX, y: startY });
  }

  private finishDrag(cmd: Command): void {
    if (!this.drag) return;
    this.views.get(this.drag.kidId)?.setHeld(false);
    this.pending.push(cmd);
    this.drag = undefined;
  }

  // --- Frame loop --------------------------------------------------------

  private frame(dt: number): void {
    // Clamp long frames (tab switch) so the sim never spirals. Long absences are
    // offline catch-up's job (M3), not the frame loop's.
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= STEP) {
      for (const k of this.game.state.world.kids) this.prev.set(k.id, { x: k.x, y: k.y });
      const events = this.game.step(this.pending.splice(0));
      for (const e of events) this.handle(e);
      this.acc -= STEP;
    }
    const alpha = this.acc / STEP;
    for (const k of this.game.state.world.kids) {
      const view = this.views.get(k.id);
      if (!view) continue;
      if (this.drag?.kidId === k.id) {
        view.update(this.drag.x, this.drag.y, false, 0, dt);
        continue;
      }
      const p = this.prev.get(k.id) ?? k;
      view.update(p.x + (k.x - p.x) * alpha, p.y + (k.y - p.y) * alpha, k.idle === 0 && !k.held, Math.cos(k.heading), dt);
    }
  }

  private handle(e: GameEvent): void {
    switch (e.type) {
      case 'spawned':
        this.addView(e.kid).popIn();
        break;
      case 'fused':
        for (const p of e.parents) {
          if (this.drag?.kidId === p.id) this.drag = undefined;
          this.removeView(p.id);
        }
        this.addView(e.child).popIn();
        break;
      case 'pickedUp':
      case 'dropped':
        break;
    }
    this.onEvent(e);
  }
}

/** Stand-in for ChatGPT's garden plate: cream ground, sage blobs in the bleed and margins. */
function drawPlaceholderBackground(): Graphics {
  const g = new Graphics();
  // Generous side bleed for landscape / wide viewports (fit-by-height).
  g.rect(-WORLD_WIDTH * 2, -BLEED, WORLD_WIDTH * 5, SAFE_HEIGHT + BLEED * 2).fill('#f4efe2');
  const rng = createRng(2024);
  for (let i = 0; i < 26; i++) {
    const edge = rng.next() < 0.5;
    const x = edge ? (rng.next() < 0.5 ? rng.next() * 60 : WORLD_WIDTH - rng.next() * 60) : rng.next() * WORLD_WIDTH;
    const y = edge ? rng.next() * SAFE_HEIGHT : rng.next() < 0.5 ? -BLEED + rng.next() * 380 : SAFE_HEIGHT - 140 + rng.next() * 380;
    g.ellipse(x, y, 30 + rng.next() * 40, 16 + rng.next() * 20).fill({ color: '#b9c9a3', alpha: 0.6 });
  }
  return g;
}

/** Stand-in for `building_garden`: a doodle soil mound with sprouts. */
function drawPlaceholderGarden(): Graphics {
  const ink = { color: '#1a1a1a', width: 6, cap: 'round' as const, join: 'round' as const };
  const g = new Graphics();
  const { x, y } = GARDEN;
  g.ellipse(x, y, 170, 60).fill('#a67c52').stroke(ink);
  for (const dx of [-90, -30, 30, 90]) {
    g.moveTo(x + dx, y - 20).lineTo(x + dx, y - 70).stroke(ink);
    g.ellipse(x + dx - 14, y - 72, 16, 9).fill('#8fbf6a').stroke(ink);
    g.ellipse(x + dx + 14, y - 76, 16, 9).fill('#8fbf6a').stroke(ink);
  }
  return g;
}
