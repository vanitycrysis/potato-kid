import { describe, expect, it } from 'vitest';
import { content } from './index';
import type { Content } from './types';
import { pairKey, validateContent } from './validate';

function withChanges(patch: Partial<Content>): Content {
  const c = { ...structuredClone(content), ...patch };
  // A test kid gets a personality, as every shipped one has.
  for (const k of c.kids) c.personality[k.id] ??= { ...content.personality.plain! };
  return c;
}

describe('shipped content', () => {
  it('passes the content contract', () => {
    expect(validateContent(content)).toEqual([]);
  });
});

describe('feeding, naming and personality (D-056, D-057, D-058)', () => {
  it('every type has a personality with two known, different foods', () => {
    const missing = structuredClone(content);
    delete missing.personality.fire;
    expect(validateContent(missing)).toContain('kid "fire" has no personality');
    const same = structuredClone(content);
    same.personality.fire!.hatedFood = same.personality.fire!.favouriteFood;
    expect(validateContent(same)).toContain(`kid "fire" can't like and hate the same food`);
    const unknown = structuredClone(content);
    unknown.personality.fire!.favouriteFood = 'cake';
    expect(validateContent(unknown)).toContain('kid "fire" has an unknown food');
  });

  it('a favourite is never worse than another food', () => {
    const c = structuredClone(content);
    c.balance.feeding.favouriteSeconds = c.balance.feeding.happySeconds - 1;
    expect(validateContent(c)).toContain('balance.feeding: a favourite must last and pay at least as much as other foods');
  });

  it('ships the twelve pinned foods (GUI_MVP §17.1)', () => {
    expect(content.balance.feeding.foods.map((f) => f.id)).toEqual(['toast', 'berry_jam', 'berries', 'apple', 'carrot', 'corn', 'mushroom', 'pickle', 'cheese', 'soup', 'cocoa', 'cracker']);
  });
});

describe('validateContent', () => {
  it('treats recipe pairs as unordered', () => {
    expect(pairKey('water', 'plain')).toBe(pairKey('plain', 'water'));
    const c = withChanges({ recipes: [...content.recipes, { a: 'water', b: 'plain', result: 'steam' }] });
    expect(validateContent(c)).toContain('duplicate recipe pair water + plain → steam');
  });

  it('rejects a result that is not a higher tier than both parents', () => {
    const c = withChanges({ recipes: [{ a: 'plain', b: 'fire', result: 'water' }] });
    expect(validateContent(c).some((e) => e.includes('must exceed both parents'))).toBe(true);
  });

  it('rejects unknown kids', () => {
    const c = withChanges({ recipes: [{ a: 'plain', b: 'ghost', result: 'chef' }] });
    expect(validateContent(c)).toContain('recipe plain + ghost → chef: unknown parent "ghost"');
  });

  it('rejects unreachable recipes and kids', () => {
    const c = structuredClone(content);
    delete c.balance.spawnWeights.snow;
    const errors = validateContent(c);
    expect(errors).toContain('recipe plain + snow → snowman is unreachable');
    expect(errors).toContain('kid "sundae" can never be obtained');
  });

  it('rejects non-positive spawn weights', () => {
    const c = structuredClone(content);
    c.balance.spawnWeights.fire = 0;
    expect(validateContent(c)).toContain('spawn weight for "fire" must be > 0, got 0');
  });

  it('rejects malformed wander settings', () => {
    const c = structuredClone(content) as unknown as { balance: { wander: Record<string, unknown> } };
    delete c.balance.wander.speed;
    c.balance.wander.idleSeconds = [3, 1];
    const errors = validateContent(c as unknown as Content);
    expect(errors).toContain('balance.wander.speed must be a finite number >= 0');
    expect(errors).toContain('balance.wander.idleSeconds must be [min, max] with 0 <= min <= max');
  });

  it('rejects malformed spawn settings', () => {
    const c = structuredClone(content);
    c.balance.spawn.intervalSeconds = 0;
    c.balance.spawn.startingKids = 99;
    c.balance.body.radius = Number.NaN;
    const errors = validateContent(c);
    expect(errors).toContain('balance.spawn.intervalSeconds must be a finite number > 0');
    expect(errors).toContain('balance.spawn.startingKids must not exceed capacity');
    expect(errors).toContain('balance.body.radius must be a finite number > 0');
  });
});

describe('planting and special kids (D-061, D-063)', () => {
  const special = { id: 'special_a', tier: 5, name: 'Special A', special: true };

  it('accepts a special kid that only planting can bring', () => {
    expect(validateContent(withChanges({ kids: [...content.kids, special] }))).toEqual([]);
  });

  it('a special kid is tier 5 or above, in no recipe, and never from the Garden', () => {
    const low = validateContent(withChanges({ kids: [...content.kids, { ...special, tier: 4 }] }));
    expect(low).toContain('special kid "special_a" must be tier 5 or above');
    const inRecipe = withChanges({ kids: [...content.kids, special], recipes: [...content.recipes, { a: 'special_a', b: 'plain', result: 'hero' }] });
    expect(validateContent(inRecipe)).toContain('special kid "special_a" must not be in a recipe');
    const asResult = withChanges({ kids: [...content.kids, special], recipes: [...content.recipes, { a: 'festival', b: 'mosaic', result: 'special_a' }] });
    expect(validateContent(asResult)).toContain('special kid "special_a" must not be in a recipe');
    const pooled = withChanges({ kids: [...content.kids, special] });
    pooled.balance.spawnWeights.special_a = 1;
    expect(validateContent(pooled)).toContain('special kid "special_a" must not be in the spawn pool');
  });

  it('checks the planting numbers', () => {
    const c = structuredClone(content);
    c.balance.planting = { ...c.balance.planting, minKids: 6, specialOdds: [0.3, 0.2], rareOdds: [0, 1.5] };
    const errors = validateContent(c);
    expect(errors).toContain('balance.planting.minKids must not exceed maxKids');
    expect(errors).toContain('balance.planting.specialOdds must be [floor, ceiling] chances in 0..1, floor <= ceiling');
    expect(errors).toContain('balance.planting.rareOdds must be [floor, ceiling] chances in 0..1, floor <= ceiling');
  });

  it("holds rare kids (D-072) to the specials' rules, and a kid is never both", () => {
    const rare = { id: 'rare_a', tier: 6, name: 'Rare A', rare: true };
    expect(validateContent(withChanges({ kids: [...content.kids, rare] }))).toEqual([]);
    expect(validateContent(withChanges({ kids: [...content.kids, { ...rare, tier: 4 }] }))).toContain('rare kid "rare_a" must be tier 5 or above');
    expect(validateContent(withChanges({ kids: [...content.kids, rare], recipes: [...content.recipes, { a: 'plain', b: 'rare_a', result: 'fire' }] }))).toContain('rare kid "rare_a" must not be in a recipe');
    const pooled = withChanges({ kids: [...content.kids, rare] });
    pooled.balance.spawnWeights.rare_a = 1;
    expect(validateContent(pooled)).toContain('rare kid "rare_a" must not be in the spawn pool');
    expect(validateContent(withChanges({ kids: [...content.kids, { ...rare, special: true }] }))).toContain(`kid "rare_a" can't be both special and rare`);
  });
});
