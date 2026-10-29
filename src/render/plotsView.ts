import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { PlantingArt } from '../content/artData';
import { trimOf } from './art';
import type { Plot } from '../sim/game';

// The plots on the map (D-061, GUI_MVP §15.2, Codex's art): soil always; an unstarted plot
// shows its five holes with a stamp per kid in it; a growing seed shows its stage by
// progress; a ready one its checked sign over a steady glow until it is tapped (D-088,
// §27.6), waiting for room or not. Nothing hints at the sprout. Static: no timers, pulses or
// per-type art. Locked plots don't exist on the map.

/** The ripe glow (§27.6): two flat ellipses under the soil, grown past it by fixed CSS px. */
const GLOW_COLOUR = 0xfff1d5;
const GLOW = [
  { grow: [28, 20], alpha: 0.28 },
  { grow: [16, 12], alpha: 0.72 },
] as const;
/** At far zoom the ready sign's canvas is drawn at least this many CSS px across (§27.6). */
const READY_SIGN_MIN_CSS = 96;

/** What a plot shows, as asset names in draw order (also what tests check). */
export function plotAssets(art: PlantingArt, plot: Plot, growSeconds: number): string[] {
  const seed = plot.seed;
  if (!seed?.sprout) {
    const stamps = Array.from({ length: Math.min(seed?.planted.length ?? 0, art.fillingSlotCentresSource.length) }, () => art.filledSlotAsset);
    return [art.empty, art.fillingAsset, ...stamps];
  }
  const p = Math.min(1, Math.max(0, seed.grown / growSeconds));
  if (p >= 1) return [art.empty, readyAsset(art)];
  const stage = art.stages.find((s) => s.to !== undefined && p >= s.from && p < s.to) ?? art.stages[0]!;
  return [art.empty, stage.asset];
}

function readyAsset(art: PlantingArt): string {
  return art.stages.find((s) => s.from >= 1)?.asset ?? art.waitingAsset;
}

/**
 * The ripe glow's two ellipses about the soil (§27.6), in a plot's local world units at this
 * `zoom` (CSS px per world unit): the soil's box grown by fixed screen px, whatever the zoom.
 */
export function glowEllipses(soil: { x: number; y: number; width: number; height: number }, zoom: number): { x: number; y: number; rx: number; ry: number; alpha: number }[] {
  const x = soil.x + soil.width / 2;
  const y = soil.y + soil.height / 2;
  return GLOW.map((g) => ({ x, y, rx: (soil.width + g.grow[0] / zoom) / 2, ry: (soil.height + g.grow[1] / zoom) / 2, alpha: g.alpha }));
}

/** A plot's soil in world units: its drawn bounds (GUI_MVP §15.2). */
export function plotRect(art: PlantingArt, garden: { x: number; y: number }, i: number): { left: number; top: number; right: number; bottom: number } {
  const [dx, dy] = art.plotOffsetsWorld[i] ?? [0, 0];
  const [l, t, r, b] = art.composedSourceBounds;
  const [px, py] = art.sourcePivot;
  const s = art.plotCanvasScale;
  const gx = garden.x + dx;
  const gy = garden.y + dy;
  return { left: gx + (l - px) * s, top: gy + (t - py) * s, right: gx + (r - px) * s, bottom: gy + (b - py) * s };
}

/**
 * A ready plot's checked sign in world units at this `zoom` (§27.6): the paper, drawn at
 * least 96 CSS px across about its own centre. Null without its art.
 */
export function readySignRect(art: PlantingArt, garden: { x: number; y: number }, i: number, zoom: number): { left: number; top: number; right: number; bottom: number } | null {
  const t = trimOf(readyAsset(art));
  if (!t) return null;
  const [x, y, w, h, cw] = t;
  const k = art.plotCanvasScale;
  const scale = Math.max(k, READY_SIGN_MIN_CSS / (cw * zoom));
  const [dx, dy] = art.plotOffsetsWorld[i] ?? [0, 0];
  const [px, py] = art.sourcePivot;
  const cx = garden.x + dx + (x + w / 2 - px) * k;
  const cy = garden.y + dy + (y + h / 2 - py) * k;
  return { left: cx - (w / 2) * scale, top: cy - (h / 2) * scale, right: cx + (w / 2) * scale, bottom: cy + (h / 2) * scale };
}

/**
 * The unlocked plot a tap at world point `p` hits, or null (§15.2). A ready plot's sign
 * first: drawn over its soil and, at far zoom, past it, it belongs to its own plot (§27.6;
 * Codex review, #115), the one drawn on top winning where signs overlap. Then the drawn
 * soil; only when none is hit, each plot's envelope grown symmetrically to at least `minCss`
 * CSS px per axis at this `zoom` (CSS px per world unit). Grown envelopes may overlap when
 * zoomed out: the nearest plot centre wins, then the lowest index. Locked plots never hit.
 */
