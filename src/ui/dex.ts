import { personalityBlocks } from './kidCard';
import { kidRig } from '../content/artData';
import type { Content, KidId, RecipeDef } from '../content/types';
import { pairKey } from '../content/validate';
import type { MapScene } from '../render/scene';
import type { BuildingSheets } from './buildings';
import { el, icon, shortName } from './dom';
import { homeSection, type HomeSection } from './dexHome';
import { HomeFeed } from './homeFeed';
import { formatRate } from './format';
import { LazyPortraits, portrait } from './portrait';
import type { GameEvent } from '../sim/game';
import type { PlantingNotes } from './plantingNotes';
import { SCROLLER_CHANGE, type OpenSheet, type Sheets } from './sheet';

// The Potato-Dex (docs/GUI_MVP.md §7, Codex's design, D-036): Kids, Recipes and the
// Compendium in one modal. Undiscovered kids and recipes are uniform packets: nothing in
// them (tier, name, order mark or parent) gives away what they are.

type Tab = 'kids' | 'recipes' | 'compendium';

const TABS: [Tab, string][] = [
  ['kids', 'Kids'],
  ['recipes', 'Recipes'],
  ['compendium', 'Compendium'],
];

interface Shown {
  sheet: OpenSheet;
  tabs: Map<Tab, HTMLButtonElement>;
  /** The tab's own fixed content, below the tab strip (the Compendium's balances). */
  tabBar: HTMLElement;
  kids: KidsPanel | null;
  recipes: RecipesPanel | null;
  compendium: { update(): void; dispose(): void } | null;
  panel: HTMLElement;
}

interface KidsPanel {
  root: HTMLElement;
  grid: HTMLElement;
  detail: HTMLElement;
  /** The kid whose detail is showing, if any, and its recipe portraits. */
  showing: KidId | null;
  detailPortraits: LazyPortraits | null;
  /** Rebuilds the detail's found recipes; the recipe count it last showed. */
  refreshFound: (() => void) | null;
  foundShown: number;
  /** Send home for this kid's live copies (§13.4). */
  home: HomeSection | null;
  /** Redraws the detail's rare variant rows; the variants it last showed. */
  refreshRare: (() => void) | null;
  rareShown: string;
  update(): void;
  dispose(): void;
}

interface RecipesPanel {
  root: HTMLElement;
  update(): void;
  dispose(): void;
}

export class Dex {
  private tab: Tab = 'kids';
  private filter = '';
  private readonly scroll: Record<Tab, number> = { kids: 0, recipes: 0, compendium: 0 };
  private shown: Shown | null = null;
  /** The kid detail that was open, and its scroll: reopening returns to it (§§7-8). */
  private detail: { kid: KidId; scroll: number } | null = null;
  /** Inconsistent saves are reported once, never shown (GUI_MVP §7). */
  private warned = new Set<string>();

  constructor(
    private readonly scene: MapScene,
    private readonly content: Content,
    private readonly sheets: Sheets,
    private readonly buildings: BuildingSheets,
    notes: PlantingNotes,
    private readonly readOnly: () => boolean = () => false,
  ) {
    this.feed = new HomeFeed(scene, content, notes);
  }

  /** Sends made from the Dex and their messages, kept across details (Codex review, PR #54). */
  private readonly feed: HomeFeed;

  /** A step's events: the Dex answers its own sends, open or not (no world card for them). */
  onStep(events: GameEvent[]): GameEvent[] {
    return this.feed.onStep(events);
  }

  get isOpen(): boolean {
    return this.shown !== null;
  }

