import { kidRig } from '../content/artData';
import type { Content, KidId } from '../content/types';
import type { MapScene } from '../render/scene';
import { el } from './dom';
import { oddsLines } from './plantingNotes';
import { portrait } from './portrait';

// One kid into one plot, without dragging (D-061, docs/GUI_MVP.md §15.6, Codex's design):
// Choose a plot, then "Add {name} to Plot {n}?" with the odds it makes, then one Add, into
// that plot only. It never starts a plot growing. Shared by the Dex's live rows and the
// kid card; each sends the add its own way and hears its own result.

/** Why the plot the player chose can't take the kid (GUI_MVP §15.3): about that plot, not all of them. */
export function chosenPlotRefusal(reason: 'plotsBusy' | 'plotFull'): string {
  return reason === 'plotsBusy' ? 'This plot is already growing. Choose another plot.' : 'This plot is full. Review it to Start growing.';
}

/** A rare variant's label, "Rare: Rainbow" (GUI_MVP §15.3). */
export const rareMark = (variant: string | undefined) => (variant ? `Rare: ${variant[0]!.toUpperCase()}${variant.slice(1)}` : null);

export interface PlotRouteOptions {
  scene: MapScene;
  content: Content;
  kidId: number;
  type: KidId;
  /** The kid's name if it has one, else its type's (GUI_MVP §18.1), as it is now. */
  displayName: () => string;
  ordinal: number;
  readOnly: () => boolean;
  /** An add is waiting for its result (one at a time, anywhere). */
  busy: () => boolean;
  /** Sends the add: this kid, into this plot. */
  onAdd: (plot: number) => void;
  onKeep: () => void;
  /** The kid left before it was added: say so, choose no other. */
  onStale: () => void;
}

/** Whether a plot takes a kid now, and if not, why (§15.6: Growing and Ready are disabled, with the reason). */
function plotState(scene: MapScene, content: Content, i: number): { count: number; reason: string | null } {
  const seed = scene.game.state.plots[i]?.seed ?? null;
  const count = seed?.planted.length ?? 0;
  if (seed?.sprout) return { count, reason: seed.grown >= scene.game.growSeconds ? 'Ready. Waiting to sprout.' : 'Growing.' };
  if (count >= content.balance.planting.maxKids) return { count, reason: 'Full. Start growing it in the Garden.' };
  return { count, reason: null };
}

