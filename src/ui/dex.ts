import { personalityBlocks } from './kidCard';
import { kidRig } from '../content/artData';
import type { Content, KidId, RecipeDef } from '../content/types';
import { pairKey } from '../content/validate';
import type { MapScene } from '../render/scene';
import type { BuildingSheets } from './buildings';
import { el, icon, shortName, tierBadge } from './dom';
import { homeSection, type HomeSection } from './dexHome';
import { formatRate } from './format';
import { LazyPortraits, portrait } from './portrait';
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
  /** Kids on map (n), above the tabs (§19.2). */
  onMap: HTMLButtonElement;
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
  update(): void;
  dispose(): void;
}

interface RecipesPanel {
  root: HTMLElement;
  update(): void;
  dispose(): void;
}

/** The Kids tab's three segments (GUI_MVP §16.4): ordinary kids, the specials, the rares. */
type Segment = 'ordinary' | 'special' | 'rare';
const SEGMENTS: { id: Segment; label: string }[] = [
  { id: 'ordinary', label: 'Ordinary' },
  { id: 'special', label: 'Specials' },
  { id: 'rare', label: 'Rares' },
];

export class Dex {
  private tab: Tab = 'kids';
  /** The Kids segment shown; each keeps its own search and scroll (§16.4). */
  private segment: Segment = 'ordinary';
  private readonly filters: Record<Segment, string> = { ordinary: '', special: '', rare: '' };
  private readonly segmentScroll: Record<Segment, number> = { ordinary: 0, special: 0, rare: 0 };
  private get filter(): string {
    return this.filters[this.segment];
  }
  private set filter(q: string) {
    this.filters[this.segment] = q;
  }
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
    /**
     * Opens a live kid's card in place of the Dex (GUI_MVP §18.1); `back` returns here: this
     * detail, its scroll, and focus on that kid's row.
     */
    private readonly openKid: (kidId: number, launcher: HTMLElement | null, back: { label: string; go: () => void }, ordinal: number) => void,
    private readonly readOnly: () => boolean = () => false,
    /** Opens Kids on map as a page of the Dex; `back` returns here (GUI_MVP §19.2). */
    private readonly openKidsOnMap: (launcher: HTMLElement | null, back: { label: string; run: () => void }) => void = () => {},
  ) {}

  /** What opened the Dex: focus returns there when it, or a kid card it opened, closes. */
  private launcher: HTMLElement | null = null;

  get isOpen(): boolean {
    return this.shown !== null;
  }

  /**
   * Opens the Dex where the player left it (tab, filter, scroll), or on `kid`'s detail when
   * a discovery card asks for it (GUI_MVP §§7, 9).
   */
  open(launcher: HTMLElement | null, kid?: KidId, focusKid?: number): void {
    this.launcher = launcher;
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
        onEscape: () => false,
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
    // Every kid on the map, as rows: the route to any kid without dragging or panning (§19.2).
    const onMap = el('button', 'ui-button dex-kids-on-map');
    onMap.type = 'button';
    onMap.addEventListener('click', () => {
      this.remember();
      this.openKidsOnMap(launcher, {
        label: 'Back to Potato-Dex',
        run: () => {
          this.sheets.asPage();
          this.open(launcher);
          this.shown?.onMap.focus();
        },
      });
    });
    sheet.bar.append(onMap, strip, tabBar);
    const panel = el('div', 'dex-panel');
    panel.id = 'dex-panel';
    panel.setAttribute('role', 'tabpanel');
    sheet.body.append(panel);
    // Lazy portraits re-target as soon as what scrolls changes.
    sheet.body.closest('.sheet')?.addEventListener(SCROLLER_CHANGE, () => this.update());
    this.shown = { sheet, tabs, tabBar, kids: null, recipes: null, compendium: null, panel, onMap };
    this.render(kid, focusKid);
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
    // The Kids tab's place is its segment's own (§16.4; Codex review, #94).
    else if (this.tab === 'kids') this.segmentScroll[this.segment] = at;
    else this.scroll[this.tab] = at;
  }

  private render(kid?: KidId, focusKid?: number): void {
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
      // A discovery card's kid, or the detail that was open: its segment (§16.4).
      const target = kid ?? this.detail?.kid;
      if (target !== undefined && this.discovered(target)) this.segment = this.segmentOf(target);
      s.kids = this.kidsPanel();
      s.panel.append(s.kids.root);
      s.kids.update();
      // The grid's place first, so a detail opened over it returns there.
      s.sheet.scrollTo(this.segmentScroll[this.segment]);
      // A discovery card's kid, else the detail that was open (e.g. before the offline
      // summary interrupted it; Codex review, PR #43).
      const back = kid !== undefined ? { kid, scroll: 0 } : this.detail;
      if (back && this.discovered(back.kid)) {
        this.showDetail(back.kid);
        s.sheet.scrollTo(back.scroll);
        // Back from a kid's card: its row (or the section, if it has left) takes focus.
        if (focusKid !== undefined) s.kids.home?.focusKid(focusKid);
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
    const n = this.game.state.world.kids.length;
    if (s.onMap.dataset.n !== String(n)) {
      s.onMap.dataset.n = String(n);
      s.onMap.textContent = `Kids on map (${n})`;
    }
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

  private segmentOf(type: KidId): Segment {
    const k = this.kid(type);
    return k.rare ? 'rare' : k.special ? 'special' : 'ordinary';
  }

  private tierMark(tier: number, size: 20 | 24, text: string): HTMLElement {
    return el('span', `tier dex-tier-${size}`, ...tierBadge(tier, `ui-icon-${size}`), text);
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
    // Rares {found} / {total} (§16.4): its own count, in the combined total too.
    const segmentHelper = el('p', 'sheet-helper dex-segment-helper');
    const search = el('div', 'dex-search', label, field, summary, empty, segmentHelper);
    const detail = el('div', 'dex-detail');
    detail.hidden = true;
    // Three 44 px controls in one row (§16.4); each segment keeps its search and scroll.
    const segments = el('div', 'dex-segments');
    segments.setAttribute('role', 'group');
    segments.setAttribute('aria-label', 'Kinds of kids');
    const segmentButtons = new Map<Segment, HTMLButtonElement>();
    for (const sg of SEGMENTS) {
      const b = el('button', 'ui-button dex-segment', sg.label);
      b.type = 'button';
      b.dataset.segment = sg.id;
      b.addEventListener('click', () => {
        if (sg.id === this.segment) return;
        this.segmentScroll[this.segment] = this.sheets.snapshot()?.scrollTop ?? 0;
        this.segment = sg.id;
        field.value = this.filter;
        known = -1;
        panel.update();
        this.shown?.sheet.scrollTo(this.segmentScroll[sg.id]);
      });
      segmentButtons.set(sg.id, b);
      segments.append(b);
    }
    const root = el('div', 'dex-kids', segments, search, grid, detail);

    // Cells are kept and reordered, never rebuilt: discovered kids in roster order, then
    // identical packets. Interleaving packets in roster order would give away each unknown
    // kid's tier by its position (GUI_MVP §7).
    const knownCells = new Map<KidId, { cell: HTMLElement; name: string }>();
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
        // Only this segment's tiles, the ones in the grid, count (Codex review, #94).
        if (!t.cell.hidden && grid.contains(t.cell)) matches++;
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
      update: () => {
        panel.home?.update();
        // Discoveries made under the open detail join its list (Codex review, PR #43).
        if (panel.showing && panel.foundShown !== this.game.state.discoveredRecipes.length) panel.refreshFound?.();
        // Five columns on a wide compact sheet, three from 360 px, else two (GUI_MVP §7).
        const sheetEl = root.closest('.sheet') as HTMLElement | null;
        const width = sheetEl?.getBoundingClientRect().width ?? 0;
        grid.dataset.cols = sheetEl?.dataset.compact === 'true' && width >= 560 ? '5' : width >= 360 ? '3' : '2';
        portraits.watch(this.sheets.scrollRoot);
        panel.detailPortraits?.watch(this.sheets.scrollRoot);
        for (const [id, b] of segmentButtons) b.setAttribute('aria-pressed', String(id === this.segment));
        segments.hidden = panel.showing !== null;
        const n = this.game.state.discoveredKids.length;
        if (n === known) return;
        known = n;
        const inSegment = this.content.kids.filter((k) => this.segmentOf(k.id) === this.segment);
        const rareCount = this.content.kids.filter((k) => k.rare);
        segmentHelper.hidden = this.segment !== 'rare';
        segmentHelper.textContent = `Rares ${rareCount.filter((k) => this.discovered(k.id)).length} / ${rareCount.length}`;
        const order: HTMLElement[] = [];
        // Cells for other segments stay kept, out of the grid.
        for (const kid of inSegment) {
          if (!this.discovered(kid.id)) continue;
          let c = knownCells.get(kid.id);
          if (!c) {
            c = { cell: cell(this.kidTile(kid.id, portraits)), name: kid.name };
            knownCells.set(kid.id, c);
          }
          order.push(c.cell);
        }
        unknown = inSegment.length - order.length;
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
      // A plain label, never colour alone (§16.4).
      ...(k.rare || k.special ? [el('span', 'dex-tile-kind', k.rare ? 'Rare' : 'Special')] : []),
    );
    b.type = 'button';
    b.dataset.kid = type;
    b.setAttribute('aria-label', `${k.name}, ${k.rare ? 'Rare, ' : k.special ? 'Special, ' : ''}Tier ${k.tier}`);
    b.addEventListener('click', () => this.showDetail(type));
    return b;
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
    if (!p.showing) this.segmentScroll[this.segment] = this.sheets.snapshot()?.scrollTop ?? 0;
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
    p.home?.dispose();
    p.home = homeSection(type, this.content, this.scene, (kidId, ordinal) => {
      // The detail is kept, scroll and all, for coming back.
      this.remember();
      const launcher = this.launcher;
      this.openKid(kidId, launcher, { label: `Back to ${k.name}`, go: () => this.open(launcher, undefined, kidId) }, ordinal);
    });
    const name = el('h3', 'dex-detail-name', k.name);
    // Apex kids (§16.4): from planting, no recipes, never sold; no recipe list.
    const apex = k.rare || k.special;
    const recipes = apex
      ? [
          el('p', 'sheet-body-text dex-apex-label', `${k.rare ? 'Rare' : 'Special'} · From planting`),
          el('p', 'sheet-helper', 'No fusion recipes.'),
          el('p', 'sheet-helper', 'Cannot be bought.'),
        ]
      : [el('h3', 'sheet-section', 'Found recipes'), foundBox];
    p.detail.replaceChildren(
      back,
      el('div', 'dex-detail-portrait', portrait(kidRig!, type, 96)),
      name,
      el('div', 'dex-detail-tier', this.tierMark(k.tier, 24, `Tier ${k.tier}`)),
      // Per hour: at the slow pacing (D-052) a per-second rate would round to 0.
      el('p', 'sheet-helper', `Earns ${formatRate(this.game.incomeOf(type) * 3600)} Materials / h`),
      // The type's personality, as on a kid's card (GUI_MVP §18.1); never one kid's name or mood.
      el('section', 'dex-personality', ...personalityBlocks(this.content, type)),
      p.home.root,
      ...recipes,
    );
    for (const node of [p.root.querySelector('.dex-search') as HTMLElement, p.grid, p.root.querySelector('.dex-segments') as HTMLElement]) node.hidden = true;
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
    p.home?.dispose();
    p.home = null;
    p.detailPortraits?.dispose();
    p.detailPortraits = null;
    p.detail.hidden = true;
    p.detail.replaceChildren();
    for (const node of [p.root.querySelector('.dex-search') as HTMLElement, p.grid, p.root.querySelector('.dex-segments') as HTMLElement]) node.hidden = false;
    this.shown!.sheet.scrollTo(this.segmentScroll[this.segment]);
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
