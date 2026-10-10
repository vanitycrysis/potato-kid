import { kidRig } from '../content/artData';
import type { Content, FoodDef, KidId } from '../content/types';
import type { MapScene } from '../render/scene';
import type { GameEvent, RejectReason } from '../sim/game';
import { checkName, graphemes, normalizeName } from '../sim/names';
import type { Kid } from '../sim/world';
import type { BuildingSheets } from './buildings';
import { el, icon } from './dom';
import { refusalText } from './feedback';
import { formatDuration, formatExact, formatRate, formatTimeLeft } from './format';
import type { PlantingNotes } from './plantingNotes';
import { chosenPlotRefusal, kindMark, plotRoute } from './plotRoute';
import { portrait } from './portrait';
import type { OpenSheet, Sheets } from './sheet';

// The kid card (D-056, D-057, D-058; docs/GUI_MVP.md §17-18, Codex's design): one live
// kid's sheet, opened by tapping it. The card shows who it is (its look, tier, income, rare
// profile, happiness and personality) and holds three actions: Feed and Name in its footer,
// each a page of the same sheet, and planting (§15.6). Nothing is optimistic: every change
// is a command, shown once the sim answers. If the kid leaves the map, the card stays as it
// last was, read-only, and says so (§18.3).

const STATUS_MS = 2500;

type View = 'card' | 'feed' | 'name';
type Action = { type: 'feed'; food: string } | { type: 'name'; name: string | null } | { type: 'plant'; plot: number };
/** A sent action and the kid it was for: its result is matched to that kid, card open or not. */
type Pending = Action & { kidId: number };

/** Where a card was, for coming back after an interruption (the return summary, GUI_MVP §8). */
export interface CardSnapshot {
  kidId: number;
  view: View;
  draft: string | null;
  back: { label: string; go: () => void } | null;
  /** The kid as the card last knew it, so a card whose kid has left comes back too (§18.3). */
  seen: Seen;
  /** The planting route: open or not, and the plot chosen in it. */
  planting: { open: boolean; plot: number | null };
  /** Its number as the card showed it. */
  ordinal: number;
  /** Where the card itself was scrolled, under a page open over it. */
  cardScroll: number;
}

/** What the card last knew of its kid: kept when the kid leaves (§18.3). */
interface Seen {
  type: KidId;
  name: string | undefined;
  look: Kid['look'];
}


/**
 * A type's Personality blocks (GUI_MVP §18.1): its description, then Likes and Hates (each
 * food's icon and name before the prose) and Hobbies. The same on a kid's card and in the
 * Dex's type detail.
 */
export function personalityBlocks(content: Content, type: KidId): HTMLElement[] {
  const p = content.personality[type];
  const food = (id: string | undefined, prose: string | undefined) => {
    const f = id ? content.balance.feeding.foods.find((x) => x.id === id) : undefined;
    return el('p', 'sheet-body-text kid-card-food', ...(f ? [icon(`icon_food_${f.id}`, '', 'ui-icon-24'), el('strong', '', f.name), ' '] : []), prose ?? '');
  };
  return [
    el('h3', 'sheet-section kid-card-heading', 'Personality'),
    el('p', 'sheet-body-text', p?.description ?? 'Personality is being written.'),
    el('h4', 'kid-card-trait', 'Likes'),
    food(p?.favouriteFood, p?.likes),
    el('h4', 'kid-card-trait', 'Hates'),
    food(p?.hatedFood, p?.hates),
    el('h4', 'kid-card-trait', 'Hobbies'),
    el('p', 'sheet-body-text', p?.hobbies ?? ''),
  ];
}

