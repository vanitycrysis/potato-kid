import { describe, expect, it } from 'vitest';
import { placePanel, placeRail } from './recipePreview';

// The recipe window's place (D-083, GUI_MVP §25.3): clear of the finger and both kids.
const band = { left: 0, top: 76, right: 390, bottom: 760 };
const size = { w: 232, h: 112 };
const box = (x: number, y: number) => ({ left: x - 30, top: y - 60, right: x + 30, bottom: y });
const at = (x: number, y: number) => ({ pointer: { x, y }, held: box(x, y - 26), target: box(x, y + 40) });
const clearOfFinger = (p: { left: number; top: number }, x: number, y: number) => {
  const nx = Math.min(Math.max(x, p.left), p.left + size.w);
  const ny = Math.min(Math.max(y, p.top), p.top + size.h);
  return Math.hypot(nx - x, ny - y) >= 48;
};

describe('the recipe window (§25.3)', () => {
  it('goes above the finger and the held kid when there is room, centred on the finger', () => {
    const v = at(195, 500);
    const p = placePanel(v, band, size, null)!;
    expect(p.dock).toBe('above');
    expect(p.left).toBe(195 - 116);
    expect(p.top + size.h).toBeLessThanOrEqual(Math.min(500 - 64, v.held.top - 8));
  });

  it('goes below near the top of the band, clamped 8 px inside it', () => {
    const p = placePanel(at(20, 140), band, size, null)!;
    expect(p.dock).toBe('below');
    expect(p.left).toBe(8);
    expect(clearOfFinger(p, 20, 140)).toBe(true);
  });

  it('near the corner of the band, with the kids elsewhere, a panel clamped onto the finger is passed over', () => {
    // Above clamps down onto the finger here; the finger alone rules it out.
    const v = { pointer: { x: 20, y: 90 }, held: box(300, 700), target: box(340, 700) };
    const p = placePanel(v, band, size, null)!;
    expect(p.dock).not.toBe('above');
    expect(clearOfFinger(p, 20, 90)).toBe(true);
  });

  it('keeps a clear dock rather than chasing the finger', () => {
    const p = placePanel(at(195, 300), band, size, 'below')!;
    expect(p.dock).toBe('below');
  });

  it('never covers the finger or either kid, wherever the finger is', () => {
    for (let x = 10; x < 390; x += 40) {
      for (let y = 90; y < 760; y += 50) {
        const v = at(x, y);
        const p = placePanel(v, band, size, null);
        if (!p) continue;
        expect(clearOfFinger(p, x, y), `${x}, ${y}`).toBe(true);
        const r = { left: p.left, top: p.top, right: p.left + size.w, bottom: p.top + size.h };
        for (const k of [v.held, v.target]) expect(r.left < k.right + 8 && k.left - 8 < r.right && r.top < k.bottom + 8 && k.top - 8 < r.bottom, `${x}, ${y}`).toBe(false);
      }
    }
  });

  it('a band too small for the panel gives none: the rail goes in the row farther from the finger', () => {
    const short = { left: 0, top: 60, right: 640, bottom: 150 };
    expect(placePanel(at(320, 100), short, size, null)).toBeNull();
    const frame = { band: short, hud: { left: 8, top: 8, right: 632, bottom: 52 }, tray: { left: 242, top: 300, right: 398, bottom: 352 } };
    expect(placeRail({ x: 320, y: 100 }, frame)).toEqual({ row: 'tray', left: 204, top: 304 });
    // A finger on the tray row: the HUD row instead.
    expect(placeRail({ x: 320, y: 326 }, frame)?.row).toBe('hud');
  });
});
