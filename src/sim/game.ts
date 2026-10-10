import { checkName } from './names';
import { pairKey } from '../content/validate';
import { BUILDING_IDS, type BuildingId, type Content, type KidId } from '../content/types';
import { createRng, type Rng } from './rng';
import { clearSpotFor, wanderOffline } from './offlineWander';
import { blockedByScenery, findFreeSpot, gaps, isFree, kidRect, separate, touching } from './space';
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
   * `target`: the kid under the finger at release (D-051). The pair is tried first,
   * touching or not; a non-recipe pair just lands as usual (D-039).
   */
  | { type: 'drop'; kidId: number; x: number; y: number; touching?: number[]; target?: number }
  /**
   * A drag ends with no drop. `safe`: put down clear of recipe partners, with a newborn's
   * grace, so it can't fuse on the way back (a release over a field that didn't take it, §22.4).
   */
  | { type: 'cancelDrag'; kidId: number; x: number; y: number; safe?: boolean }
  /** Buy the next level of a building with Materials (instant, plan §2). */
  | { type: 'upgrade'; building: BuildingId }
  /** Which spawn-pool type the bias building favours (null: none). */
  | { type: 'setBias'; kidType: KidId | null }
  /** Spawn a Garden kid now for Potatokens (D-019). */
  | { type: 'instantSpawn' }
  /** Compendium: spawn an already-discovered type, paid in Materials or Potatokens. */
  | { type: 'respawn'; kidType: KidId; pay: 'materials' | 'potatokens' }
  /**
   * Plant kids (D-061, replacing Send home): they leave the map into `plot` (the picker), or,
   * by drag, into the plot still filling, else the lowest empty one. All or none: a kid gone,
   * or more than the plot's free spaces, refuses the lot (GUI_MVP §15.3). They stay in the Dex.
   */
  | { type: 'plant'; kidIds: number[]; plot?: number }
  /** Start a plot growing (D-061): it needs `minKids` kids; never automatic. */
  | { type: 'startGrowing'; plot: number }
  /** Take one kid back out of a plot still filling (D-074): it comes back to the map as it went in. */
  | { type: 'unplant'; plot: number; kidId: number }
  /**
   * Empty a plot (D-074): every kid in it comes back to the map, all or none. A growing plot
   * is cancelled and its growing time lost; a ready one can't be emptied.
   */
  | { type: 'emptyPlot'; plot: number }
  /** Unlock the next plot with Materials (GUI_MVP §15.4). */
  | { type: 'unlockPlot' }
  /**
   * Feed a kid one bite from the pantry (D-056, D-069): happy for a while. A hated food is
   * refused and nothing is used. A farming kid can be fed too.
   */
  | { type: 'feed'; kidId: number; food: string }
  /** Buy the next food field with Materials (D-069). Kids standing in its bay move aside. */
  | { type: 'unlockField' }
  /**
   * Choose a field's food (D-069, GUI_MVP §22.3). Changing it loses the field's progress
   * toward its next bite; kids who hate the new food go back to the map, all or none.
   */
  | { type: 'setFieldFood'; field: number; food: string }
  /** Kids on the map start farming a field (D-069): all or none. */
  | { type: 'farm'; field: number; kidIds: number[] }
  /** One farming kid back to the map (D-069). */
  | { type: 'unfarm'; field: number; kidId: number }
  /** Every farming kid in a field back to the map, all or none (D-069). */
  | { type: 'emptyField'; field: number }
  /** Name a kid for Materials (D-057), or clear its name (`null`), which is free. */
  | { type: 'name'; kidId: number; name: string | null };

/** Why a purchase or setting was refused; the UI explains it, and nothing changes. */
export type RejectReason =
  | 'cost'
  | 'maxLevel'
  | 'full'
  | 'noRoom'
  | 'locked'
  | 'undiscovered'
  | 'notSpawnable'
  | 'gone'
  | 'plotsBusy'
  | 'plotFull'
  | 'tooFewKids'
  /** The plot's sprout is ready: it can't be cancelled (D-074). */
  | 'ready'
  /** The kid won't eat that food (D-056). Nothing is spent. */
  | 'hated'
  /** Not a food, or not an allowed name (GUI_MVP §18.2). */
  | 'invalid'
  /** The kid already has that name, or has none to clear. */
  | 'unchanged'
  /** The pantry has no bite of that food (D-069). */
  | 'noFood'
  /** The field has no food chosen yet (D-069). */
  | 'noCrop'
  /** The field has no free place for that many kids (D-069). */
  | 'fieldFull';

export type SpawnSource = 'garden' | 'instant' | 'compendium' | 'offline' | 'sprout';

/** Who a card's action was for: a kid on the map, or one farming (D-069). */
export type KidRef = Pick<Kid, 'id' | 'type'> & { name?: string };

/**
 * A food field (D-069): its food, the kids working it (kept as they went in, like planted
 * kids: they come back with their id, name and what is left of their happiness), and its
 * progress toward the next bite, a fraction of one.
 */
export interface Field {
  food: string | null;
  workers: Omit<PlantedKid, 'happy'>[];
  progress: number;
}

/** What a started seed sprouts (D-061): decided at Start growing, so saves never change it. */
export interface Sprout {
  type: KidId;
}

/** A kid as it was planted (GUI_MVP §15.4: the plot detail still shows it). */
export interface PlantedKid {
  /** The kid's id on the map; it keeps it if it comes back (D-074). */
  id: number;
  type: KidId;
  look: Look;
  /** Its name, which comes back with it (D-074) and ends when the seed sprouts (D-057). */
  name?: string;
  /** Happy when added (D-056): it counts one tier higher in the odds, for good (GUI_MVP §15.3). */
  happy?: boolean;
  /** Happiness it still has: it keeps counting down in the plot, and comes back with the kid (D-074). */
  happiness?: { left: number; favourite: boolean };
}

/** A plot's seed (D-061): the kids planted in it, then, once started, its sprout. */
export interface Seed {
  /** The kids planted, in order: `minKids` to `maxKids` before it can start. */
  planted: PlantedKid[];
  /** Null while the plot is still filling; set when the player starts it growing. */
  sprout: Sprout | null;
  /** Seconds grown since it started, online and offline; ready at `balance.planting.growSeconds`. */
  grown: number;
}

