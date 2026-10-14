import { ZOOM_MAX, ZOOM_MIN, type MapScene } from '../render/scene';
import type { SettingsStore } from '../save/settings';
import type { BuildingSheets, SheetRestore } from './buildings';
import { el, icon } from './dom';
import { openSettings } from './settings';
import type { Sheets } from './sheet';

/** Notebook's tools, in order (GUI_MVP §23.3). */
const ROWS = [
  { key: 'pantry', label: 'Pantry' },
  { key: 'capacity', label: 'Capacity' },
  { key: 'bias', label: 'Spawn bias' },
  { key: 'compendium', label: 'Compendium' },
  { key: 'mapview', label: 'Map view' },
  { key: 'iconguide', label: 'Icon guide' },
  { key: 'settings', label: 'Settings' },
] as const;
type Row = (typeof ROWS)[number]['key'];

/** Every sheet the Notebook's navigation control stands for while it is open. */
export const NOTEBOOK_KEYS: ReadonlySet<string> = new Set(['notebook', ...ROWS.map((r) => r.key)]);

/** A labelled 48 px `Replay tutorial` action (§23.3). */
export function replayButton(replay: (launcher: HTMLElement) => void): HTMLButtonElement {
  const b = el('button', 'ui-button sheet-action tutorial-replay', 'Replay tutorial');
  b.type = 'button';
  b.addEventListener('click', () => replay(b));
  return b;
}

/** Map view's zoom step: in or out by √2 (GUI_MVP §20.1). */
const STEP = Math.SQRT2;
/** Within this of a limit, the zoom is at it (√2 steps don't land exactly). */
const EPS = 1e-9;

/**
 * The Notebook (GUI_MVP §19.2): the tools folded away from the HUD and tray (D-070), each
 * a page of the Notebook sheet with its way back; and Map view, the on-screen zoom (§20.1).
 * Every visual decision is Codex's (D-036); this class implements it.
 */
export class Notebook {
  constructor(
    private readonly scene: MapScene,
    private readonly sheets: Sheets,
    private readonly buildings: BuildingSheets,
    private readonly settings: SettingsStore,
    private readonly readOnly: () => boolean,
    /** Replays the tutorial, from the Icon guide or Settings (D-078, §23.3). */
    private readonly replay: (launcher: HTMLElement) => void,
    /** The Pantry, as a page of the Notebook (D-069). */
    private readonly openPantry?: (launcher: HTMLElement | null) => void,
  ) {}

  /** The Notebook's scroll when its open tool was opened. */
  private returnScroll = 0;

  /** Opens the Notebook; coming back from a tool, that tool's row has focus. */
  open(launcher: HTMLElement | null, from?: Row, scrollTop = 0): void {
    // A read-only save can't change its buildings: their rows are unavailable, with the
    // reason announced (GUI_MVP §10); Map view and Settings stay.
    const locked = (key: Row) => this.readOnly() && (key === 'capacity' || key === 'bias' || key === 'compendium');
    const sheet = this.sheets.open({ key: 'notebook', icon: 'icon_compendium', title: 'Notebook', requestedHeight: 480 }, launcher);
    sheet.setSubtitle('Tools for your garden.');
    const rows = ROWS.map((r) => {
      const b = el('button', 'ui-button notebook-row', r.label);
      b.type = 'button';
      b.dataset.row = r.key;
      if (locked(r.key)) {
        b.disabled = true;
        b.setAttribute('aria-label', `${r.label}: Update the game to continue.`);
      }
      // What scrolls may be the page, not the body (page mode): ask the sheets (Codex review, PR #87).
      b.addEventListener('click', () => this.openRow(r.key, launcher, this.sheets.snapshot()?.scrollTop ?? 0));
      return b;
    });
    sheet.body.append(...rows);
    sheet.scrollTo(scrollTop);
    const back = from && rows.find((b) => b.dataset.row === from);
    if (back) {
      back.focus({ preventScroll: true });
      back.scrollIntoView({ block: 'nearest' });
    }
  }

  /** Whether an open sheet's key is one of the Notebook's tools (all of them are its pages). */
  static isTool(key: string): key is Row {
    return ROWS.some((r) => r.key === key);
  }