  /**
   * Opens the Dex where the player left it (tab, filter, scroll), or on `kid`'s detail when
   * a discovery card asks for it (GUI_MVP §§7, 9).
   */
  open(launcher: HTMLElement | null, kid?: KidId): void {
    this.feed.active = true;
    if (kid !== undefined) this.tab = 'kids';
    const tabs = new Map<Tab, HTMLButtonElement>();
    const strip = el('div', 'dex-tabs');
    strip.setAttribute('role', 'tablist');
    strip.setAttribute('aria-label', 'Potato-Dex sections');
    const sheet = this.sheets.open(
      {
        key: 'dex',
        icon: 'icon_dex',
        title: 'Potato-Dex',
        requestedHeight: 624,
        update: () => this.update(),
        onEscape: () => this.shown?.kids?.home?.collapse() ?? false,
        onClose: () => this.closed(),
      },
      launcher,
    );
    for (const [i, [tab, label]] of TABS.entries()) {
      const b = el('button', 'ui-button dex-tab', label);
      b.type = 'button';
      b.id = `dex-tab-${tab}`;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', 'dex-panel');
      b.addEventListener('click', () => this.select(tab));
      // Arrows move between tabs and select (one tab stop for the strip).
      b.addEventListener('keydown', (e) => {
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        const to = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : step ? (i + step + TABS.length) % TABS.length : -1;
        if (to < 0) return;
        e.preventDefault();
        const next = TABS[to]![0];
        this.select(next);
        this.shown?.tabs.get(next)?.focus();
      });
      tabs.set(tab, b);
      strip.append(b);
    }
    const tabBar = el('div', 'dex-tab-bar');
    sheet.bar.append(strip, tabBar);
    const panel = el('div', 'dex-panel');
    panel.id = 'dex-panel';
    panel.setAttribute('role', 'tabpanel');
    sheet.body.append(panel);
    // Lazy portraits re-target as soon as what scrolls changes.
    sheet.body.closest('.sheet')?.addEventListener(SCROLLER_CHANGE, () => this.update());
    this.shown = { sheet, tabs, tabBar, kids: null, recipes: null, compendium: null, panel };
    this.render(kid);
  }

  /** Switches tab, keeping each list's place (GUI_MVP §7). */
  private select(tab: Tab): void {
    if (!this.shown || tab === this.tab) return;
    this.remember();
    this.tab = tab;
    this.render();
  }

  /** Records the current list's scroll, for when its tab (or the Dex) comes back. */
  private remember(): void {
    const s = this.shown;
    if (!s) return;
    const at = this.sheets.snapshot()?.scrollTop ?? 0;
    if (this.tab === 'kids' && s.kids?.showing) this.detail = { kid: s.kids.showing, scroll: at };
    else this.scroll[this.tab] = at;
  }

  private render(kid?: KidId): void {
    const s = this.shown!;
    for (const [tab, b] of s.tabs) {
      const on = tab === this.tab;
      b.setAttribute('aria-selected', String(on));
      b.classList.toggle('is-selected', on);
      b.tabIndex = on ? 0 : -1;
    }
    s.panel.setAttribute('aria-labelledby', `dex-tab-${this.tab}`);
    s.kids?.dispose();
    s.recipes?.dispose();
    s.compendium?.dispose();
    s.kids = s.recipes = s.compendium = null;
    s.panel.replaceChildren();
    s.tabBar.replaceChildren();
    s.sheet.footer.replaceChildren();
    if (this.tab === 'kids') {
      s.kids = this.kidsPanel();
      s.panel.append(s.kids.root);
      s.kids.update();
      // The grid's place first, so a detail opened over it returns there.
      s.sheet.scrollTo(this.scroll.kids);
      // A discovery card's kid, else the detail that was open (e.g. before the offline
      // summary interrupted it; Codex review, PR #43).
      const back = kid !== undefined ? { kid, scroll: 0 } : this.detail;
      if (back && this.discovered(back.kid)) {
        this.showDetail(back.kid);
        s.sheet.scrollTo(back.scroll);
      }
    } else if (this.tab === 'recipes') {
      s.recipes = this.recipesPanel();
      s.panel.append(s.recipes.root);
      s.recipes.update();
      s.sheet.scrollTo(this.scroll.recipes);
    } else {
      s.compendium = this.buildings.embedCompendium(s.panel, s.sheet.footer, (t) => s.sheet.setSubtitle(t), s.tabBar);
      s.compendium.update();
      // Back where it was, e.g. after the offline summary (Codex review, PR #43).
      s.sheet.scrollTo(this.scroll.compendium);
    }
    this.update();
  }

