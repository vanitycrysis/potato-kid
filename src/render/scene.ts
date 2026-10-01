import { Application, Container, FederatedPointerEvent, Graphics, type Texture } from 'pixi.js';
import type { Content } from '../content/types';
import { Game, type Command, type GameEvent } from '../sim/game';
import { clampToBounds, STEP, type Bounds, type Kid } from '../sim/world';
import { innerBounds } from '../sim/space';
import { KidView } from './kidView';
import type { Art } from './art';
import { buildPlaceholderTextures } from './placeholderArt';

/**
 * Scrollable world (D-040): about 2 × 2 portrait screens. The camera shows a
 * 1080-unit-wide window on portrait phones and pans over the rest.
 */
export const WORLD_WIDTH = 2160;
export const WORLD_HEIGHT = 3840;
/** Width of world shown across a portrait screen; height follows the screen's aspect. */
const VIEW_WIDTH = 1080;
/** On short/landscape screens, at least this much world height stays visible. */
const VIEW_MIN_HEIGHT = 1920;

/** The Garden sits near the top centre of the world; kids emerge just below it. */
export const GARDEN = { x: WORLD_WIDTH / 2, y: 360 };

/** Where kids can be: the whole world below the Garden (bodies stay inside, D-039). */
export const PLAY_BOUNDS: Bounds = { minX: 0, minY: GARDEN.y + 120, maxX: WORLD_WIDTH, maxY: WORLD_HEIGHT };

