import { Container, Sprite, type Texture } from 'pixi.js';
import type { PlantingArt } from '../content/artData';
import type { Plot, PlotWaiting } from '../sim/game';

// The plots on the map (D-061, GUI_MVP §15.2, Codex's art): soil always; an unstarted plot
// shows its five holes with a stamp per kid in it; a growing seed shows its stage by
// progress; a ready one its sign, or the waiting sign. Nothing hints at the sprout. Static:
// no timers, pulses or per-type art. Locked plots don't exist on the map.

/** What a plot shows, as asset names in draw order (also what tests check). */
export function plotAssets(art: PlantingArt, plot: Plot, growSeconds: number, waiting: PlotWaiting | null): string[] {
  const seed = plot.seed;
  if (!seed?.sprout) {
    const stamps = Array.from({ length: Math.min(seed?.planted.length ?? 0, art.fillingSlotCentresSource.length) }, () => art.filledSlotAsset);
    return [art.empty, art.fillingAsset, ...stamps];
  }
  const p = Math.min(1, Math.max(0, seed.grown / growSeconds));
  if (p >= 1) return [art.empty, waiting ? art.waitingAsset : (art.stages.find((s) => s.from >= 1)?.asset ?? art.waitingAsset)];
  const stage = art.stages.find((s) => s.to !== undefined && p >= s.from && p < s.to) ?? art.stages[0]!;
  return [art.empty, stage.asset];
}

export class PlotsView {
  readonly root = new Container();
  private readonly plots: { node: Container; key: string }[] = [];

  constructor(
    private readonly art: PlantingArt,
    /** The Garden's world ground point; plots sit at fixed offsets from it. */
    private readonly garden: { x: number; y: number },
    private readonly textures: Map<string, Texture>,
  ) {}

  /** Redraws a plot only when what it shows changes (once per stage, not per frame). */
  update(plots: readonly Plot[], growSeconds: number, waiting: (i: number) => PlotWaiting | null): void {
    plots.forEach((plot, i) => {
      const assets = plotAssets(this.art, plot, growSeconds, waiting(i));
      const key = assets.join('|');
      let entry = this.plots[i];
      if (!entry) {
        const node = new Container();
        const [dx, dy] = this.art.plotOffsetsWorld[i] ?? [0, 0];
        node.position.set(this.garden.x + dx, this.garden.y + dy);
        this.root.addChild(node);
        entry = { node, key: '' };
        this.plots[i] = entry;
      }
      if (entry.key === key) return;
      entry.key = key;
      for (const c of entry.node.removeChildren()) c.destroy();
      assets.forEach((asset, n) => {
        const t = this.textures.get(asset);
        if (!t) return;
        const s = new Sprite(t);
        const [px, py] = this.art.sourcePivot;
        s.anchor.set(px / t.width, py / t.height);
        s.scale.set(this.art.plotCanvasScale);
        // Stamps go on the filled slots, in planting order: the stamp's centre on the slot's.
        if (asset === this.art.filledSlotAsset) {
          const slot = this.art.fillingSlotCentresSource[n - 2]!;
          const [cx, cy] = this.art.filledSlotSourceCentre;
          s.position.set((slot[0] - cx) * this.art.plotCanvasScale, (slot[1] - cy) * this.art.plotCanvasScale);
        }
        entry.node.addChild(s);
      });
    });
    // Plots never go away, but keep the view in step if a save had fewer.
    while (this.plots.length > plots.length) this.plots.pop()?.node.destroy({ children: true });
  }

  /** Test hook: the assets each plot shows now. */
  shown(): string[][] {
    return this.plots.map((p) => (p.key ? p.key.split('|') : []));
  }
}
