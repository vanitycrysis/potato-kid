import { pairKey } from '../content/validate';
import { BUILDING_IDS, type BuildingId, type Content, type KidId } from '../content/types';
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
  | { type: 'cancelDrag'; kidId: number; x: number; y: number }
  /** Buy the next level of a building with Materials (instant, plan §2). */
  | { type: 'upgrade'; building: BuildingId }
  /** Which spawn-pool type the bias building favours (null: none). */
  | { type: 'setBias'; kidType: KidId | null }
  /** Spawn a Garden kid now for Potatokens (D-019). */
  | { type: 'instantSpawn' }
  /** Compendium: spawn an already-discovered type, paid in Materials or Potatokens. */
  | { type: 'respawn'; kidType: KidId; pay: 'materials' | 'potatokens' }
  /**
   * A kid dropped on the Garden goes home (D-048): it leaves the map for good, stays in the
   * Dex, and can come back through the Compendium. No refund: Garden kids are free.
   */
  | { type: 'sendHome'; kidId: number };

/** Why a purchase or setting was refused; the UI explains it, and nothing changes. */
export type RejectReason = 'cost' | 'maxLevel' | 'full' | 'noRoom' | 'locked' | 'undiscovered' | 'notSpawnable';

export type SpawnSource = 'garden' | 'instant' | 'compendium' | 'offline';

/** What offline catch-up credited (plan §3); the return screen shows it. */
export interface OfflineReport {
  /** Seconds credited: wall time since `accountedUntil`, capped. */
  seconds: number;
  /** Seconds beyond the cap that were discarded. */
  discardedSeconds: number;
  materials: number;
  /** Potatokens from Dex milestones that offline spawns reached. */
  potatokens: number;
  spawned: Kid[];
}

type PurchaseCommand = Extract<Command, { type: 'upgrade' | 'setBias' | 'instantSpawn' | 'respawn' }>;

/** What happened during a step; rendering and audio react only to these. */
export type GameEvent =
  | { type: 'spawned'; kid: Kid; source: SpawnSource }
  | { type: 'fused'; parents: [Kid, Kid]; child: Kid; firstDiscovery: boolean }
  | { type: 'pickedUp'; kidId: number }
  | { type: 'dropped'; kidId: number }
  | { type: 'sentHome'; kid: Kid }
  | { type: 'upgraded'; building: BuildingId; level: number }
  | { type: 'biasSet'; kidType: KidId | null }
  | { type: 'rejected'; command: Command['type']; reason: RejectReason }
  /** Potatokens earned (spends are implied by the command that caused them). */
  | { type: 'earned'; potatokens: number; reason: 'discovery' | 'milestone' };

/**
 * Everything a save needs (plan §4). The world's bounds and scenery come from the map
 * data, not the save, so a save survives map changes.
 */
export type PersistedState = Omit<GameState, 'world'> & { world: Pick<World, 'kids' | 'nextKidId'> };

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
  /** Soft currency, earned passively by every kid on the map (D-020). Fractional. */
  materials: number;
  /** Hard currency: whole numbers only (D-019). */
  potatokens: number;
  buildings: Record<BuildingId, number>;
  /** The spawn-pool type the bias building favours. */
  biasTarget: KidId | null;
  /** How many Dex milestones have paid out, in balance order. */
  milestonesPaid: number;
  /**
   * Wall-clock ms up to which spawns and income are credited: the single accounting
   * boundary for online and offline time (plan §3). A high-water mark: it never moves back.
   */
  accountedUntil: number;
}

/** Weighted appearance options, derived from the rig (art data) with boxes in world units. */
export interface LookTable {
  bodies: { id: string; weight: number; box: Box }[];
  faces: { id: string; weight: number }[];
  sizes: { scale: number; weight: number }[];
}

/** How long rest activities last; derived from the rig's scheduler and clip lengths. */
export interface Ambient {
  weights: { look: number; wave: number; sit: number; sleep: number };
  /** Chance a rest is an ambient activity rather than a plain pause. */
  chance: number;
  /** The rig's stationary wait before an ambient pose may start (scheduler.stationaryDelaySeconds). */
  stationaryDelay: [number, number];
  lookSeconds: number;
  waveSeconds: number;
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
  /** Wall-clock ms at creation: a new save is accounted up to now. */
  now?: number;
}

