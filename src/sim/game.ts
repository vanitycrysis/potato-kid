import { pairKey } from '../content/validate';
import type { Content, KidId } from '../content/types';
import { createRng, type Rng } from './rng';
import { addKid, clampToBounds, createWorld, STEP, stepWander, type Bounds, type Kid, type World } from './world';

/** Player input, applied at the start of the next sim step. */
export type Command =
  | { type: 'pickUp'; kidId: number }
  | { type: 'drop'; kidId: number; x: number; y: number }
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
  /** Seconds accumulated toward the next spawn, in [0, interval]. Persisted (plan §3). */
  spawnProgress: number;
  /** Kid types the player has seen born from a recipe or the Garden. */
  discoveredKids: KidId[];
  /** Recipe pair keys (`pairKey`) the player has triggered. */
  discoveredRecipes: string[];
}

export interface Garden {
  /** Ground point new kids appear around. */
  x: number;
  y: number;
}

export class Game {
  readonly state: GameState;
  private readonly rng: Rng;
  private readonly recipes: Map<string, KidId>;
  private readonly spawnTable: { id: KidId; weight: number }[];
  private readonly spawnTotal: number;

  constructor(
    private readonly content: Content,
    bounds: Bounds,
    private readonly garden: Garden,
    seed: number,
  ) {
    this.rng = createRng(seed);
    this.recipes = new Map(content.recipes.map((r) => [pairKey(r.a, r.b), r.result]));
    this.spawnTable = Object.entries(content.balance.spawnWeights).map(([id, weight]) => ({ id, weight }));
    this.spawnTotal = this.spawnTable.reduce((sum, e) => sum + e.weight, 0);
    this.state = {
      world: createWorld(bounds),
      rngState: this.rng.state,
      spawnProgress: 0,
      discoveredKids: [],
      discoveredRecipes: [],
    };
    for (let i = 0; i < content.balance.spawn.startingKids; i++) {
      const p = clampToBounds(bounds, bounds.minX + this.rng.next() * (bounds.maxX - bounds.minX), bounds.minY + this.rng.next() * (bounds.maxY - bounds.minY));
      this.discover(addKid(this.state.world, this.rollSpawnType(), p.x, p.y, this.rng).type);
    }
    this.state.rngState = this.rng.state;
  }

  get interval(): number {
    return this.content.balance.spawn.intervalSeconds;
  }

  get capacity(): number {
    return this.content.balance.spawn.capacity;
  }

  /** Advances one fixed step. */
  step(commands: Command[], dt: number = STEP): GameEvent[] {
    const events: GameEvent[] = [];
    this.applyCommands(commands, events);
    for (const kid of this.state.world.kids) kid.grace = Math.max(0, kid.grace - dt);
    stepWander(this.state.world, this.rng, this.content.balance.wander, dt);
    this.resolveFusions(events);
    this.advanceSpawn(dt, events);
    this.state.rngState = this.rng.state;
    return events;
  }

  private applyCommands(commands: Command[], events: GameEvent[]): void {
    const { world } = this.state;
    for (const c of commands) {
      const kid = world.kids.find((k) => k.id === c.kidId);
      if (!kid) continue; // e.g. consumed before the command arrived
      if (c.type === 'pickUp') {
        kid.held = true;
        kid.idle = 0;
        events.push({ type: 'pickedUp', kidId: kid.id });
      } else {
        const p = clampToBounds(world.bounds, c.x, c.y);
        kid.x = p.x;
        kid.y = p.y;
        kid.held = false;
        if (c.type === 'drop') events.push({ type: 'dropped', kidId: kid.id });
      }
    }
  }

  /**
   * Contact → fusion, per the plan's contact contract: candidates sorted by
   * (distance, lower id, higher id); a kid consumed earlier in this step is
   * skipped, so no kid can fuse twice.
   */
  private resolveFusions(events: GameEvent[]): void {
    const { world } = this.state;
    const r = this.content.balance.contactRadius;
    const eligible = world.kids.filter((k) => !k.held && k.grace === 0);
    const candidates: { d: number; a: Kid; b: Kid; result: KidId }[] = [];

    // Spatial hash with cell size = contact radius: only neighbouring cells can touch.
    const cells = new Map<string, Kid[]>();
    const cellOf = (k: Kid) => [Math.floor(k.x / r), Math.floor(k.y / r)] as const;
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
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (d > r) continue;
            const result = this.recipes.get(pairKey(a.type, b.type));
            if (result) candidates.push({ d, a, b, result });
          }
        }
      }
    }
    candidates.sort((p, q) => p.d - q.d || p.a.id - q.a.id || p.b.id - q.b.id);

    const consumed = new Set<number>();
    for (const c of candidates) {
      if (consumed.has(c.a.id) || consumed.has(c.b.id)) continue;
      consumed.add(c.a.id);
      consumed.add(c.b.id);
      world.kids = world.kids.filter((k) => k.id !== c.a.id && k.id !== c.b.id);
      const child = addKid(world, c.result, (c.a.x + c.b.x) / 2, (c.a.y + c.b.y) / 2, this.rng, this.content.balance.spawn.newbornGraceSeconds);
      const key = pairKey(c.a.type, c.b.type);
      const firstDiscovery = !this.state.discoveredRecipes.includes(key);
      if (firstDiscovery) this.state.discoveredRecipes.push(key);
      this.discover(child.type);
      events.push({ type: 'fused', parents: [c.a, c.b], child, firstDiscovery });
    }
  }

  /**
   * Spawn timer (plan §3): progress accumulates; at the interval a kid spawns
   * if there is room. When the map is full, progress holds at the interval:
   * one spawn is banked and fires as soon as a slot frees.
   */
  private advanceSpawn(dt: number, events: GameEvent[]): void {
    const s = this.state;
    const raw = s.spawnProgress + dt;
    // Tolerance absorbs float drift from summing 0.1 s steps (120 × 0.1 ≠ 12 exactly).
    if (raw < this.interval - 1e-6 || s.world.kids.length >= this.capacity) {
      s.spawnProgress = Math.min(this.interval, raw);
      return;
    }
    // Keep the overshoot so spawn timing doesn't drift with the step size.
    s.spawnProgress = Math.max(0, Math.min(this.interval, raw - this.interval));
    const angle = this.rng.next() * Math.PI * 2;
    const p = clampToBounds(s.world.bounds, this.garden.x + Math.cos(angle) * 60, this.garden.y + 40 + Math.abs(Math.sin(angle)) * 40);
    const kid = addKid(s.world, this.rollSpawnType(), p.x, p.y, this.rng, this.content.balance.spawn.newbornGraceSeconds);
    this.discover(kid.type);
    events.push({ type: 'spawned', kid });
  }

  /** Debug/test only: place a kid directly, bypassing the Garden and capacity. */
  debugAddKid(type: KidId, x: number, y: number): Kid {
    const p = clampToBounds(this.state.world.bounds, x, y);
    const kid = addKid(this.state.world, type, p.x, p.y, this.rng);
    this.discover(type);
    this.state.rngState = this.rng.state;
    return kid;
  }

  private rollSpawnType(): KidId {
    let roll = this.rng.next() * this.spawnTotal;
    for (const e of this.spawnTable) {
      roll -= e.weight;
      if (roll < 0) return e.id;
    }
    return this.spawnTable[this.spawnTable.length - 1]!.id;
  }

  private discover(type: KidId): void {
    if (!this.state.discoveredKids.includes(type)) this.state.discoveredKids.push(type);
  }
}