/** How far above the finger a held kid floats, so the finger doesn't hide it (world units; y grows downward, so it is subtracted). */
const HOLD_LIFT = 70;
/** Dragging a kid within this many CSS px of a screen edge scrolls the map that way. */
const EDGE_ZONE = 56;
/** Edge auto-scroll speed at the very edge, world units per second. */
const EDGE_SPEED = 1100;
/** Pan inertia decay rate per second (higher stops sooner). */
const PAN_FRICTION = 6;

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
  /** Last screen position of the dragging pointer, so edge scroll can keep the kid under it. */
  private dragScreen = { x: 0, y: 0 };
  /** Camera: world point at the screen's top-left, and world → CSS px scale. */
  private cam = { x: 0, y: 0, zoom: 1 };
  /** Screen size the camera was last laid out for, to keep the view centre across resizes. */
  private laidOut = { width: 0, height: 0 };
  private pan: { pointerId: number; lastX: number; lastY: number; vx: number; vy: number; lastT: number } | undefined;
  private panVelocity = { x: 0, y: 0 };
  /**
   * Kids released by the player whose drop/cancel the sim hasn't applied yet,
   * with where to keep drawing them meanwhile. Without this a released kid would
   * snap back to its pickup point for a frame, then slide (Codex review, PR #5).
   */
  private readonly placing = new Map<number, { x: number; y: number }>();
  private acc = 0;

  constructor(
    private readonly app: Application,
    content: Content,
    seed: number,
    art: Art = { kids: new Map() },
  ) {
    this.game = new Game(content, PLAY_BOUNDS, GARDEN, seed);
    // Real art wins per asset; anything not yet delivered stays a placeholder.
    this.textures = buildPlaceholderTextures(app.renderer, content.kids);
    for (const [name, tex] of art.kids) this.textures.set(name, tex);
    // Plain ground until Codex's map tiles and decor arrive (D-040, D-036).
    this.camera.addChild(drawGround(), drawPlaceholderGarden(), this.kidLayer);
    app.stage.addChild(this.camera);
    for (const kid of this.game.state.world.kids) this.addView(kid);

    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;
    // A press on empty ground pans the map; a press on a kid picks it up (the kid
    // handler stops propagation, so this only sees ground presses).
    app.stage.on('pointerdown', (e) => this.startPan(e));
    app.stage.on('globalpointermove', (e) => this.onPointerMove(e));
    app.stage.on('pointerup', (e) => this.endPointer(e, 'drop'));
    app.stage.on('pointerupoutside', (e) => this.endPointer(e, 'drop'));
    app.stage.on('pointercancel', (e) => this.endPointer(e, 'cancelDrag'));
    // Pixi doesn't forward a native pointercancel (e.g. the OS taking over a touch) to the
    // stage, which would leave the kid held forever (Codex review, PR #5).
    app.canvas.addEventListener('pointercancel', (e) => {
      if (this.drag && e.pointerId === this.drag.pointerId) this.cancelActiveDrag();
      if (this.pan && e.pointerId === this.pan.pointerId) this.pan = undefined;
    });
    // Leaving the app mid-drag counts as a cancelled touch (plan §2).
    // Panning is dropped too: the gesture's pointerup may never arrive, which would
    // otherwise lock all input after resume (Codex review, PR #11).
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      if (this.drag) this.cancelActiveDrag();
      this.pan = undefined;
      this.panVelocity = { x: 0, y: 0 };
    });

    this.layout();
    this.centerOn(GARDEN.x, GARDEN.y + 700);
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

  /** Moves the camera so world (x, y) is at the centre of the screen (clamped to the world). */
  centerOn(x: number, y: number): void {
    const { width, height } = this.app.screen;
    this.cam.x = x - width / this.cam.zoom / 2;
    this.cam.y = y - height / this.cam.zoom / 2;
    this.applyCamera();
  }

  /**
   * Zoom shows 1080 world units across a portrait screen; short or landscape screens
   * zoom out so at least 1920 units of height stay visible.
   */
  private layout(): void {
    const { width, height } = this.app.screen;
    // The centre must come from the *previous* viewport: app.screen already has the new size
    // (Codex review, PR #11). The first layout has no previous viewport, so centre is moot.
    const centre = {
      x: this.cam.x + this.laidOut.width / this.cam.zoom / 2,
      y: this.cam.y + this.laidOut.height / this.cam.zoom / 2,
    };
    this.laidOut = { width, height };
    this.cam.zoom = Math.min(width / VIEW_WIDTH, height / VIEW_MIN_HEIGHT);
    this.app.stage.hitArea = this.app.screen;
    this.centerOn(centre.x, centre.y);
  }

  /** Keeps the view inside the world (centred if the world is smaller than the view). */
  private applyCamera(): void {
    const { width, height } = this.app.screen;
    const z = this.cam.zoom;
    const vw = width / z;
    const vh = height / z;
    this.cam.x = vw >= WORLD_WIDTH ? (WORLD_WIDTH - vw) / 2 : Math.min(WORLD_WIDTH - vw, Math.max(0, this.cam.x));
    this.cam.y = vh >= WORLD_HEIGHT ? (WORLD_HEIGHT - vh) / 2 : Math.min(WORLD_HEIGHT - vh, Math.max(0, this.cam.y));
    this.camera.scale.set(z);
    this.camera.position.set(-this.cam.x * z, -this.cam.y * z);
  }

  // --- Panning -------------------------------------------------------------

  private startPan(e: FederatedPointerEvent): void {
    if (this.drag || this.pan) return;
    this.panVelocity = { x: 0, y: 0 };
    this.pan = { pointerId: e.pointerId, lastX: e.global.x, lastY: e.global.y, vx: 0, vy: 0, lastT: performance.now() };
  }

  private movePan(e: FederatedPointerEvent): void {
    const pan = this.pan!;
    const dx = e.global.x - pan.lastX;
    const dy = e.global.y - pan.lastY;
    const now = performance.now();
    const dt = Math.max(1, now - pan.lastT) / 1000;
    // Smoothed finger velocity in world units per second, for the release fling.
    pan.vx = pan.vx * 0.6 + (-dx / this.cam.zoom / dt) * 0.4;
    pan.vy = pan.vy * 0.6 + (-dy / this.cam.zoom / dt) * 0.4;
    pan.lastX = e.global.x;
    pan.lastY = e.global.y;
    pan.lastT = now;
    this.cam.x -= dx / this.cam.zoom;
    this.cam.y -= dy / this.cam.zoom;
    this.applyCamera();
  }

  private addView(kid: Kid): KidView {
    const view = new KidView(kid, this.textures);
    view.root.eventMode = 'static';
    view.root.cursor = 'grab';
    view.root.on('pointerdown', (e) => {
      e.stopPropagation(); // a kid press is a pickup, never a pan
      this.startDrag(kid.id, e);
    });
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
    if (this.drag || this.pan) return; // one gesture at a time; a second finger is ignored
    this.panVelocity = { x: 0, y: 0 };
    this.dragScreen = { x: e.global.x, y: e.global.y };
    const kid = this.game.state.world.kids.find((k) => k.id === kidId);
    if (!kid) return;
    const w = this.toWorld(e);
    // If this kid was just dropped and the sim hasn't applied it yet, that landing
    // spot is where it really is: cancelling must return it there (Codex review, PR #5).
    const start = this.placing.get(kidId) ?? { x: kid.x, y: kid.y };
    this.placing.delete(kidId);
    this.drag = { kidId, pointerId: e.pointerId, startX: start.x, startY: start.y, x: w.x, y: w.y - HOLD_LIFT };
    this.pending.push({ type: 'pickUp', kidId });
    this.views.get(kidId)?.setHeld(true);
  }

  private onPointerMove(e: FederatedPointerEvent): void {
    if (this.pan && e.pointerId === this.pan.pointerId) {
      this.movePan(e);
      return;
    }
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    this.dragScreen = { x: e.global.x, y: e.global.y };
    const w = this.toWorld(e);
    this.drag.x = w.x;
    this.drag.y = w.y - HOLD_LIFT;
  }

  private endPointer(e: FederatedPointerEvent, kind: 'drop' | 'cancelDrag'): void {
    if (this.pan && e.pointerId === this.pan.pointerId) {
      // Fling with the finger's recent velocity, decayed by however long it then rested,
      // so a pause before lifting doesn't fling (Codex review, PR #11). Cancels never fling.
      const rested = (performance.now() - this.pan.lastT) / 1000;
      const keep = kind === 'drop' && rested < 0.1 ? Math.exp(-PAN_FRICTION * 4 * rested) : 0;
      this.panVelocity = { x: this.pan.vx * keep, y: this.pan.vy * keep };
      this.pan = undefined;
      return;
    }
    this.endDrag(e, kind);
  }

  private endDrag(e: FederatedPointerEvent, kind: 'drop' | 'cancelDrag'): void {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    if (kind === 'cancelDrag') {
      this.cancelActiveDrag();
      return;
    }
    const w = this.toWorld(e);
    this.finishDrag({ type: 'drop', kidId: this.drag.kidId, x: w.x, y: w.y - HOLD_LIFT });
  }

  private cancelActiveDrag(): void {
    if (!this.drag) return;
    const { kidId, startX, startY } = this.drag;
    this.finishDrag({ type: 'cancelDrag', kidId, x: startX, y: startY });
  }

  private finishDrag(cmd: Extract<Command, { type: 'drop' | 'cancelDrag' }>): void {
    if (!this.drag) return;
    this.views.get(this.drag.kidId)?.setHeld(false);
    this.pending.push(cmd);
    // Draw the kid exactly where the command puts it (the release point for a drop,
    // the start for a cancel) until the sim applies it (Codex review, PR #5).
    // Clamped exactly as the sim will clamp it, so the preview never jumps on landing.
    const radius = this.game.state.world.kids.find((k) => k.id === cmd.kidId)?.radius ?? 0;
    this.placing.set(this.drag.kidId, clampToBounds(innerBounds(PLAY_BOUNDS, radius), cmd.x, cmd.y));
    this.drag = undefined;
  }

  // --- Frame loop --------------------------------------------------------

  private frame(dt: number): void {
    this.updateCamera(dt);
    // Clamp long frames (tab switch) so the sim never spirals. Long absences are
    // offline catch-up's job (M3), not the frame loop's.
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= STEP) {
      for (const k of this.game.state.world.kids) this.prev.set(k.id, { x: k.x, y: k.y });
      const events = this.game.step(this.pending.splice(0));
      // Placed kids interpolate from where they were put down, so a kid that had to
      // slide off an occupied spot (D-039) visibly slides instead of teleporting.
      for (const [id, at] of this.placing) this.prev.set(id, at);
      this.placing.clear();
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
      const placed = this.placing.get(k.id);
      if (placed) {
        view.update(placed.x, placed.y, false, 0, dt);
        continue;
      }
      const p = this.prev.get(k.id) ?? k;
      view.update(p.x + (k.x - p.x) * alpha, p.y + (k.y - p.y) * alpha, k.idle === 0 && !k.held, Math.cos(k.heading), dt);
    }
  }

  /** Pan inertia, and edge auto-scroll while a kid is held near a screen edge. */
  private updateCamera(dt: number): void {
    const step = Math.min(dt, 0.1);
    if (this.drag) {
      const { width, height } = this.app.screen;
      const edge = (pos: number, size: number) =>
        pos < EDGE_ZONE ? -(1 - pos / EDGE_ZONE) : pos > size - EDGE_ZONE ? 1 - (size - pos) / EDGE_ZONE : 0;
      const ex = edge(this.dragScreen.x, width);
      const ey = edge(this.dragScreen.y, height);
      if (ex || ey) {
        this.cam.x += ex * EDGE_SPEED * step;
        this.cam.y += ey * EDGE_SPEED * step;
        this.applyCamera();
        // The map moved under a still finger: keep the held kid under it.
        const w = this.camera.toLocal(this.dragScreen);
        this.drag.x = w.x;
        this.drag.y = w.y - HOLD_LIFT;
      }
      return;
    }
    if (!this.pan && (this.panVelocity.x || this.panVelocity.y)) {
      this.cam.x += this.panVelocity.x * step;
      this.cam.y += this.panVelocity.y * step;
      this.applyCamera();
      const decay = Math.exp(-PAN_FRICTION * step);
      this.panVelocity.x *= decay;
      this.panVelocity.y *= decay;
      if (Math.hypot(this.panVelocity.x, this.panVelocity.y) < 5) this.panVelocity = { x: 0, y: 0 };
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

/** Flat ground across the world until Codex's tiles and decor arrive (not art: a single fill). */
function drawGround(): Graphics {
  return new Graphics().rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT).fill('#f4efe2');
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
