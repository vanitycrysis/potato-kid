import { Application, Container, FederatedPointerEvent, Graphics } from 'pixi.js';
import type { KidRig, MapData } from '../content/artData';
import type { Content, KidId } from '../content/types';
import { Game, type Ambient, type Command, type GameEvent, type LookTable, type OfflineReport, type PersistedState } from '../sim/game';
import { STEP, type Kid, type Obstacle } from '../sim/world';
import { intersects, rectAt, resolveDrawn, touching } from '../sim/space';
import type { TextureStore } from './art';
import { buildMap } from './mapView';
import { HomeTarget, type HomeSpec, type HomeState } from './homeTarget';
import { clipLength } from './presentation';
import { KidRigView } from './rigView';

/** Width of world shown across a portrait screen; height follows the screen's aspect (D-040). */
const VIEW_WIDTH = 1080;
/** On short/landscape screens, at least this much world height stays visible. */
const VIEW_MIN_HEIGHT = 1920;

/** Everything the scene needs from ChatGPT/Codex's art (D-036: the engine draws none itself). */
export interface SceneArt {
  rig: KidRig;
  map: MapData;
  /** Shared art resident; costumes per type, on demand (ROSTER-SCALE). */
  textures: TextureStore;
  looks: LookTable;
  ambient: Ambient;
  obstacles: Obstacle[];
  reducedMotion: boolean;
  /** Send home (D-048, GUI_MVP §13): Codex's target and departure tokens, and its ink. */
  home?: {
    target: HomeSpec;
    departure: { clipMs: number; fadeMs: number; reducedFadeMs: number };
    tether: { strokePx: number; dashPx: [number, number]; stopBeforeKidBoxPx: number };
    ink: string;
  } | undefined;
}

/** What the Send home overlay draws this frame, in screen (CSS px) coordinates. */
export interface HomeView {
  state: HomeState;
  target: { left: number; top: number; right: number; bottom: number };
  /** The raw pointer, while over the target. */
  point: { x: number; y: number } | null;
  /** The held kid's drawn silhouette box, while one is held. */
  held: { left: number; top: number; right: number; bottom: number } | null;
}

/** A kid going home: its view plays the farewell, apart from the sim (GUI_MVP §13.2). */
interface Departure {
  view: KidRigView;
  x: number;
  y: number;
  box: Kid['box'];
  ms: number;
}

/** How far above the finger a held kid floats, so the finger doesn't hide it (world units; y grows downward, so it is subtracted). */
const HOLD_LIFT = 70;
/** A costume no kid has needed for this long is released (ROSTER-SCALE). */
const RELEASE_AFTER_MS = 15_000;
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
  /** No free spot is visible right now: edge scrolling pauses so the last spot stays on screen. */
  noRoom?: boolean;
}

/**
 * Owns the Pixi stage for the map. Runs the fixed-step game, turns pointer
 * input into commands, and interpolates kid positions between steps.
 */
export class MapScene {
  readonly game: Game;
  private paused = false;

  /**
   * While a GUI sheet is open, world input (pick-up, pan, edge scroll) is paused; the
   * simulation and income keep running (GUI_MVP §2). Pausing also ends any pan and its
   * inertia (Codex review, PR #39).
   */
  get inputPaused(): boolean {
    return this.paused;
  }

