export type KidId = string;

export interface KidDef {
  id: KidId;
  tier: number;
  /** Display name; placeholder until ChatGPT names the roster. */
  name: string;
  /** A planting-only special kid (owner, 2026-10-04): in no recipe, not in the roster count. */
  special?: boolean;
}

export interface RecipeDef {
  a: KidId;
  b: KidId;
  result: KidId;
}

export interface WanderBalance {
  /** World units per second. */
  speed: number;
  turnChancePerSecond: number;
  idleChancePerSecond: number;
  idleSeconds: [number, number];
  /** Chance a resting kid does a rig ambient (look around, sit, sleep) instead of a plain pause. */
  ambientChance: number;
}

export interface SpawnBalance {
  /** Seconds between Garden spawns at level 1, after the tutorial. */
  intervalSeconds: number;
  /** The tutorial (D-052): this many first Garden spawns come every `tutorialIntervalSeconds`. */
  tutorialSpawns: number;
  /** Seconds between Garden spawns during the tutorial, whatever the Garden's level. */
  tutorialIntervalSeconds: number;
  /** Map capacity at level 1. */
  capacity: number;
  /** Kids on a brand-new map. */
  startingKids: number;
  /** Seconds a newborn kid cannot fuse (pacing knob, not a consumption guard). */
  newbornGraceSeconds: number;
}

export interface BodyBalance {
  /** Default body radius around the ground point, world units, until art variants supply their own. */
  radius: number;
  /** Bodies within `rA + rB + touchSlack` are touching, which is what triggers a recipe. */
  touchSlack: number;
}

export type BuildingId = 'garden' | 'capacity' | 'bias' | 'compendium';
export const BUILDING_IDS: readonly BuildingId[] = ['garden', 'capacity', 'bias', 'compendium'];

/**
 * One building's upgrade track (plan §2 "Buildings", §3). Upgrading from `level` costs
 * `ceil(costBase · costGrowth^level)` Materials; every upgrade is instant (no timers).
 */
export interface BuildingBalance {
  /** Level on a new save: 1 for the Garden and capacity, 0 (not built) for bias and compendium. */
  startLevel: number;
  maxLevel: number;
  costBase: number;
  costGrowth: number;
}

export interface EconomyBalance {
  /** Materials per second from one tier-1 kid; tier t earns this × 2^(t−1) (D-020). */
  materialsPerSecond: number;
  startingMaterials: number;
  startingPotatokens: number;
  /** Garden spawn interval × this per level above 1. */
  gardenIntervalFactor: number;
  /** Capacity + this per level above 1. */
  capacityPerLevel: number;
  /** The bias target's spawn weight × (1 + this · bias level). */
  biasWeightPerLevel: number;
  /** Potatokens for one instant spawn (D-019). */
  instantSpawnPotatokens: number;
  /** Compendium respawn: `respawnMaterials · 2^(tier−1)` Materials, or `respawnPotatokensPerTier · tier` Potatokens. */
  respawnMaterials: number;
  respawnPotatokensPerTier: number;
  /** Potatokens for each recipe's first discovery. */
  discoveryPotatokens: number;
  /** Potatokens when the Dex reaches this many discovered kid types. */
  dexMilestones: { kids: number; potatokens: number }[];
  /** Offline catch-up credits at most this long; the rest is discarded and reported (D-018). */
  offlineCapHours: number;
  /** The Welcome back summary shows only after an absence at least this long (D-049). */
  offlineSummaryMinSeconds: number;
}

/** Planting (D-061): 3 to 5 kids become a seed in a plot, which grows into one kid. */
export interface PlantingBalance {
  /** Seconds a started seed takes to grow, online and offline. */
  growSeconds: number;
  /** Plots unlocked on a new game. */
  startPlots: number;
  /** Plots there can ever be (GUI_MVP §15.2). */
  maxPlots: number;
  /** Materials to unlock plot n (n > startPlots): `unlockCostBase · unlockCostGrowth^(n − startPlots − 1)`. */
  unlockCostBase: number;
  unlockCostGrowth: number;
  /** Kids a plot needs before it can start growing, and the most it takes. */
  minKids: number;
  maxKids: number;
  /** [floor, ceiling] chance a sprout is a special kid (D-063), and a rare variant (D-062). */
  specialOdds: [number, number];
  rareOdds: [number, number];
  /** The rare variants a sprout can be (D-062); one is picked at random. */
  rareVariants: string[];
  /** A rare kid earns this many times its type's Materials (D-062). */
  rareIncomeMultiplier: number;
}

export interface Balance {
  spawnWeights: Record<KidId, number>;
  spawn: SpawnBalance;
  /** Body footprint and contact (D-039). */
  body: BodyBalance;
  wander: WanderBalance;
  economy: EconomyBalance;
  buildings: Record<BuildingId, BuildingBalance>;
  planting: PlantingBalance;
}

export interface Content {
  kids: KidDef[];
  recipes: RecipeDef[];
  balance: Balance;
}
