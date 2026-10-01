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

export interface Balance {
  spawnWeights: Record<KidId, number>;
  wander: WanderBalance;
}

export interface Content {
  kids: KidDef[];
  recipes: RecipeDef[];
  balance: Balance;
}
