import { BUILDING_IDS, type Content } from './types';

/** Unordered pair key, so `a+b` and `b+a` are the same recipe. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Checks the content contract from ENGINEERING_PLAN.md §2. Returns a list of
 * human-readable problems; empty means valid.
 */
export function validateContent(content: Content): string[] {
  const errors: string[] = [];
  const kids = new Map(content.kids.map((k) => [k.id, k]));

  if (kids.size !== content.kids.length) {
    const seen = new Set<string>();
    for (const k of content.kids) {
      if (seen.has(k.id)) errors.push(`duplicate kid id "${k.id}"`);
      seen.add(k.id);
    }
  }
  for (const k of content.kids) {
    if (!Number.isInteger(k.tier) || k.tier < 1) errors.push(`kid "${k.id}" has invalid tier ${k.tier}`);
  }

  const pairs = new Set<string>();
  for (const r of content.recipes) {
    const label = `${r.a} + ${r.b} → ${r.result}`;
    const key = pairKey(r.a, r.b);
    if (pairs.has(key)) errors.push(`duplicate recipe pair ${label}`);
    pairs.add(key);
    const a = kids.get(r.a);
    const b = kids.get(r.b);
    const result = kids.get(r.result);
    if (!a) errors.push(`recipe ${label}: unknown parent "${r.a}"`);
    if (!b) errors.push(`recipe ${label}: unknown parent "${r.b}"`);
    if (!result) errors.push(`recipe ${label}: unknown result "${r.result}"`);
    if (a && b && result && result.tier <= Math.max(a.tier, b.tier)) {
      errors.push(`recipe ${label}: result tier ${result.tier} must exceed both parents`);
    }
  }

  const weights = Object.entries(content.balance.spawnWeights);
  if (weights.length === 0) errors.push('spawn pool is empty');
  for (const [id, w] of weights) {
    if (!kids.has(id)) errors.push(`spawn weight for unknown kid "${id}"`);
    if (!Number.isFinite(w) || w <= 0) errors.push(`spawn weight for "${id}" must be > 0, got ${w}`);
  }

  errors.push(...validateWander(content.balance.wander));
  errors.push(...validateSpawn(content.balance));
  errors.push(...validateEconomy(content.balance, content.kids.length));

  // Reachability: walk from the spawn pool, adding results whose parents are both reachable.
  const reachable = new Set(weights.map(([id]) => id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of content.recipes) {
      if (reachable.has(r.a) && reachable.has(r.b) && !reachable.has(r.result)) {
        reachable.add(r.result);
        changed = true;
      }
    }
  }
  for (const r of content.recipes) {
    if (!reachable.has(r.a) || !reachable.has(r.b)) {
      errors.push(`recipe ${r.a} + ${r.b} → ${r.result} is unreachable`);
    }
  }
  for (const k of content.kids) {
    if (!reachable.has(k.id)) errors.push(`kid "${k.id}" can never be obtained`);
  }

  return errors;
}

/**
 * JSON bypasses TypeScript (content/index.ts casts it), so check the balance
 * shape at runtime: a missing or malformed value would otherwise put NaN into
 * kid coordinates (Codex review, PR #4).
 */
function validateWander(w: unknown): string[] {
  const errors: string[] = [];
  if (typeof w !== 'object' || w === null) return ['balance.wander is missing'];
  const o = w as Record<string, unknown>;
  const chance = o.ambientChance;
  if (typeof chance !== 'number' || !Number.isFinite(chance) || chance < 0 || chance > 1) {
    errors.push('balance.wander.ambientChance must be a number from 0 to 1');
  }
  for (const key of ['speed', 'turnChancePerSecond', 'idleChancePerSecond'] as const) {
    const v = o[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) errors.push(`balance.wander.${key} must be a finite number >= 0`);
  }
  const idle = o.idleSeconds;
  if (
    !Array.isArray(idle) ||
    idle.length !== 2 ||
    !idle.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0) ||
    (idle[0] as number) > (idle[1] as number)
  ) {
    errors.push('balance.wander.idleSeconds must be [min, max] with 0 <= min <= max');
  }
  return errors;
}

