import { Container, Sprite, type Texture } from 'pixi.js';
import { trimOf } from './art';

// Rare kids on the map (D-062, docs/GUI_MVP.md §16.1-16.2, §15.5, Codex's art): each rare's
// variant mark above its box (Mini's at its right foot instead), the shared six-glint
// sleeve around it, and the birth burst for a rare or special newborn. All of it is drawn
// in one layer beneath every kid, so neighbours cover it rather than receive its paint; it
// takes no input and never changes a kid's box.

export type Box = { left: number; top: number; right: number; bottom: number };

/** The sleeve's source canvas and its clear centre (§16.2). */
const SLEEVE = 'fx_rare_sparkle';
const SLEEVE_CENTRE = 128;
const SLEEVE_PERIOD_MS = 2400;
const BURST_MS = 480;
const BURST_SCALE = 1.28;
/** Reduced motion: a special-only newborn's static sleeve lasts this long (§15.5). */
const REDUCED_SPECIAL_MS = 1200;

/**
 * The sleeve around a lifetime box in world units (§16.2): centred on the box, at
 * s = max(.24, (box width in CSS px + 8) / 140) CSS px per source px, uniform.
 * Returns the world position and the world scale per source px.
 */
export function sleeveAt(box: Box, zoom: number): { x: number; y: number; scale: number } {
  const css = Math.max(0.24, ((box.right - box.left) * zoom + 8) / 140);
  return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2, scale: css / zoom };
}

/**
 * A variant mark above a lifetime box (§16.1): its visible trim centred on the box, its
 * visible bottom 4 CSS px above the box's top, its visible width clamp(24, canvas × 36/55,
 * 36) CSS px, where `canvasCss` is the kid's normal (un-Mini) canvas width on screen.
 * `trim` is the mark's visible rect in its source canvas [x, y, w, h].
 */
export function markAt(box: Box, zoom: number, canvasCss: number, trim: [number, number, number, number]): { x: number; y: number; scale: number; anchor: [number, number]; widthCss: number } {
  const widthCss = Math.min(36, Math.max(24, (canvasCss * 36) / 55));
  const [tx, ty, tw, th] = trim;
  return { x: (box.left + box.right) / 2, y: box.top - 4 / zoom, scale: widthCss / tw / zoom, anchor: [tx + tw / 2, ty + th], widthCss };
}

/** The idle sleeve's opacity: .8 → 1 → .8 over 2.4 s, phase fixed by kid id; reduced motion holds at 1. */
export function sleeveAlpha(ms: number, id: number, reduced: boolean): number {
  if (reduced) return 1;
  const phase = (id * 0.618034) % 1;
  return 0.9 - 0.1 * Math.cos(2 * Math.PI * (ms / SLEEVE_PERIOD_MS + phase));
}

/**
 * A newborn rare or special's burst (§15.5), `ms` after it was admitted: the sleeve grows
 * 1 → 1.28 and fades 1 → 0 over 480 ms, ease-out. Then a rare goes on to its idle sleeve
 * and a special-only kid has none. Reduced motion: no burst; a special-only kid shows a
 * static sleeve for 1.2 s. Null: no burst any more.
 */
export function burstAt(ms: number, reduced: boolean, rare: boolean): { scale: number; alpha: number } | null {
  if (reduced) return !rare && ms < REDUCED_SPECIAL_MS ? { scale: 1, alpha: 1 } : null;
  if (ms >= BURST_MS) return null;
  const t = 1 - (1 - ms / BURST_MS) ** 2;
  return { scale: 1 + (BURST_SCALE - 1) * t, alpha: 1 - t };
}

/** What the layer needs of a kid this frame. */
export interface RareKid {
  id: number;
  variant: string | undefined;
  special: boolean;
  /** Where it is drawn now (the held spot while held). */
  x: number;
  y: number;
  /** Its lifetime box about its ground point, as the sim keeps it (Mini already scaled). */
  box: Box;
  /** Its normal (un-Mini) look scale. */
  normalScale: number;
  /** Happy from food (D-056): the sun at its left foot, until it wears off (GUI_MVP §17.2). */
  happy?: boolean;
}

interface Item {
  sleeve: Sprite | null;
  mark: Sprite | null;
  happy: Sprite | null;
}

export class RareLayer {
  readonly root = new Container();
  private readonly items = new Map<number, Item>();
  /**
   * Newborns still bursting: kid id → foreground ms its burst began, or null while its view
   * is still loading (a costume not yet resident): the burst starts when it appears (Codex
   * review, PR #77).
   */
  private readonly births = new Map<number, number | null>();

  constructor(
    private readonly textures: Map<string, Texture>,
    private readonly reducedMotion: boolean,
    /** The rig: a kid canvas's source size, ground anchor and world size. */
    private readonly rig: { canvas: [number, number]; groundAnchor: [number, number]; worldCanvasSize: number },
  ) {
    this.root.eventMode = 'none';
  }

  /** A rare or special kid just came up on the map, live (never an offline birth). */
  born(id: number): void {
    this.births.set(id, null);
  }

