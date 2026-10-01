export type KidId = string;

export interface KidDef {
  id: KidId;
  tier: number;
  /** Display name; placeholder until ChatGPT names the roster. */
  name: string;
  /** Type accent colour, used by placeholder art and UI. */
  accent: string;
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
}

export interface SpawnBalance {
  /** Seconds between Garden spawns at level 1. */
  intervalSeconds: number;
  /** Map capacity at level 1. */
  capacity: number;
  /** Kids on a brand-new map. */
  startingKids: number;
  /** Seconds a newborn kid cannot fuse (pacing knob, not a consumption guard). */
  newbornGraceSeconds: number;
}

export interface Balance {
  spawnWeights: Record<KidId, number>;
  spawn: SpawnBalance;
  /** Two kids closer than this (ground point to ground point, world units) are in contact. */
  contactRadius: number;
  wander: WanderBalance;
}

export interface Content {
  kids: KidDef[];
  recipes: RecipeDef[];
  balance: Balance;
}