  private update(): void {
    const s = this.shown;
    if (!s) return;
    // Kept every frame: by the time a close is reported, the sheet's scroll is gone.
    this.remember();
    if (this.tab === 'compendium') {
      // The Compendium tab keeps the building's own subtitle (GUI_MVP §6).
      s.compendium?.update();
      return;
    }
    s.sheet.setSubtitle(`${this.game.state.discoveredKids.length} / ${this.content.kids.length} discovered`);
    s.kids?.update();
    s.recipes?.update();
  }

  private closed(): void {
    this.feed.active = false;
    this.feed.clear();
    const s = this.shown;
    this.shown = null;
    s?.kids?.dispose();
    s?.recipes?.dispose();
    s?.compendium?.dispose();
  }

  private get game() {
    return this.scene.game;
  }

  private discovered(type: KidId): boolean {
    return this.game.state.discoveredKids.includes(type);
  }

  private kid(type: KidId) {
    return this.content.kids.find((k) => k.id === type)!;
  }

  private tierMark(tier: number, size: 20 | 24, text: string): HTMLElement {
    return el('span', `tier dex-tier-${size}`, icon(`badge_tier_${tier}`, '', `ui-icon-${size}`), text);
  }

  // --- Kids -------------------------------------------------------------------------------

  /**
   * The whole roster in content order: discovered kids as buttons, the rest as uniform
   * packets. A search shows matching discovered kids only (GUI_MVP §7).
   */
  private kidsPanel(): KidsPanel {
    const portraits = new LazyPortraits(kidRig!, 80);
    const field = el('input', 'comp-search');
    field.type = 'search';
    field.id = 'dex-search';
    field.autocomplete = 'off';
    field.placeholder = 'Search discovered names';
    field.value = this.filter;
    const label = el('label', 'comp-search-label', 'Find a discovered kid');
    label.htmlFor = field.id;
    const summary = el('p', 'sheet-helper');
    const empty = el('p', 'sheet-helper', 'No discovered kids match.');
    const grid = el('div', 'dex-grid');
    grid.setAttribute('role', 'list');
    grid.setAttribute('aria-label', 'Kids');
    const search = el('div', 'dex-search', label, field, summary, empty);
    const detail = el('div', 'dex-detail');
    detail.hidden = true;
    const root = el('div', 'dex-kids', search, grid, detail);

    // Cells are kept and reordered, never rebuilt: discovered kids in roster order, then
    // identical packets. Interleaving packets in roster order would give away each unknown
    // kid's tier by its position (GUI_MVP §7).
    const knownCells = new Map<KidId, { cell: HTMLElement; name: string }>();
    let rareTiles = '';
    const unknownCells: HTMLElement[] = [];
    const cell = (node: HTMLElement) => {
      const item = el('div', 'dex-cell', node);
      item.setAttribute('role', 'listitem');
      return item;
    };
    let known = -1;
    let unknown = 0;
    const filter = () => {
      const q = this.filter.trim().toLowerCase();
      let matches = 0;
      // A search never matches an undiscovered kid, by any name or id.
      for (const c of unknownCells) c.hidden = q !== '';
      for (const t of knownCells.values()) {
        t.cell.hidden = q !== '' && !t.name.toLowerCase().includes(q);
        if (!t.cell.hidden) matches++;
      }
      summary.hidden = q === '' || unknown === 0;
      summary.textContent = `${unknown} still undiscovered`;
      empty.hidden = q === '' || matches > 0;
    };
    field.addEventListener('input', () => {
      this.filter = field.value;
      filter();
    });

    const panel: KidsPanel = {
      root,
      grid,
      detail,
      showing: null,
      detailPortraits: null,
      refreshFound: null,
      foundShown: -1,
      home: null,
      refreshRare: null,
      rareShown: '',
      update: () => {
        panel.home?.update();
        // A variant found while the Dex is open: its tile's strip and the open detail follow.
        const rareKey = JSON.stringify(this.game.state.discoveredVariants);
        if (rareKey !== rareTiles) {
          rareTiles = rareKey;
          for (const [type, c] of knownCells) this.setRareStrip(c.cell, type);
        }
        if (panel.showing && panel.rareShown !== rareKey) panel.refreshRare?.();
        // Discoveries made under the open detail join its list (Codex review, PR #43).
        if (panel.showing && panel.foundShown !== this.game.state.discoveredRecipes.length) panel.refreshFound?.();
        // Five columns on a wide compact sheet, three from 360 px, else two (GUI_MVP §7).
        const sheetEl = root.closest('.sheet') as HTMLElement | null;
        const width = sheetEl?.getBoundingClientRect().width ?? 0;
        grid.dataset.cols = sheetEl?.dataset.compact === 'true' && width >= 560 ? '5' : width >= 360 ? '3' : '2';
        portraits.watch(this.sheets.scrollRoot);
        panel.detailPortraits?.watch(this.sheets.scrollRoot);
        const n = this.game.state.discoveredKids.length;
        if (n === known) return;
        known = n;
        const order: HTMLElement[] = [];
        for (const kid of this.content.kids) {
          if (!this.discovered(kid.id)) continue;
          let c = knownCells.get(kid.id);
          if (!c) {
            c = { cell: cell(this.kidTile(kid.id, portraits)), name: kid.name };
            knownCells.set(kid.id, c);
          }
          order.push(c.cell);
        }
        unknown = this.content.kids.length - order.length;
        while (unknownCells.length < unknown) unknownCells.push(cell(this.unknownTile()));
        unknownCells.length = unknown;
        // Reordering moves nodes, which drops focus: put it back.
        const focused = document.activeElement as HTMLElement | null;
        grid.replaceChildren(...order, ...unknownCells);
        if (focused && grid.contains(focused)) focused.focus({ preventScroll: true });
        filter();
      },
      dispose: () => {
        portraits.dispose();
        panel.detailPortraits?.dispose();
        panel.home?.dispose();
      },
    };
    return panel;
  }

