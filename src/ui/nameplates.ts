import { el } from './dom';

// Nicknames on the map (D-091, docs/GUI_MVP.md §27.7, Codex's design): a decorative paper
// pill under each named kid, in a DOM layer over the world and under the HUD. Screen-sized at
// every zoom. A pill that would cover another kid, a ripe plot's sign or the finger, or crowd
// another pill, is left out; the kid card and lists always name the kid.

/** A screen rectangle, CSS px. */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A named kid drawn this frame, in screen CSS px. */
export interface Candidate {
  id: number;
  name: string;
  /** Its displayed ground point (the lifted feet while held). */
  feet: { x: number; y: number };
  /** Its projected lifetime box: every pose and costume. */
  box: Rect;
  held: boolean;
}

/** The pill (§27.7): 16/20 type, 1 px border, 2/6 px padding, at most 120 px wide. */
export const PILL = { height: 26, maxWidth: 120, textMax: 106, gap: 4, padX: 6, border: 1, clear: 4, exclude: 2, finger: 44 } as const;
/** A pill that was in the way shows again only after this long clear (§27.7). */
export const REVEAL_MS = 200;
const ELLIPSIS = '…';

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

function graphemes(s: string): string[] {
  return segmenter ? [...segmenter.segment(s)].map((g) => g.segment) : Array.from(s);
}

/** The name if it fits `max` px; else whole graphemes off its end, plus an ellipsis (§27.7). */
export function fitName(name: string, max: number, measure: (text: string) => number): string {
  if (measure(name) <= max) return name;
  const g = graphemes(name);
  for (let n = g.length - 1; n > 0; n--) {
    const text = g.slice(0, n).join('') + ELLIPSIS;
    if (measure(text) <= max) return text;
  }
  return ELLIPSIS;
}

function overlaps(a: Rect, b: Rect, margin = 0): boolean {
  return a.left < b.right + margin && b.left < a.right + margin && a.top < b.bottom + margin && b.top < a.bottom + margin;
}

function grow(r: Rect, by: number): Rect {
  return { left: r.left - by, top: r.top - by, right: r.right + by, bottom: r.bottom + by };
}

/**
 * Where each pill goes this frame, or nothing for a pill left out (§27.7): centred under the
 * feet, 4 px below the lower of the feet and the lifetime box. Winners in order: the held kid,
 * then the frontmost (lowest on screen), then the lowest id; a pill within 4 px of one kept
 * is left out. So is one outside `band`, over another kid (2 px grown), over an `exclusions`
 * rectangle (a ripe plot's sign), or, while a kid is held, over the 44 px square at `finger`.
 */
export function layoutNameplates(
  candidates: readonly Candidate[],
  widthOf: (c: Candidate) => number,
  band: Rect,
  exclusions: readonly Rect[],
  finger: { x: number; y: number } | null,
): Map<number, Rect> {
  const order = [...candidates].sort((a, b) => Number(b.held) - Number(a.held) || b.feet.y - a.feet.y || a.id - b.id);
  const fingerBox = finger ? { left: finger.x - PILL.finger / 2, top: finger.y - PILL.finger / 2, right: finger.x + PILL.finger / 2, bottom: finger.y + PILL.finger / 2 } : null;
  const kept = new Map<number, Rect>();
  for (const c of order) {
    const w = widthOf(c);
    const top = Math.max(c.feet.y, c.box.bottom) + PILL.gap;
    const r = { left: c.feet.x - w / 2, top, right: c.feet.x + w / 2, bottom: top + PILL.height };
    if (r.left < band.left || r.right > band.right || r.top < band.top || r.bottom > band.bottom) continue;
    if (candidates.some((o) => o.id !== c.id && overlaps(r, grow(o.box, PILL.exclude)))) continue;
    if (exclusions.some((x) => overlaps(r, grow(x, PILL.exclude)))) continue;
    if (fingerBox && overlaps(r, fingerBox)) continue;
    if ([...kept.values()].some((k) => overlaps(r, k, PILL.clear))) continue;
    kept.set(c.id, r);
  }
  return kept;
}

