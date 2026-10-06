import { describe, expect, it } from 'vitest';
import { burstAt, sleeveAlpha, sleeveAt } from './rareView';

// Rare sleeves (GUI_MVP §16.2, §15.5): Codex's numbers, as the spec gives them.
describe('the rare sleeve (GUI_MVP §16.2)', () => {
  it('is centred on the lifetime box at max(.24, (width + 8) / 140) CSS px per source px', () => {
    // §16.2's worked example: a full Round at normal 55 px is 48.125 CSS px wide, so the
    // 256 px source spans about 102.63 CSS px.
    const zoom = 2;
    const box = { left: 10, top: 20, right: 10 + 48.125 / zoom, bottom: 60 };
    const s = sleeveAt(box, zoom);
    expect(s.x).toBeCloseTo((box.left + box.right) / 2, 12);
    expect(s.y).toBeCloseTo(40, 12);
    expect(256 * s.scale * zoom).toBeCloseTo(102.63, 1);
    // Tiny on screen: never below .24 CSS px per source px.
    expect(sleeveAt({ left: 0, top: 0, right: 1, bottom: 1 }, 0.1).scale * 0.1).toBeCloseTo(0.24, 12);
  });

  it('breathes .8 → 1 → .8 over 2.4 s, in phase by kid; reduced motion holds at 1', () => {
    const seen = Array.from({ length: 240 }, (_, i) => sleeveAlpha(i * 10, 7, false));
    expect(Math.min(...seen)).toBeCloseTo(0.8, 3);
    expect(Math.max(...seen)).toBeCloseTo(1, 3);
    expect(sleeveAlpha(1234, 7, false)).toBeCloseTo(sleeveAlpha(1234 + 2400, 7, false), 12);
    expect(sleeveAlpha(0, 7, false)).not.toBeCloseTo(sleeveAlpha(0, 8, false), 3);
    expect(sleeveAlpha(1234, 7, true)).toBe(1);
  });
});

describe('the birth burst (GUI_MVP §15.5)', () => {
  it('grows 1 → 1.28 and fades out over 480 ms, ease-out, then ends', () => {
    expect(burstAt(0, false, true)).toEqual({ scale: 1, alpha: 1 });
    const mid = burstAt(240, false, true)!;
    // Ease-out: more than half done at half time.
    expect(mid.scale).toBeGreaterThan(1.14);
    expect(mid.alpha).toBeLessThan(0.5);
    expect(burstAt(479, false, false)!.alpha).toBeGreaterThan(0);
    expect(burstAt(480, false, true)).toBeNull();
  });

  it('reduced motion: no burst; a special-only newborn keeps a still sleeve for 1.2 s', () => {
    expect(burstAt(0, true, true)).toBeNull();
    expect(burstAt(0, true, false)).toEqual({ scale: 1, alpha: 1 });
    expect(burstAt(1199, true, false)).toEqual({ scale: 1, alpha: 1 });
    expect(burstAt(1200, true, false)).toBeNull();
  });
});