  /**
   * Draws every rare and bursting newborn among `kids` (those drawn now); `now` is foreground
   * ms. `alive`: every kid in the world, drawn or not, so a newborn still loading keeps its
   * burst for when it appears.
   */
  update(kids: readonly RareKid[], zoom: number, now: number, alive: ReadonlySet<number>): void {
    const seen = new Set<number>();
    for (const k of kids) {
      if (this.births.get(k.id) === null) this.births.set(k.id, now);
      const birth = this.births.get(k.id) ?? undefined;
      const burst = birth === undefined ? null : burstAt(now - birth, this.reducedMotion, !!k.variant);
      if (birth !== undefined && !burst) this.births.delete(k.id);
      if (!k.variant && !burst && !k.happy) continue;
      seen.add(k.id);
      let item = this.items.get(k.id);
      if (!item) {
        item = { sleeve: null, mark: null, happy: null };
        this.items.set(k.id, item);
      }
      // Happy: a still sun at the left foot, at normal size (a Mini's too), no motion.
      if (k.happy) {
        item.happy ??= this.sprite('fx_happy', this.rig.groundAnchor);
        item.happy.position.set(k.x, k.y);
        item.happy.scale.set((k.normalScale * this.rig.worldCanvasSize) / this.rig.canvas[0]);
      } else if (item.happy) {
        item.happy.destroy();
        item.happy = null;
      }
      if (!k.variant && !burst) {
        item.sleeve?.destroy();
        item.sleeve = null;
        item.mark?.destroy();
        item.mark = null;
        continue;
      }
      const box = { left: k.x + k.box.left, top: k.y + k.box.top, right: k.x + k.box.right, bottom: k.y + k.box.bottom };

      // The sleeve: the burst while it lasts, then the rare's idle pulse.
      item.sleeve ??= this.sprite(SLEEVE, [SLEEVE_CENTRE, SLEEVE_CENTRE]);
      const s = sleeveAt(box, zoom);
      const grow = burst?.scale ?? 1;
      item.sleeve.position.set(s.x, s.y);
      item.sleeve.scale.set(s.scale * grow);
      item.sleeve.alpha = burst ? burst.alpha : sleeveAlpha(now, k.id, this.reducedMotion);

      // The mark: above the box, or Mini's at the right foot at normal size (§16.1).
      if (k.variant) {
        const name = `fx_variant_${k.variant}`;
        if (!item.mark || item.mark.texture !== this.textures.get(name)) {
          item.mark?.destroy();
          item.mark = k.variant === 'mini' ? this.sprite(name, this.rig.groundAnchor) : this.sprite(name, [0, 0]);
        }
        if (k.variant === 'mini') {
          // Drawn in a normal kid canvas about the ground point: it does not shrink twice.
          item.mark.position.set(k.x, k.y);
          item.mark.scale.set((k.normalScale * this.rig.worldCanvasSize) / this.rig.canvas[0]);
        } else {
          const t = trimOf(name);
          const trim: [number, number, number, number] = t ? [t[0], t[1], t[2], t[3]] : [0, 0, this.rig.canvas[0], this.rig.canvas[1]];
          const m = markAt(box, zoom, k.normalScale * this.rig.worldCanvasSize * zoom, trim);
          item.mark.anchor.set(m.anchor[0] / this.rig.canvas[0], m.anchor[1] / this.rig.canvas[1]);
          item.mark.position.set(m.x, m.y);
          item.mark.scale.set(m.scale);
        }
      } else if (item.mark) {
        item.mark.destroy();
        item.mark = null;
      }
    }
    for (const [id, item] of this.items) {
      if (seen.has(id)) continue;
      item.sleeve?.destroy();
      item.mark?.destroy();
      item.happy?.destroy();
      this.items.delete(id);
    }
    for (const id of this.births.keys()) if (!alive.has(id)) this.births.delete(id);
  }

  /** Test hook: what each drawn rare shows. */
  shown(): { id: number; mark: string | null; sleeve: boolean; sleeveAlpha: number; sleeveScale: number; markBounds: { x: number; y: number; w: number; h: number } | null; happy: boolean }[] {
    return [...this.items].map(([id, i]) => {
      const b = i.mark?.getBounds();
      return {
        id,
        happy: !!i.happy,
        mark: i.mark ? ([...this.textures].find(([, t]) => t === i.mark!.texture)?.[0] ?? null) : null,
        sleeve: !!i.sleeve,
        sleeveAlpha: i.sleeve?.alpha ?? 0,
        sleeveScale: i.sleeve?.scale.x ?? 0,
        markBounds: b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null,
      };
    });
  }

  private sprite(name: string, anchorSource: readonly [number, number]): Sprite {
    const t = this.textures.get(name);
    if (!t) throw new Error(`Missing art "${name}"`);
    const s = new Sprite(t);
    // Textures keep their full source canvas (orig), so anchors are in source px.
    s.anchor.set(anchorSource[0] / t.orig.width, anchorSource[1] / t.orig.height);
    this.root.addChild(s);
    return s;
  }
}
