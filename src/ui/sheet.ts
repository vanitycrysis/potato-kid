import { uiData } from '../content/artData';
import type { MapScene } from '../render/scene';
import { el, icon } from './dom';
import './sheets.css';

// The modal sheet shell (docs/GUI_MVP.md §2): one sheet at a time over a 0.24 ink scrim,
// sized and placed by Codex's rules, with a fixed header and optional footer around a
// scrolling body. Every visual decision is Codex's (D-036); this file implements it.

export interface SheetSpec {
  /** Which sheet (the tray cell that opened it shows as selected). */
  key: string;
  icon: string;
  title: string;
  /** Requested height before the §2 caps (GUI_MVP §2, ui_v2 mvp.sheets.requestedHeightsPx). */
  requestedHeight: number;
  /** Called every frame while open, so live values (balances, levels) stay current. */
  update?: () => void;
  /** `replaced`: another sheet is opening in its place (not a player's dismissal). */
  onClose?: (replaced: boolean) => void;
}

export interface OpenSheet {
  readonly key: string;
  /** A fixed region between the header and the scrolling body (Compendium toolbar). */
  readonly bar: HTMLElement;
  readonly body: HTMLElement;
  readonly footer: HTMLElement;
  setSubtitle(text: string): void;
}

/** Where an open sheet was, so it can come back after a summary interrupts it (GUI_MVP §8). */
export interface SheetSnapshot {
  key: string;
  scrollTop: number;
  launcher: HTMLElement | null;
}

const motion = () => (uiData?.mvp as { motion?: { openMs: number; closeMs: number; sheetTranslatePx: number } } | undefined)?.motion;

/** The device's safe-area insets in CSS px, measured (CSS env() can't be read directly). */
function safeInsets(): { top: number; bottom: number; left: number; right: number } {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;top:env(safe-area-inset-top);bottom:env(safe-area-inset-bottom);left:env(safe-area-inset-left);right:env(safe-area-inset-right)';
  document.body.append(probe);
  const cs = getComputedStyle(probe);
  const out = { top: parseFloat(cs.top) || 0, bottom: parseFloat(cs.bottom) || 0, left: parseFloat(cs.left) || 0, right: parseFloat(cs.right) || 0 };
  probe.remove();
  return out;
}

export class Sheets {
  private current: { spec: SheetSpec; scrim: HTMLElement; sheet: HTMLElement; subtitle: HTMLElement; body: HTMLElement; footer: HTMLElement; launcher: HTMLElement | null } | null = null;
  /** True while `open` replaces a sheet, so its onClose knows it wasn't dismissed. */
  private replacing = false;
  private readonly onKey = (e: KeyboardEvent) => this.key(e);

  constructor(
    private readonly scene: MapScene,
    /** Background regions made inert while a sheet is open. */
    private readonly background: () => HTMLElement[],
    /** Height taken by a persistent banner (+ its 8 px gap), which the sheet must not cover. */
    private readonly bannerSpace: () => number,
    private readonly reducedMotion: boolean,
  ) {
    window.addEventListener('resize', () => this.place());
  }

  get isOpen(): boolean {
    return this.current !== null;
  }

  get openKey(): string | null {
    return this.current?.spec.key ?? null;
  }

  snapshot(): SheetSnapshot | null {
    const c = this.current;
    return c && { key: c.spec.key, scrollTop: c.body.scrollTop, launcher: c.launcher };
  }

  /**
   * Opens a sheet (closing any other). A held kid is settled first and world input is
   * paused while it is open; simulation and income continue (GUI_MVP §2).
   */
  open(spec: SheetSpec, launcher: HTMLElement | null): OpenSheet {
    if (this.current) {
      this.replacing = true;
      this.close(false);
      this.replacing = false;
    }
    this.scene.cancelDrag();
    this.scene.inputPaused = true;

    const scrim = el('div', 'sheet-scrim');
    // Close on click, after the press's default focus change, so focus can return to the
    // launcher (a pointerdown close would lose it to the page).
    scrim.addEventListener('click', (e) => {
      if (e.target === scrim) this.close();
    });
    const titleId = `sheet-title-${spec.key}`;
    const title = el('h2', 'sheet-title', spec.title);
    title.id = titleId;
    title.tabIndex = -1;
    const subtitle = el('p', 'sheet-subtitle');
    const close = el('button', 'ui-button sheet-close', icon('icon_close', '', 'ui-icon-24'));
    close.type = 'button';
    close.setAttribute('aria-label', `Close ${spec.title}`);
    close.addEventListener('click', () => this.close());
    const header = el('header', 'sheet-header', icon(spec.icon, '', 'ui-icon-28 sheet-icon'), title, subtitle, close);
    const bar = el('div', 'sheet-bar');
    const body = el('div', 'sheet-body');
    const footer = el('footer', 'sheet-footer');
    const sheet = el('section', 'sheet ui-surface', header, bar, body, footer);
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', titleId);
    // UI touches never reach the world (D-022).
    for (const t of [scrim, sheet]) t.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.append(scrim, sheet);
    document.documentElement.dataset.sheetOpen = 'true';
    for (const b of this.background()) b.inert = true;
    document.addEventListener('keydown', this.onKey, true);

    this.current = { spec, scrim, sheet, subtitle, body, footer, launcher };
    this.place();
    this.animate(true);
    title.focus({ preventScroll: true });
    return { key: spec.key, bar, body, footer, setSubtitle: (t) => (subtitle.textContent = t) };
  }

