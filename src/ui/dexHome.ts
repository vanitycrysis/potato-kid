import { kidRig } from '../content/artData';
import type { Content, KidId } from '../content/types';
import type { MapScene } from '../render/scene';
import { el, icon } from './dom';
import { portrait } from './portrait';
import { chosenPlotRefusal, type HomeFeed, type Message } from './homeFeed';
import { oddsLines } from './plantingNotes';

// Planting from a kid's Dex detail (D-061, docs/GUI_MVP.md §15.6, Codex's design; it began
// as Send home's, §13.4): the path for anyone who can't drag. Each live copy of the type is
// a row; choosing one opens its card, then Choose a plot, then one plot's confirmation, and
// only its Add sends that one kid to that one plot. It never starts a plot growing.
//
// The Dex owns a HomeFeed that outlives any one detail: the outstanding send and the
// inline messages, so leaving and reopening a detail never loses a result or a reading
// (Codex review, PR #54). A detail's section only draws the feed for its kid type.

/** A rare variant's label, "Rare: Rainbow" (GUI_MVP §15.3). */
const rareMark = (variant: string | undefined) => (variant ? `Rare: ${variant[0]!.toUpperCase()}${variant.slice(1)}` : null);

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

  const planting = () => content.balance.planting;
  const kidDef = content.kids.find((k) => k.id === type);

  /** Whether a plot takes a kid now, and if not, why (§15.6: Growing and Ready are disabled, with the reason). */
  const plotState = (i: number): { count: number; reason: string | null } => {
    const seed = scene.game.state.plots[i]?.seed ?? null;
    const count = seed?.planted.length ?? 0;
    if (seed?.sprout) return { count, reason: seed.grown >= scene.game.growSeconds ? 'Ready. Waiting to sprout.' : 'Growing.' };
    if (count >= planting().maxKids) return { count, reason: 'Full. Start growing it in the Garden.' };
    return { count, reason: null };
  };

  /** Stage 3: "Add {name} to Plot {n}?", the odds it makes, and the one Add (never Start). */
  const confirmFor = (kidId: number, plot: number) => {
    const title = el('h4', 'dex-home-confirm-title', `Add ${kidName} to Plot ${plot + 1}?`);
    title.tabIndex = -1;
    const kid = live().find((k) => k.id === kidId);
    const rare = rareMark(kid?.variant);
    const marks = [`Tier ${kidDef?.tier ?? 1}`, `Kid ${ordinals.get(kidId)}`, ...(rare ? [rare] : []), ...(kidDef?.special ? ['Special'] : [])];
    const who = el(
      'div',
      'dex-home-who',
      portrait(kidRig!, type, 48, kid?.look, kid?.variant === 'mini' ? { scale: content.balance.planting.miniScale } : undefined),
      el('span', 'dex-home-row-text', el('span', 'dex-home-row-name', kidName), el('span', 'sheet-helper', marks.join(' · '))),
    );
    const odds = el('div', 'dex-home-odds');
    const notices = [
      el('p', 'sheet-body-text', 'This kid leaves the map. Its name, income and happy effect end here. No refund.'),
      el('p', 'sheet-body-text', 'Its type and found variants stay in your Dex.'),
      ...(rare ? [el('p', 'sheet-body-text', 'Rare variants cannot be bought back.')] : []),
      ...(kidDef?.special ? [el('p', 'sheet-body-text', 'Special kids cannot be bought back.')] : []),
    ];
    const why = el('p', 'sheet-body-text dex-home-why');
    why.hidden = true;
    const keep = el('button', 'ui-button dex-home-action', 'Keep on map');
    keep.type = 'button';
    keep.addEventListener('click', () => close(true));
    const add = el('button', 'ui-button ui-primary dex-home-action', 'Add this kid');
    add.type = 'button';
    add.addEventListener('click', () => {
      if (feed.pending || add.getAttribute('aria-disabled') === 'true' || readOnly()) return;
      // Revalidated right before adding: never any other copy, never another plot (§15.6).
      if (!live().some((k) => k.id === kidId)) {
        stale();
        return;
      }
      add.setAttribute('aria-disabled', 'true');
      feed.send(kidId, type, plot);
    });
    const helperText = el('p', 'sheet-helper', 'Two separate rolls. A sprout can be both special and rare.');
    const node = el('div', 'dex-home-step', title, who, odds, helperText, ...notices, why, keep, add);
    /** The plot's own kids now, and with this one added: recomputed as the plot changes. */
    const refresh = () => {
      const p = planting();
      const accepted = scene.game.state.plots[plot]?.seed?.planted.map((k) => k.type) ?? [];
      const now = { count: accepted.length, ...scene.game.oddsFor(accepted) };
      const next = { count: accepted.length + 1, ...scene.game.oddsFor([...accepted, type]) };
      const lines = oddsLines(plot, now, next, { minKids: p.minKids, maxKids: p.maxKids, ceiling: { special: p.specialOdds[1], rare: p.rareOdds[1] } });
      const text = lines.join('\n');
      if (odds.dataset.text !== text) {
        odds.dataset.text = text;
        odds.replaceChildren(...lines.map((l) => el('p', 'sheet-body-text', l)));
      }
      // A plot that started or filled meanwhile: no reroute, just why (§15.3).
      const { reason } = plotState(plot);
      const blocked = reason === null ? null : chosenPlotRefusal(scene.game.state.plots[plot]?.seed?.sprout ? 'plotsBusy' : 'plotFull');
      why.hidden = blocked === null;
      why.textContent = blocked ?? '';
      // One add at a time across every confirmation, until its result arrives.
      add.setAttribute('aria-disabled', String(blocked !== null || !!feed.pending || readOnly()));
    };
    return { node, title, refresh };
  };

  /** Stage 2: one row per unlocked plot, `Plot {n} · {count} / 5`; none is chosen for the player. */
  const chooser = (kidId: number) => {
    const title = el('h4', 'dex-home-confirm-title', 'Choose a plot');
    title.tabIndex = -1;
    const list = el('div', 'dex-home-rows');
    const rows: { row: HTMLButtonElement; name: HTMLElement; reason: HTMLElement }[] = [];
    let chosen: { plot: number; step: ReturnType<typeof confirmFor> } | null = null;
    const node = el('div', 'dex-home-step', title, list);
    const choose = (i: number) => {
      chosen?.step.node.remove();
      chosen = { plot: i, step: confirmFor(kidId, i) };
      for (const [j, r] of rows.entries()) {
        r.row.setAttribute('aria-pressed', String(j === i));
        r.row.classList.toggle('is-selected', j === i);
      }
      node.append(chosen.step.node);
      chosen.step.refresh();
      chosen.step.title.focus();
    };
    const refresh = () => {
      while (rows.length < scene.game.state.plots.length) {
        const i = rows.length;
        const name = el('span', 'dex-home-row-name');
        const reason = el('span', 'sheet-helper');
        const row = el('button', 'ui-button dex-home-row dex-plot-row', el('span', 'dex-home-row-text', name, reason));
        row.type = 'button';
        row.setAttribute('aria-pressed', 'false');
        row.addEventListener('click', () => {
          if (row.getAttribute('aria-disabled') === 'true' || readOnly()) return;
          choose(i);
        });
        rows.push({ row, name, reason });
        list.append(row);
      }
      for (const [i, r] of rows.entries()) {
        const { count, reason } = plotState(i);
        const name = `Plot ${i + 1} · ${count} / ${planting().maxKids}`;
        if (r.name.textContent !== name) r.name.textContent = name;
        if (r.reason.textContent !== (reason ?? '')) r.reason.textContent = reason ?? '';
        r.reason.hidden = reason === null;
        // The chosen plot stays chosen when it fills or starts: its own step says why.
        const off = readOnly() || (reason !== null && chosen?.plot !== i);
        r.row.setAttribute('aria-disabled', String(off));
        r.row.classList.toggle('is-disabled', off);
      }
      chosen?.step.refresh();
    };
    return { node, title, refresh };
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
      const c = chooser(kidId);
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
      portrait(kidRig!, type, 48, kid.look, kid.variant === 'mini' ? { scale: content.balance.planting.miniScale } : undefined),
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
