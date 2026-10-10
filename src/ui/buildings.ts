import { kidRig } from '../content/artData';
import type { BuildingId, Content, KidId } from '../content/types';
import type { MapScene } from '../render/scene';
import type { GameEvent } from '../sim/game';
import type { Arrivals } from './arrivals';
import { el, icon, shortName } from './dom';
import { refusalText } from './feedback';
import { formatCount, formatExact, formatInterval } from './format';
import { GardenPlots, type PlotsSnapshot } from './gardenPlots';
import type { PlantingNotes } from './plantingNotes';
import { LazyPortraits, portrait } from './portrait';
import { SCROLLER_CHANGE, type OpenSheet, type Sheets } from './sheet';

// Garden, Capacity, Spawn bias and Compendium sheets (docs/GUI_MVP.md §§4-6, Codex's design, D-036).
// Each sheet is built once and updated in place every frame, so focus is never lost; the
// command a sheet sent is kept, because refusals carry no context (GUI_MVP §9).

const SUCCESS_MS = 2000;

type Pending =
  | { type: 'upgrade'; building: BuildingId }
  | { type: 'setBias'; kidType: KidId | null }
  | { type: 'respawn'; kidType: KidId; pay: 'materials' | 'potatokens' };

type Pay = 'materials' | 'potatokens';

interface Controller {
  update(): void;
}

interface CompendiumCard {
  node: HTMLElement;
  name: string;
  update(): void;
}

/** What a sheet can be reopened with after an interruption (GUI_MVP §8). */
export interface SheetRestore {
  scrollTop: number;
  search?: string;
  /** The Garden's open plot view and picker draft (GUI_MVP §15). */
  plots?: PlotsSnapshot | null;
}

export class BuildingSheets {
  private pending: Pending | null = null;
  private success: { text: string; until: number } | null = null;
  private refusal: string | null = null;
  private controller: Controller | null = null;
  /** The Compendium's search text while its sheet is open (GUI_MVP §6). */
  private search = '';
  /** The kid a Compendium purchase just brought back: its card says so for 2 s (§6). */
  private arrived: { type: KidId; until: number } | null = null;
  /** The open Compendium list's portraits, composed as they near view. */
  private portraits: LazyPortraits | null = null;
  /** The open Garden's plots (GUI_MVP §15.4). */
  private plots: GardenPlots | null = null;

  constructor(
    private readonly scene: MapScene,
    private readonly content: Content,
    private readonly sheets: Sheets,
    private readonly notes: PlantingNotes,
    private readonly arrivals: Arrivals,
  ) {}

  /** Opens a building's sheet; `restore` brings back where it was (GUI_MVP §8). */
  open(building: BuildingId, launcher: HTMLElement | null, restore?: SheetRestore, onClose?: (replaced: boolean) => void): void {
    this.pending = null;
    this.success = null;
    this.refusal = null;
    this.arrived = null;
    this.search = restore?.search ?? '';
    this.portraits?.dispose();
    this.portraits = null;
    const spec = building === 'bias' ? this.biasSheet() : building === 'compendium' ? this.compendiumSheet() : this.levelSheet(building);
    const sheet = this.sheets.open(
      {
        key: building,
        icon: `icon_${building}`,
        title: spec.title,
        requestedHeight: building === 'capacity' ? 440 : 624,
        update: () => this.controller?.update(),
        onEscape: () => this.plots?.escape() ?? false,
        onClose: (replaced) => {
          this.controller = null;
          this.plots = null;
          this.portraits?.dispose();
          this.portraits = null;
          onClose?.(replaced);
        },
      },
      launcher,
    );
    this.controller = spec.mount(sheet.body, sheet.footer, (t) => sheet.setSubtitle(t), sheet.bar, sheet);
    if (restore?.plots) this.plots?.restore(restore.plots);
    this.controller.update();
    if (restore) sheet.scrollTo(restore.scrollTop);
  }

  /** The Garden's open plot view and draft, for a snapshot (GUI_MVP §8). */
  get plotsSnapshot(): PlotsSnapshot | null {
    return this.plots?.snapshot() ?? null;
  }

  /** Opens the Garden on a plot's detail, with a note (a kid card's accepted Add, GUI_MVP §18.3). */
  openPlotDetail(plot: number, launcher: HTMLElement | null, lines: string[]): void {
    this.open('garden', launcher);
    this.plots?.openDetail(plot, lines);
  }

