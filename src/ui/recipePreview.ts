import { kidRig } from '../content/artData';
import type { Content } from '../content/types';
import type { RecipeView } from '../render/scene';
import { el } from './dom';
import { portrait } from './portrait';

// The recipe window (D-083, docs/GUI_MVP.md §25.2-25.3, Codex's design): while a held kid is
// over a partner, the two parents and the kid they make, as sprites, beside the finger. A
// result the player hasn't found is an ink silhouette with no name. It never takes input and
// never moves the camera; if no spot beside the finger is clear, a compact rail replaces the
// HUD or tray row for the gesture.

type Box = { left: number; top: number; right: number; bottom: number };

const PANEL = { w: 232, h: 112 };
const RAIL = { w: 232, h: 44 };
const FINGER = 48;
const GAP = 64;
const PAD = 8;

/** Where the panel may go: the world band between HUD and tray, and those two rows. */
export interface PreviewFrame {
  band: Box;
  hud: Box;
  tray: Box;
}

/** True if the rectangle `r` meets the circle at (cx, cy) of radius `rad`. */
function meetsCircle(r: Box, cx: number, cy: number, rad: number): boolean {
  const nx = Math.min(Math.max(cx, r.left), r.right);
  const ny = Math.min(Math.max(cy, r.top), r.bottom);
  return Math.hypot(nx - cx, ny - cy) < rad;
}

const meets = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const grow = (b: Box, d: number): Box => ({ left: b.left - d, top: b.top - d, right: b.right + d, bottom: b.bottom + d });

/** A placed panel: its candidate and top-left corner. */
export type Placed = { dock: string; left: number; top: number };

/**
 * The panel's place (§25.3): where it was, unmoved, while that still fits and is clear (it
 * doesn't chase the finger; Codex review, #103), else the first clear
 * candidate (above the finger and the held kid, below, left, right of the finger, then the
 * band's corners), each clamped 8 px inside the band. Null if none is clear: the rail is used.
 */
export function placePanel(v: Pick<RecipeView, 'pointer' | 'held' | 'target'>, band: Box, size: { w: number; h: number }, last: Placed | null): Placed | null {
  const { x, y } = v.pointer;
  const inner = { left: band.left + PAD, top: band.top + PAD, right: band.right - PAD, bottom: band.bottom - PAD };
  const avoid = [grow(v.held, PAD), grow(v.target, PAD)];
  const candidates: [string, number, number][] = [
    // Above the finger and the held kid: it floats over the finger, so a panel only 64 px up
    // would always meet it and fall to below, under the hand (Claude, on §25.3).
    ['above', x - size.w / 2, Math.min(y - GAP, v.held.top - PAD - 1) - size.h],
    ['below', x - size.w / 2, y + GAP],
    ['left', x - GAP - size.w, y - size.h / 2],
    ['right', x + GAP, y - size.h / 2],
    ['top-left', inner.left, inner.top],
    ['top-right', inner.right - size.w, inner.top],
    ['bottom-left', inner.left, inner.bottom - size.h],
    ['bottom-right', inner.right - size.w, inner.bottom - size.h],
  ];
  const clear = (left: number, top: number) => {
    const r = { left, top, right: left + size.w, bottom: top + size.h };
    return !meetsCircle(r, x, y, FINGER) && !avoid.some((a) => meets(r, a));
  };
  const fit = ([dock, l, t]: [string, number, number]): Placed | null => {
    if (inner.right - inner.left < size.w || inner.bottom - inner.top < size.h) return null;
    const left = Math.min(Math.max(l, inner.left), inner.right - size.w);
    const top = Math.min(Math.max(t, inner.top), inner.bottom - size.h);
    return clear(left, top) ? { dock, left, top } : null;
  };
  // Where it was, if that is still inside the band and clear: it stays put (§25.3).
  if (last && last.left >= inner.left && last.top >= inner.top && last.left + size.w <= inner.right && last.top + size.h <= inner.bottom && clear(last.left, last.top)) return last;
  for (const c of candidates) {
    const p = fit(c);
    if (p) return p;
  }
  return null;
}

/** The compact rail's row (§25.3): the HUD's or the tray's, whichever is farther from the finger and clear of it. */
export function placeRail(pointer: { x: number; y: number }, frame: PreviewFrame): { row: 'hud' | 'tray'; left: number; top: number } | null {
  const rows = (['hud', 'tray'] as const)
    .map((row) => ({ row, box: frame[row] }))
    .sort((a, b) => Math.abs((b.box.top + b.box.bottom) / 2 - pointer.y) - Math.abs((a.box.top + a.box.bottom) / 2 - pointer.y));
  for (const { row, box } of rows) {
    const mid = (box.left + box.right) / 2;
    const left = Math.min(Math.max(mid - RAIL.w / 2, frame.band.left + PAD), frame.band.right - PAD - RAIL.w);
    const top = (box.top + box.bottom) / 2 - RAIL.h / 2;
    const r = { left, top, right: left + RAIL.w, bottom: top + RAIL.h };
    if (!meetsCircle(r, pointer.x, pointer.y, FINGER)) return { row, left, top };
  }
  return null;
}