  private kidTile(type: KidId, portraits: LazyPortraits): HTMLElement {
    const k = this.kid(type);
    const b = el(
      'button',
      'ui-button dex-tile',
      portraits.add(type),
      el('span', 'dex-tile-name', shortName(k.name)),
      this.tierMark(k.tier, 20, `T${k.tier}`),
      el('span', 'dex-tile-rare'),
    );
    b.type = 'button';
    b.dataset.kid = type;
    b.addEventListener('click', () => this.showDetail(type));
    this.setRareStrip(b, type);
    return b;
  }

  /** The variants found on a type, in the Dex's order (D-062). */
  private variantsFound(type: KidId): string[] {
    const found = this.game.state.discoveredVariants[type] ?? [];
    return this.content.balance.planting.rareVariants.filter((v) => found.includes(v));
  }

  /** A tile's one-line rare progress, "Rare {found} / 10", and its full label (GUI_MVP §16.4). */
  private setRareStrip(node: HTMLElement, type: KidId): void {
    const tile = node.classList.contains('dex-tile') ? node : node.querySelector<HTMLElement>('.dex-tile');
    const strip = tile?.querySelector<HTMLElement>('.dex-tile-rare');
    if (!tile || !strip) return;
    const k = this.kid(type);
    const n = this.variantsFound(type).length;
    const all = this.content.balance.planting.rareVariants.length;
    strip.textContent = `Rare ${n} / ${all}`;
    tile.setAttribute('aria-label', `${k.name}, Tier ${k.tier}, ${n} of ${all} rare variants found`);
  }

