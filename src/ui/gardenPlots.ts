import { kidRig } from '../content/artData';
import type { Content, KidId } from '../content/types';
import type { MapScene } from '../render/scene';
import type { GameEvent, PlantedKid, RejectReason } from '../sim/game';
import type { Arrivals } from './arrivals';
import { el, icon } from './dom';
import { refusalText } from './feedback';
import { formatDuration, formatExact, formatTimeLeft } from './format';
import { chance, oddsLines, type PlantingNotes } from './plantingNotes';
import { kindMark } from './plotRoute';
import { portrait } from './portrait';
import type { OpenSheet } from './sheet';

// The Garden's plots (D-061, docs/GUI_MVP.md §15.2-15.4, Codex's design): the Plots section
// of the Garden sheet, a plot's detail with Start growing, and the picker that adds 1 to 5
// kids at once. All three live in the Garden's sheet: detail and picker take over its body
// and footer, and Back returns to the overview. Every change goes to the sim as a command
// and shows only once the sim has answered: nothing is optimistic (GUI_MVP §4).

type Pending =
  | { type: 'unlockPlot' }
  | { type: 'startGrowing'; plot: number }
  | { type: 'plant'; plot: number; kidIds: number[] }
  // Taking kids back out (D-074, GUI_MVP §21): one from a filling plot, or all of them.
  | { type: 'unplant'; plot: number; kidId: number }
  | { type: 'emptyPlot'; plot: number; count: number; growing: boolean };

type PlotState = 'locked' | 'empty' | 'filling' | 'growing' | 'ready';

interface PlotInfo {
  state: PlotState;
  planted: readonly PlantedKid[];
  count: number;
  /** 0..1 once growing. */
  progress: number;
  /** Seconds until it is ready. */
  left: number;
}

/**
 * Where the plots were, for coming back after an interruption (the return summary, GUI_MVP
 * §8): the open plot's detail or picker, and the picker's unsent draft.
 */
export interface PlotsSnapshot {
  view: { kind: 'detail' | 'picker'; plot: number };
  picker?: { draft: number[]; filter: 'all' | 'rares' | 'specials'; query: string };
}

/** A message shown in a view: accepted results, refusals, and why something changed. */
interface Note {
  lines: string[];
  warn: boolean;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Codex's exact refusals for Take out, Empty and Cancel (GUI_MVP §21.3). */
function takeOutRefusal(p: { type: 'unplant' } | { type: 'emptyPlot'; count: number; growing: boolean }, reason: RejectReason): string {
  switch (reason) {
    case 'full':
      return p.type === 'unplant' ? 'The map is full. Make room for 1 kid, then try Take out again.' : `There isn't room on the map for all ${p.count} kids. Make room, then try again.`;
    case 'noRoom':
      return "There's no clear spot by the Garden. Move nearby kids aside, then try again.";
    case 'ready':
      return 'This sprout has finished growing and cannot be cancelled.';
    case 'plotsBusy':
      return 'This plot is growing. Choose Cancel growing to bring all its kids back.';
    case 'gone':
      return p.type === 'unplant' ? 'This kid is no longer in this plot. Check the plot and try again.' : p.growing ? 'This plot changed. Review it again before cancelling.' : 'This plot changed. Review it again before emptying it.';
    default:
      return refusalText(reason, p.type);
  }
}

export class GardenPlots {
  private view: { kind: 'overview' } | { kind: 'detail'; plot: number } | { kind: 'picker'; plot: number } = { kind: 'overview' };
  private pending: Pending | null = null;
  private overview: { nodes: HTMLElement[]; update(): void };
  private current: { update(): void; escape(): boolean; snapshot?(): PlotsSnapshot['picker']; restore?(s: NonNullable<PlotsSnapshot['picker']>): void } | null = null;
  /** A note for a plot's detail, carried across a view change (an accepted Add, a refusal). */
  private note: { plot: number; note: Note } | null = null;
  private readonly tierOf: Map<KidId, number>;

  constructor(
    private readonly scene: MapScene,
    private readonly content: Content,
    private readonly sheet: OpenSheet,
    private readonly notes: PlantingNotes,
    /** The spawn-rate part of the Garden sheet (its comparison, cost and Upgrade). */
    spawnRate: HTMLElement[],
    /** Arrivals and Spawn now, first in the Garden (GUI_MVP §19.2). */
    private readonly arrivals: Arrivals,
  ) {
    this.tierOf = new Map(content.kids.map((k) => [k.id, k.tier]));
    this.overview = this.buildOverview(spawnRate);
    this.show({ kind: 'overview' });
  }

  private get game() {
    return this.scene.game;
  }

  private get planting() {
    return this.content.balance.planting;
  }

  private name(type: KidId): string {
    return this.content.kids.find((k) => k.id === type)?.name ?? type;
  }

  /** Special (D-063) or rare (D-072), the planting-only kinds; null for an ordinary type. */
  private kind(type: KidId): 'Rare' | 'Special' | null {
    return kindMark(this.content.kids.find((k) => k.id === type));
  }

  /**
   * Tier, then happiness, then the kind: "Tier 2 · Happy · Counts as Tier 3 · Special"
   * (GUI_MVP §15.3). `happy`: 'live' for a kid on the map happy now, 'added' for one that was
   * happy when added (its tier stays counted, the kid is gone).
   */
  private marks(type: KidId, extra: string[] = [], happy: 'live' | 'added' | null = null): string {
    const kind = this.kind(type);
    const tier = this.tierOf.get(type) ?? 1;
    const mood = happy === 'live' ? ['Happy', `Counts as Tier ${tier + 1}`] : happy === 'added' ? [`Counted as Tier ${tier + 1} when added`] : [];
    return [`Tier ${tier}`, ...mood, ...extra, ...(kind ? [kind] : [])].join(' · ');
  }

  private info(i: number): PlotInfo {
    const plot = this.game.state.plots[i];
    if (!plot) return { state: 'locked', planted: [], count: 0, progress: 0, left: 0 };
    const seed = plot.seed;
    const planted = seed?.planted ?? [];
    const grow = this.game.growSeconds;
    if (!seed?.sprout) return { state: planted.length ? 'filling' : 'empty', planted, count: planted.length, progress: 0, left: grow };
    const progress = Math.min(1, seed.grown / grow);
    return { state: progress >= 1 ? 'ready' : 'growing', planted, count: planted.length, progress, left: Math.max(0, grow - seed.grown) };
  }

  /** Whether the overview is showing (the Garden's own title and subtitle apply). */
  get inOverview(): boolean {
    return this.view.kind === 'overview';
  }

  update(): void {
    if (this.view.kind === 'overview') this.overview.update();
    else this.current?.update();
  }