  /** Opens the Garden on one plot: its picker or its detail (a tap on the map, §15.2). */
  openPlot(plot: number, launcher: HTMLElement | null): void {
    this.open('garden', launcher);
    this.plots?.openPlot(plot);
  }

  /** The open sheet's search text, for a snapshot (GUI_MVP §8). */
  get searchText(): string {
    return this.search;
  }

  /**
   * The Compendium's content inside another sheet: the Potato-Dex's Compendium tab reaches
   * the same locked and built states as the tray (GUI_MVP §§6-7). `dispose` when the tab
   * goes away.
   */
  embedCompendium(body: HTMLElement, footer: HTMLElement, setSubtitle: (t: string) => void, bar: HTMLElement): { update(): void; dispose(): void } {
    this.pending = null;
    this.success = null;
    this.refusal = null;
    this.arrived = null;
    const view = this.compendiumSheet().mount(body, footer, setSubtitle, bar);
    return {
      update: () => view.update(),
      dispose: () => {
        this.portraits?.dispose();
        this.portraits = null;
      },
    };
  }

  /**
   * A sim step's events: completes this sheet's pending command. Returns the refusals it
   * showed in the sheet, so world feedback doesn't repeat them.
   */
  onStep(events: GameEvent[]): GameEvent[] {
    const plots = this.plots?.onStep(events) ?? [];
    if (!this.pending) return plots;
    const p = this.pending;
    const handled: GameEvent[] = [];
    for (const e of events) {
      if (p.type === 'upgrade' && e.type === 'upgraded' && e.building === p.building) {
        this.pending = null;
        this.refusal = null;
        // Building the Compendium needs no message: the sheet swaps to its list (GUI_MVP §6).
        const name = p.building === 'garden' ? 'Garden' : p.building === 'capacity' ? 'Capacity' : p.building === 'bias' ? 'Spawn bias' : null;
        if (name) this.success = { text: `${name} is now level ${e.level}.`, until: performance.now() + SUCCESS_MS };
      } else if (p.type === 'setBias' && e.type === 'biasSet') {
        this.pending = null;
        this.refusal = null;
        const k = e.kidType;
        const text = k === null ? 'Bias cleared.' : this.discovered(k) ? `Bias set to ${shortName(this.name(k))}.` : 'Bias set to this seed.';
        this.success = { text, until: performance.now() + SUCCESS_MS };
      } else if (p.type === 'respawn' && e.type === 'spawned' && e.source === 'compendium') {
        this.pending = null;
        this.refusal = null;
        this.arrived = { type: e.kid.type, until: performance.now() + SUCCESS_MS };
      } else if (e.type === 'rejected' && e.command === p.type) {
        this.pending = null;
        this.success = null;
        const currency = p.type === 'upgrade' ? 'materials' : p.type === 'respawn' ? p.pay : undefined;
        this.refusal = refusalText(e.reason, e.command, currency);
        handled.push(e);
      }
    }
    return [...plots, ...handled];
  }

  private send(cmd: Pending): void {
    // One command at a time; nothing optimistic (GUI_MVP §4).
    if (this.pending) return;
    this.pending = cmd;
    this.refusal = null;
    this.scene.command(cmd);
  }

  private get game() {
    return this.scene.game;
  }

  private name(type: KidId): string {
    return this.content.kids.find((k) => k.id === type)?.name ?? type;
  }

  private discovered(type: KidId): boolean {
    return this.game.state.discoveredKids.includes(type);
  }

  /**
   * The inline status row: a success for 2 s, or the latest refusal; otherwise `standing`
   * (a condition such as a full Garden) when given.
   */
  private statusRow(standing?: () => string): { row: HTMLElement; update(): void } {
    const text = el('span', 'sheet-status-text');
    const mark = el('span', 'sheet-status-icon');
    const row = el('div', 'sheet-status', mark, text);
    row.setAttribute('role', 'status');
    let shown = '';
    return {
      row,
      update: () => {
        const ok = this.success && this.success.until > performance.now() ? this.success.text : '';
        if (!ok) this.success = null;
        const warn = this.refusal ?? (ok ? null : standing?.() || null);
        const msg = warn ?? ok;
        const key = `${warn ? 'r' : 'o'}${msg}`;
        if (key === shown) return;
        shown = key;
        row.hidden = !msg;
        text.textContent = msg;
        mark.replaceChildren(icon(warn ? 'icon_warning' : 'icon_check', '', 'ui-icon-24'));
        // On a short sheet the row may sit below the visible body: bring it into view, or a
        // refusal (or a 2 s success) would go unseen (Codex review, PR #39).
        if (msg) row.scrollIntoView({ block: 'nearest' });
      },
    };
  }

