import { kidRig } from '../content/artData';
import type { Content, KidId } from '../content/types';
import type { MapScene } from '../render/scene';
import type { GameEvent, RejectReason } from '../sim/game';
import { refusalText } from './feedback';
import { formatDuration, formatExact } from './format';
import { el, icon } from './dom';
import { portrait } from './portrait';
import type { Sheets } from './sheet';

// Food fields, their kids and the pantry (D-069, docs/GUI_MVP.md §22, Codex's FARM-DESIGN):
// the Garden's Fields section, a field's page, Choose food (with its change review), Pick
// kids, and the Pantry. Each page opens in place of the sheet it came from, with its way
// back. Every visual decision is Codex's (D-036); this file implements it.

type Pending =
  | { type: 'unlockField'; field: number }
  | { type: 'setFieldFood'; field: number; food: string; returning: number }
  | { type: 'farm'; field: number; kidIds: number[]; food: string | null }
  | { type: 'unfarm'; field: number; kidId: number; name: string }
  | { type: 'emptyField'; field: number; count: number; kidIds: number[] };

interface Note {
  lines: string[];
  warn: boolean;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export class FieldSheets {
  private pending: Pending | null = null;
  /** The latest result for a field, shown on its page and the Garden's row. */
  private notes = new Map<number, Note>();
  /** The Garden's own unlock result (a success, or why not). */
  private unlockNote: Note | null = null;

  constructor(
    private readonly scene: MapScene,
    private readonly content: Content,
    private readonly sheets: Sheets,
    private readonly readOnly: () => boolean,
    /** Opens the Garden scrolled to its Fields section (Back from a field page, View fields), with a way back. */
    private readonly openGardenFields: (launcher: HTMLElement | null, back?: { label: string; run: () => void }) => void,
    /** Opens a farming kid's card, with its way back (View kid, §22.2). */
    private readonly openKid: (kidId: number, launcher: HTMLElement | null, back: { label: string; go: () => void }) => void,
    /** The way back the Garden's Fields were opened with, if any (kept through a field's pages). */
    private readonly fieldsBack: () => { label: string; run: () => void } | null = () => null,
  ) {}

  /**
   * The farming page opened last: its sheet's key, its field (-1 for the Pantry), and how to
   * bring it back as it is now (after the return summary, §8; Codex review, #90).
   */
  private page: { key: string; field: number; restore: (scrollTop: number) => void } | null = null;

  /** Whether field `i`'s result would be seen: its page is the open sheet (the Garden for an unlock). */
  private showing(p: Pending): boolean {
    if (p.type === 'unlockField') return this.sheets.openKey === 'garden';
    return !!this.page && this.page.field === p.field && this.sheets.openKey === this.page.key;
  }

  /** The open farming page's way back to itself, or null (the HUD keeps it over the summary). */
  snapshot(): ((scrollTop: number) => void) | null {
    return this.page && this.sheets.openKey === this.page.key ? this.page.restore : null;
  }

  private get game() {
    return this.scene.game;
  }

  private get fm() {
    return this.content.balance.farming;
  }

  private foodName(id: string): string {
    return this.content.balance.feeding.foods.find((f) => f.id === id)?.name ?? id;
  }

  private kidName(type: KidId): string {
    return this.content.kids.find((k) => k.id === type)?.name ?? type;
  }

  private tier(type: KidId): number {
    return this.content.kids.find((k) => k.id === type)?.tier ?? 1;
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

  private send(cmd: Pending): void {
    if (this.pending || this.readOnly()) return;
    this.pending = cmd;
    const { field } = cmd;
    if (cmd.type === 'unlockField') this.scene.command({ type: 'unlockField' });
    else if (cmd.type === 'setFieldFood') this.scene.command({ type: 'setFieldFood', field, food: cmd.food });
    else if (cmd.type === 'farm') this.scene.command({ type: 'farm', field, kidIds: cmd.kidIds, ...(cmd.food ? { food: cmd.food } : {}) });
    else if (cmd.type === 'unfarm') this.scene.command({ type: 'unfarm', field, kidId: cmd.kidId });
    else this.scene.command({ type: 'emptyField', field, kidIds: cmd.kidIds });
  }

  /**
   * A step's events: answers the pending command. Returns the events it answered, so the
   * world shows no second card for them.
   */
  onStep(events: GameEvent[]): GameEvent[] {
    const p = this.pending;
    if (!p) return [];
    const handled: GameEvent[] = [];
    // Its page still shows: it says the result. Closed or replaced: the world does, as a kid
    // card's result does (Codex review, #90).
    const shown = this.showing(p);
    const claim = (e: GameEvent) => {
      if (shown) handled.push(e);
    };
    let farmed = 0;
    const n = p.field + 1;
    for (const e of events) {
      if (p.type === 'unlockField' && e.type === 'fieldUnlocked') {
        this.unlockNote = { lines: [`Field ${n} unlocked. Choose a food to grow.`], warn: false };
        claim(e);
      } else if (p.type === 'setFieldFood' && e.type === 'fieldFood' && e.field === p.field) {
        const lines = [`Field ${n} now grows ${this.foodName(e.food)}.`];
        if (p.returning > 0) lines.push(`${p.returning} ${plural(p.returning, 'kid is', 'kids are')} back by the Garden.`);
        this.notes.set(p.field, { lines, warn: false });
        claim(e);
      } else if (p.type === 'setFieldFood' && e.type === 'unfarmed' && e.field === p.field) {
        claim(e);
        continue;
      } else if (p.type === 'farm' && e.type === 'farming' && e.field === p.field) {
        claim(e);
        if (++farmed < p.kidIds.length) continue;
        const food = this.game.state.fields[p.field]?.food;
        this.notes.set(p.field, { lines: [`${p.kidIds.length} ${plural(p.kidIds.length, 'kid is', 'kids are')} farming ${food ? this.foodName(food) : ''} in Field ${n}.`], warn: false });
      } else if (p.type === 'unfarm' && e.type === 'unfarmed' && e.field === p.field) {
        this.notes.set(p.field, { lines: [`${p.name} is back by the Garden.`], warn: false });
        claim(e);
      } else if (p.type === 'emptyField' && e.type === 'unfarmed' && e.field === p.field) {
        // All of them come back in one step (all or none).
        claim(e);
        this.notes.set(p.field, { lines: [`All ${p.count} kids are back by the Garden. Field ${n} has no kids farming.`], warn: false });
      } else if (e.type === 'rejected' && e.command === p.type) {
        const line = this.refusal(p, e.reason);
        if (p.type === 'unlockField') this.unlockNote = { lines: [line], warn: true };
        else this.notes.set(p.field, { lines: [line], warn: true });
        claim(e);
      } else continue;
      this.pending = null;
    }
    return handled;
  }

  /** Codex's exact refusals (GUI_MVP §22.7). */
  private refusal(p: Pending, reason: RejectReason): string {
    const n = p.field + 1;
    const food = p.type === 'setFieldFood' ? this.foodName(p.food) : this.game.state.fields[p.field]?.food ? this.foodName(this.game.state.fields[p.field]!.food!) : '';
    switch (reason) {
      case 'hated':
        return `A kid won’t farm ${food}. Choose another kid or change this field’s food.`;
      case 'noCrop':
        return `Choose a food for Field ${n} before assigning kids.`;
      case 'fieldFull':
        return `Field ${n} is full. Take a farming kid back, then try again.`;
      case 'full':
        if (p.type === 'unfarm') return 'The map is full. Make room for 1 kid, then try Take back again.';
        if (p.type === 'setFieldFood') return `There isn't room on the map for the ${p.returning} kids who won't farm ${food}. Make room, then try Change food again.`;
        return `There isn't room on the map for all ${p.type === 'emptyField' ? p.count : ''} kids. Make room, then try again.`;
      case 'noRoom':
        return "There's no clear spot by the Garden. Move nearby kids aside, then try again.";
      case 'changed':
        return p.type === 'farm' ? "This field's food changed. Review the field before assigning kids." : 'This field changed. Review it again before taking all kids back.';
      case 'gone':
        if (p.type === 'farm') return 'The map changed. Check these kids and try Assign again.';
        if (p.type === 'unfarm') return 'This kid is no longer farming in this field. Check the field and try again.';
        return p.type === 'emptyField' ? 'This field changed. Review it again before taking all kids back.' : 'This field changed. Review it again before changing food.';
      case 'cost':
        return refusalText('cost', 'unlockField', 'materials');
      default:
        return refusalText(reason, p.type);
    }
  }

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
        node.replaceChildren(...(n ? n.lines.map((l) => el('p', 'sheet-body-text', l)) : []));
        if (n) node.scrollIntoView({ block: 'nearest' });
      },
    };
  }

  // --- the Garden's Fields section (§22.2) -------------------------------------------------

  /** The Fields section of the Garden's overview: Find fields, one row per field, and unlocking. */
  section(launcher: () => HTMLElement | null): { node: HTMLElement; heading: HTMLElement; update(): void } {
    const heading = el('h3', 'sheet-section garden-section-heading', 'Fields');
    heading.id = 'garden-fields';
    heading.tabIndex = -1;
    const find = this.button('Find fields', 'plot-action-full fields-find', () => {
      const [x, y] = this.scene.farmCentre ?? [0, 0];
      this.scene.zoomAround({ x, y }, this.scene.zoom);
      this.sheets.close();
    });
    const helper = el('p', 'sheet-helper', 'Kids farm food for the pantry. They earn no Materials while farming.');
    const rows = Array.from({ length: this.fm.maxFields }, (_, i) => this.fieldRow(i, launcher));
    const unlockNote = this.noteBox();
    const node = el('section', 'garden-fields', heading, helper, find, unlockNote.node, ...rows.map((r) => r.node));
    return {
      node,
      heading,
      update: () => {
        for (const r of rows) r.update();
        unlockNote.set(this.unlockNote);
      },
    };
  }

  private fieldRow(i: number, launcher: () => HTMLElement | null): { node: HTMLElement; update(): void } {
    const title = el('h4', 'dex-home-confirm-title', `Field ${i + 1}`);
    const status = el('p', 'sheet-body-text');
    const count = el('p', 'sheet-helper');
    const view = this.button('View field', 'plot-action-full field-view', () => this.openField(i, launcher()));
    view.dataset.field = String(i);
    const unlock = this.button('', 'ui-primary plot-action-full field-unlock', () => this.send({ type: 'unlockField', field: i }));
    unlock.dataset.cue = 'success';
    const shortfall = el('p', 'sheet-helper');
    const node = el('div', 'ui-surface field-row', title, status, count, view, unlock, shortfall);
    return {
      node,
      update: () => {
        const fields = this.game.state.fields;
        const f = fields[i];
        const bought = !!f;
        view.hidden = !bought;
        count.hidden = !bought;
        unlock.hidden = bought || i !== fields.length;
        shortfall.hidden = bought;
        if (f) {
          // The food, then the count on its own line (§22.2).
          const s = f.food ? this.foodName(f.food) : 'Choose a food to grow.';
          if (status.textContent !== s) status.textContent = s;
          const c = `${f.workers.length} / ${this.fm.kidsPerField} kids farming`;
          if (count.textContent !== c) count.textContent = c;
          return;
        }
        if (i !== fields.length) {
          status.textContent = `Field ${i + 1} · Locked`;
          shortfall.textContent = `Unlock Field ${i} first.`;
          return;
        }
        const price = this.fm.unlockPrices[i]!;
        const have = this.game.state.materials;
        status.textContent = `Field ${i + 1} · Locked`;
        const label = this.pending?.type === 'unlockField' ? 'Unlocking…' : `Unlock field · ${formatExact(price)} Materials`;
        if (unlock.textContent !== label) unlock.textContent = label;
        this.setEnabled(unlock, !this.pending && !this.readOnly() && have >= price);
        shortfall.textContent = have < price ? `Need ${formatExact(Math.ceil(price - have))} more Materials.` : '';
      },
    };
  }

  // --- a field's page (§22.2, §22.5) --------------------------------------------------------

  /**
   * A field's page, in place of the Garden, with its way back. `gardenBack`: the way back the
   * Garden's Fields were opened with, kept through this field's pages (Codex review, #90).
   * `review`, `scrollTop`: as it was, coming back after the return summary.
   */
  openField(i: number, launcher: HTMLElement | null, options: { gardenBack?: { label: string; run: () => void } | null; review?: boolean; scrollTop?: number } = {}): void {
    const gardenBack = options.gardenBack === undefined ? this.fieldsBack() : options.gardenBack;
    this.sheets.asPage({ label: 'Back to fields', run: () => this.openGardenFields(launcher, gardenBack ?? undefined) });
    const sheet = this.sheets.open({ key: 'field', icon: 'icon_fields', title: `Field ${i + 1}`, requestedHeight: 624, update: () => update() }, launcher);
    /** This page's way back to itself, from its own pages. */
    const self = () => this.openField(i, launcher, { gardenBack });
    this.page = { key: 'field', field: i, restore: (scrollTop) => this.openField(i, launcher, { gardenBack, review, scrollTop }) };
    const note = this.noteBox();
    const foodLine = el('div', 'field-food');
    const changeFood = this.button('Choose food', 'plot-action-full field-change-food', () => this.openChooseFood(i, launcher, self));
    const kidsHeading = el('h4', 'dex-home-confirm-title', 'Kids farming');
    kidsHeading.tabIndex = -1;
    const count = el('p', 'sheet-body-text');
    const rules = [el('p', 'sheet-helper', 'Favourite food grows faster. Hated food cannot be farmed.'), el('p', 'sheet-helper', 'No Materials earned while farming.')];
    const rate = el('p', 'sheet-body-text field-rate');
    const fill = el('div', 'plot-rail-fill');
    const rail = el('div', 'plot-rail', fill);
    rail.setAttribute('role', 'progressbar');
    rail.setAttribute('aria-valuemin', '0');
    rail.setAttribute('aria-valuemax', '100');
    const assign = this.button('Assign kids', 'plot-action-full field-assign', () => this.openPicker(i, launcher, self));
    const roster = el('div', 'plot-kids field-roster');
    const takeAll = this.button('Take all back', 'plot-action-full field-take-all', () => {
      reviewed = this.game.state.fields[i]?.workers.map((w) => w.id) ?? [];
      review = true;
      built = '';
      update();
      body().querySelector<HTMLElement>('.field-review-heading')?.focus();
    });
    const reviewBox = el('div', 'plot-review ui-surface field-review');
    const pantry = this.button('Open pantry', 'plot-action-full', () => this.openPantry(launcher, { label: `Back to Field ${i + 1}`, run: self }));
    const find = this.button('Find this field', 'plot-action-full', () => {
      const site = this.scene.fieldSite(i);
      if (site) this.scene.zoomAround(site, this.scene.zoom);
      this.sheets.close();
    });
    const body = () => sheet.body;
    sheet.body.append(note.node, foodLine, changeFood, kidsHeading, count, ...rules, rate, rail, assign, roster, takeAll, reviewBox, pantry, find);

    let review = options.review ?? false;
    /** The roster the review shows: Take all back returns exactly these, or nobody (§22.5). */
    let reviewed: number[] = review ? (this.game.state.fields[i]?.workers.map((w) => w.id) ?? []) : [];
    let built = '';
    const takeBack = new Map<number, HTMLButtonElement>();
    const update = () => {
      const f = this.game.state.fields[i];
      if (!f) return;
      const n = i + 1;
      sheet.setSubtitle(f.food ? `${this.foodName(f.food)} · ${f.workers.length === 0 ? 'No kids farming' : `${f.workers.length} / ${this.fm.kidsPerField} kids farming`}` : 'Choose a food to grow.');
      const key = `${f.food}|${f.workers.map((w) => `${w.id}:${w.name ?? ''}`).join(',')}|${review}`;
      if (key !== built) {
        built = key;
        // A rebuilt roster loses its focused button (Take back accepted): focus moves on, as
        // in a plot's detail (Codex review, #90).
        const focusWasInside = roster.contains(document.activeElement) || reviewBox.contains(document.activeElement);
        const restoreFocus = () => {
          if (!focusWasInside || sheet.body.contains(document.activeElement)) return;
          (roster.querySelector<HTMLElement>('.field-take-back') ?? (assign.getAttribute('aria-disabled') === 'true' ? null : assign) ?? kidsHeading).focus();
        };
        queueMicrotask(restoreFocus);
        foodLine.replaceChildren(...(f.food ? [icon(`icon_food_${f.food}`, '', 'ui-icon-32'), el('span', 'feed-name', this.foodName(f.food))] : [el('span', 'feed-name', 'Choose a food')]));
        changeFood.textContent = f.food ? 'Change food' : 'Choose food';
        takeBack.clear();
        roster.replaceChildren(
          ...f.workers.map((w) => {
            const fav = this.content.personality[w.type]?.favouriteFood === f.food;
            const who = w.name ?? this.kidName(w.type);
            const ordinal = this.game.ownedOrdinal(w.type, w.id);
            // Back to this field as it was opened, with its own way back (Codex review, #90).
            const view = this.button('View kid', 'field-view-kid', () => this.openKid(w.id, launcher, { label: `Back to Field ${n}`, go: self }));
            view.setAttribute('aria-label', `View kid: ${who}`);
            const b = this.button('Take back', 'field-take-back', () => this.send({ type: 'unfarm', field: i, kidId: w.id, name: who }));
            b.setAttribute('aria-label', `Take back ${who}`);
            takeBack.set(w.id, b);
            return el(
              'div',
              'ui-surface field-worker',
              el(
                'div',
                'plot-kid field-worker-identity',
                portrait(kidRig!, w.type, 48, w.look),
                el(
                  'span',
                  'dex-home-row-text',
                  el('span', 'dex-home-row-name', who),
                  el('span', 'sheet-helper', `${w.name ? `${this.kidName(w.type)} · ` : ''}Tier ${this.tier(w.type)} · Kid ${ordinal}`),
                  el('span', 'sheet-helper', fav ? 'Favourite · Farms faster' : `Farming ${f.food ? this.foodName(f.food) : ''}`),
                ),
              ),
              el('div', 'plot-confirm-actions', view, b),
            );
          }),
        );
        reviewBox.hidden = !review;
        if (review) {
          const heading = el('h4', 'dex-home-confirm-title field-review-heading', `Take all kids back from Field ${n}?`);
          heading.tabIndex = -1;
          const roomLine = el('p', 'sheet-helper field-review-room');
          const keep = this.button('Keep farming', 'plot-action-full', () => {
            review = false;
            built = '';
            update();
            takeAll.focus();
          });
          const go = this.button(`Take all back · ${f.workers.length} ${plural(f.workers.length, 'kid', 'kids')}`, 'sheet-action plot-confirm-action field-take-all-go', () =>
            this.send({ type: 'emptyField', field: i, count: f.workers.length, kidIds: [...reviewed] }),
          );
          reviewBox.replaceChildren(
            heading,
            el('p', 'sheet-body-text', `All ${f.workers.length} kids will return by the Garden. Nothing is charged.`),
            el('p', 'sheet-body-text', 'Food in the pantry and progress toward the next bite stay.'),
            roomLine,
            el('div', 'plot-confirm-actions', keep, go),
          );
        }
      }
      // Live: the count, the rate, the next bite, the room, and what can be pressed now.
      const c = `${f.workers.length} / ${this.fm.kidsPerField} kids farming`;
      if (count.textContent !== c) count.textContent = c;
      const perHour = this.game.fieldRate(i) * 3600;
      const r = !f.food ? 'Choose a food to start.' : f.workers.length === 0 ? 'Paused · Assign a kid to keep farming.' : `${perHour % 1 === 0 ? perHour : perHour.toFixed(1)} ${perHour === 1 ? 'bite' : 'bites'} per hour · Next bite in ${formatDuration(Math.ceil((1 - f.progress) / this.game.fieldRate(i)))}`;
      if (rate.textContent !== r) rate.textContent = r;
      fill.style.width = `${100 * f.progress}%`;
      rail.setAttribute('aria-valuenow', String(Math.floor(100 * f.progress)));
      rail.setAttribute('aria-label', `Field ${n}, next bite ${Math.floor(100 * f.progress)} percent grown`);
      const busy = this.pending !== null || this.readOnly();
      for (const [id, b] of takeBack) {
        const pend = this.pending;
        const label = pend?.type === 'unfarm' && pend.kidId === id ? 'Taking back…' : 'Take back';
        if (b.textContent !== label) b.textContent = label;
        this.setEnabled(b, !busy && !review);
      }
      this.setEnabled(changeFood, !busy && !review);
      this.setEnabled(assign, !busy && !review && !!f.food && f.workers.length < this.fm.kidsPerField);
      takeAll.hidden = f.workers.length === 0 || review;
      this.setEnabled(takeAll, !busy);
      const roomLine = reviewBox.querySelector<HTMLElement>('.field-review-room');
      const go = reviewBox.querySelector<HTMLButtonElement>('.field-take-all-go');
      if (review && roomLine && go) {
        const room = Math.max(0, this.game.capacity - this.game.state.world.kids.length);
        const t = `Room needed: ${f.workers.length}. Room on map: ${room}.`;
        if (roomLine.textContent !== t) roomLine.textContent = t;
        this.setEnabled(go, !busy && room >= f.workers.length);
        if (this.pending?.type === 'emptyField' && go.textContent !== 'Taking back…') go.textContent = 'Taking back…';
      }
      // A finished Take all back closes its review.
      if (review && f.workers.length === 0) {
        review = false;
        built = '';
      }
      // The roster changed under the review (another field action, a stale page): it no longer
      // confirms anything; review again (§22.5).
      const now = f.workers.map((w) => w.id);
      if (review && !this.pending && (now.length !== reviewed.length || now.some((id) => !reviewed.includes(id)))) {
        review = false;
        built = '';
        this.notes.set(i, { lines: ['This field changed. Review it again before taking all kids back.'], warn: true });
      }
      note.set(this.notes.get(i) ?? null);
    };
    update();
    if (options.scrollTop) sheet.scrollTo(options.scrollTop);
  }

  // --- Choose food and change it (§22.3) ----------------------------------------------------

  /** `toField`: back to the field's page; `restore`: the food under review and scroll, as they were. */
  private openChooseFood(i: number, launcher: HTMLElement | null, toField: () => void, restore: { proposing?: string | null; scrollTop?: number } = {}): void {
    this.sheets.asPage({ label: 'Back to field', run: toField });
    const sheet = this.sheets.open({ key: 'field-food', icon: 'icon_fields', title: `Food for Field ${i + 1}`, requestedHeight: 624, update: () => update() }, launcher);
    this.page = { key: 'field-food', field: i, restore: (scrollTop) => this.openChooseFood(i, launcher, toField, { proposing, scrollTop }) };
    sheet.setSubtitle('One food per field.');
    const note = this.noteBox();
    const reviewBox = el('div', 'plot-review ui-surface field-change-review');
    reviewBox.hidden = true;
    const list = el('div', 'field-foods');
    sheet.body.append(note.node, reviewBox, list);
    let proposing: string | null = restore.proposing ?? null;
    const rows = this.content.balance.feeding.foods.map((food) => {
      const stock = el('span', 'feed-stock');
      const choose = this.button('Choose', 'feed-button field-choose', () => {
        const f = this.game.state.fields[i];
        if (!f) return;
        // No review when nothing is lost: no kids and no progress (§22.3).
        if (f.workers.length === 0 && f.progress === 0) {
          this.send({ type: 'setFieldFood', field: i, food: food.id, returning: 0 });
          sent = true;
          return;
        }
        proposing = food.id;
        shown = '';
        update();
        reviewBox.querySelector<HTMLElement>('.field-review-heading')?.focus();
      });
      choose.dataset.food = food.id;
      const node = el('div', 'feed-row ui-surface', icon(`icon_food_${food.id}`, '', 'ui-icon-32'), el('div', 'feed-text', el('span', 'feed-name', food.name), stock), choose);
      return { food, node, stock, choose };
    });
    list.append(...rows.map((r) => r.node));
    let shown = '';
    /** A food was sent from this page: when it's answered, back to the field (which says so). */
    let sent = false;
    const update = () => {
      const f = this.game.state.fields[i];
      if (!f) return;
      for (const r of rows) {
        const n = this.game.state.pantry[r.food.id] ?? 0;
        const t = `${formatExact(n)} ${plural(n, 'bite', 'bites')} in pantry${f.food === r.food.id ? ' · Growing here' : ''}`;
        if (r.stock.textContent !== t) r.stock.textContent = t;
        const current = f.food === r.food.id;
        const label = current ? 'Current' : 'Choose';
        if (r.choose.textContent !== label) r.choose.textContent = label;
        r.node.classList.toggle('is-selected', current);
        this.setEnabled(r.choose, !current && !this.pending && !this.readOnly() && proposing === null);
      }
      // A food set: back to the field's page, which says so. A refusal stays here.
      if (sent && !this.pending) {
        sent = false;
        if (!this.notes.get(i)?.warn) {
          toField();
          return;
        }
      }
      const key = `${proposing}|${f.food}|${f.workers.map((w) => w.id).join(',')}`;
      if (key !== shown) {
        shown = key;
        reviewBox.hidden = proposing === null;
        if (proposing !== null) {
          const to = proposing;
          const haters = f.workers.filter((w) => this.content.personality[w.type]?.hatedFood === to);
          const staying = f.workers.length - haters.length;
          const heading = el('h4', 'dex-home-confirm-title field-review-heading', `Change Field ${i + 1} to ${this.foodName(to)}?`);
          heading.tabIndex = -1;
          const keep = this.button(`Keep ${f.food ? this.foodName(f.food) : 'this field'}`, 'plot-action-full', () => {
            proposing = null;
            shown = '';
            update();
          });
          const change = this.button('Change food', 'sheet-action plot-confirm-action field-change-go', () => {
            this.send({ type: 'setFieldFood', field: i, food: to, returning: haters.length });
            sent = true;
          });
          reviewBox.replaceChildren(
            heading,
            el('p', 'sheet-body-text', `${f.food ? this.foodName(f.food) : 'Nothing'} → ${this.foodName(to)}`),
            el('p', 'sheet-body-text', 'Food already in the pantry stays there.'),
            el('p', 'sheet-body-text', 'Progress toward the next bite will be lost.'),
            el('p', 'sheet-body-text', staying > 0 ? `All ${staying} kids who can farm ${this.foodName(to)} will stay.` : 'No kids will stay farming.'),
            el(
              'p',
              'sheet-body-text',
              haters.length ? `${haters.length} ${plural(haters.length, 'kid won’t', 'kids won’t')} farm ${this.foodName(to)}. They will return by the Garden.` : 'No kids need to return to the map.',
            ),
            ...haters.map((h) => el('p', 'sheet-helper', h.name ?? this.kidName(h.type))),
            el('div', 'plot-confirm-actions', keep, change),
          );
        }
      }
      const go = reviewBox.querySelector<HTMLButtonElement>('.field-change-go');
      if (go) this.setEnabled(go, !this.pending && !this.readOnly());
      note.set(this.notes.get(i)?.warn ? this.notes.get(i)! : null);
    };
    update();
    if (restore.scrollTop) sheet.scrollTo(restore.scrollTop);
  }

  // --- Pick kids (§22.4) ----------------------------------------------------------------------

  /** `toField`: back to the field's page; `restore`: the selections, search and scroll, as they were. */
  private openPicker(i: number, launcher: HTMLElement | null, toField: () => void, restore: { draft?: number[]; search?: string; scrollTop?: number } = {}): void {
    this.sheets.asPage({ label: 'Back to field', run: toField });
    const sheet = this.sheets.open({ key: 'field-pick', icon: 'icon_fields', title: `Pick kids for Field ${i + 1}`, requestedHeight: 624, update: () => update() }, launcher);
    const draft: number[] = [...(restore.draft ?? [])];
    /** The food these kids are picked for: a change freezes the draft (§22.4). */
    const food = this.game.state.fields[i]?.food ?? null;
    const frozen = el('p', 'sheet-body-text field-pick-frozen', "This field's food changed. Review the field before assigning kids.");
    frozen.hidden = true;
    this.page = { key: 'field-pick', field: i, restore: (scrollTop) => this.openPicker(i, launcher, toField, { draft: [...draft], search: search.value, scrollTop }) };
    const helper = el('p', 'sheet-helper', 'They earn no Materials while farming. You can take them back any time.');
    const label = el('label', 'picker-search-label', 'Find a kid on your map');
    const search = el('input', 'picker-search') as HTMLInputElement;
    search.type = 'search';
    search.id = 'field-pick-search';
    search.value = restore.search ?? '';
    (label as HTMLLabelElement).htmlFor = search.id;
    search.addEventListener('input', () => update());
    const limit = el('p', 'sheet-helper picker-limit');
    const note = this.noteBox();
    const list = el('div', 'picker-list');
    const empty = el('p', 'sheet-body-text picker-empty');
    sheet.body.append(helper, frozen, label, search, limit, note.node, list, empty);
    const lines = el('p', 'sheet-helper field-pick-count');
    const go = el('button', 'ui-button sheet-action picker-add field-pick-go');
    go.type = 'button';
    go.dataset.cue = 'success';
    go.addEventListener('click', () => {
      if (go.getAttribute('aria-disabled') === 'true' || draft.length === 0) return;
      this.send({ type: 'farm', field: i, kidIds: [...draft], food });
      sent = true;
    });
    sheet.footer.append(lines, go);
    const rows = new Map<number, { node: HTMLElement; box: HTMLInputElement; text: string; hated: boolean }>();
    /** Kids were sent from this page: when it's answered, back to the field (which says so). */
    let sent = false;
    const update = () => {
      const f = this.game.state.fields[i];
      if (!f) return;
      sheet.setSubtitle(`${f.food ? this.foodName(f.food) : ''} · ${f.workers.length} / ${this.fm.kidsPerField} farming`);
      // Accepted: back to the field's page, which says so. A refusal stays here.
      if (sent && !this.pending) {
        sent = false;
        if (!this.notes.get(i)?.warn) {
          toField();
          return;
        }
      }
      const kids = [...this.game.state.world.kids].sort((a, b) => a.id - b.id);
      for (const [id, r] of rows) {
        if (kids.some((k) => k.id === id)) continue;
        r.node.remove();
        rows.delete(id);
        const at = draft.indexOf(id);
        if (at >= 0) draft.splice(at, 1);
      }
      for (const k of kids) {
        if (rows.has(k.id)) continue;
        const hated = !!f.food && this.content.personality[k.type]?.hatedFood === f.food;
        const fav = !!f.food && this.content.personality[k.type]?.favouriteFood === f.food;
        const box = el('input', 'picker-check') as HTMLInputElement;
        box.type = 'checkbox';
        box.dataset.kid = String(k.id);
        const relation = hated ? `Won’t farm ${this.foodName(f.food!)} · Hated food` : fav ? 'Favourite · Farms faster' : `Can farm ${f.food ? this.foodName(f.food) : ''}`;
        const node = el(
          'label',
          `ui-surface picker-row${hated ? ' is-warning' : ''}`,
          portrait(kidRig!, k.type, 48, k.look),
          el('span', 'picker-row-text', el('span', 'picker-row-name', k.name ?? this.kidName(k.type)), el('span', 'sheet-helper', `${k.name ? `${this.kidName(k.type)} · ` : ''}Tier ${this.tier(k.type)}`), el('span', 'sheet-helper', relation)),
          box,
        );
        box.addEventListener('change', () => {
          const at = draft.indexOf(k.id);
          if (box.checked && at < 0) draft.push(k.id);
          if (!box.checked && at >= 0) draft.splice(at, 1);
          update();
        });
        rows.set(k.id, { node, box, text: `${k.name ?? ''} ${this.kidName(k.type)}`.toLowerCase(), hated });
        list.append(node);
      }
      const free = Math.max(0, this.fm.kidsPerField - f.workers.length);
      const stale = f.food !== food;
      frozen.hidden = !stale;
      const q = search.value.trim().toLowerCase();
      let visible = 0;
      for (const [id, r] of rows) {
        r.node.hidden = !!q && !r.text.includes(q);
        if (!r.node.hidden) visible++;
        const chosen = draft.includes(id);
        r.box.checked = chosen;
        r.box.disabled = stale || r.hated || this.pending !== null || (!chosen && draft.length >= free);
      }
      limit.textContent = draft.length >= free && free > 0 ? `All ${free} spaces selected. Uncheck a kid to change your choice.` : '';
      limit.hidden = !limit.textContent;
      empty.textContent = kids.length === 0 ? 'No kids on your map yet.' : visible === 0 ? 'No matching kids. Your selections are kept.' : '';
      empty.hidden = !empty.textContent;
      const text = `${draft.length} selected · ${free} ${plural(free, 'space', 'spaces')}`;
      if (lines.textContent !== text) lines.textContent = text;
      const goLabel = this.pending?.type === 'farm' ? 'Assigning…' : draft.length === 0 ? 'Select kids to assign' : `Assign ${draft.length} ${plural(draft.length, 'kid', 'kids')}`;
      if (go.textContent !== goLabel) go.textContent = goLabel;
      const ok = draft.length > 0 && !stale && !this.pending && !this.readOnly();
      go.setAttribute('aria-disabled', String(!ok));
      go.classList.toggle('is-disabled', !ok);
      go.classList.toggle('ui-primary', ok);
      note.set(this.notes.get(i)?.warn ? this.notes.get(i)! : null);
    };
    update();
    if (restore.scrollTop) sheet.scrollTo(restore.scrollTop);
  }

  // --- the Pantry (§22.6) ---------------------------------------------------------------------

  /** The Pantry, with its way back; `scrollTop`: where it was, coming back from View fields. */
  openPantry(launcher: HTMLElement | null, back: { label: string; run: () => void }, scrollTop = 0): void {
    this.sheets.asPage(back);
    const sheet = this.sheets.open({ key: 'pantry', icon: 'icon_pantry', title: 'Pantry', requestedHeight: 624, update: () => update() }, launcher);
    this.page = { key: 'pantry', field: -1, restore: (scroll) => this.openPantry(launcher, back, scroll) };
    sheet.setSubtitle('Food grown in your fields.');
    // View fields keeps the way back here, and this page's own way back (§22.6).
    const viewFields = this.button('View fields', 'plot-action-full pantry-view-fields', () => {
      const scroll = this.sheets.snapshot()?.scrollTop ?? 0;
      this.openGardenFields(launcher, { label: 'Back to Pantry', run: () => this.openPantry(launcher, back, scroll) });
    });
    const helper = el('p', 'sheet-helper', 'Feed a kid from its card. Each Feed uses 1 bite.');
    const empty = el('p', 'sheet-body-text pantry-empty', 'Your pantry is empty. Choose a food in a field and assign a kid to grow it.');
    const total = el('h4', 'dex-home-confirm-title pantry-total');
    const rows = this.content.balance.feeding.foods.map((food) => {
      const stock = el('span', 'feed-stock');
      const node = el('div', 'feed-row ui-surface pantry-row', icon(`icon_food_${food.id}`, '', 'ui-icon-32'), el('div', 'feed-text', el('span', 'feed-name', food.name), stock));
      node.dataset.food = food.id;
      return { food, stock, node };
    });
    sheet.body.append(viewFields, helper, empty, total, ...rows.map((r) => r.node));
    const update = () => {
      let sum = 0;
      for (const r of rows) {
        const n = this.game.state.pantry[r.food.id] ?? 0;
        sum += n;
        const t = n === 0 ? '0 bites · None stored' : `${formatExact(n)} ${plural(n, 'bite', 'bites')}`;
        if (r.stock.textContent !== t) r.stock.textContent = t;
      }
      empty.hidden = sum > 0;
      const t = `Pantry: ${formatExact(sum)} ${plural(sum, 'bite', 'bites')} stored`;
      if (total.textContent !== t) total.textContent = t;
    };
    update();
    sheet.scrollTo(scrollTop);
  }
}