  /** Escape: steps back (a review, then a view) before the sheet closes. True if it did. */
  escape(): boolean {
    if (this.view.kind === 'overview') return false;
    if (this.current?.escape()) return true;
    this.show({ kind: 'overview' }, true);
    return true;
  }

  /** Where the plots are now, unless on the overview (which the sheet's scroll restores). */
  snapshot(): PlotsSnapshot | null {
    if (this.view.kind === 'overview') return null;
    const picker = this.current?.snapshot?.();
    return { view: { kind: this.view.kind, plot: this.view.plot }, ...(picker ? { picker } : {}) };
  }

  /** Back where a snapshot was: the same plot's view, and the picker's draft (kids still on the map). */
  restore(s: PlotsSnapshot): void {
    if (this.info(s.view.plot).state === 'locked') return;
    this.show({ kind: s.view.kind, plot: s.view.plot });
    if (s.picker) this.current?.restore?.(s.picker);
  }

  /** A plot's detail with a note in it: where a kid card's accepted Add lands (GUI_MVP §18.3). */
  openDetail(i: number, lines: string[]): void {
    if (this.info(i).state === 'locked') return;
    this.show({ kind: 'detail', plot: i });
    this.note = { plot: i, note: { lines, warn: false } };
    this.current?.update();
    this.sheet.body.closest('.sheet')?.querySelector<HTMLElement>('.sheet-title')?.focus();
  }

  /** Opens a plot from outside (a tap on the map): the picker while it takes kids, else its detail (§15.2). */
  openPlot(i: number): void {
    const p = this.info(i);
    if (p.state === 'locked') return;
    // An empty plot opens its picker; a filling one its detail, where Take out is (§21.1).
    this.show(p.state === 'empty' ? { kind: 'picker', plot: i } : { kind: 'detail', plot: i });
  }

  private show(view: GardenPlots['view'], focusPlots = false): void {
    const from = this.view;
    this.view = view;
    // A note belongs to the plot's detail it was made for (an accepted Add carries into it).
    if (view.kind !== 'detail' || this.note?.plot !== view.plot) this.note = null;
    this.sheet.footer.replaceChildren();
    if (view.kind === 'overview') {
      this.current = null;
      this.sheet.setTitle('Garden');
      this.sheet.body.replaceChildren(...this.overview.nodes);
      this.overview.update();
      // Back to the plots: focus the plot that was open, or the Plots heading.
      if (focusPlots) {
        const at = from.kind === 'overview' ? null : this.sheet.body.querySelector<HTMLElement>(`[data-plot-heading="${from.plot}"]`);
        (at ?? this.sheet.body.querySelector<HTMLElement>('#garden-plots'))?.focus();
      }
      return;
    }
    this.current = view.kind === 'detail' ? this.detail(view.plot) : this.picker(view.plot);
    this.current.update();
    this.sheet.scrollTo(0);
  }

  /**
   * A step's events: completes this view's pending command. Returns the events it answered,
   * so the world shows no second card or refusal for them.
   */
  onStep(events: GameEvent[]): GameEvent[] {
    const p = this.pending;
    if (!p) return [];
    const handled: GameEvent[] = [];
    for (const e of events) {
      if (p.type === 'unlockPlot' && e.type === 'plotUnlocked') {
        this.pending = null;
        this.unlocked = { text: `Plot ${e.plots} unlocked.`, until: performance.now() + 2000 };
        handled.push(e);
      } else if (p.type === 'startGrowing' && e.type === 'growing' && e.plot === p.plot) {
        this.pending = null;
        this.note = { plot: p.plot, note: { lines: [`Plot ${p.plot + 1} is growing.`, `One kid sprouts in ${formatDuration(this.game.growSeconds)}.`], warn: false } };
        handled.push(e);
      } else if (p.type === 'plant' && e.type === 'planted' && e.plot === p.plot) {
        handled.push(e);
        // All of an atomic Add lands in one step: answered once the last one is in.
        if (handled.filter((h) => h.type === 'planted').length < p.kidIds.length) continue;
        this.pending = null;
        // Shown only where the player still is: the picker gives way to the plot's detail.
        // Left meanwhile (Back, Escape), the overview's count says it; no explanation is
        // spent unseen (Codex review, PR #72).
        if (this.view.kind !== 'picker' || this.view.plot !== p.plot) continue;
        const first = this.notes.claimFirst();
        const heading = this.notes.heading(this.name(e.kid.type), p.plot, p.kidIds.length);
        this.note = { plot: p.plot, note: { lines: [heading, ...(first ? this.notes.firstLines() : [this.notes.later(e.count)])], warn: false } };
        this.show({ kind: 'detail', plot: p.plot });
        this.sheet.body.closest('.sheet')?.querySelector<HTMLElement>('.sheet-title')?.focus();
        // Drawn now, in the open sheet: seen.
        if (first) this.notes.markShown();
      } else if ((p.type === 'unplant' || p.type === 'emptyPlot') && e.type === 'unplanted' && e.plot === p.plot) {
        // All of an Empty or a Cancel lands in one step (the sim's take-out is all or none).
        handled.push(e);
        this.pending = null;
        const n = p.plot + 1;
        const lines =
          p.type === 'unplant'
            ? [`${e.kid.name ?? this.name(e.kid.type)} is back by the Garden.`]
            : p.growing
              ? [`Plot ${n} was cancelled. ${p.count} ${plural(p.count, 'kid is', 'kids are')} back by the Garden.`, 'Growing time was lost.']
              : [`Plot ${n} is empty. ${p.count} ${plural(p.count, 'kid is', 'kids are')} back by the Garden.`];
        this.note = { plot: p.plot, note: { lines, warn: false } };
      } else if (e.type === 'rejected' && e.command === p.type) {
        this.pending = null;
        this.refused(p, e.reason);
        handled.push(e);
      }
    }
    return handled;
  }

  private unlocked: { text: string; until: number } | null = null;
  private unlockRefusal: string | null = null;
  private pickerRefusal: ((reason: RejectReason) => void) | null = null;

  private refused(p: Pending, reason: RejectReason): void {
    if (p.type === 'unplant' || p.type === 'emptyPlot') {
      this.note = { plot: p.plot, note: { lines: [takeOutRefusal(p, reason)], warn: true } };
      return;
    }
    if (p.type === 'unlockPlot') this.unlockRefusal = refusalText(reason, 'unlockPlot', 'materials');
    else if (p.type === 'startGrowing') {
      const lines = reason === 'plotsBusy' ? ['This plot is already growing.'] : [refusalText(reason, 'startGrowing')];
      this.note = { plot: p.plot, note: { lines, warn: true } };
    } else this.pickerRefusal?.(reason);
  }

  private send(cmd: Pending): void {
    if (this.pending) return;
    this.pending = cmd;
    this.unlockRefusal = null;
    this.scene.command(cmd);
  }