  /**
   * A tool as a page of the Notebook (same shell, `Back to Notebook`). `restore` brings a
   * tool back where it was after the offline summary, still a page (Codex review, PR #87).
   */
  openRow(row: Row, launcher: HTMLElement | null, scrollTop = this.returnScroll, restore?: SheetRestore): void {
    // Where the Notebook was, for its way back: a tool restored after the offline summary
    // returns there too (Codex review, PR #87).
    this.returnScroll = scrollTop;
    this.sheets.asPage({
      label: 'Back to Notebook',
      run: () => {
        this.sheets.asPage();
        this.open(launcher, row, scrollTop);
      },
    });
    if (row === 'settings') openSettings(this.sheets, this.settings, launcher, restore?.scrollTop, this.replay);
    else if (row === 'mapview') this.openMapView(launcher, restore?.scrollTop);
    else if (row === 'pantry') this.openPantry?.(launcher);
    else if (row === 'iconguide') this.openIconGuide(launcher, restore?.scrollTop);
    else this.buildings.open(row, launcher, restore);
  }

  /**
   * The Icon guide (D-077, GUI_MVP §23.3): every HUD and tray icon with its name and what it's
   * for, in Codex's words. Nothing in it is a command.
   */
  openIconGuide(launcher: HTMLElement | null, scrollTop = 0): void {
    const sheet = this.sheets.open({ key: 'iconguide', icon: 'icon_compendium', title: 'Icon guide', requestedHeight: 480 }, launcher);
    sheet.setSubtitle('What every icon means.');
    const entries: [string, string, string][] = [
      ['icon_materials', 'Materials', 'Kids on the map earn these. Spend them on buildings, plots, fields, names or Compendium returns.'],
      ['icon_potatokens', 'Potatokens', 'Spend these on instant Garden spawns or Compendium returns. Each action shows its cost before you spend.'],
      ['icon_kids', 'Kids on map', 'Plot kids and farming kids are counted in their own pages. Capacity upgrades add map space.'],
      ['icon_r3_garden', 'Garden', 'Arrivals, planting plots, food fields and spawn-rate upgrades.'],
      ['icon_r3_dex', 'Potato-Dex', 'Your discoveries, found recipes and kids on the map.'],
      ['icon_r3_notebook', 'Notebook', 'Pantry, buildings, map view, this guide and Settings.'],
    ];
    sheet.body.append(
      ...entries.map(([glyph, title, text]) =>
        el('div', 'icon-guide-row', icon(glyph, '', 'ui-icon'), el('div', 'icon-guide-text', el('p', 'icon-guide-title', title), el('p', 'icon-guide-line', text))),
      ),
      replayButton(this.replay),
    );
    sheet.scrollTo(scrollTop);
  }

  /**
   * Map view (§20.1): zoom out, reset and in about the play band's centre as it was when the
   * Notebook opened it, and Find Garden. The world under the scrim follows; nothing closes
   * the sheet but Find Garden and Done.
   */
  openMapView(launcher: HTMLElement | null, scrollTop = 0): void {
    const at = this.scene.bandCentre();
    const sheet = this.sheets.open({ key: 'mapview', icon: 'icon_garden', title: 'Map view', requestedHeight: 480, update: () => render() }, launcher);
    sheet.setSubtitle('Pinch the map with two fingers.');
    const level = el('p', 'sheet-section mapview-level');
    level.setAttribute('aria-live', 'polite');
    const far = el('span', 'visually-hidden', 'Farthest view');
    far.id = 'mapview-far';
    const near = el('span', 'visually-hidden', 'Nearest view');
    near.id = 'mapview-near';
    const button = (label: string, onClick: () => void) => {
      const b = el('button', 'ui-button mapview-button', label);
      b.type = 'button';
      b.addEventListener('click', () => {
        if (b.getAttribute('aria-disabled') !== 'true') onClick();
      });
      return b;
    };
    const zoomTo = (f: number) => this.scene.zoomAround(at, f);
    const out = button('Zoom out', () => zoomTo(this.scene.zoom / STEP));
    const reset = button('Reset · 100%', () => zoomTo(1));
    const zin = button('Zoom in', () => zoomTo(this.scene.zoom * STEP));
    const find = button('Find Garden', () => {
      this.scene.findGarden();
      this.sheets.close();
    });
    const done = button('Done', () => this.sheets.close());
    sheet.body.append(level, out, reset, zin, find, done, far, near);
    sheet.scrollTo(scrollTop);
    let shown = '';
    const render = () => {
      const z = this.scene.zoom;
      const text = `Zoom ${Math.round(z * 100)}%`;
      if (text !== shown) level.textContent = shown = text;
      const atFar = z <= ZOOM_MIN + EPS;
      const atNear = z >= ZOOM_MAX - EPS;
      for (const [b, off, why] of [
        [out, atFar, far],
        [zin, atNear, near],
      ] as const) {
        b.setAttribute('aria-disabled', String(off));
        b.classList.toggle('is-disabled', off);
        if (off) b.setAttribute('aria-describedby', why.id);
        else b.removeAttribute('aria-describedby');
      }
    };
    render();
  }
}
