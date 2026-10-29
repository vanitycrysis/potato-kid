import { describe, expect, it } from 'vitest';
import type { PlantingArt } from '../content/artData';
import { gate4Data } from '../content/artData';
import type { Plot } from '../sim/game';
import { DEFAULT_LOOK } from '../sim/world';
import { glowEllipses, plotAssets, plotAt, plotRect, readySignRect } from './plotsView';

// What each plot shows (GUI_MVP §15.2): Codex's shipped tokens, so a token change shows up here.
const art = gate4Data!.planting as PlantingArt;
const grow = 100;
const kid = { id: 1, type: 'plain', look: DEFAULT_LOOK };
const filling = (n: number): Plot => ({ seed: { planted: Array.from({ length: n }, () => kid), sprout: null, grown: 0 } });
const growing = (grown: number): Plot => ({ seed: { planted: [kid, kid, kid], sprout: { type: 'fire' }, grown } });

describe('what a plot shows (GUI_MVP §15.2)', () => {
  it('an empty plot: soil and its five holes', () => {
    expect(plotAssets(art, { seed: null }, grow)).toEqual([art.empty, art.fillingAsset]);
  });

  it('a filling plot: one stamp per kid in it, up to five', () => {
    for (const n of [1, 3, 5]) expect(plotAssets(art, filling(n), grow)).toEqual([art.empty, art.fillingAsset, ...Array(n).fill(art.filledSlotAsset)]);
  });

  it('a growing seed: its stage by progress, with no holes or stamps', () => {
    const stage = (p: number) => plotAssets(art, growing(p * grow), grow);
    const [seed, shoot, leaves, ready] = art.stages.map((s) => s.asset);
    expect(stage(0)).toEqual([art.empty, seed]);
    expect(stage(0.2499)).toEqual([art.empty, seed]);
    expect(stage(0.25)).toEqual([art.empty, shoot]);
    expect(stage(0.6499)).toEqual([art.empty, shoot]);
    expect(stage(0.65)).toEqual([art.empty, leaves]);
    expect(stage(0.9999)).toEqual([art.empty, leaves]);
    expect(stage(1)).toEqual([art.empty, ready]);
  });

  it('a ready seed shows its checked sign until it is tapped, also while it waits for a clear spot (D-088, §27.6)', () => {
    const ready = art.stages.find((x) => x.from >= 1)!.asset;
    expect(plotAssets(art, growing(grow), grow)).toEqual([art.empty, ready]);
  });

  it('the ripe glow: two ellipses grown past the soil by 28/20 and 16/12 CSS px at any zoom (§27.6)', () => {
    const soil = { x: -80, y: -40, width: 160, height: 50 };
    for (const zoom of [0.25, 0.4, 1.5]) {
      const [outer, inner] = glowEllipses(soil, zoom);
      expect([outer!.x, outer!.y]).toEqual([0, -15]);
      expect(outer!.rx * 2 * zoom).toBeCloseTo(160 * zoom + 28, 9);
      expect(outer!.ry * 2 * zoom).toBeCloseTo(50 * zoom + 20, 9);
      expect(inner!.rx * 2 * zoom).toBeCloseTo(160 * zoom + 16, 9);
      expect(inner!.ry * 2 * zoom).toBeCloseTo(50 * zoom + 12, 9);
      expect([outer!.alpha, inner!.alpha]).toEqual([0.28, 0.72]);
    }
  });

  it('never shows what the seed will be', () => {
    const a = plotAssets(art, growing(50), grow);
    const b = plotAssets(art, { seed: { planted: [kid, kid, kid], sprout: { type: 'hero' }, grown: 50 } }, grow);
    expect(a).toEqual(b);
  });
});

describe('tapping a plot (GUI_MVP §15.2)', () => {
  const garden = { x: 1080, y: 620 };

  it('the soil spans 168 × 99 world units around each fixed ground point', () => {
    expect(plotRect(art, garden, 0)).toEqual({ left: 1080 - 96 - 84, top: 620 + 88 - 87, right: 1080 - 96 + 84, bottom: 620 + 88 + 12 });
  });

  it('hits the soil drawn there, and never a locked plot', () => {
    const r = plotRect(art, garden, 1);
    const centre = { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
    expect(plotAt(art, garden, 4, centre, 1)).toBe(1);
    expect(plotAt(art, garden, 1, centre, 1)).toBeNull();
    expect(plotAt(art, garden, 4, { x: r.right + 30, y: r.top - 30 }, 1)).toBeNull();
  });

  it('zoomed out, a tap near a small plot still hits it: its envelope grows to 44 CSS px', () => {
    // At 0.2 CSS px per world unit the soil is 33.6 × 19.8 px; 44 px is 220 world units.
    const r = plotRect(art, garden, 0);
    const cy = (r.top + r.bottom) / 2;
    expect(plotAt(art, garden, 1, { x: (r.left + r.right) / 2, y: cy + 100 }, 0.2)).toBe(0);
    expect(plotAt(art, garden, 1, { x: (r.left + r.right) / 2, y: cy + 100 }, 1)).toBeNull();
  });

  it('where grown envelopes overlap, the nearest plot centre wins, then the lower index', () => {
    const a = plotRect(art, garden, 0);
    const b = plotRect(art, garden, 2);
    const x = (a.left + a.right) / 2;
    // Between plots 1 and 3, below the soil of 1, nearer 3's centre; then exactly midway.
    const ca = (a.top + a.bottom) / 2;
    const cb = (b.top + b.bottom) / 2;
    expect(plotAt(art, garden, 4, { x: x - 90, y: ca + 0.7 * (cb - ca) }, 0.15)).toBe(2);
    expect(plotAt(art, garden, 4, { x: x - 90, y: (ca + cb) / 2 }, 0.15)).toBe(0);
  });
});

describe("a ready plot's sign is its own target (§27.6; Codex review, #115)", () => {
  const garden = { x: 1536, y: 2348 };
  it('at far zoom, a tap on the enlarged sign past its soil is that plot, not the neighbour under it', () => {
    const zoom = 0.18;
    const sign = readySignRect(art, garden, 0, zoom)!;
    const p = { x: sign.right - 1, y: (sign.top + sign.bottom) / 2 };
    // Past plot 1's own soil edge: without the sign it would be plot 1's.
    expect(plotAt(art, garden, 2, p, zoom)).toBe(1);
    expect(plotAt(art, garden, 2, p, zoom, 44, (i) => i === 0)).toBe(0);
    // The sign is at least 96 CSS px across.
    expect((sign.right - sign.left) * zoom).toBeGreaterThan(40);
  });
});