  // --- the overview ---------------------------------------------------------------------

  /** Five 44 px spaces: an accepted kid's portrait, or an outlined empty square (§15.4). */
  private slots(planted: readonly PlantedKid[]): HTMLElement {
    const row = el('div', 'plot-slots');
    for (let i = 0; i < this.planting.maxKids; i++) {
      const k = planted[i];
      const slot = el('div', 'plot-slot');
      if (k) {
        slot.append(portrait(kidRig!, k.type, 32, k.look));
        slot.setAttribute('role', 'img');
        slot.setAttribute('aria-label', `${this.name(k.type)}, ${this.marks(k.type, [], k.happy ? 'added' : null)}`);
      } else {
        slot.append(el('span', 'plot-slot-empty'));
        slot.setAttribute('role', 'img');
        slot.setAttribute('aria-label', 'Empty space');
      }
      row.append(slot);
    }
    return row;
  }

  private button(label: string, className: string, onClick: () => void): HTMLButtonElement {
    const b = el('button', `ui-button ${className}`, label);
    b.type = 'button';
    b.addEventListener('click', () => {
      if (b.getAttribute('aria-disabled') !== 'true') onClick();
    });
    return b;
  }

  private setEnabled(b: HTMLButtonElement, on: boolean): void {
    b.setAttribute('aria-disabled', String(!on));
    b.classList.toggle('is-disabled', !on);
  }

  /** A progress rail, read out as "Plot N, P percent grown, T left" (§15.4). */
  private rail(): { node: HTMLElement; set(plot: number, p: PlotInfo): void } {
    const fill = el('div', 'plot-rail-fill');
    const node = el('div', 'plot-rail', fill);
    node.setAttribute('role', 'progressbar');
    node.setAttribute('aria-valuemin', '0');
    node.setAttribute('aria-valuemax', '100');
    return {
      node,
      set: (plot, p) => {
        const pct = Math.floor(100 * p.progress);
        fill.style.width = `${100 * p.progress}%`;
        node.setAttribute('aria-valuenow', String(pct));
        node.setAttribute('aria-label', `Plot ${plot + 1}, ${pct} percent grown, ${formatTimeLeft(p.left)} left`);
      },
    };
  }

  private waitingText(i: number): string {
    const w = this.game.plotWaiting(i);
    return w === 'full' ? 'Waiting for room on the map.' : w === 'noRoom' ? 'Waiting for a clear spot by the Garden.' : 'Sprouting…';
  }

  private buildOverview(spawnRate: HTMLElement[]): { nodes: HTMLElement[]; update(): void } {
    const rateHeading = el('h3', 'sheet-section garden-section-heading', 'Spawn rate');
    rateHeading.id = 'garden-spawn-rate';
    rateHeading.tabIndex = -1;
    const plotsHeading = el('h3', 'sheet-section garden-section-heading', 'Plots');
    plotsHeading.id = 'garden-plots';
    plotsHeading.tabIndex = -1;
    const jump = (to: HTMLElement) => () => {
      to.scrollIntoView({ block: 'start' });
      to.focus({ preventScroll: true });
    };
    const links = el(
      'nav',
      'garden-links',
      this.button('Arrivals', 'garden-link', jump(this.arrivals.heading)),
      this.button('Plots', 'garden-link', jump(plotsHeading)),
      this.button('Spawn rate', 'garden-link', jump(rateHeading)),
    );
    links.setAttribute('aria-label', 'Garden sections');
    const helpers = el(
      'div',
      'garden-plot-helpers',
      el('p', 'sheet-helper', 'Add 3–5 kids, then Start growing.'),
      el('p', 'sheet-helper', `One kid sprouts after ${formatDuration(this.game.growSeconds)}.`),
      el('p', 'sheet-helper', 'Two separate chances: special and rare.'),
    );
    const rows = Array.from({ length: this.planting.maxPlots }, (_, i) => this.plotRow(i));

    // More plots (§15.4): the next plot's price, what you hold, and Unlock.
    const moreHeading = el('h3', 'sheet-section garden-section-heading', 'More plots');
    const nowNext = el('p', 'sheet-body-text');
    const costText = el('span', '');
    const cost = el('div', 'sheet-cost', icon('icon_materials', '', 'ui-icon-24'), costText);
    const holding = el('p', 'sheet-body-text');
    const shortfall = el('p', 'sheet-helper');
    const maxed = el('div', 'sheet-cost', icon('icon_check', '', 'ui-icon-24'), 'All four plots unlocked.');
    const unlock = this.button('', 'ui-primary plot-action-full', () => this.send({ type: 'unlockPlot' }));
    unlock.dataset.cue = 'success';
    const statusText = el('span', 'sheet-status-text');
    const statusMark = el('span', 'sheet-status-icon');
    const status = el('div', 'sheet-status', statusMark, statusText);
    status.setAttribute('role', 'status');
    status.hidden = true;
    const more = el('section', 'garden-more', moreHeading, nowNext, cost, holding, shortfall, maxed, unlock, status);

    // Arrivals first, then the plots, then the spawn rate (GUI_MVP §19.2).
    const nodes = [links, this.arrivals.node, el('section', 'garden-plots', plotsHeading, helpers, ...rows.map((r) => r.node)), more, el('section', 'garden-rate', rateHeading, ...spawnRate)];
    let shown = '';
    return {
      nodes,
      update: () => {
        this.arrivals.update();
        for (const r of rows) r.update();
        const g = this.game;
        const n = g.state.plots.length;
        const price = g.plotUnlockCost;
        const have = g.state.materials;
        const max = price === null;
        for (const node of [nowNext, cost, holding, shortfall, unlock]) node.hidden = max;
        maxed.hidden = !max;
        if (!max) {
          nowNext.textContent = `Now ${n} · Next ${n + 1}`;
          costText.textContent = `Cost: ${formatExact(price)}`;
          holding.textContent = `You have ${formatExact(have)} Materials.`;
          shortfall.textContent = have < price ? `Need ${formatExact(Math.ceil(price - have))} more Materials.` : '';
          shortfall.hidden = have >= price;
          const waiting = this.pending?.type === 'unlockPlot';
          const label = waiting ? 'Unlocking…' : `Unlock plot ${n + 1} · ${formatExact(price)} Materials`;
          if (unlock.textContent !== label) unlock.textContent = label;
          this.setEnabled(unlock, !waiting && have >= price);
        }
        const ok = this.unlocked && this.unlocked.until > performance.now() ? this.unlocked.text : '';
        if (!ok) this.unlocked = null;
        const msg = this.unlockRefusal ?? ok;
        const key = `${this.unlockRefusal ? 'r' : 'o'}${msg}`;
        if (key !== shown) {
          shown = key;
          status.hidden = !msg;
          statusText.textContent = msg;
          statusMark.replaceChildren(icon(this.unlockRefusal ? 'icon_warning' : 'icon_check', '', 'ui-icon-24'));
          if (msg) status.scrollIntoView({ block: 'nearest' });
        }
      },
    };
  }

