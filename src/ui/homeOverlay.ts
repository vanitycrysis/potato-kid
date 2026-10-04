import { uiData } from '../content/artData';
import type { HomeView } from '../render/scene';
import { el, icon } from './dom';

// The planting overlay (D-061, docs/GUI_MVP.md §15.1, Codex's design; it began as Send
// home's, §13.1): the target over the Garden, the pointer mark, and the label that explains
// each state. It never takes input and never moves the camera; the scene draws the tether
// beneath the kids.

type Box = { left: number; top: number; right: number; bottom: number };

interface LabelTokens {
  minimumSizePx: [number, number];
  gapPx: number;
}

const tokens = () =>
  (uiData?.mvp as { sendHome?: { target: { states: Record<'shown' | 'waiting' | 'ready', [string, string, string]>; label: LabelTokens; cornerRadiusPx: number } } } | undefined)
    ?.sendHome?.target;

const MAX_KIDS = 5;

/** The label's three lines for each state (GUI_MVP §15.1); `n` is the 1-based plot, `c` its kids. */
export function plantLabel(v: Pick<HomeView, 'state' | 'plot' | 'busy'>): [string, string, string] {
  if (v.busy === 'full') return ['All plots are full.', 'Release to keep this kid.', 'Tap a full plot to Start growing.'];
  if (v.busy === 'growing') return ['All plots are growing.', 'Release to keep this kid.', 'Check the Garden for time left.'];
  const n = (v.plot?.index ?? 0) + 1;
  const c = v.plot?.count ?? 0;
  if (v.state === 'ready') return ['Release to add this kid', `Plot ${n}: ${c} → ${c + 1} / ${MAX_KIDS}.`, 'Start growing separately at 3–5.'];
  if (v.state === 'waiting') return ['Keep holding…', 'Release early to place normally.', `Plot ${n}: ${c} / ${MAX_KIDS} kids.`];
  return [`Add to Plot ${n}`, 'Hold here, then release.', 'Leaves the map. No refund.'];
}

/** Every label the target can show, worst cases included, for sizing it once. */
const ALL_LABELS: [string, string, string][] = [
  ...(['shown', 'waiting', 'ready'] as const).map((state) => plantLabel({ state, plot: { index: 3, count: 4 }, busy: null })),
  plantLabel({ state: 'shown', plot: null, busy: 'full' }),
  plantLabel({ state: 'shown', plot: null, busy: 'growing' }),
];

const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

export class HomeOverlay {
  private readonly target = el('div', 'home-target');
  private readonly mark = el('div', 'home-point');
  private readonly heading = el('span', 'home-heading');
  private readonly helpers = [el('span', 'home-helper'), el('span', 'home-helper')];
  private readonly label = el('div', 'home-label', icon('icon_garden', '', 'ui-icon-24 home-icon'), el('div', 'home-text', this.heading, ...this.helpers));
  private readonly stateIcon = el('span', 'home-state-icon');
  /** An unseen copy of the label, to measure the largest state's size without touching the live one. */
  private readonly probe = el('div', 'home-label home-probe', icon('icon_garden', '', 'ui-icon-24 home-icon'), el('div', 'home-text'));
  private size: { key: string; w: number; h: number } | null = null;
  private shownText = '';

  /** The outline: one dashed rect (shown, waiting), or a solid rect, a solid inset and a fill (ready). */
  private readonly svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private readonly outer = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  private readonly inner = document.createElementNS('http://www.w3.org/2000/svg', 'rect');

  constructor(
    /** The safe world area the label must stay in: below the HUD, above the tray. */
    private readonly area: () => Box,
  ) {
    this.svg.append(this.inner, this.outer);
    this.svg.classList.add('home-outline');
    this.target.append(this.svg, this.stateIcon);
    for (const n of [this.target, this.mark, this.label]) {
      n.setAttribute('aria-hidden', 'true');
      n.hidden = true;
    }
    // The label's words are announced once per state, not every frame.
    this.label.removeAttribute('aria-hidden');
    this.label.setAttribute('role', 'status');
    this.probe.setAttribute('aria-hidden', 'true');
    document.body.append(this.target, this.mark, this.label, this.probe);
  }

  /** Whether the label has a place for this target and held kid (asked by the scene). */
  fits(target: Box, held: Box | null): boolean {
    return this.place(target, held) !== null;
  }