export class KidCard {
  private sheet: OpenSheet | null = null;
  private kidId = 0;
  private seen: Seen | null = null;
  private view: View = 'card';
  private pending: Pending | null = null;
  private status: { lines: string[]; warn: boolean; until: number } | null = null;
  /** The Name page's draft: kept while the sheet is open (Back keeps it, close discards). */
  private draft: string | null = null;
  private current: { update(): void } | null = null;
  /** What opened the card: focus goes back there, through any sheet it hands over to. */
  private launcher: HTMLElement | null = null;
  /** The open card's planting route: its stage, and a way to reopen it there. */
  private plantingState: { get(): { open: boolean; plot: number | null }; open(plot: number | null): void } | null = null;
  /** Opened from the Dex: the way back to that kid's type detail (GUI_MVP §18.1). */
  private backTo: { label: string; go: () => void } | null = null;
  private readonly tierOf: Map<KidId, number>;

  constructor(
    private readonly scene: MapScene,
    private readonly content: Content,
    private readonly sheets: Sheets,
    private readonly buildings: BuildingSheets,
    private readonly notes: PlantingNotes,
    private readonly readOnly: () => boolean,
  ) {
    this.tierOf = new Map(content.kids.map((k) => [k.id, k.tier]));
  }

  private get game() {
    return this.scene.game;
  }

  private kid(): Kid | undefined {
    return this.game.state.world.kids.find((k) => k.id === this.kidId);
  }

  private typeName(type: KidId): string {
    return this.content.kids.find((k) => k.id === type)?.name ?? type;
  }

  /** The kid's own name, or its full type name (§18.1). */
  private displayName(): string {
    const s = this.seen!;
    return s.name ?? this.typeName(s.type);
  }

  /** Kid n among live copies of its type, by id (§13.4's rule). */
  /** Its number, fixed when the card opened: copies leaving never renumber it (Codex review). */
  private kidOrdinal = 1;

  private ordinal(): number {
    return this.kidOrdinal;
  }

  /** Kid n among live copies of its type, by id (§13.4's rule), now. */
  private ordinalNow(kidId: number, type: KidId): number {
    return this.game.state.world.kids.filter((k) => k.type === type && k.id <= kidId).length || 1;
  }

  private food(id: string): FoodDef | undefined {
    return this.content.balance.feeding.foods.find((f) => f.id === id);
  }

  /** Where the open card is: its kid, page, Name draft and way back. */
  snapshot(): CardSnapshot | null {
    if (!this.sheet) return null;
    return {
      kidId: this.kidId,
      view: this.view,
      draft: this.draft,
      back: this.backTo,
      seen: { ...this.seen!, look: { ...this.seen!.look } },
      planting: this.plantingState?.get() ?? { open: false, plot: null },
      ordinal: this.kidOrdinal,
      cardScroll: this.view === 'card' ? (this.sheets.snapshot()?.scrollTop ?? 0) : (this.kept?.scroll ?? 0),
    };
  }

  /** Back where a snapshot was (its kid still on the map): the same page, draft and scroll. */
  restore(s: CardSnapshot, launcher: HTMLElement | null, scrollTop: number): void {
    this.open(s.kidId, launcher, s.back ?? undefined, s.seen, s.ordinal);
    if (!this.sheet) return;
    this.draft = s.draft;
    // The card's planting route as it was, the card scrolled where it was (kept as the page
    // opens over it, for Back), then the page that was open over it.
    if (s.planting.open) this.plantingState?.open(s.planting.plot);
    if (s.view !== 'card') {
      this.sheet.scrollTo(s.cardScroll);
      this.show(s.view);
    }
    this.sheet.scrollTo(scrollTop);
  }

  /** The open card's kid id, or null. */
  get showing(): number | null {
    return this.sheet ? this.kidId : null;
  }