  /** One plot's row in the overview (§15.4). */
  private plotRow(i: number): { node: HTMLElement; update(): void } {
    const heading = el('h4', 'plot-row-heading');
    heading.dataset.plotHeading = String(i);
    heading.tabIndex = -1;
    const status = el('p', 'plot-row-status');
    const slotHost = el('div', 'plot-slot-host');
    const rail = this.rail();
    const waiting = el('p', 'sheet-helper plot-row-waiting');
    const add = this.button('Add kids', 'plot-action', () => this.show({ kind: 'picker', plot: i }));
    const review = this.button('Review plot', 'plot-action', () => this.show({ kind: 'detail', plot: i }));
    const view = this.button('View plot', 'plot-action-full', () => this.show({ kind: 'detail', plot: i }));
    const actions = el('div', 'plot-actions', add, review);
    const lockIcon = icon('icon_lock', '', 'ui-icon-24');
    const lockHelp = el('p', 'sheet-helper', 'Unlock the next plot below.');
    const node = el('div', 'plot-row ui-surface', el('div', 'plot-row-head', lockIcon, heading), status, slotHost, rail.node, waiting, actions, view, lockHelp);
    let shape = '';
    // Null until first drawn: an empty plot's key is '' too, and still needs its spaces.
    let slotsFor: string | null = null;
    return {
      node,
      update: () => {
        const p = this.info(i);
        const locked = p.state === 'locked';
        const started = p.state === 'growing' || p.state === 'ready';
        const s = `${p.state}`;
        if (s !== shape) {
          shape = s;
          node.dataset.state = p.state;
          lockIcon.hidden = !locked;
          lockHelp.hidden = !locked;
          slotHost.hidden = locked;
          actions.hidden = locked || started;
          view.hidden = !started;
          rail.node.hidden = p.state !== 'growing';
          waiting.hidden = p.state !== 'ready';
          heading.textContent = locked ? `Plot ${i + 1} · Locked` : `Plot ${i + 1}`;
          status.hidden = locked;
        }
        if (locked) return;
        const sig = p.planted.map((k) => k.type).join(',');
        if (sig !== slotsFor) {
          slotsFor = sig;
          slotHost.replaceChildren(this.slots(p.planted));
        }
        const max = this.planting.maxKids;
        const text =
          p.state === 'growing'
            ? `Growing · ${formatTimeLeft(p.left)}`
            : p.state === 'ready'
              ? 'Ready'
              : `${p.state === 'empty' ? 'Empty' : 'Filling'} · ${p.count} / ${max}`;
        if (status.textContent !== text) status.textContent = text;
        if (p.state === 'growing') rail.set(i, p);
        if (p.state === 'ready') {
          const w = this.waitingText(i);
          if (waiting.textContent !== w) waiting.textContent = w;
        }
        this.setEnabled(add, p.count < max);
      },
    };
  }

  // --- a plot's detail -------------------------------------------------------------------

  /** A note box (role status): an accepted result, or why something can't happen. */
  private noteBox(): { node: HTMLElement; set(n: Note | null): void } {
    const node = el('div', 'plot-note');
    node.setAttribute('role', 'status');
    node.hidden = true;
    let shown = '';
    return {
      node,
      set: (n) => {
        const key = n ? `${n.warn}|${n.lines.join('\n')}` : '';
        if (key === shown) return;
        shown = key;
        node.hidden = !n;
        node.classList.toggle('is-warning', !!n?.warn);
        if (!n) return node.replaceChildren();
        node.replaceChildren(
          icon(n.warn ? 'icon_warning' : 'icon_garden', '', 'ui-icon-28'),
          el('div', 'card-text', ...n.lines.map((l, j) => el('span', j === 0 ? 'card-heading' : 'card-line', l))),
        );
        node.scrollIntoView({ block: 'nearest' });
      },
    };
  }

  /** The kids in a plot, in admission order, then each empty space by number (§15.4). */
  private kidRows(planted: readonly PlantedKid[], withEmpty: boolean, takeOut?: (k: PlantedKid) => HTMLButtonElement): HTMLElement {
    const list = el('div', 'plot-kids');
    for (const k of planted) {
      // A name comes back with its kid (D-074): rows show it, with the type beside.
      const title = k.name ?? this.name(k.type);
      const marks = this.marks(k.type, [], k.happy ? 'added' : null);
      const row = el(
        'div',
        'plot-kid',
        portrait(kidRig!, k.type, 48, k.look),
        el('span', 'dex-home-row-text', el('span', 'dex-home-row-name', title), el('span', 'sheet-helper', k.name ? `${this.name(k.type)} · ${marks}` : marks)),
      );
      if (takeOut) row.append(takeOut(k));
      list.append(row);
    }
    if (withEmpty) for (let i = planted.length; i < this.planting.maxKids; i++) list.append(el('p', 'sheet-helper plot-space', `Space ${i + 1} · Empty`));
    return list;
  }

  /** The plot's two rolls now (§15.3): "Need n more" below 3. */
  private rolls(planted: readonly PlantedKid[]): string[] {
    const p = this.planting;
    // Kids added while happy count one tier higher, for good (D-056, §15.3).
    const odds = this.game.oddsFor(planted);
    const n = planted.length;
    return [`Special roll: ${chance(n, odds.special, p.minKids, p.specialOdds[1])}`, `Rare roll: ${chance(n, odds.rare, p.minKids, p.rareOdds[1])}`];
  }

