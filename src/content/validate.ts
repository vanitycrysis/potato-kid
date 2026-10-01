import type { Content } from './types';

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
