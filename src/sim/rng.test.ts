import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

describe('createRng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('resumes identically from a saved state', () => {
    const a = createRng(7);
    for (let i = 0; i < 10; i++) a.next();
    const b = createRng(a.state);
    for (let i = 0; i < 100; i++) expect(b.next()).toBe(a.next());
  });

  it('stays within bounds', () => {
    const r = createRng(1);
    for (let i = 0; i < 10_000; i++) {
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.int(3, 5);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
    }
  });
});