  private detail(i: number): { update(): void; escape(): boolean } {
    const body = this.sheet.body;
    const footer = this.sheet.footer;
    const max = this.planting.maxKids;
    const back = this.button('Back to plots', 'plot-back', () => this.show({ kind: 'overview' }, true));
    // The sheet's own title names the plot; focus goes there when the body is rebuilt.
    const heading = () => this.sheet.body.closest('.sheet')?.querySelector<HTMLElement>('.sheet-title');
    const note = this.noteBox();
    const content = el('div', 'plot-detail');
    body.replaceChildren(back, note.node, content);
    /** The Start growing review is open, for this exact plot (its kids when opened). */
    let review: string | null = null;
    /** An Empty or Cancel review is open, for this exact plot as it was then (§§21.1-21.2). */
    let confirm: { kind: 'empty' | 'cancel'; sig: string } | null = null;
    let built = '';
    let start: HTMLButtonElement | null = null;
    let left: HTMLElement | null = null;
    let rail: ReturnType<GardenPlots['rail']> | null = null;
    /**
     * The detail's controls, kept from one build to the next and updated every frame: a
     * pending command or a refusal never rebuilds them, so focus stays where it was, and the
     * reviews show the map's room as it is now (Codex review, PR #89).
     */
    let live: {
      takeOuts: Map<number, HTMLButtonElement>;
      add: HTMLButtonElement | null;
      empty: HTMLButtonElement | null;
      cancel: HTMLButtonElement | null;
      review: { room: HTMLElement; full: HTMLElement; action: HTMLButtonElement; label: string; count: number; kind: 'empty' | 'cancel' } | null;
    } = { takeOuts: new Map(), add: null, empty: null, cancel: null, review: null };

    const build = (p: PlotInfo, sig: string) => {
      // Focus anywhere in the sheet but Back (body or footer) is put somewhere sensible after.
      const sheetEl = body.closest('.sheet');
      const focusWasInside = !!sheetEl?.contains(document.activeElement) && document.activeElement !== back && !document.activeElement?.closest('.sheet-header');
      const started = p.state === 'growing' || p.state === 'ready';
      const parts: HTMLElement[] = [this.slots(p.planted)];
      if (started) {
        left = el('p', 'plot-row-status');
        rail = this.rail();
        parts.push(left, rail.node);
      }
      live = { takeOuts: new Map(), add: null, empty: null, cancel: null, review: null };
      const takeOut =
        p.state === 'filling'
          ? (k: PlantedKid) => {
              const b = this.button('Take out', 'plot-take-out', () => this.send({ type: 'unplant', plot: i, kidId: k.id }));
              b.dataset.kid = String(k.id);
              b.setAttribute('aria-label', `Take out ${k.name ?? this.name(k.type)}`);
              live.takeOuts.set(k.id, b);
              return b;
            }
          : undefined;
      parts.push(el('h4', 'dex-home-confirm-title', 'Kids in this plot'), this.kidRows(p.planted, !started, takeOut));
      if (p.state === 'filling') parts.push(el('p', 'sheet-helper', 'Take kids out before growing, or cancel while growing.'));
      footer.replaceChildren();
      start = null;
      const openConfirm = (kind: 'empty' | 'cancel') => {
        confirm = { kind, sig };
        built = '';
        refresh();
        const h = body.querySelector<HTMLElement>('.plot-confirm-heading');
        h?.scrollIntoView({ block: 'start' });
        h?.focus({ preventScroll: true });
      };
      if (p.state === 'ready') {
        parts.push(el('p', 'sheet-helper', 'This sprout has finished growing and cannot be cancelled.'));
        footer.append(this.button('Back to plots', 'sheet-action', () => this.show({ kind: 'overview' }, true)));
      } else if (p.state === 'growing') {
        if (confirm?.kind === 'cancel') {
          const block = this.confirmBlock(i, p, 'cancel');
          const label = `Cancel growing · ${p.count} ${plural(p.count, 'kid', 'kids')}`;
          const action = this.confirmButton(label, () => this.send({ type: 'emptyPlot', plot: i, count: p.count, growing: true }));
          live.review = { room: block.room, full: block.full, action, label, count: p.count, kind: 'cancel' };
          parts.push(block.node);
          // Two separate controls; the activation that opened the review can't also confirm.
          footer.append(this.button('Keep growing', 'sheet-action', () => closeConfirm(true)), action);
        } else {
          live.cancel = this.button('Cancel growing', 'plot-action-full plot-cancel', () => openConfirm('cancel'));
          parts.push(live.cancel);
          footer.append(this.button('Back to plots', 'sheet-action', () => this.show({ kind: 'overview' }, true)));
        }
      } else {
        parts.push(
          el('div', 'plot-odds', ...this.rolls(p.planted).map((l) => el('p', 'sheet-body-text', l))),
          el('p', 'sheet-helper', 'Two separate rolls. If both hit, the sprout is the rare kid.'),
          el('p', 'sheet-helper', `One kid sprouts after ${formatDuration(this.game.growSeconds)}.`),
        );
        if (p.count < max) {
          live.add = this.button('Add kids', 'plot-action-full plot-add', () => this.show({ kind: 'picker', plot: i }));
          parts.push(live.add);
        }
        if (p.count > 0) {
          if (confirm?.kind === 'empty') {
            const block = this.confirmBlock(i, p, 'empty');
            const label = `Empty plot · ${p.count} ${plural(p.count, 'kid', 'kids')}`;
            const action = this.confirmButton(label, () => this.send({ type: 'emptyPlot', plot: i, count: p.count, growing: false }));
            live.review = { room: block.room, full: block.full, action, label, count: p.count, kind: 'empty' };
            parts.push(block.node, el('div', 'plot-confirm-actions', this.button('Keep filling', 'plot-action-full', () => closeConfirm(true)), action));
          } else {
            live.empty = this.button('Empty plot', 'plot-action-full plot-empty', () => openConfirm('empty'));
            parts.push(live.empty);
          }
        }
        const min = this.planting.minKids;
        const ready = p.count >= min;
        const helper =
          p.count < min
            ? `Add ${min - p.count} more ${plural(min - p.count, 'kid', 'kids')} to Start growing.`
            : p.count < max
              ? `You can add ${max - p.count} more before starting.`
              : `Full plot · ${max} / ${max}`;
        parts.push(el('p', 'sheet-body-text plot-start-helper', helper));
        if (review !== null) parts.push(this.reviewBlock(i, p, () => collapse(true)));
        // A fresh button for the review's Start: the activation that opened the review can
        // never also start the plot (§15.4).
        start = el('button', `ui-button sheet-action plot-start${ready ? ' ui-primary' : ' is-dashed'}`);
        start.type = 'button';
        start.dataset.cue = 'success';
        if (p.count >= max && review === null) start.append(icon('icon_rare_sparkle', '', 'ui-icon-24 plot-sparkle'));
        start.append(el('span', 'action-label', review === null ? 'Start growing' : `Start growing · ${p.count} kids`));
        this.setEnabled(start, ready);
        const reviewing = review !== null;
        start.addEventListener('click', () => {
          // Start and Empty are reviewed one at a time (Codex review, PR #89).
          if (start?.getAttribute('aria-disabled') === 'true' || this.pending || confirm) return;
          if (!reviewing) {
            review = sig;
            built = '';
            refresh();
            const h = body.querySelector<HTMLElement>('.plot-review-heading');
            h?.scrollIntoView({ block: 'start' });
            h?.focus({ preventScroll: true });
            return;
          }
          this.send({ type: 'startGrowing', plot: i });
        });
        footer.append(start);
      }
      content.replaceChildren(...parts);
      // Focus that the rebuild removed goes to the next Take out, else Add kids, else the
      // plot's title (§21.1).
      if (focusWasInside && !sheetEl?.contains(document.activeElement)) (body.querySelector<HTMLElement>('.plot-take-out') ?? live.add ?? heading())?.focus();
    };

    const collapse = (focusStart: boolean) => {
      review = null;
      built = '';
      refresh();
      if (focusStart) start?.focus();
    };

    const closeConfirm = (focusOpener: boolean) => {
      const kind = confirm?.kind;
      confirm = null;
      built = '';
      refresh();
      if (focusOpener) body.querySelector<HTMLElement>(kind === 'cancel' ? '.plot-cancel' : '.plot-empty')?.focus();
    };

    const refresh = () => {
      const p = this.info(i);
      const sig = `${p.state}|${p.planted.map((k) => k.type).join(',')}`;
      // The plot changed under an open review: it closes, and says so (§15.4).
      if (review !== null && review !== sig && !(this.pending?.type === 'startGrowing' && this.pending.plot === i)) {
        review = null;
        const lines = p.state === 'growing' || p.state === 'ready' ? ['This plot is already growing.'] : ['This plot changed. Review it again before starting.'];
        if (!(this.note?.plot === i && !this.note.note.warn)) this.note = { plot: i, note: { lines, warn: true } };
      }
      if (review !== null && p.state !== 'filling') review = null;
      // An Empty or Cancel review closes if the plot changed under it, and says so; a growing
      // plot turning ready says it can't be cancelled (§21.2).
      const sending = this.pending?.type === 'emptyPlot' && this.pending.plot === i;
      if (confirm && confirm.sig !== sig && !sending) {
        const lines =
          p.state === 'ready'
            ? ['This sprout has finished growing and cannot be cancelled.']
            : [confirm.kind === 'cancel' ? 'This plot changed. Review it again before cancelling.' : 'This plot changed. Review it again before emptying it.'];
        confirm = null;
        if (!(this.note?.plot === i && !this.note.note.warn)) this.note = { plot: i, note: { lines, warn: true } };
      }
      if (confirm && p.state === 'empty') confirm = null;
      const key = `${sig}|${review !== null}|${confirm?.kind ?? ''}`;
      if (key !== built) {
        built = key;
        build(p, sig);
      }
      const state = p.state === 'empty' ? 'Empty' : p.state === 'filling' ? 'Filling' : p.state === 'growing' ? 'Growing' : 'Ready';
      this.sheet.setTitle(`Plot ${i + 1}`);
      this.sheet.setSubtitle(`${p.count} / ${max} kids · ${state}`);
      if (left && rail && p.state === 'growing') {
        const t = `Growing · ${formatTimeLeft(p.left)}`;
        if (left.textContent !== t) left.textContent = t;
        (rail as ReturnType<GardenPlots['rail']>).set(i, p);
      } else if (left && p.state === 'ready') {
        const w = `Ready · ${this.waitingText(i)}`;
        if (left.textContent !== w) left.textContent = w;
        (rail as ReturnType<GardenPlots['rail']> | null)?.node.remove();
      }
      if (start && this.pending?.type === 'startGrowing' && this.pending.plot === i) {
        const label = start.querySelector('.action-label');
        if (label && label.textContent !== 'Starting…') label.textContent = 'Starting…';
        this.setEnabled(start, false);
      }
      // While a command is out, or an Empty/Cancel review is open, other changes wait; Back
      // and browsing stay (§21.1). Start's own review keeps Empty and Take out off too.
      const busy = this.pending !== null;
      const pend = this.pending;
      for (const [kidId, b] of live.takeOuts) {
        const label = pend?.type === 'unplant' && pend.plot === i && pend.kidId === kidId ? 'Taking out…' : 'Take out';
        if (b.textContent !== label) b.textContent = label;
        this.setEnabled(b, !busy && !confirm && review === null);
      }
      if (live.add) this.setEnabled(live.add, !busy && !confirm);
      if (live.empty) this.setEnabled(live.empty, !busy && review === null);
      if (live.cancel) this.setEnabled(live.cancel, !busy);
      if (start && confirm) this.setEnabled(start, false);
      // The review's room is the map's now, and its action waits for enough of it (§21.2).
      const r = live.review;
      if (r) {
        const room = Math.max(0, this.game.capacity - this.game.state.world.kids.length);
        const roomText = `Room needed: ${r.count}. Room on map: ${room}.`;
        if (r.room.textContent !== roomText) r.room.textContent = roomText;
        const full = room < r.count;
        r.full.hidden = !full;
        const sending = pend?.type === 'emptyPlot' && pend.plot === i;
        const label = sending ? (r.kind === 'cancel' ? 'Cancelling…' : 'Emptying…') : r.label;
        if (r.action.textContent !== label) r.action.textContent = label;
        this.setEnabled(r.action, !busy && !full);
        if (full) r.action.setAttribute('aria-describedby', r.full.id);
        else r.action.removeAttribute('aria-describedby');
      }
      note.set(this.note?.plot === i ? this.note.note : null);
    };

    return {
      update: refresh,
      escape: () => {
        if (confirm) {
          closeConfirm(true);
          return true;
        }
        if (review === null) return false;
        collapse(true);
        return true;
      },
    };
  }

