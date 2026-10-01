import { Application, Container, FederatedPointerEvent, type Texture } from 'pixi.js';
import type { KidRig, MapData } from '../content/artData';
import type { Content } from '../content/types';
import { Game, type Ambient, type Command, type GameEvent, type LookTable } from '../sim/game';
import { STEP, type Kid, type Obstacle } from '../sim/world';
import { rectAt, resolveDrawn, touching } from '../sim/space';
import { buildMap } from './mapView';
import { KidRigView } from './rigView';

/** Width of world shown across a portrait screen; height follows the screen's aspect (D-040). */
const VIEW_WIDTH = 1080;
/** On short/landscape screens, at least this much world height stays visible. */
const VIEW_MIN_HEIGHT = 1920;

/** Everything the scene needs from ChatGPT/Codex's art (D-036: the engine draws none itself). */
export interface SceneArt {
  rig: KidRig;
  map: MapData;
  textures: Map<string, Texture>;
  looks: LookTable;
  ambient: Ambient;
  obstacles: Obstacle[];
  reducedMotion: boolean;
}

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
  /** Where the finger wants the kid (lifted pointer position, world units). */
  x: number;
  y: number;
  /** Where the kid is drawn: the nearest free spot to (x, y), so it never overlaps (D-039). */
  spot: { x: number; y: number };
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
  private readonly views = new Map<number, KidRigView>();
  private readonly prev = new Map<number, Prev>();
  private readonly worldWidth: number;
  private readonly worldHeight: number;
  private readonly pending: Command[] = [];
  private drag: Drag | undefined;
  /** Last screen position of the dragging pointer, so edge scroll can keep the kid under it. */
  private dragScreen = { x: 0, y: 0 };
  /** Camera: world point at the screen's top-left, and world → CSS px scale. */
  private cam = { x: 0, y: 0, zoom: 1 };
  /**
   * Screen space covered by DOM overlays (HUD on top, tray at the bottom), in CSS px. The
   * camera may scroll this far past the world edges so nothing stays hidden underneath
   * (Codex review, PR #15).
   */
  private insets = { top: 0, bottom: 0 };
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
  /** Where each kid was drawn last frame, for render-time separation of held/placed previews. */
  private readonly drawn = new Map<number, { x: number; y: number }>();

  constructor(
    private readonly app: Application,
    content: Content,
    seed: number,
    private readonly art: SceneArt,
  ) {
    const [w, h] = art.map.worldSize;
    this.worldWidth = w;
    this.worldHeight = h;
    const [sx, sy] = art.map.garden.spawnOutlet;
    this.game = new Game(
      content,
      {
        bounds: { minX: 0, minY: 0, maxX: w, maxY: h },
        spawnAt: { x: sx, y: sy },
        obstacles: art.obstacles,
        looks: art.looks,
        ambient: art.ambient,
      },
      seed,
    );
    this.camera.addChild(buildMap(art.map, art.textures), this.kidLayer);
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
    this.centerOn(art.map.camera.initialCentre[0], art.map.camera.initialCentre[1]);
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
  debugAdd(type: string, x: number, y: number, look?: { body?: string; face?: string; scale?: number }): number {
    const kid = this.game.debugAddKid(type, x, y, look);
    this.addView(kid);
    return kid.id;
  }

  /** Test hook: world → screen for an arbitrary world point. */
  worldToScreen(x: number, y: number): { x: number; y: number } {
    const p = this.camera.toGlobal({ x, y });
    return { x: p.x, y: p.y };
  }

  /** Tells the camera how much of the screen the GUI overlays cover. */
  setInsets(top: number, bottom: number): void {
    this.insets = { top: Math.max(0, top), bottom: Math.max(0, bottom) };
    this.applyCamera();
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
    const W = this.worldWidth;
    const H = this.worldHeight;
    this.cam.x = vw >= W ? (W - vw) / 2 : Math.min(W - vw, Math.max(0, this.cam.x));
    // Vertically, the usable view is between the overlays: let the world's top edge reach
    // the HUD's bottom and its bottom edge reach the tray's top.
    const top = this.insets.top / z;
    const bottom = this.insets.bottom / z;
    const minY = -top;
    const maxY = H - vh + bottom;
    this.cam.y = maxY <= minY ? (minY + maxY) / 2 : Math.min(maxY, Math.max(minY, this.cam.y));
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

  private addView(kid: Kid): KidRigView {
    const view = new KidRigView(kid, this.art.rig, this.art.textures, this.art.reducedMotion);
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
    this.drawn.delete(kidId);
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
    this.drag = { kidId, pointerId: e.pointerId, startX: start.x, startY: start.y, x: w.x, y: w.y - HOLD_LIFT, spot: start };
    this.pending.push({ type: 'pickUp', kidId });
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
    this.drag.x = w.x;
    this.drag.y = w.y - HOLD_LIFT;
    this.resolveHeld();
    // Drop exactly where the kid is shown: the resolved free spot. Kids it visibly touches
    // there (their drawn boxes) travel with the command, so a seen touch can fuse.
    const { kidId, spot } = this.drag;
    const kid = this.game.state.world.kids.find((k) => k.id === kidId);
    const slack = this.game.touchSlack;
    const seen = kid
      ? [...this.drawn].filter(([id, at]) => {
          const other = this.game.state.world.kids.find((k) => k.id === id);
          return id !== kidId && !!other && touching(rectAt(kid.box, spot.x, spot.y), rectAt(other.box, at.x, at.y), slack);
        })
      : [];
    this.finishDrag({ type: 'drop', kidId, x: spot.x, y: spot.y, touching: seen.map(([id]) => id) });
  }

  /** Moves the held kid's drawn position to the nearest free spot to the finger (D-039). */
  private resolveHeld(): void {
    if (!this.drag) return;
    // Keep the held kid's whole silhouette inside the visible play area (between HUD and
    // tray), so it can't disappear behind the GUI while the finger is near an edge.
    // The free-spot search is limited to that area too: otherwise scenery (e.g. the Garden)
    // can push the nearest free spot up behind the HUD (Codex review, PR #15).
    const kid = this.game.state.world.kids.find((k) => k.id === this.drag!.kidId);
    let limit: { minX: number; minY: number; maxX: number; maxY: number } | undefined;
    if (kid) {
      const z = this.cam.zoom;
      const { width, height } = this.app.screen;
      limit = {
        minX: this.cam.x - kid.box.left,
        maxX: this.cam.x + width / z - kid.box.right,
        minY: this.cam.y + this.insets.top / z - kid.box.top,
        maxY: this.cam.y + (height - this.insets.bottom) / z - kid.box.bottom,
      };
      if (limit.minY <= limit.maxY) this.drag.y = Math.min(limit.maxY, Math.max(limit.minY, this.drag.y));
    }
    const spot = this.game.landingSpot(this.drag.kidId, this.drag.x, this.drag.y, this.drawn, limit);
    if (spot) this.drag.spot = spot;
  }

  /** The held kid's silhouette box on screen (CSS px), from where the finger wants it. */
  private heldScreenBox(): { top: number; bottom: number } | undefined {
    if (!this.drag) return undefined;
    const kid = this.game.state.world.kids.find((k) => k.id === this.drag!.kidId);
    if (!kid) return undefined;
    const z = this.cam.zoom;
    const wantY = this.camera.toLocal(this.dragScreen).y - HOLD_LIFT;
    return { top: (wantY + kid.box.top - this.cam.y) * z, bottom: (wantY + kid.box.bottom - this.cam.y) * z };
  }

  private cancelActiveDrag(): void {
    if (!this.drag) return;
    const { kidId, startX, startY } = this.drag;
    this.finishDrag({ type: 'cancelDrag', kidId, x: startX, y: startY });
  }

  private finishDrag(cmd: Extract<Command, { type: 'drop' | 'cancelDrag' }>): void {
    if (!this.drag) return;
    this.pending.push(cmd);
    // Draw the kid exactly where the sim will put it until the command is applied
    // (Codex review, PR #5): the same free-spot answer, so it never jumps or overlaps.
    const spot = this.game.landingSpot(cmd.kidId, cmd.x, cmd.y, this.drawn) ?? { x: cmd.x, y: cmd.y };
    this.placing.set(this.drag.kidId, spot);
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
    // This frame's drawn positions first (interpolated, overlap-free), then the held kid
    // resolves against exactly those (Codex review, PR #14), then everything is drawn.
    const kids = this.game.state.world.kids;
    const interpolated = new Map<number, { x: number; y: number }>();
    for (const k of kids) {
      const p = this.prev.get(k.id) ?? k;
      interpolated.set(k.id, { x: p.x + (k.x - p.x) * alpha, y: p.y + (k.y - p.y) * alpha });
    }
    const drawn = resolveDrawn(kids, interpolated, this.placing, this.art.obstacles);
    this.drawn.clear();
    for (const [id, pos] of drawn) this.drawn.set(id, pos);
    if (this.drag) this.resolveHeld();
    for (const k of kids) {
      const view = this.views.get(k.id);
      if (!view) continue;
      if (this.drag?.kidId === k.id) {
        view.update(this.drag.spot.x, this.drag.spot.y, k.activity, true, dt);
        continue;
      }
      const at = drawn.get(k.id) ?? k;
      view.update(at.x, at.y, k.activity, k.held, dt);
    }
  }

  /** Pan inertia, and edge auto-scroll while a kid is held near a screen edge. */
  private updateCamera(dt: number): void {
    const step = Math.min(dt, 0.1);
    if (this.drag) {
      const { width, height } = this.app.screen;
      // Edge zones sit at the edges of the *visible* play area, inside the HUD and tray, and
      // shrink on short screens so a neutral middle always remains (Codex review, PR #15).
      // Horizontally they follow the finger; vertically they follow the held kid's own
      // silhouette (it floats above the finger), so it never hides behind the HUD.
      const zone = (span: number) => Math.max(8, Math.min(EDGE_ZONE, span / 4));
      const ramp = (into: number, z: number) => Math.min(1, Math.max(0, 1 - into / z));
      const zx = zone(width);
      const ex = -ramp(this.dragScreen.x, zx) + ramp(width - this.dragScreen.x, zx);
      const top = this.insets.top;
      const bottom = height - this.insets.bottom;
      const held = this.heldScreenBox();
      // The zones share what's left after the kid's own height, so a neutral band survives
      // even on short landscape screens.
      const zy = zone(bottom - top - (held ? held.bottom - held.top : 0));
      const ey = held ? -ramp(held.top - top, zy) + ramp(bottom - held.bottom, zy) : 0;
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
        this.addView(e.kid);
        break;
      case 'fused':
        for (const p of e.parents) {
          if (this.drag?.kidId === p.id) this.drag = undefined;
          this.removeView(p.id);
        }
        this.addView(e.child);
        break;
      case 'pickedUp':
      case 'dropped':
        break;
    }
    this.onEvent(e);
  }
}