  /**
   * Opens a kid's card. `seen`: what an interrupted card last showed; with it, a kid that has
   * since left still gets its card back, read-only (§18.3).
   */
  open(kidId: number, launcher: HTMLElement | null, back?: { label: string; go: () => void }, seen?: Seen, ordinal?: number): void {
    const kid = this.game.state.world.kids.find((k) => k.id === kidId);
    if (!kid && !seen) return;
    this.kidId = kidId;
    this.launcher = launcher;
    this.backTo = back ?? null;
    this.seen = kid ? { type: kid.type, name: kid.name, look: { ...kid.look } } : seen!;
    this.kidOrdinal = ordinal ?? this.ordinalNow(kidId, this.seen.type);
    this.view = 'card';
    this.kept = null;
    // An action still waiting for its result stays waiting: it answers here, or in the world.
    this.status = null;
    this.draft = null;
    this.sheet = this.sheets.open(
      {
        key: 'kid',
        icon: 'icon_kids',
        title: this.displayName(),
        requestedHeight: 624,
        update: () => this.update(),
        onEscape: () => {
          if (this.view === 'card') return false;
          this.show('card');
          return true;
        },
        onClose: () => {
          this.sheet = null;
          this.current = null;
          this.draft = null;
        },
      },
      launcher,
    );
    this.show('card');
  }

  /**
   * The card as it was while Feed or Name is open: its nodes, scroll and planting steps,
   * put back on return rather than rebuilt (GUI_MVP §17.2; Codex review, FEED-NAME).
   */
  private kept: { body: Node[]; footer: Node[]; current: { update(): void }; scroll: number } | null = null;

  private show(view: View): void {
    const from = this.view;
    const s = this.sheet!;
    // A refusal holds until the player moves on: another page is moving on (§9).
    if (this.status?.warn) this.status = null;
    if (from === 'card' && view !== 'card' && this.current) {
      this.kept = { body: [...s.body.childNodes], footer: [...s.footer.childNodes], current: this.current, scroll: this.sheets.snapshot()?.scrollTop ?? 0 };
    }
    this.view = view;
    const kept = view === 'card' ? this.kept : null;
    if (view === 'card') this.kept = null;
    if (kept) {
      s.body.replaceChildren(...kept.body);
      s.footer.replaceChildren(...kept.footer);
      this.current = kept.current;
      this.current.update();
      s.scrollTo(kept.scroll);
      s.footer.querySelector<HTMLElement>(`[data-action="${from}"]`)?.focus({ preventScroll: true });
      return;
    }
    s.footer.replaceChildren();
    this.current = view === 'card' ? this.card() : view === 'feed' ? this.feedPage() : this.namePage();
    this.current.update();
    s.scrollTo(0);
    // Back from a page returns focus to its own action (§18.2).
    if (view === 'card' && from !== 'card') s.footer.querySelector<HTMLElement>(`[data-action="${from}"]`)?.focus();
    else s.body.closest('.sheet')?.querySelector<HTMLElement>('.sheet-title')?.focus();
  }

  private update(): void {
    const kid = this.kid();
    // Still here: keep what the card shows current (a name, a look). Gone: keep the last.
    if (kid && this.seen) this.seen = { type: kid.type, name: kid.name, look: { ...kid.look } };
    if (this.status && this.status.until < performance.now()) this.status = null;
    this.current?.update();
  }