  /** "Empty Plot n?" or "Cancel Plot n?": exactly what it does, before it does it (§§21.1-21.2). */
  private confirmBlock(i: number, p: PlotInfo, kind: 'empty' | 'cancel'): { node: HTMLElement; room: HTMLElement; full: HTMLElement } {
    const n = i + 1;
    const heading = el('h4', 'dex-home-confirm-title plot-confirm-heading', kind === 'cancel' ? `Cancel Plot ${n}?` : `Empty Plot ${n}?`);
    heading.tabIndex = -1;
    const kids = `${p.count} ${plural(p.count, 'kid', 'kids')}`;
    const lines =
      kind === 'cancel'
        ? [
            `All ${kids} will return by the Garden.`,
            'Growing time will be lost. Start again from the beginning if you plant them again.',
            'Nothing is charged or refunded.',
            `Grown for ${formatDuration(this.game.growSeconds - p.left)}.`,
          ]
        : [`All ${kids} will return by the Garden. Nothing is charged.`];
    // Room and the full-map reason are filled in each frame (see `detail`).
    const room = el('p', 'sheet-helper plot-confirm-room');
    const full = el('p', 'sheet-body-text plot-confirm-full', `There isn't room on the map for all ${kids}. Make room, then try again.`);
    full.id = `plot-confirm-full-${i}`;
    full.hidden = true;
    const node = el(
      'div',
      'plot-review plot-confirm ui-surface',
      heading,
      ...(kind === 'cancel' ? [this.kidRows(p.planted, false)] : []),
      ...lines.map((l) => el('p', 'sheet-body-text', l)),
      room,
      full,
    );
    return { node, room, full };
  }

