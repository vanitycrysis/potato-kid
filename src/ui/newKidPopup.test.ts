import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { LINES, pickLine, type MeetSource } from './newKidPopup';

// The popup's lines (D-087, GUI_MVP §27.5): Codex's thirty, as the spec gives them.
describe('new-kid popup lines (§27.5)', () => {
  const sources: MeetSource[] = ['garden', 'plot', 'fusion'];

  it('has ten lines per source, each naming the kind exactly once, with no pronoun', () => {
    for (const s of sources) {
      expect(LINES[s]).toHaveLength(10);
      expect(new Set(LINES[s]).size).toBe(10);
      for (const l of LINES[s]) {
        expect(l.split('{name}')).toHaveLength(2);
        expect(l).not.toMatch(/\b(he|she|they|him|her|them|his|its)\b/i);
      }
    }
    // The owner's own two (D-087).
    expect(LINES.garden[0]).toBe('{name} wandered in!');
    expect(LINES.plot[0]).toBe('{name} sprouted!');
  });

  it('every kind reads in every line', () => {
    for (const k of content.kids) for (const s of sources) for (const l of LINES[s]) expect(l.replace('{name}', k.name)).toContain(k.name);
  });

  it('picks uniformly, and never the same line twice in a row for a source', () => {
    const seen = new Map<number, number>();
    let last: number | null = null;
    let r = 1;
    const random = () => ((r = (r * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 5000; i++) {
      const n = pickLine('garden', last, random);
      expect(n).not.toBe(last);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(10);
      seen.set(n, (seen.get(n) ?? 0) + 1);
      last = n;
    }
    expect(seen.size).toBe(10);
    for (const c of seen.values()) expect(c).toBeGreaterThan(350);
  });
});