  /** "Rare variants": every variant in order, found or not (GUI_MVP §16.4). */
  private rareRows(type: KidId): HTMLElement {
    const found = this.variantsFound(type);
    const mult = this.content.balance.planting.rareIncomeMultiplier;
    const list = el('div', 'dex-rare-rows');
    list.setAttribute('role', 'list');
    for (const v of this.content.balance.planting.rareVariants) {
      const has = found.includes(v);
      const label = `${v[0]!.toUpperCase()}${v.slice(1)}`;
      // Unfound: a plain square, never a faint copy of the variant's icon.
      const mark = has ? icon(`icon_variant_${v}`, '', 'ui-icon-24') : el('span', 'dex-rare-unfound');
      const status = has ? el('span', 'dex-rare-status', icon('icon_check', '', 'ui-icon-20'), 'Found') : el('span', 'dex-rare-status', el('span', 'dex-rare-empty'), 'Not found');
      const text = el('span', 'dex-rare-text', el('span', 'dex-rare-label', label), ...(has ? [el('span', 'sheet-helper', `Materials ×${mult}`)] : []));
      const row = el('div', 'dex-rare-row', mark, text, status);
      row.setAttribute('role', 'listitem');
      row.setAttribute('aria-label', has ? `${label}: found. Materials ×${mult}` : `${label}: not found`);
      list.append(row);
    }
    return list;
  }

  /** The same packet for every unknown kid: no tier, number or name (GUI_MVP §7). */
  private unknownTile(): HTMLElement {
    const t = el('div', 'dex-tile dex-unknown', icon('icon_unknown', '', 'ui-icon-80'), el('span', 'dex-tile-name', 'Undiscovered'));
    t.setAttribute('aria-label', 'Undiscovered kid');
    return t;
  }

  /** A discovered kid's detail, in place of the grid; Back returns to its tile (§7). */
  private showDetail(type: KidId): void {
    const p = this.shown?.kids;
    if (!p) return;
    if (!p.showing) this.scroll.kids = this.sheets.snapshot()?.scrollTop ?? 0;
    p.showing = type;
    const k = this.kid(type);
    const back = el('button', 'ui-button dex-back', 'Back to kids');
    back.type = 'button';
    back.addEventListener('click', () => this.hideDetail());
    const foundBox = el('div', 'dex-found');
    p.refreshFound = () => {
      p.foundShown = this.game.state.discoveredRecipes.length;
      const found = this.content.recipes.filter((r) => this.revealed(r) && (r.a === type || r.b === type || r.result === type));
      p.detailPortraits?.dispose();
      const portraits = new LazyPortraits(kidRig!, 48);
      p.detailPortraits = portraits;
      const list = el('div', 'dex-recipes');
      for (const r of found) list.append(this.recipeRow(r, portraits));
      foundBox.replaceChildren(found.length ? list : el('p', 'sheet-helper', 'No recipes found for this kid yet.'));
      portraits.watch(this.sheets.scrollRoot);
    };
    p.refreshFound();
    const rareBox = el('div', 'dex-rare');
    p.refreshRare = () => {
      p.rareShown = JSON.stringify(this.game.state.discoveredVariants);
      rareBox.replaceChildren(this.rareRows(type));
    };
    p.refreshRare();
    p.home?.dispose();
    p.home = homeSection(type, this.content, this.scene, this.feed, this.readOnly);
    const name = el('h3', 'dex-detail-name', k.name);
    p.detail.replaceChildren(
      back,
      el('div', 'dex-detail-portrait', portrait(kidRig!, type, 96)),
      name,
      el('div', 'dex-detail-tier', this.tierMark(k.tier, 24, `Tier ${k.tier}`)),
      // Per hour: at the slow pacing (D-052) a per-second rate would round to 0.
      el('p', 'sheet-helper', `Earns ${formatRate(this.game.incomeOf(type) * 3600)} Materials / h`),
      el('h3', 'sheet-section dex-rare-heading', 'Rare variants'),
      rareBox,
      // The type's personality, as on a kid's card (GUI_MVP §18.1); never one kid's name or mood.
      el('section', 'dex-personality', ...personalityBlocks(this.content, type)),
      p.home.root,
      el('h3', 'sheet-section', 'Found recipes'),
      foundBox,
    );
    for (const node of [p.root.querySelector('.dex-search') as HTMLElement, p.grid]) node.hidden = true;
    p.detail.hidden = false;
    this.shown!.sheet.scrollTo(0);
    back.focus({ preventScroll: true });
    // Only now, mounted and scrolled: a waiting message can be drawn and brought into view
    // (Codex review, PR #54).
    p.home.update();
  }

