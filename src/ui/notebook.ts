import { ZOOM_MAX, ZOOM_MIN, type MapScene } from '../render/scene';
import type { SettingsStore } from '../save/settings';
import type { BuildingSheets } from './buildings';
import { el } from './dom';
import { openSettings } from './settings';
import type { Sheets } from './sheet';

/** Notebook's tools, in order (GUI_MVP §19.2). */
const ROWS = [
  { key: 'capacity', label: 'Capacity' },
  { key: 'bias', label: 'Spawn bias' },
  { key: 'compendium', label: 'Compendium' },
  { key: 'mapview', label: 'Map view' },
  { key: 'settings', label: 'Settings' },
] as const;
type Row = (typeof ROWS)[number]['key'];

/** Every sheet the Notebook's navigation control stands for while it is open. */
export const NOTEBOOK_KEYS: ReadonlySet<string> = new Set(['notebook', ...ROWS.map((r) => r.key)]);

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
  ) {}

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
      b.addEventListener('click', () => this.openRow(r.key, launcher, sheet.body.scrollTop));
      return b;
    });
    sheet.body.append(...rows);
    sheet.scrollTo(scrollTop);
    if (from) rows.find((b) => b.dataset.row === from)?.focus({ preventScroll: true });
  }

  /** A tool as a page of the Notebook (same shell, `Back to Notebook`). */
  private openRow(row: Row, launcher: HTMLElement | null, scrollTop: number): void {
    this.sheets.asPage({
      label: 'Back to Notebook',
      run: () => {
        this.sheets.asPage();
        this.open(launcher, row, scrollTop);
      },
    });
    if (row === 'settings') openSettings(this.sheets, this.settings, launcher);
    else if (row === 'mapview') this.openMapView(launcher);
    else this.buildings.open(row, launcher);
  }

  /**
   * Map view (§20.1): zoom out, reset and in about the play band's centre as it was when the
   * Notebook opened it, and Find Garden. The world under the scrim follows; nothing closes
   * the sheet but Find Garden and Done.
   */
  openMapView(launcher: HTMLElement | null): void {
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
      this.scene.zoomAround(this.scene.gardenPoint, this.scene.zoom);
      this.sheets.close();
    });
    const done = button('Done', () => this.sheets.close());
    sheet.body.append(level, out, reset, zin, find, done, far, near);
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
