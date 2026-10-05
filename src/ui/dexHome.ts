import { kidRig } from '../content/artData';
import type { Content, KidId } from '../content/types';
import type { MapScene } from '../render/scene';
import { el, icon } from './dom';
import { portrait } from './portrait';
import type { HomeFeed, Message } from './homeFeed';
import { plotRoute, rareMark } from './plotRoute';

// Planting from a kid's Dex detail (D-061, docs/GUI_MVP.md §15.6, Codex's design; it began
// as Send home's, §13.4): the path for anyone who can't drag. Each live copy of the type is
// a row; choosing one opens its card, then Choose a plot, then one plot's confirmation, and
// only its Add sends that one kid to that one plot. It never starts a plot growing.
//
// The Dex owns a HomeFeed that outlives any one detail: the outstanding send and the
// inline messages, so leaving and reopening a detail never loses a result or a reading
// (Codex review, PR #54). A detail's section only draws the feed for its kid type.


export interface HomeSection {
  root: HTMLElement;
  update(): void;
  /** Escape: closes an open confirmation first. True if it did. */
  collapse(): boolean;
  /** The detail is going away. */
  dispose(): void;
}

export function homeSection(type: KidId, content: Content, scene: MapScene, feed: HomeFeed, readOnly: () => boolean): HomeSection {
  const kidName = content.kids.find((k) => k.id === type)?.name ?? type;
  const heading = el('h3', 'sheet-section dex-home-heading');
  heading.tabIndex = -1;
  const helper = el('p', 'sheet-helper');
  const rows = el('div', 'dex-home-rows');
  const status = el('div', 'dex-home-status');
  status.setAttribute('role', 'status');
  status.hidden = true;
  // Focusable, so a keyboard user can hold a message to read it (focus pauses it).
  status.tabIndex = 0;
  const root = el('section', 'dex-home', heading, helper, rows, status);
  let hover = false;
  status.addEventListener('pointerenter', () => (hover = true));
  status.addEventListener('pointerleave', () => (hover = false));

  const live = () => scene.game.state.world.kids.filter((k) => k.type === type);
  // Ordinals: by kid id when the detail opens, newcomers appended; a copy keeps its number
  // while the detail stays open (§13.4). Ids are never shown.
  const ordinals = new Map<number, number>();
  let next = 1;
  for (const k of [...live()].sort((a, b) => a.id - b.id)) ordinals.set(k.id, next++);
  const rowFor = new Map<number, { row: HTMLButtonElement; wrap: HTMLElement }>();
  let selected: number | null = null;
  let panel: { node: HTMLElement; refresh: () => void } | null = null;
  let drawn: object | null = null;

  const draw = (m: Message | null) => {
    if (m === drawn) return;
    drawn = m;
    status.hidden = !m;
    if (!m) return;
    const lines = m.lines();
    status.classList.toggle('is-warning', m.warn);
    status.replaceChildren(
      icon(m.warn ? 'icon_warning' : 'icon_garden', '', 'ui-icon-28'),
      el('div', 'card-text', ...lines.map((l, i) => el('span', i === 0 ? 'card-heading' : 'card-line', l))),
    );
    status.scrollIntoView({ block: 'nearest' });
  };

  /**
   * All its words inside the visible part of the sheet (or the page): only then does reading
   * time count. The words, not the box: a sliver of blank margin isn't reading.
   * The aperture is the viewport, cut by every clipping ancestor (the body, or a tight
   * sheet that scrolls as one), then by the sheet's header, which stays put over a tight
   * sheet's content (Codex review, PR #54). The Kids tab has no footer.
   */
  const onScreen = () => {
    if (status.hidden) return false;
    const r = (status.querySelector('.card-text') ?? status).getBoundingClientRect();
    let top = 0;
    let bottom = window.innerHeight;
    for (let a = status.parentElement; a && a !== document.body; a = a.parentElement) {
      if (getComputedStyle(a).overflowY === 'visible') continue;
      const b = a.getBoundingClientRect();
      top = Math.max(top, b.top);
      bottom = Math.min(bottom, b.bottom);
    }
    // Above the content in the flow, the header cuts nothing; pinned over it, it hides it.
    const header = status.closest('.sheet')?.querySelector(':scope > .sheet-header')?.getBoundingClientRect();
    if (header?.height) top = Math.max(top, header.bottom);
    // A pixel of slack for rounding; words taller than the view count while they fill it.
    return (r.top >= top - 1 && r.bottom <= bottom + 1) || (r.top <= top && r.bottom >= bottom);
  };

  /** Focus back on the section heading, without scrolling the message out of view. */
  const focusHeading = () => {
    heading.focus({ preventScroll: true });
    if (!status.hidden) status.scrollIntoView({ block: 'nearest' });
  };

  const close = (focusRow: boolean) => {
    if (!panel) return;
    panel.node.remove();
    panel = null;
    const was = selected;
    selected = null;
    for (const [id, r] of rowFor) {
      r.row.setAttribute('aria-pressed', 'false');
      r.row.classList.toggle('is-selected', false);
      if (focusRow && id === was) r.row.focus();
    }
  };

  /** The chosen kid left before it was added (fused, or gone): say so, choose no other. */
  const stale = () => {
    close(false);
    feed.warn(type);
    focusHeading();
  };

  /** Stage 1, the kid's card: what planting does, then Choose a plot (§15.6). */
  const open = (kidId: number) => {
    close(false);
    selected = kidId;
    const ordinal = ordinals.get(kidId)!;
    const title = el('h4', 'dex-home-confirm-title dex-home-planting', 'Planting');
    title.tabIndex = -1;
    const helperText = el('p', 'sheet-body-text', 'Add this kid to a plot. Leaves the map right away; kept in your Dex. No refund.');
    const keep = el('button', 'ui-button dex-home-action', 'Keep on map');
    keep.type = 'button';
    keep.addEventListener('click', () => close(true));
    const pick = el('button', 'ui-button ui-primary dex-home-action', 'Choose a plot');
    pick.type = 'button';
    pick.setAttribute('aria-label', `Choose a plot for kid ${ordinal}`);
    const node = el('div', 'dex-home-confirm ui-surface', title, helperText, pick, keep);
    const opened = { node, refresh: () => {} };
    panel = opened;
    pick.addEventListener('click', () => {
      if (readOnly() || panel !== opened) return;
      const kid = live().find((k) => k.id === kidId);
      const c = plotRoute({
        scene,
        content,
        kidId,
        type,
        displayName: kid?.name ?? kidName,
        ordinal,
        readOnly,
        busy: () => !!feed.pending,
        onAdd: (plot) => feed.send(kidId, type, plot),
        onKeep: () => close(true),
        onStale: stale,
      });
      pick.replaceWith(c.node);
      opened.refresh = c.refresh;
      c.refresh();
      c.title.focus();
    });
    const r = rowFor.get(kidId)!;
    r.row.setAttribute('aria-pressed', 'true');
    r.row.classList.add('is-selected');
    r.wrap.after(node);
    title.focus();
  };

  const makeRow = (kidId: number) => {
    const kid = live().find((k) => k.id === kidId)!;
    const ordinal = ordinals.get(kidId)!;
    const rare = rareMark(kid.variant);
    const row = el(
      'button',
      'ui-button dex-home-row',
      portrait(kidRig!, type, 48, kid.look, kid.variant ? { variant: kid.variant, miniScale: content.balance.planting.miniScale } : undefined),
      el('span', 'dex-home-row-text', el('span', 'dex-home-row-name', `Kid ${ordinal}${rare ? ` · ${rare}` : ''}`), el('span', 'sheet-helper', 'Choose this kid')),
    );
    row.type = 'button';
    row.setAttribute('aria-pressed', 'false');
    row.setAttribute('aria-label', `Choose ${kidName}, kid ${ordinal} on your map${rare ? `, ${rare}` : ''}, to add to a plot`);
    row.addEventListener('click', () => {
      if (readOnly()) return;
      if (selected === kidId) close(true);
      else open(kidId);
    });
    const wrap = el('div', 'dex-home-row-wrap', row);
    return { row, wrap };
  };

  // This section hears the results of sends (made here, or before it was reopened).
  feed.listen(() => {
    close(false);
    focusHeading();
  });

  let shown = '';
  const update = () => {
    const m = feed.tick(type, performance.now(), onScreen(), hover || status.contains(document.activeElement));
    draw(m);
    // Not read yet (e.g. drawn before the detail settled): keep bringing it into view.
    if (m && !m.read && !onScreen()) status.scrollIntoView({ block: 'nearest' });
    const ids = live().map((k) => k.id);
    for (const id of ids) if (!ordinals.has(id)) ordinals.set(id, next++);
    // A chosen kid that left while unsent: the confirmation goes, with the reason.
    if (selected !== null && feed.pending?.kidId !== selected && !ids.includes(selected)) stale();
    panel?.refresh();
    const key = `${ids.join(',')}|${readOnly()}`;
    if (key === shown) return;
    shown = key;
    heading.textContent = `On your map · ${ids.length}`;
    helper.textContent = ids.length ? 'Choose a kid to add it to a plot.' : 'None on your map.';
    for (const [id, r] of rowFor) {
      if (ids.includes(id)) continue;
      // Focus on a row that leaves goes to the section heading, never the page (Codex
      // review, PR #54).
      if (r.wrap.contains(document.activeElement)) heading.focus({ preventScroll: true });
      r.wrap.remove();
      rowFor.delete(id);
    }
    // Rows in ordinal order; existing rows stay put, so focus is kept.
    for (const id of [...ids].sort((a, b) => ordinals.get(a)! - ordinals.get(b)!)) {
      if (rowFor.has(id)) continue;
      const r = makeRow(id);
      rowFor.set(id, r);
      rows.append(r.wrap);
    }
    for (const r of rowFor.values()) {
      r.row.setAttribute('aria-disabled', String(readOnly()));
      r.row.classList.toggle('is-disabled', readOnly());
    }
    // No scroll here: a routine change on the map never pulls the player back to a message
    // already read (Codex review, PR #54). One not yet read is kept in view above.
  };

  return {
    root,
    update,
    collapse: () => {
      if (!panel) return false;
      close(true);
      return true;
    },
    dispose: () => feed.listen(null),
  };
}