  /**
   * A step's events: completes this card's pending command. Returns the events it answered,
   * so the world shows no second card or refusal for them.
   */
  onStep(events: GameEvent[]): GameEvent[] {
    const p = this.pending;
    if (!p) return [];
    const handled: GameEvent[] = [];
    // Its card closed (or shows another kid) before the result came: the world says it, so
    // a payment is never left unconfirmed (GUI_MVP §17.2; Codex review).
    const here = !!this.sheet && this.kidId === p.kidId;
    if (!here) {
      for (const e of events) {
        const mine = (e.type === 'fed' || e.type === 'named' || e.type === 'planted') && e.kid.id === p.kidId;
        if (mine || (e.type === 'rejected' && e.command === p.type)) this.pending = null;
      }
      return [];
    }
    const name = this.displayName();
    for (const e of events) {
      if (p.type === 'feed' && e.type === 'fed' && e.kid.id === this.kidId) {
        this.pending = null;
        handled.push(e);
        const f = this.content.balance.feeding;
        const foodName = this.food(e.food)?.name ?? e.food;
        this.say(
          e.favourite
            ? [`${foodName} is ${name}’s favourite!`, `Happy for ${formatDuration(f.favouriteSeconds)}. Check planting chances in a plot.`]
            : [`${name} enjoyed ${foodName}.`, `Happy for ${formatDuration(f.happySeconds)}.`],
          false,
        );
      } else if (p.type === 'name' && e.type === 'named' && e.kid.id === this.kidId) {
        this.pending = null;
        handled.push(e);
        this.draft = null;
        if (this.seen) this.seen.name = e.name ?? undefined;
        this.say([e.name ? `Named ${e.name}.` : `Called ${this.typeName(this.seen!.type)} again.`], false);
        this.show('card');
        this.sheet!.setTitle(this.displayName());
        this.sheet!.body.closest('.sheet')?.querySelector<HTMLElement>('.sheet-title')?.focus();
      } else if (p.type === 'plant' && e.type === 'planted' && e.kid.id === this.kidId) {
        this.pending = null;
        handled.push(e);
        // The card gives way to the plot's detail, which explains (§15.6, §18.3).
        const first = this.notes.claimFirst();
        const lines = [this.notes.heading(name, e.plot), ...(first ? this.notes.firstLines() : [this.notes.later(e.count)])];
        if (first) this.notes.markShown();
        // Handed over with the card's own launcher, so closing the Garden returns focus there.
        this.buildings.openPlotDetail(e.plot, this.launcher, lines);
      } else if (e.type === 'rejected' && e.command === p.type) {
        this.pending = null;
        handled.push(e);
        this.refused(p, e.reason);
      }
    }
    return handled;
  }

  private refused(p: Pending, reason: RejectReason): void {
    const name = this.displayName();
    if (reason === 'gone') return this.say(['This kid has already left the map.'], true);
    if (p.type === 'feed' && reason === 'hated') return this.say([`${name} won’t eat ${this.food(p.food)?.name ?? p.food}. Nothing was spent.`], true);
    if (p.type === 'name' && reason === 'invalid') return this.say(['Use letters, numbers, spaces, apostrophes or hyphens.'], true);
    // An add was for one plot: say what changed there, not about every plot (§15.3).
    if (p.type === 'plant' && (reason === 'plotsBusy' || reason === 'plotFull')) return this.say([chosenPlotRefusal(reason)], true);
    this.say([refusalText(reason, p.type, 'materials')], true);
  }

  /** A success shows 2.5 s; a refusal holds until the player acts, moves on or closes (§9). */
  private say(lines: string[], warn: boolean): void {
    this.status = { lines, warn, until: warn ? Infinity : performance.now() + STATUS_MS };
  }

  private send(p: Action): void {
    if (this.pending || this.readOnly()) return;
    this.pending = { ...p, kidId: this.kidId };
    this.status = null;
    if (p.type === 'feed') this.scene.command({ type: 'feed', kidId: this.kidId, food: p.food });
    else if (p.type === 'name') this.scene.command({ type: 'name', kidId: this.kidId, name: p.name });
    else this.scene.command({ type: 'plant', kidIds: [this.kidId], plot: p.plot });
  }

  // --- shared pieces --------------------------------------------------------------------

