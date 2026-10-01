export type KidId = string;

export interface KidDef {
  id: KidId;
  tier: number;
  /** Display name; placeholder until ChatGPT names the roster. */
  name: string;
  /**
   * Accent colour used only by the legacy code-drawn placeholders, which are retired
   * once Codex's art covers every type (D-036). New types don't have one.
   */
  accent?: string;
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
  /** Seconds between Garden spawns at level 1. */
  intervalSeconds: number;
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

export interface Balance {
  spawnWeights: Record<KidId, number>;
  spawn: SpawnBalance;
  /** Body footprint and contact (D-039). */
  body: BodyBalance;
  wander: WanderBalance;
}

export interface Content {
  kids: KidDef[];
  recipes: RecipeDef[];
  balance: Balance;
}
