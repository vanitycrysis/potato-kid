import { pairKey } from '../content/validate';
import type { Content, KidId } from '../content/types';
import { createRng, type Rng } from './rng';
import { blockedByScenery, findFreeSpot, gaps, kidRect, separate, touching } from './space';
import {
  addKid,
  clampToBounds,
  createWorld,
  defaultBox,
  DEFAULT_LOOK,
  STEP,
  stepWander,
  type Activity,
  type Bounds,
  type Box,
  type Kid,
  type Look,
  type Obstacle,
  type World,
} from './world';

/** Player input, applied at the start of the next sim step. */
export type Command =
  | { type: 'pickUp'; kidId: number }
  /**
   * `touching`: kids whose *drawn* boxes touched the drop when it was released. Those pairs
   * count as in contact for this drop, so what the player saw touch can fuse even if
   * interpolation put the partner a little away from its sim box (Codex review, PR #14).
   */
  | { type: 'drop'; kidId: number; x: number; y: number; touching?: number[] }
  | { type: 'cancelDrag'; kidId: number; x: number; y: number };

/** What happened during a step; rendering and audio react only to these. */
export type GameEvent =
  | { type: 'spawned'; kid: Kid }
  | { type: 'fused'; parents: [Kid, Kid]; child: Kid; firstDiscovery: boolean }
  | { type: 'pickedUp'; kidId: number }
  | { type: 'dropped'; kidId: number };

export interface GameState {
  world: World;
  rngState: number;
  /** Separate stream for appearance and ambient choices, so cosmetics never shift gameplay rolls. */
  cosmeticRngState: number;
  /** Separate stream for which type the Garden spawns next, independent of wandering and cosmetics. */
  spawnRngState: number;
  /** Seconds accumulated toward the next spawn, in [0, interval]. Persisted (plan §3). */
  spawnProgress: number;
  /** Kid types the player has seen born from a recipe or the Garden. */
  discoveredKids: KidId[];
  /** Recipe pair keys (`pairKey`) the player has triggered. */
  discoveredRecipes: string[];
}

/** Weighted appearance options, derived from the rig (art data) with boxes in world units. */
export interface LookTable {
  bodies: { id: string; weight: number; box: Box }[];
  faces: { id: string; weight: number }[];
  sizes: { scale: number; weight: number }[];
}

/** How long rest activities last; derived from the rig's scheduler and clip lengths. */
export interface Ambient {
  weights: { look: number; sit: number; sleep: number };
  /** Chance a rest is an ambient activity rather than a plain pause. */
  chance: number;
  /** The rig's stationary wait before an ambient pose may start (scheduler.stationaryDelaySeconds). */
  stationaryDelay: [number, number];
  lookSeconds: number;
  /** sit-down transition + hold + stand-up transition. */
  sitSeconds: (hold: number) => number;
  sleepSeconds: (hold: number) => number;
  seatedHold: [number, number];
  sleepHold: [number, number];
}

export interface GameOptions {
  bounds: Bounds;
  /** Where kids appear: the Garden's spawn outlet. */
  spawnAt: { x: number; y: number };
  obstacles?: Obstacle[];
  looks?: LookTable;
  ambient?: Ambient;
}

export class Game {
  readonly state: GameState;
  private readonly rng: Rng;
  private readonly cosmetic: Rng;
  private readonly spawnRng: Rng;
  private readonly recipes: Map<string, KidId>;
  private readonly spawnTable: { id: KidId; weight: number }[];
  private readonly spawnTotal: number;
  private readonly looks: LookTable;
  private readonly spawnAt: { x: number; y: number };
  private readonly ambient: Ambient | undefined;

