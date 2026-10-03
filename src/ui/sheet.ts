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
  /** Scrolls whatever scrolls (the body, or a tight sheet) to `top`. */
  scrollTo(top: number): void;
}

/** Where an open sheet was, so it can come back after a summary interrupts it (GUI_MVP §8). */
export interface SheetSnapshot {
  key: string;
  scrollTop: number;
  launcher: HTMLElement | null;
}

/** Least body height beside a fixed bar: one 44 px control and its label (GUI_MVP §§2, 6). */
const BODY_MIN = 22 + 4 + 44 + 16;

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
  private current: {
    spec: SheetSpec;
    scrim: HTMLElement;
    sheet: HTMLElement;
    subtitle: HTMLElement;
    bar: HTMLElement;
    body: HTMLElement;
    footer: HTMLElement;
    launcher: HTMLElement | null;
    watch: ResizeObserver;
  } | null = null;
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
    // A soft keyboard may shrink only the visual viewport: the sheet follows it, so its
    // lower controls stay above the keyboard (GUI_MVP §2; Codex review, PR #41).
    window.visualViewport?.addEventListener('resize', () => this.place());
    window.visualViewport?.addEventListener('scroll', () => this.place());
  }

  get isOpen(): boolean {
    return this.current !== null;
  }

  get openKey(): string | null {
    return this.current?.spec.key ?? null;
  }

  snapshot(): SheetSnapshot | null {
    const c = this.current;
    return c && { key: c.spec.key, scrollTop: this.scroller(c).scrollTop, launcher: c.launcher };
  }

  /**
   * What scrolls the open sheet's content: its body; the whole sheet when tight (see
   * `place`); or, in page mode, the page itself (GUI_MVP §3.1; Codex review, PR #41).
   */
  private scroller(c: { sheet: HTMLElement; body: HTMLElement }): Element {
    if (document.documentElement.dataset.hudFit === 'page') return document.scrollingElement ?? document.documentElement;
    return c.sheet.dataset.tight === 'true' ? c.sheet : c.body;
  }

  /** The element to observe visibility against (null: the page's viewport). */
  get scrollRoot(): Element | null {
    const c = this.current;
    if (!c || document.documentElement.dataset.hudFit === 'page') return null;
    return this.scroller(c);
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

    // The bar grows when a status appears: the fit is checked again (see `place`).
    const watch = new ResizeObserver(() => this.place());
    watch.observe(bar);
    this.current = { spec, scrim, sheet, subtitle, bar, body, footer, launcher, watch };
    this.place();
    this.animate(true);
    title.focus({ preventScroll: true });
    const current = this.current;
    return {
      key: spec.key,
      bar,
      body,
      footer,
      setSubtitle: (t) => (subtitle.textContent = t),
      scrollTo: (top) => {
        this.place();
        this.scroller(current).scrollTop = top;
      },
    };
  }

  /** Closes the open sheet; focus returns to whatever opened it (GUI_MVP §2). */
  close(restoreFocus = true): void {
    const c = this.current;
    if (!c) return;
    this.current = null;
    c.watch.disconnect();
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
    const vv = window.visualViewport;
    const w = vv?.width ?? window.innerWidth;
    const h = vv?.height ?? window.innerHeight;
    // The layout viewport below the visible one (a soft keyboard), which the sheet clears.
    const hidden = vv ? Math.max(0, window.innerHeight - vv.offsetTop - vv.height) : 0;
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
    c.sheet.style.bottom = `${sb + hidden}px`;
    c.sheet.dataset.compact = String(compact);
    this.fitBar(c);
  }

  /**
   * A fixed bar (the Compendium's balances, message and status) may leave the body too
   * little room on a short screen, hiding search and every card. Then the bar scrolls with
   * the body under a sticky header and footer, so every control stays reachable (GUI_MVP
   * §2 required-action visibility; Codex review, PR #41).
   */
  private fitBar(c: { sheet: HTMLElement; bar: HTMLElement; body: HTMLElement }): void {
    const was = c.sheet.dataset.tight === 'true';
    const scroll = was ? c.sheet.scrollTop : c.body.scrollTop;
    c.sheet.dataset.tight = 'false';
    const tight = c.bar.childElementCount > 0 && c.body.clientHeight < BODY_MIN;
    c.sheet.dataset.tight = String(tight);
    if (tight !== was) (tight ? c.sheet : c.body).scrollTop = scroll;
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