  private hideDetail(): void {
    const p = this.shown?.kids;
    if (!p?.showing) return;
    const type = p.showing;
    p.showing = null;
    this.detail = null;
    p.refreshFound = null;
    p.refreshRare = null;
    p.home?.dispose();
    p.home = null;
    p.detailPortraits?.dispose();
    p.detailPortraits = null;
    p.detail.hidden = true;
    p.detail.replaceChildren();
    for (const node of [p.root.querySelector('.dex-search') as HTMLElement, p.grid]) node.hidden = false;
    this.shown!.sheet.scrollTo(this.scroll.kids);
    // Its tile, unless the kept search hides it: then the search field, so focus stays in
    // the sheet (Codex review, PR #43).
    const tile = p.grid.querySelector<HTMLElement>(`[data-kid="${type}"]`);
    const target = tile && !tile.closest<HTMLElement>('.dex-cell')?.hidden ? tile : p.root.querySelector<HTMLElement>('#dex-search');
    target?.focus({ preventScroll: true });
  }

  // --- Recipes ----------------------------------------------------------------------------

  /**
   * Found recipes in content order, then one generic card per recipe still unknown. A
   * recipe is revealed by its pair key, and only if every kid in it is discovered.
   */
  private recipesPanel(): RecipesPanel {
    let portraits = new LazyPortraits(kidRig!, 48);
    const progress = el('p', 'sheet-helper dex-progress');
    const list = el('div', 'dex-recipes');
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', 'Recipes');
    const root = el('div', 'dex-recipes-panel', progress, list);
    let shownKey = '';
    return {
      root,
      update: () => {
        portraits.watch(this.sheets.scrollRoot);
        const s = this.game.state;
        const key = `${s.discoveredRecipes.length}|${s.discoveredKids.length}`;
        if (key === shownKey) return;
        shownKey = key;
        const found = this.content.recipes.filter((r) => this.revealed(r));
        progress.textContent = `${found.length} / ${this.content.recipes.length} recipes found`;
        portraits.dispose();
        portraits = new LazyPortraits(kidRig!, 48);
        const rows: HTMLElement[] = found.map((r) => this.recipeRow(r, portraits));
        for (let i = found.length; i < this.content.recipes.length; i++) rows.push(this.unknownRecipe());
        list.replaceChildren(...rows);
        portraits.watch(this.sheets.scrollRoot);
      },
      dispose: () => portraits.dispose(),
    };
  }

  /** Found by its pair key, with every kid in it discovered; else it stays hidden (§7). */
  private revealed(r: RecipeDef): boolean {
    const key = pairKey(r.a, r.b);
    if (!this.game.state.discoveredRecipes.includes(key)) return false;
    const ok = [r.a, r.b, r.result].every((t) => this.discovered(t));
    if (!ok && !this.warned.has(key)) {
      this.warned.add(key);
      console.warn(`Potato-Dex: recipe ${key} is found but not all its kids are discovered; it stays hidden.`);
    }
    return ok;
  }

  private recipeRow(r: RecipeDef, portraits: LazyPortraits): HTMLElement {
    const end = (type: KidId) => el('div', 'dex-end', portraits.add(type), el('span', 'dex-end-name', shortName(this.kid(type).name)));
    const sym = (s: string) => {
      const x = el('span', 'dex-sym', s);
      x.setAttribute('aria-hidden', 'true');
      return x;
    };
    const row = el('div', 'dex-recipe ui-surface', end(r.a), sym('+'), end(r.b), sym('→'), end(r.result));
    row.setAttribute('role', 'listitem');
    row.setAttribute('aria-label', `${this.kid(r.a).name} plus ${this.kid(r.b).name} makes ${this.kid(r.result).name}`);
    return row;
  }

  /** Every unknown recipe looks the same: no symbols, silhouettes, tier or name (§7). */
  private unknownRecipe(): HTMLElement {
    const row = el(
      'div',
      'dex-recipe-unknown ui-surface',
      icon('icon_unknown', '', 'ui-icon-32'),
      el('div', 'dex-unknown-text', el('span', '', 'Unknown recipe'), el('span', 'sheet-helper', 'Keep experimenting.')),
    );
    row.setAttribute('role', 'listitem');
    return row;
  }
}