  set inputPaused(on: boolean) {
    this.paused = on;
    if (on) {
      this.pan = undefined;
      this.panVelocity = { x: 0, y: 0 };
    }
  }
  private readonly listeners = new Set<(e: GameEvent) => void>();
  private readonly stepListeners = new Set<(events: GameEvent[]) => void>();
  private readonly resumeListeners = new Set<(report: OfflineReport) => void>();
  private readonly shownListeners = new Set<(kidId: number) => void>();
  private readonly camera = new Container();
  private readonly kidLayer = new Container({ sortableChildren: true });
  private readonly views = new Map<number, KidRigView>();
  /** Kids whose costume is still loading: their view, and what it should play, come after. */
  private readonly pendingViews = new Map<number, ((v: KidRigView) => void)[]>();
  /** Loaded costume types with no kid on the map, and since when (wall ms). */
  private readonly absentSince = new Map<KidId, number>();
  /** Types kept loaded however long they are absent: the Garden spawns them all the time. */
  private readonly resident: Set<KidId>;
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
  /** Send home (D-048): the Garden target, its tether layer, and kids on their way out. */
  private readonly home: HomeTarget | null;
  private readonly homeLayer = new Graphics();
  private readonly departures: Departure[] = [];
  private readonly homeListeners = new Set<(v: HomeView) => void>();
  /** Foreground time (ms): it only advances while frames run, never while hidden. */
  private clock = 0;
  /** The view last frame, to tell when the map moved under the finger. */
  private lastView = '';
  /**
   * Whether the overlay can place the target's label (GUI_MVP §13.1); without room for it
   * the target is not offered. Set by the GUI.
   */
  homeFits: (target: HomeView['target'], held: HomeView['held']) => boolean = () => true;