export class Game {
  readonly state: GameState;
  private readonly rng: Rng;
  private readonly cosmetic: Rng;
  private readonly spawnRng: Rng;
  private readonly recipes: Map<string, KidId>;
  private readonly spawnTable: { id: KidId; weight: number }[];
  private readonly tiers: Map<KidId, number>;
  private readonly looks: LookTable;
  private readonly spawnAt: { x: number; y: number };
  private readonly ambient: Ambient | undefined;
  /** A due Garden spawn found no free spot near the outlet (shown as "Waiting for room"). */
  private blocked = false;

  constructor(
    private readonly content: Content,
    options: GameOptions,
    seed: number,
    /** A loaded save (already validated): restores it instead of starting a new map. */
    saved?: PersistedState,
  ) {
    this.rng = createRng(seed);
    this.cosmetic = createRng((seed ^ 0x9e3779b9) >>> 0);
    this.spawnRng = createRng((seed ^ 0x85ebca6b) >>> 0);
    this.recipes = new Map(content.recipes.map((r) => [pairKey(r.a, r.b), r.result]));
    this.spawnTable = Object.entries(content.balance.spawnWeights).map(([id, weight]) => ({ id, weight }));
    this.tiers = new Map(content.kids.map((k) => [k.id, k.tier]));
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
      materials: content.balance.economy.startingMaterials,
      potatokens: content.balance.economy.startingPotatokens,
      buildings: Object.fromEntries(BUILDING_IDS.map((b) => [b, content.balance.buildings[b].startLevel])) as Record<BuildingId, number>,
      biasTarget: null,
      milestonesPaid: 0,
      accountedUntil: options.now ?? 0,
    };
    if (saved) {
      this.restore(saved);
      return;
    }
    for (let i = 0; i < content.balance.spawn.startingKids; i++) {
      // Starting kids appear around the spawn outlet, each on a free spot (D-039).
      const look = this.rollLook();
      const p = this.freeSpot(look.box, this.spawnAt.x + (this.rng.next() - 0.5) * 600, this.spawnAt.y + this.rng.next() * 400);
      if (!p) continue;
      // Starting kids seed the Dex directly: a new save hasn't earned any milestone yet.
      const type = this.add(this.rollSpawnType(), p, 0, look).type;
      if (!this.state.discoveredKids.includes(type)) this.state.discoveredKids.push(type);
    }
    this.state.milestonesPaid = this.milestonesReached();
    this.syncRngState();
  }

  /** A deep copy of the state to save: no live references into the running game. */
  persisted(): PersistedState {
    this.syncRngState();
    const { world, ...rest } = this.state;
    return structuredClone({ ...rest, world: { kids: world.kids, nextKidId: world.nextKidId } });
  }

  private restore(saved: PersistedState): void {
    const copy = structuredClone(saved);
    Object.assign(this.state, copy, { world: { ...this.state.world, kids: copy.world.kids, nextKidId: copy.world.nextKidId } });
    for (const kid of this.state.world.kids) {
      // Nobody is mid-drag in a loaded game, and the box always follows the current art.
      kid.held = false;
      // Appearance is cosmetic: a body or face the current art doesn't have (e.g. retired
      // in a later version) maps to the first one rather than failing to draw (Codex review, PR #30).
      const body = this.looks.bodies.find((b) => b.id === kid.look.body) ?? this.looks.bodies[0]!;
      if (!this.looks.faces.some((f) => f.id === kid.look.face)) kid.look.face = this.looks.faces[0]!.id;
      kid.look.body = body.id;
      const k = kid.look.scale;
      kid.box = { left: body.box.left * k, top: body.box.top * k, right: body.box.right * k, bottom: body.box.bottom * k };
    }
    this.rng.setState(copy.rngState);
    this.cosmetic.setState(copy.cosmeticRngState);
    this.spawnRng.setState(copy.spawnRngState);
  }

  /** Garden spawn interval, seconds: `base · factor^(level−1)` (plan §3). */
  get interval(): number {
    const e = this.content.balance.economy;
    return this.content.balance.spawn.intervalSeconds * e.gardenIntervalFactor ** (this.state.buildings.garden - 1);
  }

  /** Map capacity: `base + perLevel·(level−1)` (plan §3). */
  get capacity(): number {
    const e = this.content.balance.economy;
    return this.content.balance.spawn.capacity + e.capacityPerLevel * (this.state.buildings.capacity - 1);
  }

  /** Materials per second from every kid on the map: the sum of `base · 2^(tier−1)` (D-020). */
  get income(): number {
    let sum = 0;
    for (const k of this.state.world.kids) sum += this.incomeOf(k.type);
    return sum;
  }

  incomeOf(type: KidId): number {
    return this.content.balance.economy.materialsPerSecond * 2 ** ((this.tiers.get(type) ?? 1) - 1);
  }

  /** Materials to upgrade a building from its current level, or null at max level. */
  upgradeCost(building: BuildingId): number | null {
    const b = this.content.balance.buildings[building];
    const level = this.state.buildings[building];
    if (level >= b.maxLevel) return null;
    return Math.ceil(b.costBase * b.costGrowth ** level);
  }

  /** Compendium respawn price for a type, in each currency. */
  respawnCost(type: KidId): { materials: number; potatokens: number } {
    const e = this.content.balance.economy;
    const tier = this.tiers.get(type) ?? 1;
    return { materials: Math.ceil(e.respawnMaterials * 2 ** (tier - 1)), potatokens: e.respawnPotatokensPerTier * tier };
  }

  /**
   * A due Garden spawn is waiting because no spot near the Garden is free, though the map
   * isn't full (GUI_MVP §3: "Waiting for room" only after a real failed placement).
   */
  get waitingForRoom(): boolean {
    return this.blocked;
  }

  /** Spawn-pool weights with the bias building applied. */
  get spawnWeights(): { id: KidId; weight: number }[] {
    const s = this.state;
    const factor = 1 + this.content.balance.economy.biasWeightPerLevel * s.buildings.bias;
    return this.spawnTable.map((e) => (e.id === s.biasTarget ? { id: e.id, weight: e.weight * factor } : e));
  }

  get touchSlack(): number {
    return this.content.balance.body.touchSlack;
  }

  /**
   * Where a held kid would land if dropped near (x, y): the nearest spot where its box
   * touches nothing (D-039, D-043). The scene draws the held kid there, so a lifted kid
   * never overlaps anyone either; it can still sit right against a recipe partner.
   */
  landingSpot(
    kidId: number,
    x: number,
    y: number,
    drawn?: Map<number, { x: number; y: number }>,
    limit?: Bounds,
  ): { x: number; y: number } | null {
    const world = this.state.world;
    const kid = world.kids.find((k) => k.id === kidId);
    if (!kid) return null;
    if (!drawn || drawn.size === 0) return findFreeSpot(world, kid.box, x, y, kid.id, limit);
    // Free against both where neighbours ARE (the sim, so the drop won't be re-resolved)
    // and where they're DRAWN this frame (interpolated), so the preview never overlaps
    // a neighbour on screen either (render-time separation; Codex review, PR #14).
    const ghosts = world.kids.flatMap((k) => {
      const d = drawn.get(k.id);
      return d && (d.x !== k.x || d.y !== k.y) ? [{ ...k, x: d.x, y: d.y }] : [];
    });
    return findFreeSpot({ ...world, kids: [...world.kids, ...ghosts] }, kid.box, x, y, kid.id, limit);
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
    // Income for the step, from the kids present after commands (plan §3).
    this.state.materials += this.income * dt;
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
    // This step's time is now credited (plan §3): online time is never credited again offline.
    this.state.accountedUntil += dt * 1000;
    this.syncRngState();
    return events;
  }

  /**
   * Offline catch-up (plan §3, D-018), for time the app was suspended. Deliberately
   * simpler than online play: no wandering and no fusions. Garden spawns fill free slots
   * on the interval schedule, and every kid earns from the moment it exists. Credits
   * only time after `accountedUntil`, capped, then advances it to `now`; a clock that
   * reads earlier than `accountedUntil` credits nothing and moves nothing back.
   */
  reconcile(now: number): OfflineReport {
    const s = this.state;
    const capSeconds = this.content.balance.economy.offlineCapHours * 3600;
    const elapsed = Math.max(0, (now - s.accountedUntil) / 1000);
    const away = Math.min(elapsed, capSeconds);
    s.accountedUntil = Math.max(s.accountedUntil, now);

    const interval = this.interval;
    const events: GameEvent[] = [];
    const spawned: Kid[] = [];
    let materials = this.income * away;
    // First spawn when the current interval completes; a banked spawn (progress at the
    // interval) is due at once. At most `capacity` admissions, so the loop is bounded.
    let t = Math.max(0, interval - s.spawnProgress);
    let last: number | undefined;
    // Tolerance absorbs float drift, as in advanceSpawn.
    while (t <= away + 1e-6 && s.world.kids.length < this.capacity) {
      const kid = this.spawnAtOutlet(() => this.rollSpawnType(), 'offline', events);
      if (!kid) break; // no free spot near the Garden: treat as full
      kid.grace = 0; // it has been around for a while
      spawned.push(kid);
      materials += this.incomeOf(kid.type) * Math.max(0, away - t);
      last = t;
      t += interval;
    }
    // Phase rule (plan §3): after a spawn, progress restarts from the last one; otherwise
    // it keeps accumulating, holding at the interval (one banked spawn) when full.
    s.spawnProgress = Math.min(interval, last === undefined ? s.spawnProgress + away : Math.max(0, away - last));
    s.materials += materials;
    this.syncRngState();
    let potatokens = 0;
    for (const e of events) if (e.type === 'earned') potatokens += e.potatokens;
    return { seconds: away, discardedSeconds: elapsed - away, materials, potatokens, spawned };
  }

  /** Applies player commands; returns pairs the player saw touching at a drop. */
  private applyCommands(commands: Command[], events: GameEvent[]): [number, number][] {
    const { world } = this.state;
    const seen: [number, number][] = [];
    for (const c of commands) {
      if (c.type === 'upgrade' || c.type === 'setBias' || c.type === 'instantSpawn' || c.type === 'respawn') {
        this.applyPurchase(c, events);
        continue;
      }
      const kid = world.kids.find((k) => k.id === c.kidId);
      if (!kid) continue; // e.g. consumed before the command arrived
      if (c.type === 'sendHome') {
        world.kids.splice(world.kids.indexOf(kid), 1);
        events.push({ type: 'sentHome', kid });
        continue;
      }
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

  private applyPurchase(c: PurchaseCommand, events: GameEvent[]): void {
    const s = this.state;
    const reject = (reason: RejectReason) => {
      events.push({ type: 'rejected', command: c.type, reason });
    };
    switch (c.type) {
      case 'upgrade': {
        const cost = this.upgradeCost(c.building);
        if (cost === null) return reject('maxLevel');
        if (s.materials < cost) return reject('cost');
        s.materials -= cost;
        s.buildings[c.building]++;
        // A faster Garden keeps at most one banked spawn (plan §3): clamp before the step's
        // spawn consumes it, or the leftover would bank a second one (Codex review, PR #27).
        s.spawnProgress = Math.min(s.spawnProgress, this.interval);
        events.push({ type: 'upgraded', building: c.building, level: s.buildings[c.building] });
        return;
      }
      case 'setBias':
        // The engine guards this too, not only the UI (GUI_MVP §5).
        if (s.buildings.bias < 1) return reject('locked');
        if (c.kidType !== null && !this.spawnTable.some((e) => e.id === c.kidType)) return reject('notSpawnable');
        s.biasTarget = c.kidType;
        events.push({ type: 'biasSet', kidType: c.kidType });
        return;
      case 'instantSpawn': {
        const price = this.content.balance.economy.instantSpawnPotatokens;
        if (s.potatokens < price) return reject('cost');
        if (s.world.kids.length >= this.capacity) return reject('full');
        // The Garden's timer is untouched: an instant spawn is extra, not a skip.
        if (!this.spawnAtOutlet(() => this.rollSpawnType(), 'instant', events)) return reject('noRoom');
        s.potatokens -= price;
        return;
      }
      case 'respawn': {
        if (s.buildings.compendium < 1) return reject('locked');
        if (!s.discoveredKids.includes(c.kidType)) return reject('undiscovered');
        const cost = this.respawnCost(c.kidType);
        const price = c.pay === 'materials' ? cost.materials : cost.potatokens;
        if ((c.pay === 'materials' ? s.materials : s.potatokens) < price) return reject('cost');
        if (s.world.kids.length >= this.capacity) return reject('full');
        if (!this.spawnAtOutlet(() => c.kidType, 'compendium', events)) return reject('noRoom');
        if (c.pay === 'materials') s.materials -= price;
        else s.potatokens -= price;
        return;
      }
    }
  }

  /** A newborn at the Garden outlet, if a spot is free; the type is drawn only then. */
  private spawnAtOutlet(type: () => KidId, source: SpawnSource, events: GameEvent[]): Kid | null {
    const look = this.peekLook();
    const p = this.freeSpot(look.box, this.spawnAt.x, this.spawnAt.y);
    if (!p) return null;
    this.rollLook(); // commit the peeked roll
    const kid = this.add(type(), p, this.content.balance.spawn.newbornGraceSeconds, look);
    events.push({ type: 'spawned', kid, source });
    this.discover(kid.type, events);
    return kid;
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
      events.push({ type: 'fused', parents: [c.a, c.b], child, firstDiscovery });
      if (firstDiscovery) {
        this.state.discoveredRecipes.push(key);
        this.earn(this.content.balance.economy.discoveryPotatokens, 'discovery', events);
      }
      this.discover(child.type, events);
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
      this.blocked = false;
      return;
    }
    if (!this.spawnAtOutlet(() => this.rollSpawnType(), 'garden', events)) {
      s.spawnProgress = Math.min(this.interval, raw);
      this.blocked = true;
      return;
    }
    this.blocked = false;
    // Keep the overshoot so spawn timing doesn't drift with the step size.
    s.spawnProgress = Math.max(0, Math.min(this.interval, raw - this.interval));
  }

  /** Debug/test only: place a kid directly, bypassing the Garden and capacity; optionally fix its look. */
  debugAddKid(type: KidId, x: number, y: number, force?: Partial<Look>): Kid {
    const look = this.forceLook(this.rollLook(), force);
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

  private forceLook(look: Look & { box: Box }, force?: Partial<Look>): Look & { box: Box } {
    if (!force) return look;
    const body = this.looks.bodies.find((b) => b.id === (force.body ?? look.body)) ?? this.looks.bodies[0]!;
    const face = force.face ?? look.face;
    const s = force.scale ?? look.scale;
    const b = body.box;
    return { body: body.id, face, scale: s, box: { left: b.left * s, top: b.top * s, right: b.right * s, bottom: b.bottom * s } };
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
      { id: 'wave' as const, weight: a.weights.wave },
      { id: 'sit' as const, weight: a.weights.sit },
      { id: 'sleep' as const, weight: a.weights.sleep },
    ]).id;
    if (pick === 'look') return { kind: 'look', left: a.lookSeconds };
    if (pick === 'wave') return { kind: 'wave', left: a.waveSeconds };
    const range = pick === 'sit' ? a.seatedHold : a.sleepHold;
    const hold = range[0] + r.next() * (range[1] - range[0]);
    const total = pick === 'sit' ? a.sitSeconds(hold) : a.sleepSeconds(hold);
    return { kind: pick, left: total, total };
  }

  private rollSpawnType(): KidId {
    return weighted(this.spawnRng, this.spawnWeights).id;
  }

  /** Records a type in the Dex; crossing a Dex milestone pays Potatokens. */
  private discover(type: KidId, events?: GameEvent[]): void {
    if (this.state.discoveredKids.includes(type)) return;
    this.state.discoveredKids.push(type);
    const milestones = this.content.balance.economy.dexMilestones;
    while (this.state.milestonesPaid < this.milestonesReached()) {
      const m = milestones[this.state.milestonesPaid++]!;
      this.earn(m.potatokens, 'milestone', events);
    }
  }

  private milestonesReached(): number {
    const n = this.state.discoveredKids.length;
    return this.content.balance.economy.dexMilestones.filter((m) => n >= m.kids).length;
  }

  private earn(potatokens: number, reason: 'discovery' | 'milestone', events?: GameEvent[]): void {
    if (potatokens <= 0) return;
    this.state.potatokens += potatokens;
    events?.push({ type: 'earned', potatokens, reason });
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