  /** A confirming action: ink text, the danger only in its border (§21.2, LAYOUT-DESIGN B2). */
  private confirmButton(label: string, onClick: () => void): HTMLButtonElement {
    const b = this.button(label, 'sheet-action plot-confirm-action', () => {
      if (!this.pending) onClick();
    });
    return b;
  }

  /** "Start Plot {n} growing?": exactly what starting does, before it does it (§15.4). */
  private reviewBlock(i: number, p: PlotInfo, keepFilling: () => void): HTMLElement {
    const heading = el('h4', 'dex-home-confirm-title plot-review-heading', `Start Plot ${i + 1} growing?`);
    heading.tabIndex = -1;
    const lines = [
      ...this.rolls(p.planted),
      `One kid sprouts after ${formatDuration(this.game.growSeconds)}.`,
      'One new kid will sprout. Cancelling before it is ready returns these kids and loses the growing time.',
      ...(p.planted.some((k) => this.kind(k.type) === 'Special') ? ['Special kids cannot be bought back.'] : []),
      ...(p.planted.some((k) => this.kind(k.type) === 'Rare') ? ['Rare kids cannot be bought back.'] : []),
    ];
    const keep = this.button('Keep filling', 'plot-action-full', keepFilling);
    return el('div', 'plot-review ui-surface', heading, this.kidRows(p.planted, false), ...lines.map((l) => el('p', 'sheet-body-text', l)), keep);
  }

  // --- the picker ------------------------------------------------------------------------