  /**
   * The label's size: the largest of its three states, so a state change never needs a
   * place that wasn't checked. Remeasured when the viewport or the font changes.
   */
  private labelSize(): { w: number; h: number } {
    const key = `${window.innerWidth}|${document.fonts?.status}`;
    if (this.size?.key === key) return this.size;
    let w = 0;
    let h = 0;
    const text = this.probe.querySelector('.home-text') as HTMLElement;
    for (const lines of ALL_LABELS) {
      text.replaceChildren(el('span', 'home-heading', lines[0]), el('span', 'home-helper', lines[1]), el('span', 'home-helper', lines[2]));
      w = Math.max(w, this.probe.offsetWidth);
      h = Math.max(h, this.probe.offsetHeight);
    }
    this.size = { key, w, h };
    return this.size;
  }

  render(v: HomeView): void {
    this.target.hidden = this.label.hidden = v.state === 'hidden';
    this.mark.hidden = !v.point;
    if (v.state === 'hidden') return;
    const t = v.target;
    const side = Math.min(t.right - t.left, t.bottom - t.top);
    Object.assign(this.target.style, {
      left: `${t.left}px`,
      top: `${t.top}px`,
      width: `${t.right - t.left}px`,
      height: `${t.bottom - t.top}px`,
      // The corner radius is capped at a quarter of the projected side (§13.1).
      borderRadius: `${Math.min(tokens()?.cornerRadiusPx ?? 8, side / 4)}px`,
    });
    this.target.dataset.state = v.state;
    const w = t.right - t.left;
    const h = t.bottom - t.top;
    const r = Math.min(tokens()?.cornerRadiusPx ?? 8, side / 4);
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    // Strokes sit inside the projected rectangle; the ready inset is 4 px further in.
    const set = (rect: SVGRectElement, inset: number) => {
      rect.setAttribute('x', String(inset));
      rect.setAttribute('y', String(inset));
      rect.setAttribute('width', String(Math.max(0, w - 2 * inset)));
      rect.setAttribute('height', String(Math.max(0, h - 2 * inset)));
      rect.setAttribute('rx', String(Math.max(0, r - inset + 1)));
    };
    set(this.outer, 1);
    set(this.inner, 5);
    const want = v.state === 'ready' ? 'icon_check' : v.state === 'waiting' ? 'icon_timer' : '';
    if (this.stateIcon.dataset.icon !== want) {
      this.stateIcon.dataset.icon = want;
      this.stateIcon.replaceChildren(...(want ? [icon(want, '', 'ui-icon-20')] : []));
    }
    if (v.point) Object.assign(this.mark.style, { left: `${v.point.x}px`, top: `${v.point.y}px` });
    this.setText(plantLabel(v));
    const at = this.place(t, v.held);
    if (at) Object.assign(this.label.style, { left: `${at.x}px`, top: `${at.y}px` });
  }

  private setText(lines: [string, string, string]): void {
    const key = lines.join('\n');
    if (key === this.shownText) return;
    this.shownText = key;
    this.heading.textContent = lines[0];
    this.helpers[0]!.textContent = lines[1];
    this.helpers[1]!.textContent = lines[2];
  }

  /**
   * Above the target, else below, left, right, each 8 px away and clamped into the safe
   * area, never over the target or the held kid (§13.1). Null when nothing fits.
   */
  private place(target: Box, held: Box | null): { x: number; y: number } | null {
    const gap = tokens()?.label.gapPx ?? 8;
    const { w, h } = this.labelSize();
    const a = this.area();
    const cx = (target.left + target.right) / 2;
    const cy = (target.top + target.bottom) / 2;
    const clampX = (x: number) => Math.min(Math.max(x, a.left), a.right - w);
    const clampY = (y: number) => Math.min(Math.max(y, a.top), a.bottom - h);
    const options = [
      { x: clampX(cx - w / 2), y: target.top - gap - h },
      { x: clampX(cx - w / 2), y: target.bottom + gap },
      { x: target.left - gap - w, y: clampY(cy - h / 2) },
      { x: target.right + gap, y: clampY(cy - h / 2) },
    ];
    for (const o of options) {
      const box = { left: o.x, top: o.y, right: o.x + w, bottom: o.y + h };
      const inside = box.left >= a.left && box.right <= a.right && box.top >= a.top && box.bottom <= a.bottom;
      if (inside && !overlaps(box, target) && !(held && overlaps(box, held))) return o;
    }
    return null;
  }
}
