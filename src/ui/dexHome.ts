import { kidRig, uiData } from '../content/artData';
import type { Content, KidId } from '../content/types';
import type { MapScene } from '../render/scene';
import { el, icon } from './dom';
import { portrait } from './portrait';
import type { HomeFeed, Message } from './homeFeed';

// Send home from a kid's Dex detail (D-048, docs/GUI_MVP.md §13.4, Codex's design): the
// path for anyone who can't drag. Each live copy of the type is a row; choosing one opens
// a confirmation, and only its own button sends that one kid home.
//
// The Dex owns a HomeFeed that outlives any one detail: the outstanding send and the
// inline messages, so leaving and reopening a detail never loses a result or a reading
// (Codex review, PR #54). A detail's section only draws the feed for its kid type.

const nonDrag = () => (uiData?.mvp as { sendHome?: { nonDrag: { confirm: string; cancel: string } } } | undefined)?.sendHome?.nonDrag;

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
  let panel: { node: HTMLElement; confirm: HTMLButtonElement } | null = null;
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

  /** The chosen kid left before it was sent (fused, or gone): say so, choose no other. */
  const stale = () => {
    close(false);
    feed.warn(type);
    focusHeading();
  };

  const open = (kidId: number) => {
    close(false);
    selected = kidId;
    const ordinal = ordinals.get(kidId)!;
    const title = el('h4', 'dex-home-confirm-title', `Send kid ${ordinal} home?`);
    title.tabIndex = -1;
    const lines = [el('p', 'sheet-body-text', 'Leaves the map. Kept in your Potato-Dex.'), el('p', 'sheet-body-text', 'No refund. Bringing one back costs a fee.')];
    if (scene.game.state.buildings.compendium < 1) lines.push(el('p', 'sheet-body-text', 'Build Compendium first to bring one back.'));
    const keep = el('button', 'ui-button dex-home-action', nonDrag()?.cancel ?? 'Keep on map');
    keep.type = 'button';
    keep.addEventListener('click', () => close(true));
    const confirm = el('button', 'ui-button ui-primary dex-home-action', nonDrag()?.confirm ?? 'Send this kid home');
    confirm.type = 'button';
    // One send at a time across every confirmation, until its result arrives.
    if (feed.pending) confirm.setAttribute('aria-disabled', 'true');
    confirm.addEventListener('click', () => {
      if (feed.pending || confirm.getAttribute('aria-disabled') === 'true' || readOnly()) return;
      // Revalidated right before sending: never any other copy (§13.4).
      if (!live().some((k) => k.id === kidId)) {
        stale();
        return;
      }
      confirm.setAttribute('aria-disabled', 'true');
      feed.send(kidId, type);
    });
    const node = el('div', 'dex-home-confirm ui-surface', title, ...lines, keep, confirm);
    panel = { node, confirm };
    const r = rowFor.get(kidId)!;
    r.row.setAttribute('aria-pressed', 'true');
    r.row.classList.add('is-selected');
    r.wrap.after(node);
    title.focus();
  };

  const makeRow = (kidId: number) => {
    const kid = live().find((k) => k.id === kidId)!;
    const ordinal = ordinals.get(kidId)!;
    const row = el(
      'button',
      'ui-button dex-home-row',
      portrait(kidRig!, type, 48, kid.look),
      el('span', 'dex-home-row-text', el('span', 'dex-home-row-name', `Kid ${ordinal}`), el('span', 'sheet-helper', 'Choose this kid')),
    );
    row.type = 'button';
    row.setAttribute('aria-pressed', 'false');
    row.setAttribute('aria-label', `Choose ${kidName}, kid ${ordinal} on your map, to send home`);
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
    const key = `${ids.join(',')}|${readOnly()}`;
    if (key === shown) return;
    shown = key;
    heading.textContent = `On your map · ${ids.length}`;
    helper.textContent = ids.length ? 'Send a kid home to make room. No refund.' : 'None on your map.';
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