  constructor(
    private readonly content: Content,
    options: GameOptions,
    seed: number,
  ) {
    this.rng = createRng(seed);
    this.cosmetic = createRng((seed ^ 0x9e3779b9) >>> 0);
    this.spawnRng = createRng((seed ^ 0x85ebca6b) >>> 0);
    this.recipes = new Map(content.recipes.map((r) => [pairKey(r.a, r.b), r.result]));
    this.spawnTable = Object.entries(content.balance.spawnWeights).map(([id, weight]) => ({ id, weight }));
    this.spawnTotal = this.spawnTable.reduce((sum, e) => sum + e.weight, 0);
    this.spawnAt = options.spawnAt;
    this.ambient = options.ambient;
    this.looks = options.looks ?? {
      bodies: [{ id: DEFAULT_LOOK.body, weight: 1, box: defaultBox(content.balance.body.radius) }],
      faces: [{ id: DEFAULT_LOOK.face, weight: 1 }],
      sizes: [{ scale: 1, weight: 1 }],
    };
    this.state = {
      world: createWorld(options.bounds, options.obstacles ?? []),
      rngState: this.rng.state,
      cosmeticRngState: this.cosmetic.state,
      spawnRngState: this.spawnRng.state,
      spawnProgress: 0,
      discoveredKids: [],
      discoveredRecipes: [],
    };
    for (let i = 0; i < content.balance.spawn.startingKids; i++) {
      // Starting kids appear around the spawn outlet, each on a free spot (D-039).
      const look = this.rollLook();
      const p = this.freeSpot(look.box, this.spawnAt.x + (this.rng.next() - 0.5) * 600, this.spawnAt.y + this.rng.next() * 400);
      if (p) this.discover(this.add(this.rollSpawnType(), p, 0, look).type);
    }
    this.syncRngState();
  }

  get interval(): number {
    return this.content.balance.spawn.intervalSeconds;
  }

  get capacity(): number {
    return this.content.balance.spawn.capacity;
  }

  get touchSlack(): number {
    return this.content.balance.body.touchSlack;
  }

  /**
   * Where a held kid would land if dropped near (x, y): the nearest spot where its box
   * touches nothing (D-039, D-043). The scene draws the held kid there, so a lifted kid
   * never overlaps anyone either; it can still sit right against a recipe partner.
   */
  landingSpot(kidId: number, x: number, y: number, drawn?: Map<number, { x: number; y: number }>): { x: number; y: number } | null {
    const world = this.state.world;
    const kid = world.kids.find((k) => k.id === kidId);
    if (!kid) return null;
    if (!drawn || drawn.size === 0) return findFreeSpot(world, kid.box, x, y, kid.id);
    // Free against both where neighbours ARE (the sim, so the drop won't be re-resolved)
    // and where they're DRAWN this frame (interpolated), so the preview never overlaps
    // a neighbour on screen either (render-time separation; Codex review, PR #14).
    const ghosts = world.kids.flatMap((k) => {
      const d = drawn.get(k.id);
      return d && (d.x !== k.x || d.y !== k.y) ? [{ ...k, x: d.x, y: d.y }] : [];
    });
    return findFreeSpot({ ...world, kids: [...world.kids, ...ghosts] }, kid.box, x, y, kid.id);
  }

  /** Advances one fixed step. */
  step(commands: Command[], dt: number = STEP): GameEvent[] {
    const events: GameEvent[] = [];
    const seen = this.applyCommands(commands, events);
    const world = this.state.world;
    // A drop resolves its contacts first: a partner walking away mustn't escape the touch
    // the player saw at release (Codex review, PR #14).
    if (commands.some((c) => c.type !== 'pickUp')) this.resolveFusions(events, seen);
    for (const kid of world.kids) kid.grace = Math.max(0, kid.grace - dt);
    stepWander(
      world,
      this.rng,
      this.content.balance.wander,
      dt,
      (_kid, phase) => this.rest(phase),
      (kid, x, y) => blockedByScenery(world, kid.box, x, y),
    );
    // Touching recipe pairs fuse first, so a kid dropped against its partner fuses.
    this.resolveFusions(events);
    separate(world);
    this.advanceSpawn(dt, events);
    this.syncRngState();
    return events;
  }

  /** Applies player commands; returns pairs the player saw touching at a drop. */
  private applyCommands(commands: Command[], events: GameEvent[]): [number, number][] {
    const { world } = this.state;
    const seen: [number, number][] = [];
    for (const c of commands) {
      const kid = world.kids.find((k) => k.id === c.kidId);
      if (!kid) continue; // e.g. consumed before the command arrived
      if (c.type === 'pickUp') {
        kid.held = true;
        kid.activity = { kind: 'walk' };
        events.push({ type: 'pickedUp', kidId: kid.id });
        continue;
      }
      // Land on the nearest free spot to the requested point: the same answer the scene
      // previewed with landingSpot, so the kid never jumps and never overlaps (D-039).
      kid.held = false;
      const p = findFreeSpot(world, kid.box, c.x, c.y, kid.id) ?? clampToBounds(world.bounds, kid.x, kid.y);
      kid.x = p.x;
      kid.y = p.y;
      if (c.type === 'drop') {
        events.push({ type: 'dropped', kidId: kid.id });
        for (const other of c.touching ?? []) if (other !== kid.id) seen.push([kid.id, other]);
      }
    }
    return seen;
  }

