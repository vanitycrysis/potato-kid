import { describe, expect, it } from 'vitest';
import { fitName, layoutNameplates, PILL, type Candidate } from './nameplates';

// Map nicknames (D-091, GUI_MVP §27.7): Codex's numbers, as the spec gives them.
const band = { left: 0, top: 100, right: 400, bottom: 800 };
/** A kid 40 px wide and 50 px tall standing at (x, y). */
const kid = (id: number, x: number, y: number, held = false, name = `Kid ${id}`): Candidate => ({ id, name, feet: { x, y }, box: { left: x - 20, top: y - 50, right: x + 20, bottom: y + 2 }, held });
const width = () => 60;

describe('fitting a name (§27.7)', () => {
  const measure = (t: string) => [...t].length * 10;

  it('keeps a name that fits, and cuts one that does not at whole graphemes with an ellipsis', () => {
    expect(fitName('Moss', 106, measure)).toBe('Moss');
    expect(fitName('Wwwwwwwwwwwwwwwwwwwwwwww', 106, measure)).toBe('Wwwwwwwww…');
    // A family emoji is one grapheme: never split.
    const family = '👨‍👩‍👧';
    const cut = fitName(`Ab${family}Cdefghijkl`, 40, (t) => (t.match(/./gu) ?? []).length * 10);
    expect(cut === 'Ab…' || cut.includes(family)).toBe(true);
    // Without Intl.Segmenter too (older WebViews): a combining mark stays with its letter (Codex review round 2, #114).
    const Seg = (Intl as unknown as { Segmenter?: unknown }).Segmenter;
    (Intl as unknown as { Segmenter?: unknown }).Segmenter = undefined;
    try {
      expect(fitName('Abcdéfgh', 50, (x) => [...x].length * 10)).toBe('Abcd…');
    } finally {
      (Intl as unknown as { Segmenter?: unknown }).Segmenter = Seg;
    }
  });
});

describe('placing pills (§27.7)', () => {
  it('centres a pill 4 px below the lower of the feet and the lifetime box', () => {
    const r = layoutNameplates([kid(1, 200, 400)], width, band, [], null).get(1)!;
    expect(r).toEqual({ left: 170, top: 406, right: 230, bottom: 406 + PILL.height });
  });

  it('leaves out a pill outside the map band, over another kid, or over a ripe sign', () => {
    expect(layoutNameplates([kid(1, 200, 790)], width, band, [], null).size).toBe(0);
    expect(layoutNameplates([kid(1, 10, 400)], width, band, [], null).size).toBe(0);
    // Another kid just below: its box (grown 2 px) is in the way.
    const crowd = layoutNameplates([kid(1, 200, 400), kid(2, 200, 470, false, '')], width, band, [], null);
    expect(crowd.has(1)).toBe(false);
    const sign = { left: 190, top: 420, right: 210, bottom: 440 };
    expect(layoutNameplates([kid(1, 200, 400)], width, band, [sign], null).size).toBe(0);
    expect(layoutNameplates([kid(1, 200, 400)], width, band, [{ ...sign, top: 440, bottom: 460 }], null).size).toBe(1);
  });

  it('when pills would crowd, the held kid wins, then the frontmost, then the lowest id', () => {
    // Side by side, 62 px apart: the 60 px pills would be 2 px apart, so only one stays.
    const a = kid(1, 200, 400);
    const b = kid(2, 262, 400);
    expect([...layoutNameplates([b, a], width, band, [], null).keys()]).toEqual([1]);
    expect([...layoutNameplates([a, { ...b, feet: { x: 262, y: 401 }, box: { ...b.box, bottom: 402 } }], width, band, [], null).keys()]).toEqual([2]);
    expect([...layoutNameplates([a, { ...b, held: true }], width, band, [], null).keys()]).toEqual([2]);
    // Far enough apart, both stay.
    expect(layoutNameplates([a, kid(2, 266, 400)], width, band, [], null).size).toBe(2);
  });

  it('an unnamed kid never gets a pill, but no pill covers it (Codex review, #114)', () => {
    const placed = layoutNameplates([kid(1, 200, 400), kid(2, 200, 470, false, '')], width, band, [], null);
    expect(placed.size).toBe(0);
    expect(layoutNameplates([kid(2, 200, 470, false, '')], width, band, [], null).size).toBe(0);
  });

  it('while a kid is held, no pill under the 44 px square at the finger', () => {
    const held = kid(1, 200, 400, true);
    expect(layoutNameplates([held], width, band, [], { x: 200, y: 420 }).size).toBe(0);
    expect(layoutNameplates([held], width, band, [], { x: 200, y: 520 }).size).toBe(1);
  });
});