  constructor(
    private readonly app: Application,
    content: Content,
    seed: number,
    private readonly art: SceneArt,
    /** A loaded save (plan §4) to continue instead of starting a new map. */
    saved?: PersistedState,
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
        // A new game is accounted up to now (plan §3), never from the epoch.
        now: Date.now(),
      },
      seed,
      saved,
    );
    this.resident = new Set(Object.keys(content.balance.spawnWeights));
    const [gx, gy] = art.map.garden.worldGround;
    this.home = art.home ? new HomeTarget({ x: gx, y: gy }, art.home.target) : null;
    // The tether is drawn beneath kids (GUI_MVP §13.1) and takes no input.
    this.homeLayer.eventMode = 'none';
    this.camera.addChild(buildMap(art.map, art.textures.map), this.homeLayer, this.kidLayer);
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

    this.layout();
    this.centerOn(art.map.camera.initialCentre[0], art.map.camera.initialCentre[1]);
    app.renderer.on('resize', () => this.layout());
    app.ticker.add((t) => this.frame(t.deltaMS / 1000));
  }

  /** Calls `fn` with every sim event, after the scene has handled it. */
  listen(fn: (e: GameEvent) => void): void {
    this.listeners.add(fn);
  }

  /** Calls `fn` every frame with what the Send home overlay should show (D-048). */
  listenHome(fn: (v: HomeView) => void): void {
    this.homeListeners.add(fn);
  }

  /** The Send home target's state (tests). */
  get homeState(): HomeState {
    return this.home?.state ?? 'hidden';
  }

  /** How long a send home's farewell plays (its success card waits for it, §13.3). */
  get departureMs(): number {
    const d = this.art.home?.departure;
    if (!d) return 0;
    return this.art.reducedMotion ? d.reducedFadeMs : d.clipMs + d.fadeMs;
  }

  /** Kids still playing their farewell, and where (tests). */
  get departing(): { x: number; y: number }[] {
    return this.departures.map((d) => ({ x: d.x, y: d.y }));
  }

  /** Calls `fn` once per sim step with all of that step's events (GUI feedback batches them). */
  listenSteps(fn: (events: GameEvent[]) => void): void {
    this.stepListeners.add(fn);
  }

  /** A kid is being held: GUI feedback waits rather than covering the drag (GUI_MVP §2). */
  get dragging(): boolean {
    return this.drag !== undefined;
  }

  /** Calls `fn` after every offline catch-up (cold load or resume), with its report. */
  listenResume(fn: (report: OfflineReport) => void): void {
    this.resumeListeners.add(fn);
  }

  /**
   * Calls `fn` when a kid's view appears: at once, or after its costume loads (ROSTER-SCALE).
   * Feedback about a newborn waits for this, not for the sim event (Codex review, PR #35).
   */
  listenShown(fn: (kidId: number) => void): void {
    this.shownListeners.add(fn);
  }

  /** Whether a kid is drawn now, or still exists waiting for its costume. */
  viewState(kidId: number): 'shown' | 'pending' | 'gone' {
    if (this.views.has(kidId)) return 'shown';
    return this.pendingViews.has(kidId) && this.game.state.world.kids.some((k) => k.id === kidId) ? 'pending' : 'gone';
  }

  /** Settles any held kid now (a cancelled touch), e.g. before the GUI layout shifts. */
  cancelDrag(): void {
    if (!this.drag) return;
    this.cancelActiveDrag();
    this.stepOnce(0);
  }

  /** Queues a UI command (purchase, upgrade, bias) for the next sim step. */
  command(cmd: Extract<Command, { type: 'upgrade' | 'setBias' | 'instantSpawn' | 'respawn' | 'sendHome' }>): void {
    this.pending.push(cmd);
  }

  /**
   * The app is going away (lifecycle coordinator, plan §3): run whole pending sim steps,
   * discard the sub-step remainder, cancel any drag (leaving mid-drag is a cancelled
   * touch, plan §2) and stop ticking. Suspended time is credited only by `resume`.
   */
  suspend(): void {
    while (this.acc >= STEP) this.stepOnce();
    this.acc = 0;
    if (this.drag) this.cancelActiveDrag();
    // Apply the cancel now, with no time passing, so the save never holds a kid mid-air.
    if (this.pending.length) this.stepOnce(0);
    // Panning is dropped too: its pointerup may never arrive (Codex review, PR #11).
    this.pan = undefined;
    // Hidden: departures are disposed, not replayed, and any dwell starts over (§13).
    this.endDepartures();
    this.home?.reset();
    this.panVelocity = { x: 0, y: 0 };
    this.app.ticker.stop();
  }

  /** Back from a suspension at wall-clock `now`: offline catch-up once, then tick again. */
  resume(now: number): OfflineReport {
    const report = this.game.reconcile(now);
    for (const kid of report.spawned) this.addView(kid);
    this.app.ticker.start();
    for (const fn of this.resumeListeners) fn(report);
    return report;
  }

  /**
   * Releases costumes no kid has needed for a while (ROSTER-SCALE), except the Garden's
   * spawn pool, which comes back constantly. Absence is timed so a fusion that consumes the
   * last kid of a type and a respawn moments later don't thrash the loader.
   */
  private releaseUnused(now: number): void {
    const present = new Set(this.game.state.world.kids.map((k) => k.type));
    for (const type of this.art.textures.loadedTypes) {
      if (present.has(type) || this.resident.has(type)) {
        this.absentSince.delete(type);
        continue;
      }
      const since = this.absentSince.get(type);
      if (since === undefined) this.absentSince.set(type, now);
      else if (now - since >= RELEASE_AFTER_MS) {
        this.absentSince.delete(type);
        this.art.textures.release(type);
      }
    }
  }

  /** Test hook: costume types currently loaded. */
  get loadedCostumes(): KidId[] {
    return this.art.textures.loadedTypes;
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

  /** Test hook: the clip a kid is showing and its running effects. */
  presentationOf(kidId: number): { clip: string; effects: string[] } | undefined {
    return this.views.get(kidId)?.presenting;
  }

  /**
   * How long after a first discovery its toast appears: when the discovery effect ends
   * (rig: discovery onComplete → toast). Immediately under reduced motion.
   */
  get discoveryToastDelayMs(): number {
    return this.art.reducedMotion ? 0 : clipLength(this.art.rig, 'discovery') * 1000;
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
    if (this.drag || this.pan || this.inputPaused) return;
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

  /**
   * A kid's view, now if its costume is loaded, else as soon as it is (ROSTER-SCALE). The
   * handle records what the view should play meanwhile (a spawn, an effect) and replays it.
   */
  private addView(kid: Kid): Pick<KidRigView, 'play' | 'startEffect'> {
    if (this.art.textures.ready(kid.type)) return this.createView(kid);
    const actions: ((v: KidRigView) => void)[] = [];
    this.pendingViews.set(kid.id, actions);
    // A failed load is retried with backoff while the kid still needs a view, so a
    // transient fetch failure never leaves it invisible for good (Codex review, PR #35).
    const attempt = (delay: number) => {
      this.art.textures.ensure(kid.type).then(
        () => {
          if (this.pendingViews.get(kid.id) !== actions) return; // consumed while loading
          this.pendingViews.delete(kid.id);
          const live = this.game.state.world.kids.find((k) => k.id === kid.id);
          if (!live) return;
          const view = this.createView(live);
          for (const a of actions) a(view);
        },
        () => {
          if (this.pendingViews.get(kid.id) !== actions) return;
          window.setTimeout(() => attempt(Math.min(delay * 2, 30_000)), delay);
        },
      );
    };
    attempt(1000);
    return {
      play: (name) => void actions.push((v) => v.play(name)),
      startEffect: (name) => void actions.push((v) => v.startEffect(name)),
    };
  }

  private createView(kid: Kid): KidRigView {
    const view = new KidRigView(kid, this.art.rig, this.art.textures.map, this.art.reducedMotion);
    view.root.eventMode = 'static';
    view.root.cursor = 'grab';
    view.root.on('pointerdown', (e) => {
      e.stopPropagation(); // a kid press is a pickup, never a pan
      this.startDrag(kid.id, e);
    });
    this.views.set(kid.id, view);
    this.prev.set(kid.id, { x: kid.x, y: kid.y });
    this.kidLayer.addChild(view.root);
    for (const fn of this.shownListeners) fn(kid.id);
    return view;
  }

  private removeView(kidId: number): void {
    this.pendingViews.delete(kidId);
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
    if (this.drag || this.pan || this.inputPaused) return; // one gesture at a time; none under a sheet
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
    // A new gesture starts with no dwell (§13.1).
    this.home?.reset();
    this.pending.push({ type: 'pickUp', kidId });
    this.views.get(kidId)?.pickedUp();
  }

  private onPointerMove(e: FederatedPointerEvent): void {
    if (this.paused) return;
    if (this.pan && e.pointerId === this.pan.pointerId) {
      this.movePan(e);
      return;
    }
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    this.dragScreen = { x: e.global.x, y: e.global.y };
    const w = this.toWorld(e);
    this.home?.move(w);
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
    // Released over the armed target, rechecked now: the kid goes home instead of landing
    // (GUI_MVP §13.1). Exactly one of the two commands is ever sent.
    if (this.home?.releases(this.clock, this.homeEligible(), w)) {
      const { kidId, spot } = this.drag;
      this.pending.push({ type: 'sendHome', kidId });
      this.placing.set(kidId, spot);
      this.views.get(kidId)?.dropped();
      this.drag = undefined;
      this.home.reset();
      return;
    }
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
      // If the band is shorter than the kid, keep its top just below the HUD rather than
      // letting an impossible limit be ignored (Codex review, PR #15).
      if (limit.minY > limit.maxY) limit.maxY = limit.minY;
      this.drag.y = Math.min(limit.maxY, Math.max(limit.minY, this.drag.y));
    }
    const spot = this.game.landingSpot(this.drag.kidId, this.drag.x, this.drag.y, this.drawn, limit);
    // A full visible area keeps the last valid spot, and updateCamera stops edge scrolling
    // until there is room again, so the held kid can't be scrolled out of view or dropped
    // somewhere stale (Codex review, PR #15).
    this.drag.noRoom = !spot;
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
    this.home?.reset();
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
    this.views.get(this.drag.kidId)?.dropped();
    this.drag = undefined;
  }

  // --- Send home (D-048, GUI_MVP §13) ---------------------------------------

  /** The target's projection on screen (CSS px). */
  private homeScreenRect(): HomeView['target'] {
    const r = this.home!.rect;
    const a = this.camera.toGlobal({ x: r.minX, y: r.minY });
    const b = this.camera.toGlobal({ x: r.maxX, y: r.maxY });
    return { left: a.x, top: a.y, right: b.x, bottom: b.y };
  }

  /** The held kid's drawn silhouette box on screen. */
  private heldScreenRect(): HomeView['held'] {
    if (!this.drag) return null;
    const kid = this.game.state.world.kids.find((k) => k.id === this.drag!.kidId);
    if (!kid) return null;
    const a = this.camera.toGlobal({ x: this.drag.spot.x + kid.box.left, y: this.drag.spot.y + kid.box.top });
    const b = this.camera.toGlobal({ x: this.drag.spot.x + kid.box.right, y: this.drag.spot.y + kid.box.bottom });
    return { left: a.x, top: a.y, right: b.x, bottom: b.y };
  }

  /**
   * The target is offered only while a kid is held, input isn't paused, the whole target is
   * inside the unobscured world view at a usable size, and its label has room (§13.1).
   */
  private homeEligible(): boolean {
    if (!this.home || !this.drag || this.inputPaused) return false;
    const r = this.homeScreenRect();
    const { width, height } = this.app.screen;
    const min = this.art.home!.target.minimumProjectedSidePx;
    const onScreen = r.left >= 0 && r.right <= width && r.top >= this.insets.top && r.bottom <= height - this.insets.bottom;
    return onScreen && r.right - r.left >= min && r.bottom - r.top >= min && this.homeFits(r, this.heldScreenRect());
  }

  private updateHome(): void {
    if (!this.home) return;
    const { width, height } = this.app.screen;
    const view = `${this.cam.x},${this.cam.y},${this.cam.zoom},${width},${height},${this.insets.top},${this.insets.bottom}`;
    const moved = view !== this.lastView;
    this.lastView = view;
    const point = this.drag ? this.camera.toLocal(this.dragScreen) : null;
    const state = this.home.update(this.clock, this.homeEligible(), point ? { x: point.x, y: point.y } : null, moved);
    const over = state === 'waiting' || state === 'ready';
    this.drawTether(over);
    const v: HomeView = {
      state,
      target: this.homeScreenRect(),
      point: over ? { x: this.dragScreen.x, y: this.dragScreen.y } : null,
      held: state === 'hidden' ? null : this.heldScreenRect(),
    };
    for (const fn of this.homeListeners) fn(v);
  }

  /**
   * A static dashed line from the target's centre to the nearest point of the held kid's
   * box, stopping short of it (§13.1). Screen-constant widths, so divided by the zoom.
   */
  private drawTether(show: boolean): void {
    const g = this.homeLayer;
    g.clear();
    if (!show || !this.drag || !this.home) return;
    const kid = this.game.state.world.kids.find((k) => k.id === this.drag!.kidId);
    if (!kid) return;
    const t = this.art.home!.tether;
    const z = this.cam.zoom;
    const r = this.home.rect;
    const cx = (r.minX + r.maxX) / 2;
    const cy = (r.minY + r.maxY) / 2;
    const s = this.drag.spot;
    const nx = Math.min(Math.max(cx, s.x + kid.box.left), s.x + kid.box.right);
    const ny = Math.min(Math.max(cy, s.y + kid.box.top), s.y + kid.box.bottom);
    const len = Math.hypot(nx - cx, ny - cy) - t.stopBeforeKidBoxPx / z;
    if (len <= 0) return;
    const ux = (nx - cx) / Math.hypot(nx - cx, ny - cy);
    const uy = (ny - cy) / Math.hypot(nx - cx, ny - cy);
    const [dash, gap] = [t.dashPx[0] / z, t.dashPx[1] / z];
    for (let d = 0; d < len; d += dash + gap) {
      const e = Math.min(len, d + dash);
      g.moveTo(cx + ux * d, cy + uy * d).lineTo(cx + ux * e, cy + uy * e);
    }
    g.stroke({ width: t.strokePx / z, color: this.art.home!.ink });
  }

  /** The kid's view leaves the sim's world but waves goodbye where it was last drawn. */
  private startDeparture(kid: Kid): void {
    const view = this.views.get(kid.id);
    if (!view || !this.art.home) {
      this.removeView(kid.id);
      return;
    }
    this.views.delete(kid.id);
    this.prev.delete(kid.id);
    this.drawn.delete(kid.id);
    this.pendingViews.delete(kid.id);
    view.root.eventMode = 'none';
    this.departures.push({ view, x: view.root.position.x, y: view.root.position.y, box: kid.box, ms: 0 });
  }

  /**
   * Plays each farewell, and ends it early rather than ever overlapping a live kid, the
   * held preview or a newer departure (no-overlap holds for what is drawn, §13.2).
   */
  private updateDepartures(dt: number): void {
    const timing = this.art.home?.departure;
    if (!timing) return;
    const live = this.game.state.world.kids.flatMap((k) => {
      const at = this.drag?.kidId === k.id ? this.drag.spot : this.drawn.get(k.id);
      return at ? [rectAt(k.box, at.x, at.y)] : [];
    });
    for (let i = this.departures.length - 1; i >= 0; i--) {
      const d = this.departures[i]!;
      d.ms += dt * 1000;
      const box = rectAt(d.box, d.x, d.y);
      const newer = this.departures.slice(i + 1).map((n) => rectAt(n.box, n.x, n.y));
      const blocked = [...live, ...newer].some((o) => intersects(box, o));
      if (blocked || !d.view.depart(d.x, d.y, d.ms, timing)) {
        d.view.destroy();
        this.departures.splice(i, 1);
      }
    }
  }

  private endDepartures(): void {
    for (const d of this.departures) d.view.destroy();
    this.departures.length = 0;
  }

  // --- Frame loop --------------------------------------------------------

  private frame(dt: number): void {
    this.clock += dt * 1000;
    this.updateCamera(dt);
    this.releaseUnused(performance.now());
    // Clamp long frames (tab switch) so the sim never spirals. Long absences are
    // offline catch-up's job (M3), not the frame loop's.
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= STEP) {
      this.stepOnce();
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
    this.updateHome();
    this.updateDepartures(dt);
    for (const k of kids) {
      const view = this.views.get(k.id);
      if (!view) continue;
      if (this.drag?.kidId === k.id) {
        view.update(this.drag.spot.x, this.drag.spot.y, k.activity, true, dt);
        continue;
      }
      // Only the dragged kid is drawn held: one just let go is released from that moment,
      // even before the sim applies its drop (Codex review, PR #24).
      const at = drawn.get(k.id) ?? k;
      view.update(at.x, at.y, k.activity, false, dt);
    }
  }

  /** One fixed sim step with the queued commands (dt 0 applies commands without time passing). */
  private stepOnce(dt: number = STEP): void {
    for (const k of this.game.state.world.kids) this.prev.set(k.id, { x: k.x, y: k.y });
    const events = this.game.step(this.pending.splice(0), dt);
    // Placed kids interpolate from where they were put down, so a kid that had to
    // slide off an occupied spot (D-039) visibly slides instead of teleporting.
    for (const [id, at] of this.placing) this.prev.set(id, at);
    this.placing.clear();
    for (const e of events) this.handle(e);
    if (events.length) for (const fn of this.stepListeners) fn(events);
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
      // Over the Send home target, the map holds still (GUI_MVP §13.1).
      const overHome = this.home?.state === 'waiting' || this.home?.state === 'ready';
      if ((ex || ey) && !this.drag.noRoom && !overHome) {
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
        this.addView(e.kid).play('spawn');
        break;
      case 'sentHome': {
        // Gone from the sim at once (D-048); its view stays briefly to wave goodbye.
        if (this.drag?.kidId === e.kid.id) this.drag = undefined;
        this.startDeparture(e.kid);
        break;
      }
      case 'fused': {
        // Parents are consumed at once, never fading or converging (rig: fusion onStart);
        // the child is born where the sim resolved it, with the fusion effect behind it.
        for (const p of e.parents) {
          if (this.drag?.kidId === p.id) this.drag = undefined;
          this.removeView(p.id);
        }
        const child = this.addView(e.child);
        child.play('spawn');
        child.startEffect('fusion');
        if (e.firstDiscovery) child.startEffect('discovery');
        break;
      }
      default:
        break;
    }
    for (const fn of this.listeners) fn(e);
  }
}