  /**
   * Contact → fusion (D-043): boxes touching (gap ≤ touchSlack on one axis, intervals
   * overlapping on the other). Candidates sort by (gap, lower id, higher id); a kid
   * consumed earlier in this step is skipped, so no kid can fuse twice.
   */
  private resolveFusions(events: GameEvent[], seen: [number, number][] = []): void {
    const { world } = this.state;
    const slack = this.content.balance.body.touchSlack;
    const eligible = world.kids.filter((k) => !k.held && k.grace === 0);
    const candidates: { d: number; a: Kid; b: Kid; result: KidId }[] = [];
    // Cell size covers the largest box plus slack, so only neighbouring cells can touch.
    const cell = Math.max(1, ...eligible.map((k) => Math.max(k.box.right - k.box.left, k.box.bottom - k.box.top))) + slack;
    const cells = new Map<string, Kid[]>();
    const cellOf = (k: Kid) => [Math.floor(k.x / cell), Math.floor(k.y / cell)] as const;
    for (const k of eligible) {
      const [cx, cy] = cellOf(k);
      const key = `${cx},${cy}`;
      const list = cells.get(key);
      if (list) list.push(k);
      else cells.set(key, [k]);
    }
    for (const a of eligible) {
      const [cx, cy] = cellOf(a);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (const b of cells.get(`${cx + dx},${cy + dy}`) ?? []) {
            if (b.id <= a.id) continue; // each pair once
            const ra = kidRect(a);
            const rb = kidRect(b);
            if (!touching(ra, rb, slack)) continue;
            const result = this.recipes.get(pairKey(a.type, b.type));
            if (!result) continue;
            const g = gaps(ra, rb);
            candidates.push({ d: Math.max(g.dx, g.dy), a, b, result });
          }
        }
      }
    }
    // Contacts the player saw at a drop count even if the sim gap is wider than the slack.
    for (const [x, y] of seen) {
      const a = eligible.find((k) => k.id === Math.min(x, y));
      const b = eligible.find((k) => k.id === Math.max(x, y));
      if (!a || !b || candidates.some((c) => c.a === a && c.b === b)) continue;
      const result = this.recipes.get(pairKey(a.type, b.type));
      if (result) candidates.push({ d: 0, a, b, result });
    }
    candidates.sort((p, q) => p.d - q.d || p.a.id - q.a.id || p.b.id - q.b.id);

    const consumed = new Set<number>();
    for (const c of candidates) {
      if (consumed.has(c.a.id) || consumed.has(c.b.id)) continue;
      consumed.add(c.a.id);
      consumed.add(c.b.id);
      world.kids = world.kids.filter((k) => k.id !== c.a.id && k.id !== c.b.id);
      const look = this.rollLook();
      // Resolved against the remaining kids after both parents left.
      const at = this.freeSpot(look.box, (c.a.x + c.b.x) / 2, (c.a.y + c.b.y) / 2) ?? { x: c.a.x, y: c.a.y };
      const child = this.add(c.result, at, this.content.balance.spawn.newbornGraceSeconds, look);
      const key = pairKey(c.a.type, c.b.type);
      const firstDiscovery = !this.state.discoveredRecipes.includes(key);
      if (firstDiscovery) this.state.discoveredRecipes.push(key);
      this.discover(child.type);
      events.push({ type: 'fused', parents: [c.a, c.b], child, firstDiscovery });
    }
  }

  /**
   * Spawn timer (plan §3): progress accumulates; at the interval a kid spawns if there is
   * room. When the map is full, or no free spot exists, progress holds at the interval:
   * one spawn is banked and fires as soon as there is room.
   */
  private advanceSpawn(dt: number, events: GameEvent[]): void {
    const s = this.state;
    const raw = s.spawnProgress + dt;
    // Tolerance absorbs float drift from summing 0.1 s steps (120 × 0.1 ≠ 12 exactly).
    if (raw < this.interval - 1e-6 || s.world.kids.length >= this.capacity) {
      s.spawnProgress = Math.min(this.interval, raw);
      return;
    }
    const look = this.peekLook();
    const p = this.freeSpot(look.box, this.spawnAt.x, this.spawnAt.y);
    if (!p) {
      s.spawnProgress = Math.min(this.interval, raw);
      return;
    }
    this.rollLook(); // commit the peeked roll
    // Keep the overshoot so spawn timing doesn't drift with the step size.
    s.spawnProgress = Math.max(0, Math.min(this.interval, raw - this.interval));
    const kid = this.add(this.rollSpawnType(), p, this.content.balance.spawn.newbornGraceSeconds, look);
    this.discover(kid.type);
    events.push({ type: 'spawned', kid });
  }

  /** Debug/test only: place a kid directly, bypassing the Garden and capacity. */
  debugAddKid(type: KidId, x: number, y: number): Kid {
    const look = this.rollLook();
    const p = this.freeSpot(look.box, x, y) ?? clampToBounds(this.state.world.bounds, x, y);
    const kid = this.add(type, p, 0, look);
    this.discover(type);
    this.syncRngState();
    return kid;
  }

  private add(type: KidId, p: { x: number; y: number }, grace: number, look: Look & { box: Box }): Kid {
    const { box, ...rest } = look;
    return addKid(this.state.world, type, p.x, p.y, this.rng, grace, box, rest);
  }

  private freeSpot(box: Box, x: number, y: number, ignore?: number): { x: number; y: number } | null {
    return findFreeSpot(this.state.world, box, x, y, ignore);
  }

  /** Rolls body, face and size from the cosmetic stream (persisted via cosmeticRngState). */
  private rollLook(): Look & { box: Box } {
    const t = this.looks;
    const body = weighted(this.cosmetic, t.bodies);
    const face = weighted(this.cosmetic, t.faces);
    const size = weighted(this.cosmetic, t.sizes);
    const s = size.scale;
    const b = body.box;
    return { body: body.id, face: face.id, scale: s, box: { left: b.left * s, top: b.top * s, right: b.right * s, bottom: b.bottom * s } };
  }

  /** The next look, without consuming it (spawn checks room first). */
  private peekLook(): Look & { box: Box } {
    const saved = this.cosmetic.state;
    const look = this.rollLook();
    this.cosmetic.setState(saved);
    return look;
  }

  /**
   * What a kid does when it stops walking: a plain pause, or the rig's stationary wait
   * (Codex review, PR #14) after which an ambient pose begins. Cosmetic stream.
   */
  private rest(phase: 'stop' | 'stationary'): Activity {
    const w = this.content.balance.wander;
    const a = this.ambient;
    const r = this.cosmetic;
    if (phase === 'stop') {
      if (!a || r.next() >= a.chance) {
        const [lo, hi] = w.idleSeconds;
        return { kind: 'pause', left: lo + r.next() * (hi - lo) };
      }
      const [lo, hi] = a.stationaryDelay;
      return { kind: 'pause', left: lo + r.next() * (hi - lo), thenAmbient: true };
    }
    if (!a) return { kind: 'walk' };
    const pick = weighted(r, [
      { id: 'look' as const, weight: a.weights.look },
      { id: 'sit' as const, weight: a.weights.sit },
      { id: 'sleep' as const, weight: a.weights.sleep },
    ]).id;
    if (pick === 'look') return { kind: 'look', left: a.lookSeconds };
    const range = pick === 'sit' ? a.seatedHold : a.sleepHold;
    const hold = range[0] + r.next() * (range[1] - range[0]);
    const total = pick === 'sit' ? a.sitSeconds(hold) : a.sleepSeconds(hold);
    return { kind: pick, left: total, total };
  }

  private rollSpawnType(): KidId {
    let roll = this.spawnRng.next() * this.spawnTotal;
    for (const e of this.spawnTable) {
      roll -= e.weight;
      if (roll < 0) return e.id;
    }
    return this.spawnTable[this.spawnTable.length - 1]!.id;
  }

  private discover(type: KidId): void {
    if (!this.state.discoveredKids.includes(type)) this.state.discoveredKids.push(type);
  }

  private syncRngState(): void {
    this.state.rngState = this.rng.state;
    this.state.cosmeticRngState = this.cosmetic.state;
    this.state.spawnRngState = this.spawnRng.state;
  }
}

function weighted<T extends { weight: number }>(rng: Rng, items: T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let roll = rng.next() * total;
  for (const i of items) {
    roll -= i.weight;
    if (roll < 0) return i;
  }
  return items[items.length - 1]!;
}