  /** Closes the open sheet; focus returns to whatever opened it (GUI_MVP §2). */
  close(restoreFocus = true): void {
    const c = this.current;
    if (!c) return;
    this.current = null;
    delete document.documentElement.dataset.sheetOpen;
    document.removeEventListener('keydown', this.onKey, true);
    for (const b of this.background()) b.inert = false;
    this.scene.inputPaused = false;
    const m = motion();
    const remove = () => {
      c.scrim.remove();
      c.sheet.remove();
    };
    // While it fades out, the closed sheet takes no input: a touch right after closing
    // reaches the world, not the vanishing scrim.
    for (const t of [c.scrim, c.sheet]) t.style.pointerEvents = 'none';
    c.sheet.inert = true;
    if (this.reducedMotion || !m) remove();
    else {
      c.scrim.style.transition = `opacity ${m.closeMs}ms ease-in`;
      c.sheet.style.transition = `transform ${m.closeMs}ms ease-in, opacity ${m.closeMs}ms ease-in`;
      c.scrim.style.opacity = '0';
      c.sheet.style.opacity = '0';
      c.sheet.style.transform = `translateY(${m.sheetTranslatePx}px)`;
      window.setTimeout(remove, m.closeMs);
    }
    c.spec.onClose?.(this.replacing);
    if (restoreFocus) c.launcher?.focus({ preventScroll: true });
  }

  /** Android Back: closes a sheet if one is open (returns whether it did). */
  back(): boolean {
    if (!this.current) return false;
    this.close();
    return true;
  }

  /** Per-frame refresh of the open sheet's live values. */
  tick(): void {
    this.current?.spec.update?.();
  }

  /**
   * Geometry (GUI_MVP §2): width min(600, W − ML − MR), centred, bottom at H − SB; height
   * min(requested, ⌊0.8 × UA⌋) in portrait, min(requested, UA − 16) when compact, where UA
   * is the usable height minus any persistent banner.
   */
  place(): void {
    const c = this.current;
    if (!c) return;
    // Page mode (GUI_MVP §3.1) is laid out by sheets.css, which overrides this geometry.
    const inset = safeInsets();
    const w = window.visualViewport?.width ?? window.innerWidth;
    const h = window.visualViewport?.height ?? window.innerHeight;
    const compact = h <= 520;
    const st = Math.max(compact ? 8 : 24, inset.top);
    const sb = Math.max(compact ? 8 : 24, inset.bottom);
    const ml = Math.max(8, inset.left);
    const mr = Math.max(8, inset.right);
    const ua = h - st - sb - this.bannerSpace();
    const height = compact ? Math.min(c.spec.requestedHeight, ua - 16) : Math.min(c.spec.requestedHeight, Math.floor(0.8 * ua));
    const width = Math.min(600, w - ml - mr);
    c.sheet.style.width = `${width}px`;
    c.sheet.style.height = `${Math.max(0, height)}px`;
    c.sheet.style.left = `${ml + (w - ml - mr - width) / 2}px`;
    c.sheet.style.bottom = `${sb}px`;
    c.sheet.dataset.compact = String(compact);
  }

  private animate(opening: boolean): void {
    const c = this.current;
    const m = motion();
    if (!c || !opening || this.reducedMotion || !m) return;
    c.scrim.style.opacity = '0';
    c.sheet.style.opacity = '0';
    c.sheet.style.transform = `translateY(${m.sheetTranslatePx}px)`;
    requestAnimationFrame(() => {
      c.scrim.style.transition = `opacity ${m.openMs}ms ease-out`;
      c.sheet.style.transition = `transform ${m.openMs}ms ease-out, opacity ${m.openMs}ms ease-out`;
      c.scrim.style.opacity = '1';
      c.sheet.style.opacity = '1';
      c.sheet.style.transform = 'none';
    });
  }

  /** Escape closes; Tab stays inside the sheet (focus trap). */
  private key(e: KeyboardEvent): void {
    const c = this.current;
    if (!c) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusables = [...c.sheet.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
      (x) => !x.hasAttribute('disabled') && x.offsetParent !== null,
    );
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    // Backward from the first stop, or from anything not in the tab order (the heading
    // focused on open), wraps to the last stop (Codex review, PR #39).
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && (active === first || !active || !focusables.includes(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}