export function plotAt(art: PlantingArt, garden: { x: number; y: number }, unlocked: number, p: { x: number; y: number }, zoom: number, minCss = 44, ready: (i: number) => boolean = () => false): number | null {
  const rects = Array.from({ length: unlocked }, (_, i) => plotRect(art, garden, i));
  const inside = (r: { left: number; top: number; right: number; bottom: number }) => p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
  // Signs are drawn in plot order, so where they overlap the later one is the one you see.
  for (let i = unlocked - 1; i >= 0; i--) {
    const r = ready(i) ? readySignRect(art, garden, i, zoom) : null;
    if (r && inside(r)) return i;
  }
  const hit = rects.findIndex(inside);
  if (hit >= 0) return hit;
  const min = minCss / zoom;
  let best: number | null = null;
  let bestD = Infinity;
  rects.forEach((r, i) => {
    const cx = (r.left + r.right) / 2;
    const cy = (r.top + r.bottom) / 2;
    const hw = Math.max(r.right - r.left, min) / 2;
    const hh = Math.max(r.bottom - r.top, min) / 2;
    if (!inside({ left: cx - hw, top: cy - hh, right: cx + hw, bottom: cy + hh })) return;
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

export class PlotsView {
  readonly root = new Container();
  /** Every plot's soil and stage, in plot order. */
  private readonly soils = new Container();
  /**
   * Ready plots' checked signs, above every plot's soil: enlarged at far zoom, a sign may
   * reach over a neighbour, and stays visible there, as picking assumes (§27.6; Codex review
   * round 3, #115).
   */
  private readonly signs = new Container();
  private readonly plots: { node: Container; key: string; glow: Graphics | null; sign: Sprite | null; zoom: number }[] = [];

  constructor(
    private readonly art: PlantingArt,
    /** The Garden's world ground point; plots sit at fixed offsets from it. */
    private readonly garden: { x: number; y: number },
    private readonly textures: Map<string, Texture>,
  ) {
    this.root.addChild(this.soils, this.signs);
  }

  /**
   * Redraws a plot only when what it shows changes (once per stage, not per frame); a ready
   * plot's glow and sign also follow the zoom (`zoom`: CSS px per world unit).
   */
  update(plots: readonly Plot[], growSeconds: number, zoom: number): void {
    plots.forEach((plot, i) => {
      const assets = plotAssets(this.art, plot, growSeconds);
      const key = assets.join('|');
      let entry = this.plots[i];
      if (!entry) {
        const node = new Container();
        const [dx, dy] = this.art.plotOffsetsWorld[i] ?? [0, 0];
        node.position.set(this.garden.x + dx, this.garden.y + dy);
        this.soils.addChild(node);
        entry = { node, key: '', glow: null, sign: null, zoom: 0 };
        this.plots[i] = entry;
      }
      if (entry.key === key) {
        if (entry.zoom !== zoom) this.fitReady(entry, zoom);
        return;
      }
      entry.key = key;
      for (const c of entry.node.removeChildren()) c.destroy();
      entry.sign?.destroy();
      entry.glow = null;
      entry.sign = null;
      // A ripe plot glows under its soil (§27.6).
      if (assets[assets.length - 1] === readyAsset(this.art)) entry.node.addChild((entry.glow = new Graphics()));
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
        if (asset === readyAsset(this.art) && n > 0) {
          // Its own layer, placed at its plot, in plot order whenever it ripened: picking takes
          // the later plot's sign where two overlap (Codex review round 4, #115).
          entry.sign = s;
          const before = this.plots.slice(0, i).filter((e) => e?.sign).length;
          this.signs.addChildAt(s, before);
          return;
        }
        entry.node.addChild(s);
      });
      this.fitReady(entry, zoom);
    });
    // Plots never go away, but keep the view in step if a save had fewer.
    while (this.plots.length > plots.length) {
      const gone = this.plots.pop()!;
      gone.sign?.destroy();
      gone.node.destroy({ children: true });
    }
  }

  /**
   * A ready plot at this zoom: the glow's ellipses, and the sign drawn at least 96 CSS px
   * across, enlarged about its checked paper so that stays over the soil (§27.6).
   */
  private fitReady(entry: (typeof this.plots)[number], zoom: number): void {
    entry.zoom = zoom;
    const soilTexture = this.textures.get(this.art.empty);
    if (entry.glow && soilTexture) {
      const k = this.art.plotCanvasScale;
      const [px, py] = this.art.sourcePivot;
      const t = soilTexture.trim ?? soilTexture.frame;
      const soil = { x: (t.x - px) * k, y: (t.y - py) * k, width: t.width * k, height: t.height * k };
      entry.glow.clear();
      for (const e of glowEllipses(soil, zoom)) entry.glow.ellipse(e.x, e.y, e.rx, e.ry).fill({ color: GLOW_COLOUR, alpha: e.alpha });
    }
    const sign = entry.sign;
    if (sign) {
      const t = sign.texture;
      const k = this.art.plotCanvasScale;
      const scale = Math.max(k, READY_SIGN_MIN_CSS / (t.orig.width * zoom));
      // The checked paper's centre, in source px, stays where it is drawn at the normal size.
      const paper = t.trim ?? t.frame;
      const cx = paper.x + paper.width / 2;
      const cy = paper.y + paper.height / 2;
      const [px, py] = this.art.sourcePivot;
      sign.anchor.set(cx / t.orig.width, cy / t.orig.height);
      sign.position.set(entry.node.x + (cx - px) * k, entry.node.y + (cy - py) * k);
      sign.scale.set(scale);
    }
  }

  /** Test hook: the assets each plot shows now. */
  shown(): string[][] {
    return this.plots.map((p) => (p.key ? p.key.split('|') : []));
  }

  /** Test hook: each plot's glow (whether it has one) and its sign's width in CSS px. */
  ready(zoom: number): { glow: boolean; signCss: number | null }[] {
    return this.plots.map((p) => ({ glow: !!p.glow, signCss: p.sign ? p.sign.texture.orig.width * p.sign.scale.x * zoom : null }));
  }
}
