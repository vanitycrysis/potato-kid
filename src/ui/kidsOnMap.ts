import { kidRig } from '../content/artData';
import type { Content } from '../content/types';
import type { MapScene } from '../render/scene';
import { el } from './dom';
import { portrait } from './portrait';
import type { Sheets } from './sheet';

// Every kid on the map, wherever it is (GUI_MVP §19.2, Codex's LAYOUT-DESIGN): Dex → Kids on
// map, the route to any kid without dragging, panning or pinching; and "Which kid?" (§20.1),
// the same rows for a tap that landed on several kids' pickup targets at once. A row opens
// that kid's card; its Back returns here with the search, scroll and focus as they were.

export interface ListOptions {
  /** Only these kids (a tap's candidates); every kid on the map when absent. */
  ids?: number[];
  /** The page's way back, when it is a page of another sheet (the Dex). */
  back?: { label: string; run: () => void };
  query?: string;
  scrollTop?: number;
  focusKid?: number;
}

export class KidsOnMap {
  constructor(
    private readonly scene: MapScene,
    private readonly content: Content,
    private readonly sheets: Sheets,
    /** Opens a kid's card; `back` returns to this list. */
    private readonly openKid: (kidId: number, launcher: HTMLElement | null, back: { label: string; go: () => void }, ordinal: number) => void,
  ) {}

  private name(type: string): string {
    return this.content.kids.find((k) => k.id === type)?.name ?? type;
  }

  private tier(type: string): number {
    return this.content.kids.find((k) => k.id === type)?.tier ?? 1;
  }

  /** The list last opened and from where: the offline summary brings it back (§8). */
  private last: { launcher: HTMLElement | null; options: ListOptions } | null = null;

  /** Whether an open sheet's key is this list's. */
  static isList(key: string): boolean {
    return key === 'kids-on-map' || key === 'which-kid';
  }

  /** Back where the list was, after the offline summary interrupted it. */
  reopen(scrollTop: number): void {
    if (!this.last) return;
    const options = { ...this.last.options, scrollTop };
    delete options.focusKid;
    this.open(this.last.launcher, options);
  }

  /** "Kids on map" (all) or "Which kid?" (`ids`). */
  open(launcher: HTMLElement | null, options: ListOptions = {}): void {
    const choosing = options.ids !== undefined;
    this.last = { launcher, options };
    const title = choosing ? 'Which kid?' : 'Kids on map';
    if (options.back) this.sheets.asPage(options.back);
    const sheet = this.sheets.open({ key: choosing ? 'which-kid' : 'kids-on-map', icon: 'icon_kids', title, requestedHeight: 624, update: () => update() }, launcher);
    const kids = () => this.scene.game.state.world.kids.filter((k) => !options.ids || options.ids.includes(k.id));
    // Each kid's number among its type's copies on the map, by id: the number its card shows
    // (§18.1). A kid keeps its number while the list is open; newcomers are appended.
    const ordinals = new Map<number, number>();
    const nextOf = new Map<string, number>();
    const number = (k: { id: number; type: string }) => {
      if (!ordinals.has(k.id)) {
        const n = (nextOf.get(k.type) ?? 0) + 1;
        nextOf.set(k.type, n);
        ordinals.set(k.id, n);
      }
      return ordinals.get(k.id)!;
    };
    for (const k of [...this.scene.game.state.world.kids].sort((a, b) => a.id - b.id)) number(k);

    sheet.setSubtitle(choosing ? 'Your tap reached more than one kid.' : 'Every kid on your map, wherever it is.');
    const search = el('input', 'comp-search kids-search') as HTMLInputElement;
    search.type = 'search';
    search.id = 'kids-search';
    search.autocomplete = 'off';
    search.placeholder = 'Name or type';
    const label = el('label', 'comp-search-label', 'Find a kid on your map');
    (label as HTMLLabelElement).htmlFor = search.id;
    search.value = options.query ?? '';
    const empty = el('p', 'sheet-helper kids-empty');
    const rows = el('div', 'kids-rows');
    // A tap's few candidates need no search.
    if (!choosing) sheet.body.append(label, search);
    sheet.body.append(empty, rows);
    search.addEventListener('input', () => {
      if (this.last) this.last.options = { ...this.last.options, query: search.value };
      update();
    });

    const rowFor = new Map<number, { row: HTMLButtonElement; text: string; set(name: string | undefined): void }>();
    const makeRow = (kid: (typeof this.scene.game.state.world.kids)[number]) => {
      const ordinal = number(kid);
      const typeName = this.name(kid.type);
      const tier = this.tier(kid.type);
      const nameEl = el('span', 'dex-home-row-name');
      const sub = el('span', 'sheet-helper');
      const row = el('button', 'ui-button dex-home-row kids-row', portrait(kidRig!, kid.type, 48, kid.look), el('span', 'dex-home-row-text', nameEl, sub)) as HTMLButtonElement;
      row.type = 'button';
      row.dataset.kid = String(kid.id);
      row.addEventListener('click', () => {
        const back = { query: search.value, scrollTop: this.sheets.snapshot()?.scrollTop ?? 0, focusKid: kid.id };
        this.openKid(kid.id, launcher, { label: `Back to ${title}`, go: () => this.open(launcher, { ...options, ...back }) }, ordinal);
      });
      const r = {
        row,
        text: '',
        set: (name: string | undefined) => {
          nameEl.textContent = name ?? typeName;
          sub.textContent = `${name ? `${typeName} · ` : ''}Tier ${tier} · Kid ${ordinal}`;
          row.setAttribute('aria-label', `View kid: ${name ? `${name}, ` : ''}${typeName}, tier ${tier}, kid ${ordinal}`);
          r.text = `${name ?? ''} ${typeName}`.toLowerCase();
        },
      };
      r.set(kid.name);
      return r;
    };

    let shownKey: string | null = null;
    const update = () => {
      const live = kids().sort((a, b) => a.id - b.id);
      const ids = live.map((k) => k.id);
      // Rows for kids that left go (focus moves to the search, or the title).
      for (const [id, r] of rowFor) {
        if (ids.includes(id)) continue;
        if (r.row.contains(document.activeElement)) (choosing ? sheet.body.closest('.sheet')?.querySelector<HTMLElement>('.sheet-title') : search)?.focus({ preventScroll: true });
        r.row.remove();
        rowFor.delete(id);
      }
      for (const k of live) {
        if (!rowFor.has(k.id)) {
          const r = makeRow(k);
          rowFor.set(k.id, r);
          rows.append(r.row);
        }
        rowFor.get(k.id)!.set(k.name);
      }
      const q = search.value.trim().toLowerCase();
      let visible = 0;
      for (const r of rowFor.values()) {
        const show = !q || r.text.includes(q);
        r.row.hidden = !show;
        if (show) visible++;
      }
      const key = `${ids.length}|${visible}|${q}`;
      if (key === shownKey) return;
      shownKey = key;
      empty.textContent = ids.length === 0 ? (choosing ? 'These kids have left the map.' : 'No kids on your map yet.') : visible === 0 ? 'No matching kids.' : '';
      empty.hidden = !empty.textContent;
    };
    update();
    sheet.scrollTo(options.scrollTop ?? 0);
    const focus = options.focusKid !== undefined ? rowFor.get(options.focusKid)?.row : undefined;
    if (focus) {
      focus.focus({ preventScroll: true });
      focus.scrollIntoView({ block: 'nearest' });
    }
  }
}