  private picker(i: number): NonNullable<GardenPlots['current']> {
    const body = this.sheet.body;
    const footer = this.sheet.footer;
    const p = this.planting;
    const max = p.maxKids;
    const live = () => this.game.state.world.kids;
    /** The draft: chosen kid ids, in the order chosen. Nothing leaves the map until Add. */
    const draft: number[] = [];
    let filter: 'all' | 'rares' | 'specials' = 'all';
    let query = '';
    /** Shown once, until the next change: the map changed, or why Add can't go. */
    let notice: string | null = null;

    // Ordinals per type: by id at entry, newcomers appended; a kid keeps its number (§15.3).
    const ordinals = new Map<number, number>();
    const nextOrdinal = new Map<KidId, number>();
    const number = (id: number, type: KidId) => {
      if (!ordinals.has(id)) {
        const n = (nextOrdinal.get(type) ?? 0) + 1;
        nextOrdinal.set(type, n);
        ordinals.set(id, n);
      }
      return ordinals.get(id)!;
    };
    for (const k of [...live()].sort((a, b) => a.id - b.id)) number(k.id, k.type);

    const back = this.button('Back to plots', 'plot-back', () => this.show({ kind: 'overview' }, true));
    const helpers = el(
      'div',
      'picker-helpers',
      el('p', 'sheet-helper', 'Added kids leave the map. You can take them out while filling, or cancel while growing.'),
      el('p', 'sheet-helper', 'They earn no Materials in a plot. Happiness keeps counting down.'),
      el('p', 'sheet-helper', 'Selections stay on the map until Add.'),
      el('p', 'sheet-helper', 'Two separate rolls. If both hit, the sprout is the rare kid.'),
    );
    const searchLabel = el('label', 'picker-search-label', 'Find a kid on your map');
    const search = el('input', 'picker-search');
    search.type = 'search';
    search.id = 'picker-search';
    searchLabel.htmlFor = search.id;
    search.addEventListener('input', () => {
      query = search.value.trim().toLowerCase();
      refresh();
    });
    const filters = (['all', 'rares', 'specials'] as const).map((f) => {
      const b = this.button(f === 'all' ? 'All' : f === 'rares' ? 'Rares' : 'Specials', 'picker-filter', () => {
        filter = f;
        refresh();
      });
      b.setAttribute('role', 'radio');
      return { f, b };
    });
    const filterGroup = el('div', 'picker-filters', ...filters.map((x) => x.b));
    filterGroup.setAttribute('role', 'radiogroup');
    filterGroup.setAttribute('aria-label', 'Show');
    const limitNote = el('p', 'sheet-helper picker-limit');
    const list = el('div', 'picker-list');
    const empty = el('p', 'sheet-body-text picker-empty');
    const blocked = el('div', 'plot-note is-warning picker-blocked');
    blocked.setAttribute('role', 'status');
    body.replaceChildren(back, helpers, searchLabel, search, filterGroup, limitNote, blocked, list, empty);

    const lines = el('div', 'picker-lines');
    const notices = el('div', 'picker-notices');
    const add = el('button', 'ui-button sheet-action picker-add');
    add.type = 'button';
    add.dataset.cue = 'success';
    const announce = el('p', 'visually-hidden');
    announce.setAttribute('aria-live', 'polite');
    footer.replaceChildren(lines, notices, add, announce);

    const rows = new Map<number, { node: HTMLElement; box: HTMLInputElement; text: string; named: (name: string | undefined, happy?: boolean) => void }>();
    const rowFor = (id: number) => {
      const k = live().find((c) => c.id === id)!;
      const box = el('input', 'picker-check');
      box.type = 'checkbox';
      const typeName = this.name(k.type);
      const kidNumber = `Kid ${number(id, k.type)}`;
      const detailEl = el('span', 'sheet-helper picker-row-detail');
      // A named kid: its name, then its full type name, then tier and number (§15.3).
      const nameEl = el('span', 'picker-row-name');
      const typeEl = el('span', 'sheet-helper picker-row-type', typeName);
      // The full row toggles its checkbox once (a native label).
      const node = el(
        'label',
        'ui-surface picker-row',
        portrait(kidRig!, k.type, 48, k.look),
        el('span', 'picker-row-text', nameEl, typeEl, detailEl),
        box,
      );
      const row = {
        node,
        box,
        text: '',
        // A name given or cleared, or happiness starting or wearing off, shows (and is
        // searchable) at once: a happy kid counts one tier higher (§15.3).
        named: (name: string | undefined, happy = false) => {
          if (nameEl.textContent !== (name ?? typeName)) nameEl.textContent = name ?? typeName;
          typeEl.hidden = !name;
          const detail = this.marks(k.type, [kidNumber], happy ? 'live' : null);
          if (detailEl.textContent !== detail) detailEl.textContent = detail;
          row.text = `${name ?? ''} ${typeName} ${detail}`.toLowerCase();
        },
        rare: this.kind(k.type) === 'Rare',
        special: this.kind(k.type) === 'Special',
      };
      row.named(k.name, !!k.happy);
      box.addEventListener('change', () => {
        const at = draft.indexOf(id);
        if (box.checked && at < 0) draft.push(id);
        if (!box.checked && at >= 0) draft.splice(at, 1);
        notice = null;
        refresh();
        say();
      });
      return row;
    };
    const kinds = new Map<number, { rare: boolean; special: boolean }>();

    /** The footer's numbers for the plot now and with the draft added. */
    const projection = () => {
      // Accepted kids as they were added; chosen kids as they are now, happy or not (D-056).
      const accepted = this.info(i).planted;
      const chosen = draft.flatMap((id) => {
        const k = live().find((c) => c.id === id);
        return k ? [{ type: k.type, happy: !!k.happy }] : [];
      });
      const now = { count: accepted.length, ...this.game.oddsFor(accepted) };
      const next = { count: accepted.length + chosen.length, ...this.game.oddsFor([...accepted, ...chosen]) };
      return oddsLines(i, now, next, { minKids: p.minKids, maxKids: max, ceiling: { special: p.specialOdds[1], rare: p.rareOdds[1] } });
    };
    /** Announced on the player's changes, never on sim ticks (§15.3). */
    const say = () => {
      const [count, special, rare] = projection();
      announce.textContent = `${draft.length} selected. ${count}. ${special}. ${rare}.`;
    };

    this.pickerRefusal = (reason) => {
      if (reason === 'gone') notice = 'The map changed. Check these kids and try Add again.';
      else if (reason === 'plotsBusy') notice = 'This plot is already growing. Choose another plot.';
      else if (reason === 'plotFull') notice = 'This plot is full. Review it to Start growing.';
      else notice = refusalText(reason, 'plant');
    };

    const refresh = () => {
      const info = this.info(i);
      const ids = live().map((k) => k.id);
      // A chosen kid that left (fused, gone): unchecked, said once, never swapped (§15.3).
      const gone = draft.filter((id) => !ids.includes(id));
      if (gone.length) {
        for (const id of gone) draft.splice(draft.indexOf(id), 1);
        notice = 'The map changed. Check these kids and try Add again.';
      }
      const free = Math.max(0, max - info.count);
      const started = info.state === 'growing' || info.state === 'ready';
      this.sheet.setTitle(`Pick kids for Plot ${i + 1}`);
      this.sheet.setSubtitle(`${info.count} / ${max} in this plot · ${free} ${plural(free, 'space', 'spaces')}`);

      // Rows: every kid on the map, in id order; existing rows stay put, so focus is kept.
      for (const [id, r] of rows)
        if (!ids.includes(id)) {
          if (r.node.contains(document.activeElement)) search.focus();
          r.node.remove();
          rows.delete(id);
        }
      // Newcomers go at the end (ids only grow), and no surviving row is ever moved: a
      // focused checkbox keeps its focus (Codex review, PR #72).
      for (const id of [...ids].sort((a, b) => a - b)) {
        if (rows.has(id)) continue;
        const r = rowFor(id);
        rows.set(id, r);
        kinds.set(id, { rare: r.rare, special: r.special });
        list.append(r.node);
      }
      let visible = 0;
      for (const [id, r] of rows) {
        const now = live().find((k) => k.id === id);
        r.named(now?.name, !!now?.happy);
        const kind = kinds.get(id)!;
        const show = (filter === 'all' || (filter === 'rares' ? kind.rare : kind.special)) && (!query || r.text.includes(query));
        r.node.hidden = !show;
        if (show) visible++;
        const checked = draft.includes(id);
        r.box.checked = checked;
        // At the limit, unchecked kids can't be chosen; checked ones stay reversible.
        r.box.disabled = started || this.pending !== null || (!checked && draft.length >= free);
        r.node.classList.toggle('is-selected', checked);
        r.node.classList.toggle('is-disabled', r.box.disabled);
      }
      for (const { f, b } of filters) {
        b.setAttribute('aria-checked', String(f === filter));
        b.classList.toggle('is-selected', f === filter);
      }
      empty.hidden = visible > 0;
      empty.textContent = rows.size === 0 ? 'No kids on your map yet.' : 'No matching kids. Your selections are kept.';
      limitNote.hidden = !(free > 0 && draft.length >= free && !started);
      limitNote.textContent = `All ${free} ${plural(free, 'space', 'spaces')} selected. Uncheck a kid to change your choice.`;

      // Why Add can't go now, if it can't (§15.3): in order of what the player must do.
      const excess = draft.length - free;
      const why = started
        ? 'This plot is already growing. Choose another plot.'
        : free === 0
          ? 'This plot is full. Review it to Start growing.'
          : excess > 0
            ? `Uncheck ${excess} ${plural(excess, 'kid', 'kids')} to fit this plot.`
            : notice;
      const blockedKey = why ?? '';
      if (blocked.dataset.text !== blockedKey) {
        blocked.dataset.text = blockedKey;
        blocked.hidden = !why;
        blocked.replaceChildren(...(why ? [icon('icon_warning', '', 'ui-icon-24'), el('span', 'card-line', why)] : []));
      }

      const text = [...projection(), 'Leaves map now. Take out before growing.'];
      if (lines.dataset.text !== text.join('\n')) {
        lines.dataset.text = text.join('\n');
        lines.replaceChildren(...text.map((t) => el('p', 'picker-line', t)));
      }
      const chosenKinds = draft.map((id) => kinds.get(id));
      const extra = [
        ...(chosenKinds.some((k) => k?.rare) ? ['Rare kids cannot be bought back.'] : []),
        ...(chosenKinds.some((k) => k?.special) ? ['Special kids cannot be bought back.'] : []),
      ];
      if (notices.dataset.text !== extra.join('\n')) {
        notices.dataset.text = extra.join('\n');
        notices.replaceChildren(...extra.map((t) => el('p', 'picker-line', t)));
      }
      const adding = this.pending?.type === 'plant' && this.pending.plot === i;
      const label = adding ? 'Adding…' : draft.length === 0 ? 'Select kids to add' : draft.length === 1 ? 'Add 1 kid' : `Add ${draft.length} kids`;
      if (add.textContent !== label) add.textContent = label;
      const can = !adding && !this.pending && draft.length > 0 && !started && excess <= 0 && free > 0;
      this.setEnabled(add, can);
      add.classList.toggle('ui-primary', can);
    };

    add.addEventListener('click', () => {
      if (add.getAttribute('aria-disabled') === 'true' || this.pending) return;
      // Atomic: every chosen kid, into this plot, or none (§15.3).
      notice = null;
      this.send({ type: 'plant', plot: i, kidIds: [...draft] });
      refresh();
    });

    say();
    return {
      update: refresh,
      escape: () => false,
      snapshot: () => ({ draft: [...draft], filter, query: search.value }),
      restore: (s) => {
        const live = new Set(this.game.state.world.kids.map((k) => k.id));
        draft.splice(0, draft.length, ...s.draft.filter((id) => live.has(id)));
        filter = s.filter;
        search.value = s.query;
        query = s.query.trim().toLowerCase();
        refresh();
      },
    };
  }
}