/** One unlocked plot: empty, or growing a seed. */
export interface Plot {
  seed: Seed | null;
}

/** Why a ready plot hasn't sprouted (GUI_MVP §15.3): the map is full, or no spot by the Garden is clear. */
export type PlotWaiting = 'full' | 'noRoom';

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
  /** Kids that sprouted from plots while away (D-054). */
  sprouted: Kid[];
  /** Plots ready on return but waiting for room. */
  plotsWaiting: number;
  /** Bites the fields grew while away, by food (D-069). */
  food: Record<string, number>;
}

type PurchaseCommand = Extract<Command, { type: 'upgrade' | 'setBias' | 'instantSpawn' | 'respawn' | 'unlockPlot' }>;

/** What happened during a step; rendering and audio react only to these. */
export type GameEvent =
  /** `plot`: the plot a sprout came up from (0-based). */
  | { type: 'spawned'; kid: Kid; source: SpawnSource; plot?: number }
  | { type: 'fused'; parents: [Kid, Kid]; child: Kid; firstDiscovery: boolean }
  | { type: 'pickedUp'; kidId: number }
  | { type: 'dropped'; kidId: number }
  /** A kid was planted in `plot` (0-based); `count`: the kids in it now. */
  | { type: 'planted'; kid: Kid; plot: number; count: number }
  /** A kid came back out of `plot` to the map (D-074); `count`: the kids left in it. */
  | { type: 'unplanted'; kid: Kid; plot: number; count: number }
  /** A bite accepted (D-056): the kid is happy from now, replacing any earlier happiness. */
  | { type: 'fed'; kid: KidRef; food: string; favourite: boolean }
  /** A name given, or cleared (`null`) (D-057). */
  | { type: 'named'; kid: KidRef; name: string | null }
  /** A plot started growing; its sprout is decided (not revealed until it comes up). */
  | { type: 'growing'; plot: number }
  | { type: 'plotUnlocked'; plots: number }
  /** A field bought (D-069); `fields`: how many there are now. */
  | { type: 'fieldUnlocked'; fields: number }
  /** A field's food chosen or changed (D-069). */
  | { type: 'fieldFood'; field: number; food: string }
  /** A kid started farming `field`; `count`: the kids in it now. */
  | { type: 'farming'; kid: Kid; field: number; count: number }
  /** A farming kid came back to the map; `count`: the kids left in the field. */
  | { type: 'unfarmed'; kid: Kid; field: number; count: number }
  /** Whole bites a field added to the pantry (D-069). */
  | { type: 'harvested'; field: number; food: string; bites: number }
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
  /** Garden spawns so far, online and offline: the first few make the tutorial (D-052). */
  gardenSpawns: number;
  /** Unlocked plots, in order (D-054). */
  plots: Plot[];
  /** Bought food fields, in order (D-069). */
  fields: Field[];
  /** Whole bites of each food, from the fields (D-069). */
  pantry: Record<string, number>;
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
  /**
   * Each food field's bay, in field order (Codex's farm_v1): a bought field is scenery, so
   * nothing wanders, spawns or lands in it (GUI_MVP §22.1).
   */
  fieldBays?: Obstacle[];
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
  private readonly fieldBays: Obstacle[];
  /** A due Garden spawn found no free spot near the outlet (shown as "Waiting for room"). */
  private blocked = false;
  /** Ready plots that couldn't sprout in the last step, and why. */
  private readonly plotWaits = new Map<number, PlotWaiting>();

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
    this.fieldBays = options.fieldBays ?? [];
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
      gardenSpawns: 0,
      plots: Array.from({ length: content.balance.planting.startPlots }, () => ({ seed: null })),
      fields: [],
      pantry: {},
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
      // Bought fields are scenery before kids are placed: one standing in a bay moves (§22.1).
      for (let i = 0; i < saved.fields.length; i++) this.addBay(i);
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
      const { box, ...look } = this.lookWithBox(kid.look);
      kid.look = look;
      kid.box = box;
    }
    // Farming kids are drawn too: the same fallback for a body or face the art no longer has
    // (Codex review, #90).
    for (const worker of this.state.fields.flatMap((f) => f.workers)) {
      const { body, face, scale } = this.lookWithBox(worker.look);
      worker.look = { body, face, scale };
    }
    // A save from another map (schema 8 moved kids beside the v3 Garden, D-071), or a box
    // grown with new art, may leave a kid in scenery or another kid: it moves to the nearest
    // free spot clear of recipe partners, so loading never fuses it.
    for (const kid of this.state.world.kids) {
      if (isFree(this.state.world, kid.box, kid.x, kid.y, kid.id)) continue;
      const spot = clearSpotFor(this.state.world, kid, this.content.balance.body.touchSlack, (a, b) => this.recipes.has(pairKey(a.type, b.type)));
      if (spot) [kid.x, kid.y] = [spot.x, spot.y];
    }
    this.rng.setState(copy.rngState);
    this.cosmetic.setState(copy.cosmeticRngState);
    this.spawnRng.setState(copy.spawnRngState);
  }

  /**
   * Garden spawn interval, seconds: the tutorial's for its first spawns (D-052), then
   * `base · factor^(level−1)` (plan §3).
   */
  get interval(): number {
    const sp = this.content.balance.spawn;
    if (this.state.gardenSpawns < sp.tutorialSpawns) return sp.tutorialIntervalSeconds;
    return this.gardenInterval(this.state.buildings.garden);
  }

  /** The Garden's schedule at `level`, after the tutorial: what an upgrade buys. */
  gardenInterval(level: number): number {
    return this.content.balance.spawn.intervalSeconds * this.content.balance.economy.gardenIntervalFactor ** (level - 1);
  }

  /** Map capacity: `base + perLevel·(level−1)` (plan §3). */
  get capacity(): number {
    const e = this.content.balance.economy;
    return this.content.balance.spawn.capacity + e.capacityPerLevel * (this.state.buildings.capacity - 1);
  }

  /** Materials per second from every kid on the map: the sum of `base · 2^(tier−1)` (D-020). */
  get income(): number {
    let sum = 0;
    for (const k of this.state.world.kids) sum += this.incomeOfKid(k);
    return sum;
  }

  /** What one kid earns per second: its type's rate (a rare's through its tier, D-072), more if happy (D-056). */
  incomeOfKid(kid: Pick<Kid, 'type' | 'happy'>): number {
    return this.baseIncomeOfKid(kid) * this.happyMultiplier(kid);
  }

  /** What a kid earns when not happy: its type's rate. */
  private baseIncomeOfKid(kid: Pick<Kid, 'type'>): number {
    return this.incomeOf(kid.type);
  }

  /** How many times as much a kid earns while happy (D-056): 1 when it isn't. */
  happyMultiplier(kid: Pick<Kid, 'happy'>): number {
    if (!kid.happy || kid.happy.left <= 0) return 1;
    const f = this.content.balance.feeding;
    return kid.happy.favourite ? f.favouriteMultiplier : f.happyMultiplier;
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
    const { seen, targeted } = this.applyCommands(commands, events);
    const world = this.state.world;
    // A drop resolves its contacts first: a partner walking away mustn't escape the touch
    // the player saw at release (Codex review, PR #14).
    if (commands.some((c) => c.type !== 'pickUp')) this.resolveFusions(events, seen, targeted);
    for (const kid of world.kids) kid.grace = Math.max(0, kid.grace - dt);
    // Income for the step, from the kids present after commands (plan §3).
    this.state.materials += this.income * dt;
    // Happiness wears off (D-056), after this step's income.
    for (const kid of world.kids) {
      if (!kid.happy) continue;
      kid.happy.left -= dt;
      if (kid.happy.left <= 0) delete kid.happy;
    }
    this.wearOffPlanted(dt);
    this.advanceFields(dt, events);
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
    // Ready sprouts come up before the Garden's own spawn (GUI_MVP §15.3).
    this.advancePlots(dt, events);
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

    const events: GameEvent[] = [];
    const spawned: Kid[] = [];
    const sprouted: Kid[] = [];
    /** Offline arrivals, seconds into the absence. */
    const arrived = new Map<number, number>();
    // Each kid earns its base rate for the whole absence, and its happy extra only until the
    // happiness wears off (D-056), which it does offline too.
    let materials = 0;
    for (const kid of s.world.kids) {
      const base = this.baseIncomeOfKid(kid);
      materials += base * away + base * (this.happyMultiplier(kid) - 1) * Math.min(away, kid.happy?.left ?? 0);
      if (kid.happy) {
        kid.happy.left -= away;
        if (kid.happy.left <= 0) delete kid.happy;
      }
    }
    this.wearOffPlanted(away);
    // Fields keep growing while away, for the credited time (D-069).
    const food: Record<string, number> = {};
    for (const e of this.advanceFields(away, [])) if (e.type === 'harvested') food[e.food] = (food[e.food] ?? 0) + e.bites;
    const admit = (kid: Kid, at: number, into: Kid[]) => {
      kid.grace = 0; // it has been around for a while
      into.push(kid);
      arrived.set(kid.id, at);
      materials += this.incomeOfKid(kid) * Math.max(0, away - at);
    };
    // Started seeds keep growing (D-061); those that ripen while away, in time then plot order.
    const grow = this.content.balance.planting.growSeconds;
    const ripening = s.plots
      .flatMap((p, i) => (p.seed?.sprout ? [{ i, at: Math.max(0, grow - p.seed.grown) }] : []))
      .filter((r) => r.at <= away + 1e-6)
      .sort((a, b) => a.at - b.at || a.i - b.i);
    for (const p of s.plots) if (p.seed?.sprout) p.seed.grown = Math.min(grow, p.seed.grown + away);
    // First spawn when the current interval completes; a banked spawn (progress at the
    // interval) is due at once. The interval is read per spawn: the tutorial can end
    // partway through (D-052). Garden spawns and sprouts share one timeline, a sprout first
    // on a tie, as online. Nothing leaves the map offline, so once it's full, or no spot
    // near the outlet is free, nothing more arrives; each turn admits a kid or stops.
    let t = Math.max(0, this.interval - s.spawnProgress);
    let last: number | undefined;
    // Tolerance absorbs float drift, as in advanceSpawn.
    for (;;) {
      const seed = ripening[0];
      const gardenDue = t <= away + 1e-6;
      if (s.world.kids.length >= this.capacity) break;
      if (seed && (!gardenDue || seed.at <= t + 1e-9)) {
        const kid = this.sproutFrom(seed.i, events);
        if (!kid) break;
        ripening.shift();
        admit(kid, seed.at, sprouted);
        continue;
      }
      if (!gardenDue) break;
      const kid = this.spawnAtOutlet(() => this.rollSpawnType(), 'offline', events);
      if (!kid) break;
      s.gardenSpawns++;
      admit(kid, t, spawned);
      last = t;
      t += this.interval;
    }
    // Phase rule (plan §3): after a spawn, progress restarts from the last one; otherwise
    // it keeps accumulating, holding at the interval (one banked spawn) when full.
    s.spawnProgress = Math.min(this.interval, last === undefined ? s.spawnProgress + away : Math.max(0, away - last));
    s.materials += materials;
    // The world lived on (D-053): every kid wandered for its time away, offline spawns
    // from where they arrived, and no recipe pair is left touching (no fusions offline).
    if (away > 0) {
      for (const kid of s.world.kids) kid.grace = Math.max(0, kid.grace - away);
      const recipes = this.recipes;
      wanderOffline(
        s.world,
        this.content.balance.wander,
        this.content.balance.body.touchSlack,
        this.rng,
        (kid) => away - (arrived.get(kid.id) ?? 0),
        (a, b) => recipes.has(pairKey(a.type, b.type)),
      );
    }
    this.syncRngState();
    let potatokens = 0;
    for (const e of events) if (e.type === 'earned') potatokens += e.potatokens;
    const plotsWaiting = s.plots.filter((p) => p.seed && p.seed.grown >= grow).length;
    return { seconds: away, discardedSeconds: elapsed - away, materials, potatokens, spawned, sprouted, plotsWaiting, food };
  }

  /**
   * Applies player commands; returns pairs the player saw touching at a drop, and pairs
   * dropped onto each other (D-051).
   */
  private applyCommands(commands: Command[], events: GameEvent[]): { seen: [number, number][]; targeted: [number, number][] } {
    const { world } = this.state;
    const seen: [number, number][] = [];
    const targeted: [number, number][] = [];
    for (const c of commands) {
      if (c.type === 'upgrade' || c.type === 'setBias' || c.type === 'instantSpawn' || c.type === 'respawn' || c.type === 'unlockPlot') {
        this.applyPurchase(c, events);
        continue;
      }
      if (c.type === 'feed') {
        this.feed(c, events);
        continue;
      }
      if (c.type === 'name') {
        this.name(c, events);
        continue;
      }
      if (c.type === 'startGrowing') {
        const seed = this.state.plots[c.plot]?.seed;
        const reason: RejectReason | null = !seed || seed.sprout ? 'plotsBusy' : seed.planted.length < this.content.balance.planting.minKids ? 'tooFewKids' : null;
        if (reason || !seed) {
          events.push({ type: 'rejected', command: 'startGrowing', reason: reason ?? 'plotsBusy' });
          continue;
        }
        seed.sprout = this.rollSprout(seed.planted);
        events.push({ type: 'growing', plot: c.plot });
        continue;
      }
      if (c.type === 'plant') {
        this.plant(c, events);
        continue;
      }
      if (c.type === 'unplant' || c.type === 'emptyPlot') {
        this.unplant(c, events);
        continue;
      }
      if (c.type === 'unlockField') {
        this.unlockField(events);
        continue;
      }
      if (c.type === 'setFieldFood') {
        this.setFieldFood(c, events);
        continue;
      }
      if (c.type === 'farm') {
        this.farm(c, events);
        continue;
      }
      if (c.type === 'unfarm' || c.type === 'emptyField') {
        this.unfarm(c, events);
        continue;
      }
      const kid = world.kids.find((k) => k.id === c.kidId);
      if (!kid) {
        // Consumed before the command arrived: a drag just ends.
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
      if (c.type === 'cancelDrag' && c.safe) {
        const spot = clearSpotFor(world, kid, this.content.balance.body.touchSlack, (a, b) => this.recipes.has(pairKey(a.type, b.type)));
        if (spot) [kid.x, kid.y] = [spot.x, spot.y];
        kid.grace = Math.max(kid.grace, this.content.balance.spawn.newbornGraceSeconds);
      }
      if (c.type === 'drop') {
        events.push({ type: 'dropped', kidId: kid.id });
        for (const other of c.touching ?? []) if (other !== kid.id) seen.push([kid.id, other]);
        if (c.target !== undefined && c.target !== kid.id) targeted.push([kid.id, c.target]);
      }
    }
    return { seen, targeted };
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
        if (this.state.world.kids.length >= this.capacity) return reject('full');
        // The Garden's timer is untouched: an instant spawn is extra, not a skip.
        if (!this.spawnAtOutlet(() => this.rollSpawnType(), 'instant', events)) return reject('noRoom');
        s.potatokens -= price;
        return;
      }
      case 'unlockPlot': {
        const cost = this.plotUnlockCost;
        if (cost === null) return reject('maxLevel');
        if (s.materials < cost) return reject('cost');
        s.materials -= cost;
        s.plots.push({ seed: null });
        events.push({ type: 'plotUnlocked', plots: s.plots.length });
        return;
      }
      case 'respawn': {
        if (s.buildings.compendium < 1) return reject('locked');
        // Specials and rares come only from planting (owner, 2026-10-04; D-072).
        const def = this.content.kids.find((k) => k.id === c.kidType);
        if (def?.special || def?.rare) return reject('notSpawnable');
        if (!s.discoveredKids.includes(c.kidType)) return reject('undiscovered');
        const cost = this.respawnCost(c.kidType);
        const price = c.pay === 'materials' ? cost.materials : cost.potatokens;
        if ((c.pay === 'materials' ? s.materials : s.potatokens) < price) return reject('cost');
        if (this.state.world.kids.length >= this.capacity) return reject('full');
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
  private resolveFusions(events: GameEvent[], seen: [number, number][] = [], targeted: [number, number][] = []): void {
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
    // A drop onto a kid tries that pair ahead of every contact, touching or not: the player
    // chose it (D-051). Kids in newborn grace stay out, as for contact.
    for (const [x, y] of targeted) {
      const a = eligible.find((k) => k.id === Math.min(x, y));
      const b = eligible.find((k) => k.id === Math.max(x, y));
      if (!a || !b) continue;
      const result = this.recipes.get(pairKey(a.type, b.type));
      if (!result) continue;
      const known = candidates.find((c) => c.a === a && c.b === b);
      if (known) known.d = -1;
      else candidates.push({ d: -1, a, b, result });
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
  /**
   * Started seeds grow; a ready one sprouts at the Garden outlet, in plot order, if the map
   * has room and a spot there is clear. Otherwise it waits, ready, as long as it takes (D-061).
   */
  private advancePlots(dt: number, events: GameEvent[]): void {
    const grow = this.content.balance.planting.growSeconds;
    this.plotWaits.clear();
    this.state.plots.forEach((plot, i) => {
      const seed = plot.seed;
      if (!seed?.sprout) return;
      seed.grown = Math.min(grow, seed.grown + dt);
      if (seed.grown < grow) return;
      if (this.state.world.kids.length >= this.capacity) return void this.plotWaits.set(i, 'full');
      if (!this.sproutFrom(i, events)) return void this.plotWaits.set(i, 'noRoom');
    });
  }

  /** A ready plot's kid comes up at the outlet; the plot empties. Null if no spot. */
  private sproutFrom(index: number, events: GameEvent[]): Kid | null {
    const plot = this.state.plots[index]!;
    const sprout = plot.seed!.sprout!;
    const kid = this.spawnAtOutlet(() => sprout.type, 'sprout', events);
    if (!kid) return null;
    plot.seed = null;
    for (const e of events) if (e.type === 'spawned' && e.kid === kid) e.plot = index;
    return kid;
  }

  /** Why plot `i` is ready but hasn't sprouted, as of the last step; null if it isn't waiting. */
  plotWaiting(i: number): PlotWaiting | null {
    return this.plotWaits.get(i) ?? null;
  }

  /** Materials to unlock the next plot, or null when every plot is unlocked. */
  /** The next field's price (D-069), or null at the most fields. */
  get fieldUnlockCost(): number | null {
    const fm = this.content.balance.farming;
    const n = this.state.fields.length;
    return n >= fm.maxFields ? null : (fm.unlockPrices[n] ?? null);
  }

  get plotUnlockCost(): number | null {
    const p = this.content.balance.planting;
    const n = this.state.plots.length;
    if (n >= p.maxPlots) return null;
    return Math.ceil(p.unlockCostBase * p.unlockCostGrowth ** (n - p.startPlots));
  }

  /**
   * The chances a seed of these kids sprouts a special (D-063) and a rare (D-062) (D-061):
   * from the floor (minKids kids, all below tier 3) to the ceiling (maxKids kids of tier 5
   * or above), at x = the average of a count factor and a tier factor, each clamped to 0..1.
   */
  oddsFor(planted: readonly (KidId | Pick<PlantedKid, 'type' | 'happy'>)[]): { special: number; rare: number } {
    const p = this.content.balance.planting;
    const n = planted.length;
    // A kid happy when added counts one tier higher; the curve's caps still hold (D-056, §15.3).
    const tierOf = (k: KidId | Pick<PlantedKid, 'type' | 'happy'>) => (typeof k === 'string' ? (this.tiers.get(k) ?? 1) : (this.tiers.get(k.type) ?? 1) + (k.happy ? 1 : 0));
    const meanTier = n ? planted.reduce((t, k) => t + tierOf(k), 0) / n : 1;
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    const x = (clamp((n - p.minKids) / Math.max(1, p.maxKids - p.minKids)) + clamp((meanTier - 2) / 3)) / 2;
    const at = ([lo, hi]: readonly [number, number]) => lo + (hi - lo) * x;
    return { special: at(p.specialOdds), rare: at(p.rareOdds) };
  }

  /**
   * What a seed sprouts (D-061): a random Garden kid; a special (D-063) at its chance, and,
   * independently, a rare kid (D-072) at its own. If both hit, the rare wins: the rarer roll.
   * A roll with no kids of its kind in the content gives nothing. Both chances are always
   * rolled, then the type, on the spawn stream, so saves replay it.
   */
  private rollSprout(kids: readonly PlantedKid[]): Sprout {
    const odds = this.oddsFor(kids);
    const specials = this.content.kids.filter((k) => k.special);
    const rares = this.content.kids.filter((k) => k.rare);
    const special = this.spawnRng.next() < odds.special && specials.length > 0;
    const rare = this.spawnRng.next() < odds.rare && rares.length > 0;
    const pick = <T>(list: readonly T[]) => list[Math.floor(this.spawnRng.next() * list.length)]!;
    return { type: rare ? pick(rares).id : special ? pick(specials).id : this.rollSpawnType() };
  }

  /**
   * Planting (D-061), all or none. Refused if a kid is gone (`gone`), if no plot takes kids
   * (`plotFull` when filled plots only wait to be started, else `plotsBusy`), or if the plot is
   * growing (`plotsBusy`) or lacks the spaces (`plotFull`). Refused kids are put down clear of
   * recipe partners, with a newborn's grace: a refusal never fuses (GUI_MVP §15.1; Codex
   * review, PR #72).
   */
  private plant(c: Extract<Command, { type: 'plant' }>, events: GameEvent[]): void {
    const world = this.state.world;
    const max = this.content.balance.planting.maxKids;
    const kids = c.kidIds.map((id) => world.kids.find((k) => k.id === id));
    const plot = c.plot ?? this.plotForDrop();
    const target = plot === null ? undefined : this.state.plots[plot];
    const filled = target?.seed?.planted.length ?? 0;
    const reason: RejectReason | null = kids.some((k) => !k)
      ? 'gone'
      : new Set(c.kidIds).size !== c.kidIds.length || c.kidIds.length === 0
        ? 'gone'
        : plot === null || !target
          ? this.state.plots.some((p) => p.seed && !p.seed.sprout) ? 'plotFull' : 'plotsBusy'
          : target.seed?.sprout
            ? 'plotsBusy'
            : filled + c.kidIds.length > max
              ? 'plotFull'
              : null;
    if (reason || plot === null || !target) {
      const recipes = this.recipes;
      for (const kid of kids) {
        if (!kid) continue;
        kid.held = false;
        const spot = clearSpotFor(world, kid, this.content.balance.body.touchSlack, (a, b) => recipes.has(pairKey(a.type, b.type)));
        if (spot) [kid.x, kid.y] = [spot.x, spot.y];
        // "Release to keep this kid": it can't fuse for a newborn's grace either, so a
        // partner walking up later this step can't take it (Codex review, PR #72).
        kid.grace = Math.max(kid.grace, this.content.balance.spawn.newbornGraceSeconds);
      }
      events.push({ type: 'rejected', command: 'plant', reason: reason ?? 'plotsBusy' });
      return;
    }
    for (const kid of kids as Kid[]) {
      world.kids.splice(world.kids.indexOf(kid), 1);
      // Whether it was happy stays with the seed for good (D-056). Its name and what is left
      // of its happiness come back with it if it is taken out (D-074).
      const snapshot: PlantedKid = {
        id: kid.id,
        type: kid.type,
        look: { ...kid.look },
        ...(kid.name ? { name: kid.name } : {}),
        ...(kid.happy ? { happy: true, happiness: { ...kid.happy } } : {}),
      };
      if (target.seed) target.seed.planted.push(snapshot);
      else target.seed = { planted: [snapshot], sprout: null, grown: 0 };
      events.push({ type: 'planted', kid, plot, count: target.seed.planted.length });
    }
  }

  /**
   * Taking kids back out of a plot (D-074), all or none: one kid from a plot still filling
   * (`unplant`), or every kid in a filling or growing plot (`emptyPlot`), which loses the
   * growing time. Refused if the plot or kid is gone (`gone`), if the plot is growing and only
   * one kid was asked for (`plotsBusy`), if its sprout is ready (`ready`), if the map hasn't
   * room for them all (`full`), or if a kid finds no free spot by the Garden or none clear of
   * recipe partners (`noRoom`). They come back by the Garden outlet with their id, look, name
   * and remaining happiness, clear of recipe partners and with a newborn's grace, so they never
   * fuse on the way back.
   */
  private unplant(c: Extract<Command, { type: 'unplant' | 'emptyPlot' }>, events: GameEvent[]): void {
    const reject = (reason: RejectReason): void => {
      events.push({ type: 'rejected', command: c.type, reason });
    };
    const seed = this.state.plots[c.plot]?.seed;
    if (!seed) return reject('gone');
    if (seed.sprout && seed.grown >= this.content.balance.planting.growSeconds) return reject('ready');
    if (c.type === 'unplant' && seed.sprout) return reject('plotsBusy');
    const leaving = c.type === 'unplant' ? seed.planted.filter((k) => k.id === c.kidId) : [...seed.planted];
    if (leaving.length === 0) return reject('gone');
    const back = this.returnToMap(leaving);
    if (typeof back === 'string') return reject(back);
    const ids = new Set(leaving.map((k) => k.id));
    seed.planted = seed.planted.filter((k) => !ids.has(k.id));
    if (seed.planted.length === 0) this.state.plots[c.plot]!.seed = null;
    const left = this.state.plots[c.plot]!.seed?.planted.length ?? 0;
    for (const kid of back) events.push({ type: 'unplanted', kid, plot: c.plot, count: left });
  }

  /**
   * Kids back to the map from a plot or a field (D-069, D-074), all or none: room on the map
   * for every one (`full`), and a free spot by the Garden outlet clear of recipe partners for
   * each (`noRoom`), else nothing changes. They come back as they went in: id, look, name and
   * what is left of their happiness, with a newborn's grace, so they never fuse on the way.
   */
  private returnToMap(leaving: readonly Omit<PlantedKid, 'happy'>[]): Kid[] | 'full' | 'noRoom' {
    const world = this.state.world;
    if (world.kids.length + leaving.length > this.capacity) return 'full';
    const back: Kid[] = [];
    // All or none: the ones already placed go back where they were.
    const rollBack = (): 'noRoom' => {
      for (const b of back) world.kids.splice(world.kids.indexOf(b), 1);
      return 'noRoom';
    };
    for (const k of leaving) {
      const look = this.lookWithBox(k.look);
      const p = this.freeSpot(look.box, this.spawnAt.x, this.spawnAt.y);
      if (!p) return rollBack();
      const kid = addKid(world, k.type, p.x, p.y, this.rng, this.content.balance.spawn.newbornGraceSeconds, look.box, { body: look.body, face: look.face, scale: look.scale }, k.id);
      if (k.name) kid.name = k.name;
      if (k.happiness) kid.happy = { ...k.happiness };
      // Clear of recipe partners, those already on the map and those coming back with it:
      // coming back never fuses a kid, now or once its grace ends. With no such spot, none
      // comes back (Codex review, PR #82).
      back.push(kid);
      const spot = clearSpotFor(world, kid, this.content.balance.body.touchSlack, (x, y) => this.recipes.has(pairKey(x.type, y.type)));
      if (!spot) return rollBack();
      [kid.x, kid.y] = [spot.x, spot.y];
    }
    return back;
  }

  /** Planted and farming kids' happiness keeps counting down (D-069, D-074); `happy`, for the odds, stays. */
  private wearOffPlanted(dt: number): void {
    const kept = [...this.state.plots.flatMap((p) => p.seed?.planted ?? []), ...this.state.fields.flatMap((f) => f.workers)];
    for (const k of kept) {
      if (!k.happiness) continue;
      k.happiness.left -= dt;
      if (k.happiness.left <= 0) delete k.happiness;
    }
  }

  // --- food fields (D-069, GUI_MVP §22) --------------------------------------------------

  /** Field `i`'s bay becomes scenery (it is bought). */
  private addBay(i: number): void {
    const bay = this.fieldBays[i];
    if (bay && !this.state.world.obstacles.includes(bay)) this.state.world.obstacles.push(bay);
  }

  /**
   * The next field, for Materials. Kids standing in its bay move to the nearest spot clear
   * of scenery, other kids and recipe partners, never fusing; if one has nowhere to go,
   * nothing is bought and nobody moves (`noRoom`, GUI_MVP §22.2 as Claude decided).
   */
  private unlockField(events: GameEvent[]): void {
    const reject = (reason: RejectReason): void => {
      events.push({ type: 'rejected', command: 'unlockField', reason });
    };
    const fm = this.content.balance.farming;
    const n = this.state.fields.length;
    if (n >= fm.maxFields) return reject('maxLevel');
    const price = fm.unlockPrices[n]!;
    if (this.state.materials < price) return reject('cost');
    const world = this.state.world;
    const bay = this.fieldBays[n];
    if (bay) {
      world.obstacles.push(bay);
      const moved: { kid: Kid; x: number; y: number }[] = [];
      for (const kid of world.kids) {
        if (isFree(world, kid.box, kid.x, kid.y, kid.id)) continue;
        const spot = clearSpotFor(world, kid, this.content.balance.body.touchSlack, (a, b) => this.recipes.has(pairKey(a.type, b.type)));
        if (!spot) {
          for (const m of moved) [m.kid.x, m.kid.y] = [m.x, m.y];
          world.obstacles.splice(world.obstacles.indexOf(bay), 1);
          return reject('noRoom');
        }
        moved.push({ kid, x: kid.x, y: kid.y });
        [kid.x, kid.y] = [spot.x, spot.y];
      }
    }
    this.state.materials -= price;
    this.state.fields.push({ food: null, workers: [], progress: 0 });
    events.push({ type: 'fieldUnlocked', fields: this.state.fields.length });
  }

  /**
   * A field's food. The same food changes nothing (`unchanged`). A change loses the progress
   * toward the next bite (whole bites are already in the pantry), and kids who hate the new
   * food go back to the map, all or none (`full`, `noRoom`): if they can't, nothing changes.
   */
  private setFieldFood(c: Extract<Command, { type: 'setFieldFood' }>, events: GameEvent[]): void {
    const reject = (reason: RejectReason): void => {
      events.push({ type: 'rejected', command: 'setFieldFood', reason });
    };
    const field = this.state.fields[c.field];
    if (!field) return reject('gone');
    if (!this.content.balance.feeding.foods.some((f) => f.id === c.food)) return reject('invalid');
    if (field.food === c.food) return reject('unchanged');
    const haters = field.workers.filter((k) => this.content.personality[k.type]?.hatedFood === c.food);
    let back: Kid[] = [];
    if (haters.length) {
      const r = this.returnToMap(haters);
      if (typeof r === 'string') return reject(r);
      back = r;
      const ids = new Set(haters.map((k) => k.id));
      field.workers = field.workers.filter((k) => !ids.has(k.id));
    }
    field.food = c.food;
    field.progress = 0;
    for (const kid of back) events.push({ type: 'unfarmed', kid, field: c.field, count: field.workers.length });
    events.push({ type: 'fieldFood', field: c.field, food: c.food });
  }

  /**
   * Kids start farming (D-069), all or none: each on the map (`gone`), the field bought
   * (`gone`) with a food (`noCrop`), none hating it (`hated`), and places for all (`fieldFull`).
   * They leave the map, earn nothing while farming, and keep their name and happiness.
   */
  private farm(c: Extract<Command, { type: 'farm' }>, events: GameEvent[]): void {
    const world = this.state.world;
    const field = this.state.fields[c.field];
    const kids = c.kidIds.map((id) => world.kids.find((k) => k.id === id));
    const reason: RejectReason | null =
      !field || kids.some((k) => !k) || new Set(c.kidIds).size !== c.kidIds.length || c.kidIds.length === 0
        ? 'gone'
        : field.food === null
          ? 'noCrop'
          : kids.some((k) => this.content.personality[k!.type]?.hatedFood === field.food)
            ? 'hated'
            : field.workers.length + c.kidIds.length > this.content.balance.farming.kidsPerField
              ? 'fieldFull'
              : null;
    if (reason || !field) {
      // A kid held over the field lands where it was let go, clear of its partners (as a
      // refused planting).
      for (const kid of kids) {
        if (!kid?.held) continue;
        kid.held = false;
        const spot = clearSpotFor(world, kid, this.content.balance.body.touchSlack, (a, b) => this.recipes.has(pairKey(a.type, b.type)));
        if (spot) [kid.x, kid.y] = [spot.x, spot.y];
        kid.grace = Math.max(kid.grace, this.content.balance.spawn.newbornGraceSeconds);
      }
      events.push({ type: 'rejected', command: 'farm', reason: reason ?? 'gone' });
      return;
    }
    for (const kid of kids as Kid[]) {
      world.kids.splice(world.kids.indexOf(kid), 1);
      field.workers.push({
        id: kid.id,
        type: kid.type,
        look: { ...kid.look },
        ...(kid.name ? { name: kid.name } : {}),
        ...(kid.happy ? { happiness: { ...kid.happy } } : {}),
      });
      events.push({ type: 'farming', kid, field: c.field, count: field.workers.length });
    }
  }

  /** One farming kid, or all of them, back to the map, all or none (`full`, `noRoom`). The field keeps its food and progress. */
  private unfarm(c: Extract<Command, { type: 'unfarm' | 'emptyField' }>, events: GameEvent[]): void {
    const reject = (reason: RejectReason): void => {
      events.push({ type: 'rejected', command: c.type, reason });
    };
    const field = this.state.fields[c.field];
    if (!field) return reject('gone');
    const leaving = c.type === 'unfarm' ? field.workers.filter((k) => k.id === c.kidId) : [...field.workers];
    if (leaving.length === 0) return reject('gone');
    const back = this.returnToMap(leaving);
    if (typeof back === 'string') return reject(back);
    const ids = new Set(leaving.map((k) => k.id));
    field.workers = field.workers.filter((k) => !ids.has(k.id));
    for (const kid of back) events.push({ type: 'unfarmed', kid, field: c.field, count: field.workers.length });
  }

  /** Kids a field takes (D-069). */
  get kidsPerField(): number {
    return this.content.balance.farming.kidsPerField;
  }

  /** A type's favourite and hated foods (D-058). */
  likes(type: KidId): { favouriteFood: string; hatedFood: string } | undefined {
    return this.content.personality[type];
  }

  /** A food's name. */
  foodName(id: string): string {
    return this.content.balance.feeding.foods.find((f) => f.id === id)?.name ?? id;
  }

  /** A type's name. */
  kidName(type: KidId): string {
    return this.content.kids.find((k) => k.id === type)?.name ?? type;
  }

  /**
   * Kid n among a type's copies on the map and farming, by id: how a farming kid is numbered
   * on its card and in its field (GUI_MVP §22.2, §22.6).
   */
  ownedOrdinal(type: KidId, id: number): number {
    const ids = [...this.state.world.kids, ...this.state.fields.flatMap((f) => f.workers)].filter((k) => k.type === type && k.id <= id);
    return ids.length || 1;
  }

  /** How many bites a second one kid of `type` grows of `food`: faster on its favourite (D-069). */
  farmRate(type: KidId, food: string): number {
    const fm = this.content.balance.farming;
    return (this.content.personality[type]?.favouriteFood === food ? fm.favouriteFactor : 1) / fm.biteSeconds;
  }

  /** How many bites a second a field grows: each kid's rate, faster on its favourite (D-069). */
  fieldRate(i: number): number {
    const field = this.state.fields[i];
    if (!field?.food) return 0;
    let rate = 0;
    for (const k of field.workers) rate += this.farmRate(k.type, field.food);
    return rate;
  }

  /** Fields grow for `dt` seconds; whole bites go to the pantry (D-069). Returns the harvests. */
  private advanceFields(dt: number, events: GameEvent[]): GameEvent[] {
    const out: GameEvent[] = [];
    this.state.fields.forEach((field, i) => {
      const rate = this.fieldRate(i);
      if (!field.food || rate <= 0) return;
      field.progress += rate * dt;
      const bites = Math.floor(field.progress + 1e-9);
      if (bites <= 0) return;
      field.progress = Math.max(0, field.progress - bites);
      this.state.pantry[field.food] = (this.state.pantry[field.food] ?? 0) + bites;
      const e: GameEvent = { type: 'harvested', field: i, food: field.food, bites };
      events.push(e);
      out.push(e);
    });
    return out;
  }

  /** A kid on the map, or one farming (it keeps its card: Feed and Name, GUI_MVP §22.6). */
  private findKid(id: number): { live: Kid } | { worker: Omit<PlantedKid, 'happy'> } | null {
    const live = this.state.world.kids.find((k) => k.id === id);
    if (live) return { live };
    for (const f of this.state.fields) {
      const worker = f.workers.find((k) => k.id === id);
      if (worker) return { worker };
    }
    return null;
  }

  /** A look with its box from the current art; a body or face it doesn't have maps to the first. */
  private lookWithBox(look: Look): Look & { box: Box } {
    const body = this.looks.bodies.find((b) => b.id === look.body) ?? this.looks.bodies[0]!;
    const face = this.looks.faces.some((f) => f.id === look.face) ? look.face : this.looks.faces[0]!.id;
    const k = look.scale;
    const b = body.box;
    return { body: body.id, face, scale: k, box: { left: b.left * k, top: b.top * k, right: b.right * k, bottom: b.bottom * k } };
  }

  /**
   * One bite (D-056). Refused if the kid is gone, the food unknown (`invalid`), hated
   * (`hated`, nothing spent) or unaffordable. Accepted, the kid is happy from now: a
   * favourite for longer and more, and a new bite replaces the old happiness, never adds.
   */
  private feed(c: Extract<Command, { type: 'feed' }>, events: GameEvent[]): void {
    const reject = (reason: RejectReason): void => {
      events.push({ type: 'rejected', command: 'feed', reason });
    };
    const found = this.findKid(c.kidId);
    if (!found) return reject('gone');
    const type = 'live' in found ? found.live.type : found.worker.type;
    const f = this.content.balance.feeding;
    const food = f.foods.find((x) => x.id === c.food);
    if (!food) return reject('invalid');
    const likes = this.content.personality[type];
    if (likes?.hatedFood === food.id) return reject('hated');
    // A bite comes from the pantry (D-069).
    if ((this.state.pantry[food.id] ?? 0) < 1) return reject('noFood');
    this.state.pantry[food.id]! -= 1;
    const favourite = likes?.favouriteFood === food.id;
    const happy = { left: favourite ? f.favouriteSeconds : f.happySeconds, favourite };
    // A farming kid's happiness counts down in its field; its income boost waits for the map.
    if ('live' in found) found.live.happy = happy;
    else found.worker.happiness = happy;
    events.push({ type: 'fed', kid: 'live' in found ? found.live : found.worker, food: food.id, favourite });
  }

  /**
   * A name (D-057): normalized and checked (GUI_MVP §18.2), then charged; the same name is
   * refused, never charged. `null` clears a name for free.
   */
  private name(c: Extract<Command, { type: 'name' }>, events: GameEvent[]): void {
    const reject = (reason: RejectReason): void => {
      events.push({ type: 'rejected', command: 'name', reason });
    };
    // On the map or farming: a farming kid keeps its card (GUI_MVP §22.6).
    const found = this.findKid(c.kidId);
    if (!found) return reject('gone');
    const kid = 'live' in found ? found.live : found.worker;
    if (c.name === null) {
      if (kid.name === undefined) return reject('unchanged');
      delete kid.name;
      events.push({ type: 'named', kid, name: null });
      return;
    }
    const n = this.content.balance.naming;
    const check = checkName(c.name, n.maxLength);
    if (!check.ok) return reject('invalid');
    if (check.name === kid.name) return reject('unchanged');
    if (this.state.materials < n.price) return reject('cost');
    this.state.materials -= n.price;
    kid.name = check.name;
    events.push({ type: 'named', kid, name: check.name });
  }

  /** The plot a dragged kid goes into: the one still filling with room, else the lowest empty; null if none. */
  plotForDrop(): number | null {
    const max = this.content.balance.planting.maxKids;
    const filling = this.state.plots.findIndex((p) => p.seed && !p.seed.sprout && p.seed.planted.length < max);
    if (filling >= 0) return filling;
    const empty = this.state.plots.findIndex((p) => !p.seed);
    return empty >= 0 ? empty : null;
  }

  /** Seconds a seed takes to grow. */
  /** A planting-only special type (D-063). */
  isSpecial(type: KidId): boolean {
    return !!this.content.kids.find((k) => k.id === type)?.special;
  }

  /** One of the planting-only rare types (D-072). */
  isRare(type: KidId): boolean {
    return !!this.content.kids.find((k) => k.id === type)?.rare;
  }

  get growSeconds(): number {
    return this.content.balance.planting.growSeconds;
  }

  private advanceSpawn(dt: number, events: GameEvent[]): void {
    const s = this.state;
    const raw = s.spawnProgress + dt;
    // Tolerance absorbs float drift from summing 0.1 s steps (120 × 0.1 ≠ 12 exactly).
    if (raw < this.interval - 1e-6 || this.state.world.kids.length >= this.capacity) {
      s.spawnProgress = Math.min(this.interval, raw);
      this.blocked = false;
      return;
    }
    // The interval this spawn completed, before the count moves past the tutorial.
    const interval = this.interval;
    if (!this.spawnAtOutlet(() => this.rollSpawnType(), 'garden', events)) {
      s.spawnProgress = Math.min(interval, raw);
      this.blocked = true;
      return;
    }
    s.gardenSpawns++;
    this.blocked = false;
    // Keep the overshoot so spawn timing doesn't drift with the step size.
    s.spawnProgress = Math.max(0, Math.min(this.interval, raw - interval));
  }

  /** Debug/test only: place a kid directly, bypassing the Garden and capacity; optionally fix its look. */
  /** Debug only: a plot ready to sprout `sprout` at the next step (three Potato Kids in it). */
  debugReadySeed(plot: number, sprout: Sprout): void {
    const p = this.state.plots[plot];
    if (!p) return;
    const world = this.state.world;
    p.seed = { planted: Array.from({ length: this.content.balance.planting.minKids }, () => ({ id: world.nextKidId++, type: 'plain', look: { ...DEFAULT_LOOK } })), sprout, grown: this.growSeconds };
  }

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