function validateSpawn(balance: unknown): string[] {
  const errors: string[] = [];
  const b = balance as Record<string, unknown>;
  const body = b.body as Record<string, unknown> | undefined;
  const r = body?.radius;
  const slack = body?.touchSlack;
  if (typeof r !== 'number' || !Number.isFinite(r) || r <= 0) errors.push('balance.body.radius must be a finite number > 0');
  if (typeof slack !== 'number' || !Number.isFinite(slack) || slack < 0) errors.push('balance.body.touchSlack must be a finite number >= 0');
  const s = b.spawn;
  if (typeof s !== 'object' || s === null) return [...errors, 'balance.spawn is missing'];
  const o = s as Record<string, unknown>;
  const num = (key: string, ok: (v: number) => boolean, rule: string) => {
    const v = o[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || !ok(v)) errors.push(`balance.spawn.${key} must be ${rule}`);
  };
  num('intervalSeconds', (v) => v > 0, 'a finite number > 0');
  num('capacity', (v) => Number.isInteger(v) && v >= 2, 'an integer >= 2');
  num('startingKids', (v) => Number.isInteger(v) && v >= 0, 'an integer >= 0');
  num('newbornGraceSeconds', (v) => v >= 0, 'a finite number >= 0');
  const cap = o.capacity;
  const start = o.startingKids;
  if (typeof cap === 'number' && typeof start === 'number' && start > cap) {
    errors.push('balance.spawn.startingKids must not exceed capacity');
  }
  return errors;
}

/** Economy and building tracks (plan §3): every value finite and in range, so no NaN reaches a save. */
function validateEconomy(balance: unknown, kidCount: number): string[] {
  const errors: string[] = [];
  const b = balance as Record<string, unknown>;
  const e = b.economy as Record<string, unknown> | undefined;
  if (typeof e !== 'object' || e === null) return ['balance.economy is missing'];
  const num = (key: string, ok: (v: number) => boolean, rule: string) => {
    const v = e[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || !ok(v)) errors.push(`balance.economy.${key} must be ${rule}`);
  };
  const whole = (v: number) => Number.isInteger(v) && v >= 0;
  num('materialsPerSecond', (v) => v > 0, 'a finite number > 0');
  num('startingMaterials', (v) => v >= 0, 'a finite number >= 0');
  num('startingPotatokens', whole, 'an integer >= 0');
  num('gardenIntervalFactor', (v) => v > 0 && v <= 1, 'in (0, 1]');
  num('capacityPerLevel', whole, 'an integer >= 0');
  num('biasWeightPerLevel', (v) => v >= 0, 'a finite number >= 0');
  num('instantSpawnPotatokens', (v) => Number.isInteger(v) && v >= 1, 'an integer >= 1');
  num('respawnMaterials', (v) => v > 0, 'a finite number > 0');
  num('respawnPotatokensPerTier', (v) => Number.isInteger(v) && v >= 1, 'an integer >= 1');
  num('discoveryPotatokens', whole, 'an integer >= 0');
  num('offlineCapHours', (v) => v > 0, 'a finite number > 0');
  const ms = e.dexMilestones;
  if (!Array.isArray(ms)) {
    errors.push('balance.economy.dexMilestones must be a list');
  } else {
    let prev = 0;
    for (const m of ms as { kids?: unknown; potatokens?: unknown }[]) {
      const kids = m?.kids;
      const pt = m?.potatokens;
      if (typeof kids !== 'number' || !Number.isInteger(kids) || kids <= prev) {
        errors.push('balance.economy.dexMilestones must have strictly increasing whole kid counts');
        break;
      }
      if (kids > kidCount) errors.push(`balance.economy.dexMilestones: ${kids} kids is more than the roster has (${kidCount})`);
      if (typeof pt !== 'number' || !Number.isInteger(pt) || pt < 0) errors.push('balance.economy.dexMilestones potatokens must be integers >= 0');
      prev = kids;
    }
  }

  const buildings = b.buildings as Record<string, unknown> | undefined;
  if (typeof buildings !== 'object' || buildings === null) return [...errors, 'balance.buildings is missing'];
  for (const id of BUILDING_IDS) {
    const t = buildings[id] as Record<string, unknown> | undefined;
    if (typeof t !== 'object' || t === null) {
      errors.push(`balance.buildings.${id} is missing`);
      continue;
    }
    const start = t.startLevel;
    const max = t.maxLevel;
    const base = t.costBase;
    const growth = t.costGrowth;
    const okInt = (v: unknown, min: number) => typeof v === 'number' && Number.isInteger(v) && v >= min;
    if (!okInt(start, 0)) errors.push(`balance.buildings.${id}.startLevel must be an integer >= 0`);
    if (!okInt(max, 1) || (okInt(start, 0) && (max as number) < (start as number))) {
      errors.push(`balance.buildings.${id}.maxLevel must be an integer >= max(1, startLevel)`);
    }
    if (typeof base !== 'number' || !Number.isFinite(base) || base <= 0) errors.push(`balance.buildings.${id}.costBase must be a finite number > 0`);
    if (typeof growth !== 'number' || !Number.isFinite(growth) || growth < 1) errors.push(`balance.buildings.${id}.costGrowth must be a finite number >= 1`);
  }
  // The Garden and capacity formulas count levels from 1.
  for (const id of ['garden', 'capacity'] as const) {
    const t = buildings[id] as Record<string, unknown> | undefined;
    if (t && t.startLevel !== 1) errors.push(`balance.buildings.${id}.startLevel must be 1`);
  }
  return errors;
}