  /** The footer action: a two-line button (label; Materials icon + exact cost). */
  private action(onClick: () => void): { button: HTMLButtonElement; set(label: string, cost: number | null, enabled: boolean, primary: boolean): void } {
    const label = el('span', 'action-label');
    const costText = el('span', '');
    const price = el('span', 'action-price', icon('icon_materials', '', 'ui-icon-18'), costText);
    const button = el('button', 'ui-button sheet-action', label, price);
    button.type = 'button';
    // Its success has its own sound (upgrade): no tap first (Codex review, PR #53).
    button.dataset.cue = 'success';
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-disabled') !== 'true') onClick();
    });
    return {
      button,
      set: (l, cost, enabled, primary) => {
        label.textContent = l;
        price.hidden = cost === null;
        costText.textContent = cost === null ? '' : formatExact(cost);
        button.setAttribute('aria-disabled', String(!enabled));
        button.classList.toggle('is-disabled', !enabled);
        button.classList.toggle('ui-primary', enabled && primary);
        button.setAttribute('aria-label', cost === null ? l : `${l}, ${formatExact(cost)} Materials`);
      },
    };
  }

  /** Garden and Capacity (GUI_MVP §4). */
  private levelSheet(building: 'garden' | 'capacity') {
    const title = building === 'garden' ? 'Garden' : 'Capacity';
    const intro =
      building === 'garden'
        ? ['Kids arrive here on their own.', 'Upgrades make the wait shorter.']
        : ['A little more room to wander.', 'Upgrades add space for more kids.'];
    return {
      title,
      mount: (body: HTMLElement, footer: HTMLElement, setSubtitle: (t: string) => void, _bar: HTMLElement, sheet: OpenSheet): Controller => {
        const nowValue = el('span', 'compare-value');
        const nextLabel = el('span', 'compare-label', 'Next level');
        const nextValue = el('span', 'compare-value');
        const card = el(
          'div',
          'compare ui-surface',
          el('div', 'compare-row', el('span', 'compare-label', 'Now'), nowValue),
          el('div', 'compare-row', nextLabel, nextValue),
        );
        const costText = el('span', '');
        const cost = el('div', 'sheet-cost', icon('icon_materials', '', 'ui-icon-24'), costText);
        const holding = el('p', 'sheet-body-text');
        const helper = el('p', 'sheet-helper');
        const maxed = el('div', 'sheet-cost', icon('icon_check', '', 'ui-icon-24'), 'This building is fully upgraded.');
        const status = this.statusRow();
        const parts = [el('p', 'sheet-body-text sheet-intro', intro[0]!, el('br', ''), intro[1]!), card, cost, holding, helper, maxed, status.row];
        const act = this.action(() => this.send({ type: 'upgrade', building }));
        // The Garden has no footer of its own: its purchase sits in the body, then the
        // plots follow (GUI_MVP §15.4).
        if (building === 'garden') {
          act.button.classList.add('garden-upgrade');
          this.plots = new GardenPlots(this.scene, this.content, sheet, this.notes, [...parts, act.button], this.arrivals);
        } else {
          body.append(...parts);
          footer.append(act.button);
        }
        const plots = this.plots;
        return {
          update: () => {
            plots?.update();
            if (plots && !plots.inOverview) return;
            const g = this.game;
            const b = this.content.balance.buildings[building];
            const level = g.state.buildings[building];
            const price = g.upgradeCost(building);
            const max = price === null;
            const e = this.content.balance.economy;
            setSubtitle(`Level ${level} / ${b.maxLevel}`);
            if (building === 'garden') {
              // The level's schedule, not the tutorial's (D-052): that's what an upgrade changes.
              nowValue.textContent = `Every ${formatInterval(g.gardenInterval(level))}`;
              nextValue.textContent = max ? '' : `Every ${formatInterval(g.gardenInterval(level + 1))}`;
            } else {
              nowValue.textContent = `${g.capacity} kids`;
              nextValue.textContent = max ? '' : `${g.capacity + e.capacityPerLevel} kids`;
            }
            nextLabel.textContent = max ? 'Maximum reached' : 'Next level';
            cost.hidden = max;
            holding.hidden = max;
            helper.hidden = max;
            maxed.hidden = !max;
            const have = g.state.materials;
            if (!max) {
              costText.textContent = `Cost: ${formatExact(price)}`;
              holding.textContent = `You have ${formatExact(have)} Materials.`;
              helper.textContent = have < price ? `Need ${formatExact(Math.ceil(price - have))} more Materials.` : 'Upgrades happen right away.';
            }
            const waiting = this.pending?.type === 'upgrade';
            if (max) act.set('Maximum level reached', null, false, false);
            else act.set(waiting ? 'Upgrading…' : `Upgrade to level ${level + 1}`, price, !waiting && have >= price, true);
            status.update();
          },
        };
      },
    };
  }

  /** Spawn bias: upgrade and seed picker in one sheet (GUI_MVP §5). */
  private biasSheet() {
    return {
      title: 'Spawn bias',
      mount: (body: HTMLElement, footer: HTMLElement, setSubtitle: (t: string) => void): Controller => {
        const nowValue = el('span', 'compare-value');
        const nextLabel = el('span', 'compare-label', 'Next level');
        const nextValue = el('span', 'compare-value');
        const card = el(
          'div',
          'compare compare-short ui-surface',
          el('div', 'compare-row', el('span', 'compare-label', 'Seed weight now'), nowValue),
          el('div', 'compare-row', nextLabel, nextValue),
        );
        const grid = el('div', 'seed-grid');
        // The pool in content order; never hard-coded (GUI_MVP §5).
        const pool = Object.keys(this.content.balance.spawnWeights);
        const cards = pool.map((type, i) => {
          const b = el('button', 'ui-button seed-card');
          b.type = 'button';
          b.setAttribute('role', 'radio');
          b.addEventListener('click', () => this.pick(type));
          grid.append(b);
          return { type, b, ordinal: i + 1, shownAs: '' };
        });
        const none = el('button', 'ui-button seed-none', icon('icon_none', '', 'ui-icon-24'), el('span', '', 'None · normal mix'));
        none.type = 'button';
        none.setAttribute('role', 'radio');
        none.addEventListener('click', () => this.pick(null));
        // One radio group, seeds then None: a single tab stop (the selected choice), and the
        // arrow keys move and select as native radios do (Codex review, PR #39).
        const radios = [...cards.map((c) => ({ el: c.b, value: c.type as KidId | null })), { el: none, value: null as KidId | null }];
        for (const [i, r] of radios.entries()) {
          r.el.addEventListener('keydown', (e) => {
            const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
            const to = e.key === 'Home' ? 0 : e.key === 'End' ? radios.length - 1 : step ? (i + step + radios.length) % radios.length : -1;
            if (to < 0) return;
            e.preventDefault();
            radios[to]!.el.focus();
            this.pick(radios[to]!.value);
          });
        }
        const choice = el('p', 'sheet-helper');
        const status = this.statusRow();
        // One labelled radio group holds every choice, None included (Codex review, PR #39).
        const group = el('div', 'seed-group', grid, none);
        group.setAttribute('role', 'radiogroup');
        group.setAttribute('aria-label', 'Choose a seed');
        body.append(card, el('p', 'sheet-helper', 'Favours one seed; other kids can still arrive.'), el('h3', 'sheet-section', 'Choose a seed'), group, choice, status.row);
        const short = el('p', 'sheet-helper footer-helper');
        const act = this.action(() => this.send({ type: 'upgrade', building: 'bias' }));
        footer.append(short, act.button);
        return {
          update: () => {
            const g = this.game;
            const level = g.state.buildings.bias;
            const max = this.content.balance.buildings.bias.maxLevel;
            const per = this.content.balance.economy.biasWeightPerLevel;
            const price = g.upgradeCost('bias');
            const mult = (l: number) => `×${(1 + per * l).toFixed(1)}`;
            setSubtitle(`Level ${level} / ${max}`);
            nowValue.textContent = level === 0 ? 'Not built' : mult(level);
            nextLabel.textContent = price === null ? 'Maximum reached' : 'Next level';
            nextValue.textContent = price === null ? '' : mult(level + 1);
            const built = level > 0;
            const target = g.state.biasTarget;
            const busy = this.pending !== null;
            for (const c of cards) {
              const known = this.discovered(c.type);
              const want = known ? 'k' : 'u';
              if (c.shownAs !== want) {
                c.shownAs = want;
                // An undiscovered seed shows only the packet: no name, tier or costume.
                c.b.replaceChildren(
                  known ? portrait(kidRig!, c.type, 48) : icon('icon_unknown', '', 'ui-icon-48'),
                  el('span', 'seed-name', known ? shortName(this.name(c.type)) : 'Unknown seed'),
                  el('span', 'seed-check'),
                );
              }
              const selected = target === c.type;
              c.b.setAttribute('aria-checked', String(selected));
              c.b.classList.toggle('is-selected', selected);
              (c.b.querySelector('.seed-check') as HTMLElement).replaceChildren(...(selected ? [icon('icon_check', '', 'ui-icon-20')] : []));
              const label = known ? this.name(c.type) : `Unknown seed ${c.ordinal}`;
              c.b.setAttribute('aria-label', selected ? `${label}, selected` : label);
              const enabled = built && !busy;
              c.b.setAttribute('aria-disabled', String(!enabled));
              c.b.classList.toggle('is-disabled', !built);
            }
            const stop = radios.findIndex((r) => r.value === target);
            for (const [i, r] of radios.entries()) r.el.tabIndex = i === (stop < 0 ? 0 : stop) ? 0 : -1;
            none.setAttribute('aria-checked', String(target === null));
            none.classList.toggle('is-selected', target === null);
            none.setAttribute('aria-disabled', String(!built || busy));
            none.classList.toggle('is-disabled', !built);
            choice.textContent = !built
              ? 'Build Spawn bias to choose a seed.'
              : target === null
                ? 'No seed favoured. All weights are normal.'
                : this.discovered(target)
                  ? `Selected seed: ${shortName(this.name(target))}. Weight ${mult(level)}.`
                  : 'An unknown seed is favoured.';
            const have = g.state.materials;
            const waiting = this.pending?.type === 'upgrade';
            short.hidden = price === null || have >= price;
            if (price !== null && have < price) short.textContent = `Need ${formatExact(Math.ceil(price - have))} more Materials.`;
            if (price === null) act.set('Maximum level reached', null, false, false);
            else act.set(waiting ? 'Upgrading…' : level === 0 ? 'Build Spawn bias' : `Upgrade bias to level ${level + 1}`, price, !waiting && have >= price, true);
            status.update();
          },
        };
      },
    };
  }

  /** Compendium: build it, then bring back any discovered kid for either currency (GUI_MVP §6). */
  private compendiumSheet() {
    return {
      title: 'Compendium',
      mount: (body: HTMLElement, footer: HTMLElement, setSubtitle: (t: string) => void, bar: HTMLElement): Controller => {
        let view: Controller | null = null;
        let built: boolean | null = null;
        return {
          update: () => {
            const level = this.game.state.buildings.compendium;
            const max = this.content.balance.buildings.compendium.maxLevel;
            const now = level >= 1;
            if (now !== built) {
              // Building it swaps straight to the list, scrolled to the top: no reopening.
              const hadFocus = footer.contains(document.activeElement);
              built = now;
              bar.replaceChildren();
              body.replaceChildren();
              footer.replaceChildren();
              view = now ? this.compendiumList(body, bar) : this.compendiumLocked(body, footer);
              body.scrollTop = 0;
              // The Build button is gone: keep focus in the sheet, on its heading.
              if (hadFocus) body.closest('.sheet')?.querySelector<HTMLElement>('.sheet-title')?.focus({ preventScroll: true });
            }
            setSubtitle(level >= max ? `Level ${level} / ${max} · Fully built` : `Level ${level} / ${max}`);
            view!.update();
          },
        };
      },
    };
  }

  /** Not built yet: what it does, its price and the Build button (GUI_MVP §6). */
  private compendiumLocked(body: HTMLElement, footer: HTMLElement): Controller {
    const card = el(
      'div',
      'compare ui-surface',
      el('div', 'compare-row', el('span', 'compare-label', 'Now'), el('span', 'compare-value', 'Not built')),
      el('div', 'compare-row', el('span', 'compare-label', 'After building'), el('span', 'compare-value compare-value-small', 'Respawn known kids')),
    );
    const costText = el('span', '');
    const holding = el('p', 'sheet-body-text');
    const helper = el('p', 'sheet-helper');
    const status = this.statusRow();
    body.append(
      el('div', 'comp-lock', icon('icon_lock', '', 'ui-icon-48')),
      el('h3', 'sheet-section comp-centred', 'Keep a familiar kid close.'),
      el('p', 'sheet-body-text', 'Build the Compendium to bring back kids you’ve already discovered.'),
      card,
      el('div', 'sheet-cost', icon('icon_materials', '', 'ui-icon-24'), costText),
      holding,
      helper,
      status.row,
    );
    const act = this.action(() => this.send({ type: 'upgrade', building: 'compendium' }));
    footer.append(act.button);
    return {
      update: () => {
        const price = this.game.upgradeCost('compendium') ?? 0;
        const have = this.game.state.materials;
        costText.textContent = `Cost: ${formatExact(price)} Materials`;
        holding.textContent = `You have ${formatExact(have)} Materials.`;
        helper.textContent = have < price ? `Need ${formatExact(Math.ceil(price - have))} more Materials.` : 'Building happens right away.';
        const waiting = this.pending?.type === 'upgrade';
        act.set(waiting ? 'Building…' : 'Build Compendium', price, !waiting && have >= price, true);
        status.update();
      },
    };
  }

  /**
   * Built: balances and the payment message stay fixed; the search field, count and one
   * card per discovered kid scroll (GUI_MVP §6). Cards are added as kids are discovered,
   * never rebuilt, so focus and scroll hold; portraits compose as they scroll into view.
   */
  private compendiumList(body: HTMLElement, bar: HTMLElement): Controller {
    const materials = el('span', 'comp-balance');
    const potatokens = el('span', 'comp-balance');
    const wallet = el(
      'div',
      'comp-toolbar',
      el('span', 'comp-wallet', icon('icon_materials', '', 'ui-icon-24'), materials),
      el('span', 'comp-wallet', icon('icon_potatokens', '', 'ui-icon-24'), potatokens),
    );
    const status = this.statusRow(() => (this.full ? refusalText('full') : ''));
    bar.append(wallet, el('p', 'comp-message', 'Choose how to pay. Either price buys one kid.'), status.row);

    const field = el('input', 'comp-search');
    field.type = 'search';
    field.id = 'compendium-search';
    field.autocomplete = 'off';
    field.placeholder = 'Search discovered names';
    field.value = this.search;
    const label = el('label', 'comp-search-label', 'Find a discovered kid');
    label.htmlFor = field.id;
    const count = el('p', 'sheet-helper');
    const empty = el('p', 'sheet-helper');
    const list = el('div', 'comp-list');
    body.append(label, field, count, empty, list);

    const cards = new Map<KidId, CompendiumCard>();
    let known = -1;
    this.portraits?.dispose();
    this.portraits = new LazyPortraits(kidRig!, 64);
    body.closest('.sheet')?.addEventListener(SCROLLER_CHANGE, () => this.portraits?.watch(this.sheets.scrollRoot));
    const filter = () => {
      const q = this.search.trim().toLowerCase();
      let shown = 0;
      for (const c of cards.values()) {
        c.node.hidden = q !== '' && !c.name.toLowerCase().includes(q);
        if (!c.node.hidden) shown++;
      }
      count.textContent = cards.size === 1 ? '1 discovered kid' : `${cards.size} discovered kids`;
      empty.hidden = shown > 0;
      empty.textContent = cards.size === 0 ? 'No kids discovered yet.' : 'No discovered kids match.';
    };
    field.addEventListener('input', () => {
      this.search = field.value;
      filter();
    });
    return {
      update: () => {
        const g = this.game;
        materials.textContent = formatCount(g.state.materials);
        materials.parentElement!.setAttribute('aria-label', `${formatExact(g.state.materials)} Materials`);
        potatokens.textContent = formatCount(g.state.potatokens);
        potatokens.parentElement!.setAttribute('aria-label', `${formatExact(g.state.potatokens)} Potatokens`);
        // New discoveries join in roster order, inserted around the existing cards.
        if (g.state.discoveredKids.length !== known) {
          known = g.state.discoveredKids.length;
          const discovered = new Set(g.state.discoveredKids);
          let prev: HTMLElement | null = null;
          for (const kid of this.content.kids) {
            // Ordinary kids only: specials and rares are never sold (D-063, D-072; GUI_MVP §16.4).
            if (!discovered.has(kid.id) || kid.special || kid.rare) continue;
            let c = cards.get(kid.id);
            if (!c) {
              c = this.compendiumCard(kid.id);
              cards.set(kid.id, c);
              if (prev) prev.after(c.node);
              else list.prepend(c.node);
            }
            prev = c.node;
          }
          filter();
        }
        for (const c of cards.values()) c.update();
        this.portraits?.watch(this.sheets.scrollRoot);
        status.update();
      },
    };
  }

  private get full(): boolean {
    return this.game.state.world.kids.length >= this.game.capacity;
  }

  /** One discovered kid: portrait, name, tier and the two alternative prices (GUI_MVP §6). */
  private compendiumCard(type: KidId): CompendiumCard {
    const name = this.name(type);
    const tier = this.content.kids.find((k) => k.id === type)?.tier ?? 1;
    const buy = (pay: Pay) => {
      const price = el('span', '');
      const b = el(
        'button',
        'ui-button comp-buy',
        el('span', 'action-label', 'Bring back'),
        el('span', 'action-price', icon(pay === 'materials' ? 'icon_materials' : 'icon_potatokens', '', 'ui-icon-18'), price),
      );
      b.type = 'button';
      b.dataset.cue = 'success'; // the arrival's spawn cue is its sound
      b.addEventListener('click', () => {
        if (b.getAttribute('aria-disabled') !== 'true') this.send({ type: 'respawn', kidType: type, pay });
      });
      return { b, price, pay };
    };
    const buttons = [buy('materials'), buy('potatokens')];
    const arrived = el('div', 'comp-arrived', icon('icon_check', '', 'ui-icon-24'), 'Kid arrived at the Garden.');
    arrived.setAttribute('role', 'status');
    arrived.hidden = true;
    const node = el(
      'article',
      'comp-card ui-surface',
      this.portraits!.add(type),
      el('div', 'comp-title', el('span', 'comp-name', name), el('span', 'tier comp-tier', icon(`badge_tier_${tier}`, '', 'ui-icon-24'), `Tier ${tier}`)),
      el('div', 'comp-buys', ...buttons.map((x) => x.b)),
      arrived,
    );
    node.setAttribute('aria-label', name);
    let shown = '';
    return {
      node,
      name,
      update: () => {
        const g = this.game;
        const cost = g.respawnCost(type);
        const full = this.full;
        const busy = this.pending !== null;
        const just = this.arrived?.type === type && this.arrived.until > performance.now();
        const afford = { materials: g.state.materials >= cost.materials, potatokens: g.state.potatokens >= cost.potatokens };
        const key = `${cost.materials}|${cost.potatokens}|${full}|${busy}|${afford.materials}|${afford.potatokens}|${just}`;
        if (key === shown) return;
        shown = key;
        arrived.hidden = !just;
        for (const { b, price, pay } of buttons) {
          const p = cost[pay];
          const currency = pay === 'materials' ? 'Materials' : 'Potatokens';
          price.textContent = formatExact(p);
          // Full disables both; an unaffordable price disables only its own button.
          const reason = full ? refusalText('full') : afford[pay] ? '' : refusalText('cost', 'respawn', pay);
          b.setAttribute('aria-disabled', String(reason !== '' || busy));
          b.classList.toggle('is-disabled', reason !== '');
          b.classList.toggle('is-full', full);
          b.setAttribute('aria-label', `Bring back ${name} for ${formatExact(p)} ${currency}${reason ? `: ${reason}` : ''}`);
        }
      },
    };
  }

  /** Bias choice: the UI never sends a predicted refusal (level 0) or a no-op. */
  private pick(type: KidId | null): void {
    if (this.game.state.buildings.bias < 1 || this.pending || this.game.state.biasTarget === type) return;
    this.send({ type: 'setBias', kidType: type });
  }
}