/** Stage 3: "Add {name} to Plot {n}?", the odds it makes, and the one Add (never Start). */
function confirmFor(o: PlotRouteOptions, plot: number) {
  const { scene, content, kidId, type } = o;
  const kidDef = content.kids.find((k) => k.id === type);
  const live = () => scene.game.state.world.kids.find((k) => k.id === kidId);
  const title = el('h4', 'dex-home-confirm-title', `Add ${o.displayName()} to Plot ${plot + 1}?`);
  title.tabIndex = -1;
  const kid = live();
  const rare = rareMark(kid?.variant);
  const marks = [`Tier ${kidDef?.tier ?? 1}`, `Kid ${o.ordinal}`, ...(rare ? [rare] : []), ...(kidDef?.special ? ['Special'] : [])];
  const whoName = el('span', 'dex-home-row-name', o.displayName());
  const who = el(
    'div',
    'dex-home-who',
    portrait(kidRig!, type, 48, kid?.look, kid?.variant ? { variant: kid.variant, miniScale: content.balance.planting.miniScale } : undefined),
    el('span', 'dex-home-row-text', whoName, el('span', 'sheet-helper', marks.join(' · '))),
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
  keep.addEventListener('click', () => o.onKeep());
  const add = el('button', 'ui-button ui-primary dex-home-action', 'Add this kid');
  add.type = 'button';
  add.addEventListener('click', () => {
    if (o.busy() || add.getAttribute('aria-disabled') === 'true' || o.readOnly()) return;
    // Revalidated right before adding: never any other copy, never another plot (§15.6).
    if (!live()) {
      o.onStale();
      return;
    }
    add.setAttribute('aria-disabled', 'true');
    o.onAdd(plot);
  });
  const helperText = el('p', 'sheet-helper', 'Two separate rolls. A sprout can be both special and rare.');
  const node = el('div', 'dex-home-step', title, who, odds, helperText, ...notices, why, keep, add);
  /** The plot's own kids now, and with this one added: recomputed as the plot or the kid changes. */
  const refresh = () => {
    // A rename meanwhile shows here at once: this is the kid the Add would consume.
    const name = o.displayName();
    const heading = `Add ${name} to Plot ${plot + 1}?`;
    if (title.textContent !== heading) title.textContent = heading;
    if (whoName.textContent !== name) whoName.textContent = name;
    const p = content.balance.planting;
    const accepted = scene.game.state.plots[plot]?.seed?.planted ?? [];
    const me = live();
    const now = { count: accepted.length, ...scene.game.oddsFor(accepted) };
    // A happy kid would count one tier higher (D-056): the projection says so while it lasts.
    const next = { count: accepted.length + 1, ...scene.game.oddsFor([...accepted, { type, happy: !!me?.happy }]) };
    const lines = oddsLines(plot, now, next, { minKids: p.minKids, maxKids: p.maxKids, ceiling: { special: p.specialOdds[1], rare: p.rareOdds[1] } });
    const text = lines.join('\n');
    if (odds.dataset.text !== text) {
      odds.dataset.text = text;
      odds.replaceChildren(...lines.map((l) => el('p', 'sheet-body-text', l)));
    }
    // A plot that started or filled meanwhile: no reroute, just why (§15.3).
    const { reason } = plotState(scene, content, plot);
    const blocked = reason === null ? null : chosenPlotRefusal(scene.game.state.plots[plot]?.seed?.sprout ? 'plotsBusy' : 'plotFull');
    why.hidden = blocked === null;
    why.textContent = blocked ?? '';
    // One add at a time across every confirmation, until its result arrives.
    add.setAttribute('aria-disabled', String(blocked !== null || o.busy() || o.readOnly()));
  };
  return { node, title, refresh };
}

/** Stage 2: one row per unlocked plot, `Plot {n} · {count} / 5`; none is chosen for the player. Stage 3 opens below. */
export function plotRoute(o: PlotRouteOptions): { node: HTMLElement; title: HTMLElement; refresh(): void } {
  const { scene, content } = o;
  const title = el('h4', 'dex-home-confirm-title', 'Choose a plot');
  title.tabIndex = -1;
  const list = el('div', 'dex-home-rows');
  const rows: { row: HTMLButtonElement; name: HTMLElement; reason: HTMLElement }[] = [];
  let chosen: { plot: number; step: ReturnType<typeof confirmFor> } | null = null;
  const node = el('div', 'dex-home-step', title, list);
  const choose = (i: number) => {
    chosen?.step.node.remove();
    chosen = { plot: i, step: confirmFor(o, i) };
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
        if (row.getAttribute('aria-disabled') === 'true' || o.readOnly()) return;
        choose(i);
      });
      rows.push({ row, name, reason });
      list.append(row);
    }
    for (const [i, r] of rows.entries()) {
      const { count, reason } = plotState(scene, content, i);
      const name = `Plot ${i + 1} · ${count} / ${content.balance.planting.maxKids}`;
      if (r.name.textContent !== name) r.name.textContent = name;
      if (r.reason.textContent !== (reason ?? '')) r.reason.textContent = reason ?? '';
      r.reason.hidden = reason === null;
      // The chosen plot stays chosen when it fills or starts: its own step says why.
      const off = o.readOnly() || (reason !== null && chosen?.plot !== i);
      r.row.setAttribute('aria-disabled', String(off));
      r.row.classList.toggle('is-disabled', off);
    }
    chosen?.step.refresh();
  };
  return { node, title, refresh };
}
