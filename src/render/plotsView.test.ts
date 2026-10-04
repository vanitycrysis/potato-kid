import { describe, expect, it } from 'vitest';
import type { PlantingArt } from '../content/artData';
import { gate4Data } from '../content/artData';
import type { Plot } from '../sim/game';
import { DEFAULT_LOOK } from '../sim/world';
import { plotAssets } from './plotsView';

// What each plot shows (GUI_MVP §15.2): Codex's shipped tokens, so a token change shows up here.
const art = gate4Data!.planting as PlantingArt;
const grow = 100;
const kid = { type: 'plain', look: DEFAULT_LOOK };
const filling = (n: number): Plot => ({ seed: { planted: Array.from({ length: n }, () => kid), sprout: null, grown: 0 } });
const growing = (grown: number): Plot => ({ seed: { planted: [kid, kid, kid], sprout: { type: 'fire', variant: null }, grown } });

describe('what a plot shows (GUI_MVP §15.2)', () => {
  it('an empty plot: soil and its five holes', () => {
    expect(plotAssets(art, { seed: null }, grow, null)).toEqual([art.empty, art.fillingAsset]);
  });

  it('a filling plot: one stamp per kid in it, up to five', () => {
    for (const n of [1, 3, 5]) expect(plotAssets(art, filling(n), grow, null)).toEqual([art.empty, art.fillingAsset, ...Array(n).fill(art.filledSlotAsset)]);
  });

  it('a growing seed: its stage by progress, with no holes or stamps', () => {
    const stage = (p: number) => plotAssets(art, growing(p * grow), grow, null);
    const [seed, shoot, leaves, ready] = art.stages.map((s) => s.asset);
    expect(stage(0)).toEqual([art.empty, seed]);
    expect(stage(0.2499)).toEqual([art.empty, seed]);
    expect(stage(0.25)).toEqual([art.empty, shoot]);
    expect(stage(0.6499)).toEqual([art.empty, shoot]);
    expect(stage(0.65)).toEqual([art.empty, leaves]);
    expect(stage(0.9999)).toEqual([art.empty, leaves]);
    expect(stage(1)).toEqual([art.empty, ready]);
  });

  it('a ready seed waiting for room shows the waiting sign, for either reason', () => {
    expect(plotAssets(art, growing(grow), grow, 'full')).toEqual([art.empty, art.waitingAsset]);
    expect(plotAssets(art, growing(grow), grow, 'noRoom')).toEqual([art.empty, art.waitingAsset]);
  });

  it('never shows what the seed will be', () => {
    const a = plotAssets(art, growing(50), grow, null);
    const b = plotAssets(art, { seed: { planted: [kid, kid, kid], sprout: { type: 'hero', variant: 'rainbow' }, grown: 50 } }, grow, null);
    expect(a).toEqual(b);
  });
});
