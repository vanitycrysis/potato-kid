import { kidRig, uiData } from '../content/artData';
import type { Content, KidId } from '../content/types';
import type { MapScene } from '../render/scene';
import type { GameEvent } from '../sim/game';
import { el, icon } from './dom';
import { refusalText } from './feedback';
import { portrait } from './portrait';
import type { SendHomeNotes } from './sendHome';

// Send home from a kid's Dex detail (D-048, docs/GUI_MVP.md §13.4, Codex's design): the
// path for anyone who can't drag. Each live copy of the type is a row; choosing one opens
// a confirmation, and only its own button sends that one kid home.

export interface HomeSection {
  root: HTMLElement;
  update(): void;
  /** Events of the step: returns the ones this section answered (no world card for them). */
  onStep(events: GameEvent[]): GameEvent[];
  /** Escape: closes an open confirmation first. True if it did. */
  collapse(): boolean;
}

const nonDrag = () => (uiData?.mvp as { sendHome?: { nonDrag: { confirm: string; cancel: string } } } | undefined)?.sendHome?.nonDrag;

export function homeSection(type: KidId, content: Content, scene: MapScene, notes: SendHomeNotes, readOnly: () => boolean): HomeSection {
  const kidName = content.kids.find((k) => k.id === type)?.name ?? type;
  const heading = el('h3', 'sheet-section dex-home-heading');
  heading.tabIndex = -1;
  const helper = el('p', 'sheet-helper');
  const rows = el('div', 'dex-home-rows');
  const status = el('div', 'dex-home-status');
  status.setAttribute('role', 'status');
  status.hidden = true;
  const root = el('section', 'dex-home', heading, helper, rows, status);

  const live = () => scene.game.state.world.kids.filter((k) => k.type === type);
  // Ordinals: by kid id when the detail opens, newcomers appended; a copy keeps its number
  // while the detail stays open (§13.4). Ids are never shown.
  const ordinals = new Map<number, number>();
  let next = 1;
  for (const k of [...live()].sort((a, b) => a.id - b.id)) ordinals.set(k.id, next++);
  const rowFor = new Map<number, { row: HTMLButtonElement; wrap: HTMLElement }>();
  let selected: number | null = null;
  let pending: number | null = null;
  let panel: { node: HTMLElement; confirm: HTMLButtonElement } | null = null;

  const say = (lines: string[], warn = false) => {
    status.hidden = false;
    status.classList.toggle('is-warning', warn);
    status.replaceChildren(
      icon(warn ? 'icon_warning' : 'icon_garden', '', 'ui-icon-28'),
      el('div', 'card-text', ...lines.map((l, i) => el('span', i === 0 ? 'card-heading' : 'card-line', l))),
    );
    status.scrollIntoView({ block: 'nearest' });
  };

  // Inline messages keep the world card's timing (§13.3; Codex review, PR #54): a success
  // waits for its farewell, then stays 6 s (the first, explaining) or 2.5 s, in order; a
  // refusal shows at once, ahead of them.
  interface Message {
    lines: () => string[];
    warn: boolean;
    first: boolean;
    notBefore: number;
    ms: number;
  }
  const queue: Message[] = [];
  let current: { until: number } | null = null;
  const tick = (now: number) => {
    if (current && now >= current.until) {
      current = null;
      status.hidden = true;
    }
    if (current) return;
    const at = queue.findIndex((m) => m.notBefore <= now);
    if (at < 0) return;
    const m = queue.splice(at, 1)[0]!;
    say(m.lines(), m.warn);
    if (m.first) notes.markShown();
    current = { until: now + m.ms };
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
    current = null;
    queue.unshift({ lines: () => [refusalText('gone')], warn: true, first: false, notBefore: 0, ms: notes.visibleMs(false) });
    tick(performance.now());
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
    // One send at a time across every confirmation: until its result arrives, no other
    // (Codex review, PR #54).
    if (pending !== null) confirm.setAttribute('aria-disabled', 'true');
    confirm.addEventListener('click', () => {
      if (pending !== null || confirm.getAttribute('aria-disabled') === 'true' || readOnly()) return;
      // Revalidated right before sending: never any other copy (§13.4).
      if (!live().some((k) => k.id === kidId)) {
        stale();
        return;
      }
      pending = kidId;
      confirm.setAttribute('aria-disabled', 'true');
      scene.command({ type: 'sendHome', kidId });
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

  let shown = '';
  const update = () => {
    tick(performance.now());
    const ids = live().map((k) => k.id);
    for (const id of ids) if (!ordinals.has(id)) ordinals.set(id, next++);
    // A chosen kid that left while unsent: the confirmation goes, with the reason.
    if (selected !== null && pending === null && !ids.includes(selected)) stale();
    const key = `${ids.join(',')}|${readOnly()}`;
    if (key === shown) return;
    shown = key;
    heading.textContent = `On your map · ${ids.length}`;
    helper.textContent = ids.length ? 'Send a kid home to make room. No refund.' : 'None on your map.';
    for (const [id, r] of rowFor) {
      if (ids.includes(id)) continue;
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
  };

  return {
    root,
    update,
    onStep: (events) => {
      if (pending === null) return [];
      const handled: GameEvent[] = [];
      for (const e of events) {
        if (e.type === 'sentHome' && e.kid.id === pending) {
          pending = null;
          close(false);
          const first = notes.claimFirst();
          queue.push({
            // The first explanation's copy follows the Compendium as it is when shown.
            lines: () => [notes.heading(kidName), ...(first ? notes.firstLines() : [notes.later()])],
            warn: false,
            first,
            notBefore: performance.now() + scene.departureMs,
            ms: notes.visibleMs(first),
          });
          focusHeading();
          handled.push(e);
        } else if (e.type === 'rejected' && e.command === 'sendHome') {
          pending = null;
          stale();
          handled.push(e);
        }
      }
      update();
      if (!status.hidden) status.scrollIntoView({ block: 'nearest' });
      return handled;
    },
    collapse: () => {
      if (!panel) return false;
      close(true);
      return true;
    },
  };
}