/** The pills' DOM layer: one element per shown name, reused across frames. */
export class Nameplates {
  readonly root = el('div', 'nameplates');
  private readonly pills = new Map<number, { node: HTMLElement; name: string; text: string; width: number }>();
  /** When each left-out pill was last in the way: it shows again 200 ms after (§27.7). */
  private readonly blocked = new Map<number, number>();
  private measureCtx: CanvasRenderingContext2D | null = null;
  private font = '';

  constructor() {
    this.root.setAttribute('aria-hidden', 'true');
  }

  /** This frame's named kids; `now` is ms. An empty list (or the setting off) clears every pill. */
  update(candidates: readonly Candidate[], band: Rect, exclusions: readonly Rect[], finger: { x: number; y: number } | null, now: number): void {
    const widths = new Map<number, number>();
    for (const c of candidates) widths.set(c.id, this.width(c));
    const placed = layoutNameplates(candidates, (c) => widths.get(c.id)!, band, exclusions, finger);
    for (const c of candidates) if (!placed.has(c.id)) this.blocked.set(c.id, now);
    const live = new Set(candidates.map((c) => c.id));
    for (const id of this.blocked.keys()) if (!live.has(id)) this.blocked.delete(id);
    for (const [id, pill] of this.pills) {
      const r = placed.get(id);
      const since = this.blocked.get(id);
      if (!r || !live.has(id) || (since !== undefined && now - since < REVEAL_MS)) {
        pill.node.remove();
        this.pills.delete(id);
      }
    }
    for (const c of candidates) {
      const r = placed.get(c.id);
      if (!r) continue;
      const since = this.blocked.get(c.id);
      if (since !== undefined && now - since < REVEAL_MS) continue;
      this.blocked.delete(c.id);
      let pill = this.pills.get(c.id);
      if (!pill) {
        const node = el('span', 'nameplate');
        this.root.append(node);
        pill = { node, name: '', text: '', width: 0 };
        this.pills.set(c.id, pill);
      }
      if (pill.name !== c.name) {
        pill.name = c.name;
        pill.text = this.text(c.name);
        pill.node.replaceChildren(el('bdi', '', pill.text));
      }
      pill.node.style.transform = `translate(${Math.round(r.left)}px, ${Math.round(r.top)}px)`;
    }
  }

  clear(): void {
    for (const p of this.pills.values()) p.node.remove();
    this.pills.clear();
    this.blocked.clear();
  }

  /** Test hook: the shown pills, by kid id. */
  shown(): { id: number; text: string; rect: DOMRect }[] {
    return [...this.pills].map(([id, p]) => ({ id, text: p.text, rect: p.node.getBoundingClientRect() }));
  }

  private text(name: string): string {
    return fitName(name, PILL.textMax, (t) => this.measure(t));
  }

  private width(c: Candidate): number {
    const t = this.pills.get(c.id)?.name === c.name ? this.pills.get(c.id)!.text : this.text(c.name);
    return Math.min(PILL.maxWidth, Math.ceil(this.measure(t)) + 2 * (PILL.padX + PILL.border));
  }

  private measure(text: string): number {
    if (!this.measureCtx) this.measureCtx = document.createElement('canvas').getContext('2d');
    const ctx = this.measureCtx;
    if (!ctx) return text.length * 8;
    // The pill's own font, as the page has it now (it loads after start).
    if (!this.font) {
      const probe = el('span', 'nameplate');
      probe.style.visibility = 'hidden';
      this.root.append(probe);
      const s = getComputedStyle(probe);
      this.font = `${s.fontSize} ${s.fontFamily}`;
      probe.remove();
    }
    ctx.font = this.font;
    return ctx.measureText(text).width;
  }
}
