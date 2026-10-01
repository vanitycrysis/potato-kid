import { describe, expect, it } from 'vitest';
import { content } from './index';
import type { Content } from './types';
import { pairKey, validateContent } from './validate';

function withChanges(patch: Partial<Content>): Content {
  return { ...structuredClone(content), ...patch };
}

describe('shipped content', () => {
  it('passes the content contract', () => {
    expect(validateContent(content)).toEqual([]);
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
});
