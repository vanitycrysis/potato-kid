import { describe, expect, it } from 'vitest';
import { chance, oddsLines, percent } from './plantingNotes';

describe('planting odds copy (GUI_MVP §15.3)', () => {
  it('shows at most two decimals, rounded, zeroes trimmed', () => {
    expect(percent(0.1)).toBe('10%');
    expect(percent(0.125)).toBe('12.5%');
    expect(percent(0.0625)).toBe('6.25%');
    // §15.3's worked examples.
    expect(percent(0.129166666)).toBe('12.92%');
    expect(percent(0.064583333)).toBe('6.46%');
    expect(percent(0.06875)).toBe('6.88%');
  });

  it('never claims the ceiling it falls short of', () => {
    expect(percent(0.19999, 0.2)).toBe('19.99%');
    expect(percent(0.2, 0.2)).toBe('20%');
    expect(percent(0.0999999, 0.1)).toBe('9.99%');
  });

  it('below 3 kids says how many more, never 0% or a false 10%', () => {
    expect(chance(0, 0.1, 3)).toBe('Need 3 more');
    expect(chance(2, 0.1, 3)).toBe('Need 1 more');
    expect(chance(3, 0.1, 3)).toBe('10%');
  });

  it('the first valid add reads Need 1 more → 10%', () => {
    const p = { minKids: 3, maxKids: 5, ceiling: { special: 0.2, rare: 0.1 } };
    expect(oddsLines(0, { count: 2, special: 0.1, rare: 0.05 }, { count: 3, special: 0.1, rare: 0.05 }, p)).toEqual([
      'Plot 1: 2 → 3 / 5',
      'Special roll: Need 1 more → 10%',
      'Rare roll: Need 1 more → 5%',
    ]);
  });
});