export class RecipePreview {
  private readonly panel = el('div', 'recipe-window ui-surface ui-toast');
  private readonly rail = el('div', 'recipe-rail ui-surface ui-toast');
  /** Announces each new pair once (§25.2); never the hidden result's name. */
  private readonly status = el('div', 'visually-hidden');
  private key: string | null = null;
  private placed: Placed | null = null;
  /** The panel's height with its current content, measured while out of sight (§25.3). */
  private panelHeight = PANEL.h;
  /** A font or size change since the last measurement: measure again, announcing nothing. */
  private stale = false;
  private railRow: 'hud' | 'tray' | null = null;

  constructor(
    private readonly content: Content,
    private readonly frame: () => PreviewFrame,
    private readonly rows: { hud: HTMLElement; tray: HTMLElement },
  ) {
    this.panel.hidden = true;
    this.rail.hidden = true;
    for (const node of [this.panel, this.rail]) node.setAttribute('aria-hidden', 'true');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.status.setAttribute('aria-label', 'Fusion preview');
    document.body.append(this.panel, this.rail, this.status);
    // The panel's height can change with the same pair targeted: the bundled font arriving,
    // or text enlarged. Placement must test the real size (Codex review, #103).
    new ResizeObserver(() => {
      if (!this.panel.hidden) this.panelHeight = Math.max(PANEL.h, this.panel.offsetHeight);
    }).observe(this.panel);
    const remeasure = () => (this.stale = true);
    document.fonts?.addEventListener('loadingdone', remeasure);
    window.addEventListener('resize', remeasure);
  }

  private name(type: string): string {
    return this.content.kids.find((k) => k.id === type)?.name ?? type;
  }

  /** The three sprites and the signs between them, at `size` px. */
  private equation(v: RecipeView, size: number): HTMLElement[] {
    const result = el('span', `recipe-sprite${v.found ? '' : ' recipe-unfound'}`, portrait(kidRig!, v.result, size));
    return [
      el('span', 'recipe-sprite', portrait(kidRig!, v.parents[0].type, size, v.parents[0].look)),
      el('span', 'recipe-sign', '+'),
      el('span', 'recipe-sprite', portrait(kidRig!, v.parents[1].type, size, v.parents[1].look)),
      el('span', 'recipe-sign', '→'),
      result,
    ];
  }

  /** Every frame, from the scene: the recipe now, or null. */
  render(v: RecipeView | null): void {
    if (!v) {
      this.hide();
      return;
    }
    const [a, b] = v.parents;
    const key = `${a.type}/${a.look.body}/${a.look.face}|${b.type}/${b.look.body}/${b.look.face}|${v.result}|${v.found}`;
    if (key !== this.key) {
      this.key = key;
      // Same frame as the mark, content replaced at once: no stale parent or result (§25.1).
      this.panel.replaceChildren(
        el('p', 'recipe-heading', 'Release to fuse'),
        el('div', 'recipe-equation', ...this.equation(v, 48)),
        el('p', 'recipe-name', v.found ? this.name(v.result) : 'Not found yet'),
      );
      this.rail.replaceChildren(el('div', 'recipe-equation', ...this.equation(v, 32)));
      this.stale = true;
      const made = v.found ? this.name(v.result) : "a kid you haven't found";
      this.status.textContent = `${this.name(a.type)} plus ${this.name(b.type)} makes ${made}. Release on the marked partner to fuse.`;
    }
    if (this.stale) this.measure();
    const frame = this.frame();
    const p = placePanel(v, frame.band, { w: PANEL.w, h: this.panelHeight }, this.placed);
    if (p) {
      this.placed = p;
      this.panel.hidden = false;
      this.panel.style.transform = `translate(${Math.round(p.left)}px, ${Math.round(p.top)}px)`;
      this.showRail(null);
      return;
    }
    this.placed = null;
    this.panel.hidden = true;
    this.showRail(placeRail(v.pointer, frame));
  }

  /**
   * The panel's real height (enlarged text, a wrapped name) is what placement must test, even
   * while it is hidden; otherwise it would flicker with the rail (Codex review, #103).
   */
  private measure(): void {
    this.stale = false;
    const hidden = this.panel.hidden;
    this.panel.style.visibility = 'hidden';
    this.panel.hidden = false;
    this.panelHeight = Math.max(PANEL.h, this.panel.offsetHeight);
    this.panel.hidden = hidden;
    this.panel.style.visibility = '';
  }

  private showRail(at: ReturnType<typeof placeRail>): void {
    if (this.railRow && this.railRow !== at?.row) this.rowShown(this.railRow, true);
    if (!at) {
      this.rail.hidden = true;
      this.railRow = null;
      return;
    }
    // The rail replaces that whole row for the gesture.
    this.rowShown(at.row, false);
    this.railRow = at.row;
    this.rail.hidden = false;
    this.rail.style.transform = `translate(${Math.round(at.left)}px, ${Math.round(at.top)}px)`;
  }

  /**
   * Hidden, the row takes no taps or focus and leaves the accessibility tree, so its controls
   * are inert for the gesture without touching `inert`, which sheets own (§2).
   */
  private rowShown(row: 'hud' | 'tray', on: boolean): void {
    this.rows[row].style.visibility = on ? '' : 'hidden';
  }

  private hide(): void {
    if (this.key === null && this.panel.hidden && this.rail.hidden) return;
    this.key = null;
    this.placed = null;
    this.panel.hidden = true;
    this.showRail(null);
    this.status.textContent = '';
  }
}