  /** The one status region (§9): a result, or why not; announced once. */
  private statusBox(): { node: HTMLElement; update(): void } {
    const node = el('div', 'plot-note kid-status');
    node.setAttribute('role', 'status');
    // Focus can land here when what it was on goes away (a stale kid's name input).
    node.tabIndex = -1;
    node.hidden = true;
    let shown = '';
    return {
      node,
      update: () => {
        const gone = !this.kid();
        // A kid that left says so for good; a read-only save says why nothing can change
        // (§10, §18.2); a result shows its 2.5 s.
        const s = gone ? { lines: ['This kid has already left the map.'], warn: true } : this.readOnly() ? { lines: ['Update the game to continue.'], warn: true } : this.status;
        const key = s ? `${s.warn}|${s.lines.join('\n')}` : '';
        if (key === shown) return;
        shown = key;
        node.hidden = !s;
        node.classList.toggle('is-warning', !!s?.warn);
        if (!s) return void node.replaceChildren();
        node.replaceChildren(
          icon(s.warn ? 'icon_warning' : 'icon_check', '', 'ui-icon-24'),
          el('div', 'card-text', ...s.lines.map((l, i) => el('span', i === 0 ? 'card-heading' : 'card-line', l))),
        );
        node.scrollIntoView({ block: 'nearest' });
      },
    };
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

  private back(to: View): HTMLButtonElement {
    return this.button(to === 'card' ? 'Back' : 'Back', 'plot-back', () => this.show(to));
  }

  private tierLine(type: KidId): HTMLElement {
    const t = this.tierOf.get(type) ?? 1;
    // A tier with no badge (T6) is plain text; no invented glyph (§18.1).
    return el('span', 'tier dex-tier-24', ...(t <= 5 ? [icon(`badge_tier_${t}`, '', 'ui-icon-24')] : []), `Tier ${t}`);
  }

  // --- the card -------------------------------------------------------------------------

  private card(): { update(): void } {
    const s = this.sheet!;
    const seen = this.seen!;
    const type = seen.type;
    const def = this.content.kids.find((k) => k.id === type);
    // Special (D-063) or rare (D-072): planting-only kinds, marked alike.
    const kind = kindMark(def);
    const status = this.statusBox();
    const pic = el('div', 'kid-card-portrait', portrait(kidRig!, type, 96, seen.look));
    const marks = el('div', 'kid-card-marks');
    if (kind) marks.append(el('span', 'kid-card-mark', `${kind} kid`));
    const income = el('p', 'sheet-helper kid-card-income');
    const tier = el('div', 'kid-card-tier', this.tierLine(type), income);

    // Happiness (§17.2): how long, and what it does.
    const happy = el('div', 'kid-card-happy');
    happy.setAttribute('aria-live', 'off');

    const personality = [
      ...(kind ? [el('p', 'sheet-helper', `Found only through planting. No fusion recipes. ${kind} kids cannot be bought.`)] : []),
      ...personalityBlocks(this.content, type),
    ];

    // Planting (§15.6): what it does, then Choose a plot, in this sheet.
    let route: ReturnType<typeof plotRoute> | null = null;
    /** Opens the plot route; `plot`: a plot chosen before an interruption, chosen again. */
    const openRoute = (plot: number | null) => {
      if (this.readOnly() || !this.kid() || route) return;
      route = plotRoute({
        scene: this.scene,
        content: this.content,
        kidId: this.kidId,
        type,
        displayName: () => this.displayName(),
        ordinal: this.ordinal(),
        readOnly: () => this.readOnly() || !this.kid(),
        busy: () => this.pending !== null,
        onAdd: (plot) => this.send({ type: 'plant', plot }),
        onKeep: () => {
          route?.node.replaceWith(pick);
          route = null;
          pick.focus();
        },
        onStale: () => this.say(['This kid has already left the map.'], true),
      });
      pick.replaceWith(route.node);
      route.refresh();
      if (plot !== null) route.choose(plot);
      else route.title.focus();
    };
    const pick = this.button('Choose a plot', 'ui-primary dex-home-action', () => openRoute(null));
    // For a snapshot, and to come back to: whether the route is open, and the plot chosen.
    this.plantingState = {
      get: () => ({ open: route !== null, plot: route?.chosen() ?? null }),
      open: openRoute,
    };
    const planting = el(
      'section',
      'kid-card-planting',
      el('h3', 'sheet-section kid-card-heading', 'Planting'),
      el('p', 'sheet-body-text', 'Add this kid to a plot. Leaves the map right away; kept in your Dex. No refund.'),
      pick,
    );

    // From the Dex: "Back to {type}", first in the body (§18.1).
    const backTo = this.backTo;
    const toDex = backTo ? [this.button(backTo.label, 'plot-back', () => backTo.go())] : [];
    s.body.replaceChildren(...toDex, status.node, pic, marks, tier, happy, ...personality, planting);
    const feed = this.button('Feed', 'sheet-action kid-card-action', () => this.show('feed'));
    feed.dataset.action = 'feed';
    const name = this.button('Name', 'sheet-action kid-card-action', () => this.show('name'));
    name.dataset.action = 'name';
    s.footer.replaceChildren(el('div', 'kid-card-actions', feed, name));

    let happyKey = '';
    return {
      update: () => {
        const kid = this.kid();
        const gone = !kid;
        s.setTitle(this.displayName());
        s.setSubtitle(this.seen!.name ? this.typeName(type) : `On your map · Kid ${this.ordinal()}`);
        status.update();
        if (kid) {
          const t = `Earns ${formatRate(this.game.incomeOfKid(kid) * 3600)} Materials / h`;
          if (income.textContent !== t) income.textContent = t;
        }
        // Happy for how long, at 1 Hz, and what it does now.
        const h = kid?.happy;
        const tierNow = this.tierOf.get(type) ?? 1;
        const key = h ? `${Math.ceil(h.left)}|${h.favourite}` : 'none';
        if (key !== happyKey) {
          happyKey = key;
          happy.replaceChildren(
            ...(h
              ? [
                  el('p', 'sheet-body-text kid-card-happy-line', icon('icon_happy', '', 'ui-icon-24'), `Happy · ${formatTimeLeft(h.left)}`),
                  el('p', 'sheet-helper', `Income ×${this.game.happyMultiplier(kid!)} · Counts as Tier ${tierNow + 1} when added to a plot; odds stay capped.`),
                ]
              : [el('p', 'sheet-helper', 'Not happy right now.')]),
          );
        }
        for (const b of [feed, name]) this.setEnabled(b, !gone && !this.readOnly());
        this.setEnabled(pick, !gone && !this.readOnly());
        route?.refresh();
      },
    };
  }

  // --- feeding (§17.2) -------------------------------------------------------------------

  private feedPage(): { update(): void } {
    const s = this.sheet!;
    const type = this.seen!.type;
    const f = this.content.balance.feeding;
    const p = this.content.personality[type];
    const status = this.statusBox();
    const replaces = el('p', 'sheet-helper', 'Replaces the current happy effect.');
    const rows: { food: FoodDef; button: HTMLButtonElement; price: HTMLElement; label: HTMLElement; short: HTMLElement }[] = [];
    const row = (food: FoodDef, relation: string | null, favourite: boolean) => {
      const label = el('span', 'action-label', 'Feed');
      const price = el('span', 'feed-price', `${formatExact(food.price)} Materials`);
      const button = el('button', 'ui-button feed-button', label, price);
      button.type = 'button';
      button.setAttribute('aria-label', `Feed ${food.name}, ${formatExact(food.price)} Materials`);
      button.dataset.cue = 'success';
      button.addEventListener('click', () => {
        if (button.getAttribute('aria-disabled') === 'true') return;
        this.send({ type: 'feed', food: food.id });
      });
      const short = el('p', 'sheet-helper feed-short');
      short.hidden = true;
      const text = el('div', 'feed-text', el('span', 'feed-name', food.name), ...(relation ? [el('span', 'feed-relation', ...(favourite ? [icon('icon_check', '', 'ui-icon-20')] : []), relation)] : []));
      const node = el('div', `feed-row ui-surface${favourite ? ' is-selected' : ''}`, icon(`icon_food_${food.id}`, '', 'ui-icon-32'), text, button, short);
      rows.push({ food, button, price, label, short });
      return node;
    };
    const fav = p ? this.food(p.favouriteFood) : undefined;
    const hated = p ? this.food(p.hatedFood) : undefined;
    const others = f.foods.filter((x) => x.id !== fav?.id && x.id !== hated?.id);
    const plantingLine = () => el('p', 'sheet-helper', 'Planting chances depend on the whole plot. Preview special and rare chances before Start growing.');
    const tierLine = () => el('p', 'sheet-helper', 'Happy kids count as one tier higher when added to a plot.');
    const refused = hated
      ? el(
          'div',
          'feed-row ui-surface is-warning',
          icon(`icon_food_${hated.id}`, '', 'ui-icon-32'),
          el('div', 'feed-text', el('span', 'feed-name', hated.name), el('span', 'feed-relation', icon('icon_warning', '', 'ui-icon-20'), 'Won’t eat this')),
          (() => {
            const b = el('button', 'ui-button feed-button is-disabled', el('span', 'action-label', 'Refused'), el('span', 'feed-price', 'Costs nothing'));
            b.type = 'button';
            b.setAttribute('aria-disabled', 'true');
            b.setAttribute('aria-label', `${hated.name}: refused, costs nothing`);
            return b;
          })(),
          el('p', 'sheet-helper feed-refused', `This kid won’t eat ${hated.name}. Nothing charged.`),
        )
      : null;
    s.body.replaceChildren(
      this.back('card'),
      status.node,
      replaces,
      ...(fav
        ? [
            el('h4', 'kid-card-trait', 'Favourite works best'),
            el('p', 'sheet-helper', `Happy for ${formatDuration(f.favouriteSeconds)}; income ×${f.favouriteMultiplier}.`),
            plantingLine(),
            tierLine(),
            row(fav, 'Favourite', true),
          ]
        : []),
      el('h4', 'kid-card-trait', 'Other foods'),
      el('p', 'sheet-helper', `Happy for ${formatDuration(f.happySeconds)}; income ×${f.happyMultiplier}.`),
      plantingLine(),
      tierLine(),
      ...others.map((x) => row(x, null, false)),
      ...(refused ? [el('h4', 'kid-card-trait', 'Won’t eat this'), refused] : []),
    );
    return {
      update: () => {
        const kid = this.kid();
        s.setTitle(`Feed ${this.displayName()}`);
        s.setSubtitle('Buy one bite for this kid.');
        status.update();
        replaces.hidden = !kid?.happy;
        const have = this.game.state.materials;
        const feeding = this.pending?.type === 'feed' ? this.pending.food : null;
        for (const r of rows) {
          const short = have < r.food.price;
          const label = feeding === r.food.id ? 'Feeding…' : 'Feed';
          if (r.label.textContent !== label) r.label.textContent = label;
          r.short.hidden = !short;
          if (short) r.short.textContent = `Need ${formatExact(Math.ceil(r.food.price - have))} more Materials.`;
          const on = !!kid && !this.readOnly() && !this.pending && !short;
          this.setEnabled(r.button, on);
          r.button.classList.toggle('ui-primary', on);
        }
      },
    };
  }

  // --- naming (§18.2) --------------------------------------------------------------------

  private namePage(): { update(): void } {
    const s = this.sheet!;
    const type = this.seen!.type;
    const n = this.content.balance.naming;
    const status = this.statusBox();
    const input = el('input', 'name-input');
    input.type = 'text';
    input.id = 'kid-name';
    input.placeholder = 'A name for this kid';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.value = this.draft ?? this.seen!.name ?? '';
    const label = el('label', 'name-label', 'Kid name');
    label.htmlFor = input.id;
    const count = el('p', 'sheet-helper name-count');
    const error = el('p', 'sheet-helper name-error');
    error.setAttribute('role', 'alert');
    const holding = el('p', 'sheet-body-text');
    const shortfall = el('p', 'sheet-helper');
    let composing = false;
    input.addEventListener('compositionstart', () => (composing = true));
    input.addEventListener('compositionend', () => {
      composing = false;
      this.draft = input.value;
    });
    input.addEventListener('input', () => {
      this.draft = input.value;
    });
    const save = el('button', 'ui-button ui-primary sheet-action name-save');
    save.type = 'button';
    save.dataset.cue = 'success';
    /** Whether the draft can be saved now: checked at once, never from the last frame's state. */
    const canSave = () => {
      const check = checkName(input.value, n.maxLength);
      return !!this.kid() && !this.readOnly() && !this.pending && check.ok && check.name !== this.seen!.name && this.game.state.materials >= n.price;
    };
    const trySave = () => {
      if (composing || !canSave()) return;
      this.send({ type: 'name', name: input.value });
    };
    save.addEventListener('click', trySave);
    // Enter saves only a valid, changed, affordable name, never mid-composition (§18.2).
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing && !composing) {
        e.preventDefault();
        trySave();
      }
    });
    // A named kid can go back to its type name, free, after saying so.
    const clear = this.button('Use type name · free', 'plot-action-full', () => {
      clear.hidden = true;
      confirm.hidden = false;
      confirm.querySelector<HTMLElement>('.name-confirm-title')?.focus();
    });
    const confirmTitle = el('h4', 'dex-home-confirm-title name-confirm-title', 'Remove this name?');
    confirmTitle.tabIndex = -1;
    const keep = this.button('Keep', 'dex-home-action', () => {
      confirm.hidden = true;
      clear.hidden = false;
      clear.focus();
    });
    const remove = this.button('Remove name', 'ui-primary dex-home-action', () => this.send({ type: 'name', name: null }));
    // Its acceptance has its own tap: no click tap first (as Save name).
    remove.dataset.cue = 'success';
    const confirm = el('div', 'dex-home-confirm ui-surface', confirmTitle, el('p', 'sheet-body-text', `This kid will be called ${this.typeName(type)}.`), keep, remove);
    confirm.hidden = true;
    s.body.replaceChildren(
      this.back('card'),
      status.node,
      el('div', 'kid-card-portrait name-portrait', portrait(kidRig!, type, 64, this.seen!.look)),
      label,
      input,
      count,
      error,
      el('p', 'sheet-helper', 'Names end when this kid fuses or is added to a plot.'),
      el('p', 'sheet-body-text', `Naming costs ${formatExact(n.price)} Materials.`),
      holding,
      shortfall,
      clear,
      confirm,
    );
    s.footer.replaceChildren(save);
    return {
      update: () => {
        const kid = this.kid();
        s.setTitle('Name this kid');
        s.setSubtitle(this.typeName(type));
        status.update();
        const check = checkName(input.value, n.maxLength);
        const length = graphemes(normalizeName(input.value)).length;
        const c = `${length} / ${n.maxLength} characters`;
        if (count.textContent !== c) count.textContent = c;
        const have = this.game.state.materials;
        holding.textContent = `You have ${formatExact(have)} Materials.`;
        shortfall.hidden = have >= n.price;
        shortfall.textContent = have < n.price ? `Need ${formatExact(Math.ceil(n.price - have))} more Materials.` : '';
        // The error says what to change; never during composition.
        const why = composing || check.ok ? '' : check.reason === 'empty' ? 'Enter a name, or keep the type name.' : check.reason === 'long' ? `Choose a name of ${n.maxLength} characters or fewer.` : 'Use letters, numbers, spaces, apostrophes or hyphens.';
        if (error.textContent !== why) error.textContent = why;
        const unchanged = check.ok && check.name === this.seen!.name;
        const saving = this.pending?.type === 'name' && this.pending.name !== null;
        const text = saving ? 'Saving…' : unchanged ? 'Name unchanged' : `Save name · ${formatExact(n.price)} Materials`;
        if (save.textContent !== text) save.textContent = text;
        const ok = canSave();
        this.setEnabled(save, ok);
        save.classList.toggle('ui-primary', ok);
        clear.hidden = clear.hidden || !this.seen!.name;
        if (!this.seen!.name) {
          clear.hidden = true;
          confirm.hidden = true;
        } else if (confirm.hidden && clear.hidden) clear.hidden = false;
        this.setEnabled(remove, !!kid && !this.readOnly() && !this.pending);
        // Gone while typing: stop editing, keep the draft shown, and move focus to the
        // notice first, so it never falls out of the sheet (§18.3; Codex review).
        const typing = document.activeElement === input;
        if (!kid && typing) status.node.focus();
        input.disabled = !kid || this.readOnly();
      },
    };
  }
}
