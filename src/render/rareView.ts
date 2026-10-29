import { Container, Sprite, type Texture } from 'pixi.js';

// Rare kids on the map (D-072, docs/GUI_MVP.md §16.2, §15.5, Codex's art): the shared
// six-glint sleeve around each rare kid, the birth burst for a rare or special newborn, and
// a happy kid's sun. All of it is drawn in one layer beneath every kid, so neighbours cover
// it rather than receive its paint; it takes no input and never changes a kid's box. The
// variant marks retired with the variants (D-072).

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

/** The sleeve's small loop (D-094, §27.7): stops at 0/25/50/75 % of 2.4 s, then back to rest. */
const SLEEVE_STOPS = [
  { dy: 0, scale: 1, rotation: 0, alpha: 1 },
  { dy: -1, scale: 1.02, rotation: 2, alpha: 0.82 },
  { dy: 0, scale: 1, rotation: 0, alpha: 1 },
  { dy: 1, scale: 0.98, rotation: -2, alpha: 0.82 },
] as const;

export type SleeveMotion = { dy: number; scale: number; rotation: number; alpha: number };

/**
 * The idle sleeve at foreground `ms` (D-094, §27.7): it rises and falls 1 CSS px, grows and
 * shrinks 2 %, tilts ±2° and dims to .82, eased in and out between the stops; the phase is
 * fixed by kid id. `dy` is CSS px, `rotation` degrees. Reduced motion: at rest.
 */
export function sleeveMotion(ms: number, id: number, reduced: boolean): SleeveMotion {
  if (reduced) return SLEEVE_STOPS[0];
  const t = (((ms / SLEEVE_PERIOD_MS + id * 0.618034) % 1) + 1) % 1;
  const at = t * SLEEVE_STOPS.length;
  const i = Math.floor(at);
  const a = SLEEVE_STOPS[i]!;
  const b = SLEEVE_STOPS[(i + 1) % SLEEVE_STOPS.length]!;
  const u = at - i;
  const e = u * u * (3 - 2 * u);
  const mix = (x: number, y: number) => x + (y - x) * e;
  return { dy: mix(a.dy, b.dy), scale: mix(a.scale, b.scale), rotation: mix(a.rotation, b.rotation), alpha: mix(a.alpha, b.alpha) };
}

/** The idle sleeve's opacity (its loop's, D-094): between .82 and 1; reduced motion holds at 1. */
export function sleeveAlpha(ms: number, id: number, reduced: boolean): number {
  return sleeveMotion(ms, id, reduced).alpha;
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

/** The sun's centre in fx_happy's 256 px source canvas (its trimmed art: 26, 191, 41 × 42). */
const SUN_CENTRE: [number, number] = [46.5, 212];

/**
 * A happy kid's sun (D-092): centred on the top-right corner of its lifetime box, so it sits
 * by the kid's head on the right whatever its body or costume. World position of the centre.
 */
export function sunAt(x: number, y: number, box: Box): { x: number; y: number } {
  return { x: x + box.right, y: y + box.top };
}

/** What the layer needs of a kid this frame. */
export interface RareKid {
  id: number;
  /** One of the rare kid types (D-072): it sparkles for as long as it lives. */
  rare: boolean;
  special: boolean;
  /** Where it is drawn now (the held spot while held). */
  x: number;
  y: number;
  /** Its lifetime box about its ground point, as the sim keeps it. */
  box: Box;
  /** Its look scale. */
  scale: number;
  /** Happy from food (D-056): the sun at its top right (D-092), until it wears off (GUI_MVP §17.2). */
  happy?: boolean;
}

interface Item {
  sleeve: Sprite | null;
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
    /**
     * Reduced motion, as the player's preference is now: a change applies at once, a rare
     * going still and a special's still sleeve keeping its first deadline (§16.2; Codex
     * review, PR #77). Births are timed from admission, so none restarts.
     */
    public reducedMotion: boolean,
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
      const burst = birth === undefined ? null : burstAt(now - birth, this.reducedMotion, k.rare);
      if (birth !== undefined && !burst) this.births.delete(k.id);
      if (!k.rare && !burst && !k.happy) continue;
      seen.add(k.id);
      let item = this.items.get(k.id);
      if (!item) {
        item = { sleeve: null, happy: null };
        this.items.set(k.id, item);
      }
      // Happy: a still sun at the top right (D-092), at the kid's size, no motion.
      if (k.happy) {
        item.happy ??= this.sprite('fx_happy', SUN_CENTRE);
        const sun = sunAt(k.x, k.y, k.box);
        item.happy.position.set(sun.x, sun.y);
        item.happy.scale.set((k.scale * this.rig.worldCanvasSize) / this.rig.canvas[0]);
      } else if (item.happy) {
        item.happy.destroy();
        item.happy = null;
      }
      if (!k.rare && !burst) {
        item.sleeve?.destroy();
        item.sleeve = null;
        continue;
      }
      const box = { left: k.x + k.box.left, top: k.y + k.box.top, right: k.x + k.box.right, bottom: k.y + k.box.bottom };

      // The sleeve: the burst while it lasts, then the rare's idle loop (D-094).
      item.sleeve ??= this.sprite(SLEEVE, [SLEEVE_CENTRE, SLEEVE_CENTRE]);
      const s = sleeveAt(box, zoom);
      const m = burst ? SLEEVE_STOPS[0] : sleeveMotion(now, k.id, this.reducedMotion);
      const grow = burst?.scale ?? m.scale;
      item.sleeve.position.set(s.x, s.y + m.dy / zoom);
      item.sleeve.scale.set(s.scale * grow);
      item.sleeve.rotation = (m.rotation * Math.PI) / 180;
      item.sleeve.alpha = burst ? burst.alpha : m.alpha;

    }
    for (const [id, item] of this.items) {
      if (seen.has(id)) continue;
      item.sleeve?.destroy();
      item.happy?.destroy();
      this.items.delete(id);
    }
    for (const id of this.births.keys()) if (!alive.has(id)) this.births.delete(id);
  }

  /** Test hook: what each drawn rare shows. */
  shown(): { id: number; sleeve: boolean; sleeveAlpha: number; sleeveScale: number; sleeveRotation: number; happy: boolean; sun?: { x: number; y: number } }[] {
    return [...this.items].map(([id, i]) => ({
      id,
      sleeveRotation: i.sleeve?.rotation ?? 0,
      happy: !!i.happy,
      ...(i.happy ? { sun: { x: i.happy.x, y: i.happy.y } } : {}),
      sleeve: !!i.sleeve,
      sleeveAlpha: i.sleeve?.alpha ?? 0,
      sleeveScale: i.sleeve?.scale.x ?? 0,
    }));
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
