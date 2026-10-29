import { kidRig, uiData } from '../content/artData';
import type { MapScene } from '../render/scene';
import type { Lessons } from '../sim/game';
import { el, icon } from './dom';
import { portrait } from './portrait';

// The first-run introduction (D-086, docs/GUI_MVP.md §27.1, Codex's design and copy): three
// tiny cards, skippable at every page, needing no game action and changing nothing in the game.
// Offered once when nothing else is in front, it resumes at its saved page, and can be previewed
// from `Tutorial & lessons` without touching what is saved. The game keeps running beneath it;
// world input and the rest of the page wait while it is open (§2). The mechanics themselves are
// taught later, one quiet lesson at a time (`lessonNotes.ts`).

interface Page {
  id: string;
  title: string;
  body: string;
  icons: string[];
  /** Kid sprites shown fusing (page 2): `a + b → icons[0]`. */
  demoTypes?: string[];
  /** The control it outlines, if any. */
  pointer: string | null;
}

interface Tokens {
  header: string;
  actions: { skip: string; close: string; back: string; next: string; done: string };
  iconCss: number;
  steps: Page[];
}

const tokens = () => (uiData?.mvp as { round4?: { intro?: Tokens } } | undefined)?.round4?.intro;

/** The control a page outlines (§27.1). */
const POINTER: Record<string, string> = { 'Dex tray': '[data-nav=dex]' };

export class Tutorial {
  private readonly root = el('div', 'tutorial');
  private readonly scrim = el('div', 'tutorial-scrim');
  private readonly spot = el('div', 'tutorial-spot');
  private readonly card = el('section', 'tutorial-card ui-surface');
  private page = 1;
  /** A preview from `Tutorial & lessons`: what is saved is left as it was (§27.3). */
  private replaying = false;
  private launcher: HTMLElement | null = null;
  private offered = false;
  /** What it made inert (anything already inert belongs to a sheet beneath). */
  private quieted: HTMLElement[] = [];
  /** Put aside for higher feedback (§27.3), to come back at the same page. */
  private aside: { page: number; replaying: boolean; launcher: HTMLElement | null } | null = null;
  /** The page on screen, for re-placing the outline. */
  private shown: Page | null = null;

  constructor(
    private readonly scene: MapScene,
    /** This save's introduction and lessons (§27.3). */
    private readonly lessons: () => Lessons,
    /** What waits while it is open: the HUD, the tray and the world (§2). */
    private readonly background: () => HTMLElement[],
    /** Where focus goes after the first-run introduction: the Garden control. */
    private readonly home: () => HTMLElement | null,
    private readonly reducedMotion: boolean,
    /** Whether a sheet owns world input now: closing hands it back to that, not to a snapshot. */
    private readonly sheetOpen: () => boolean,
    /** Saves the game: each page turned is kept (§27.1). */
    private readonly persist: () => void = () => {},
  ) {
    this.root.hidden = true;
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-modal', 'true');
    this.card.id = 'tutorial-card';
    this.root.append(this.scrim, this.spot, this.card);
    document.body.append(this.root);
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.skip();
      } else if (e.key === 'Tab') this.trapTab(e);
    });
    // A tap outside the card skips, as Close does (§27.1).
    this.scrim.addEventListener('click', () => this.skip());
  }

  /** The outline follows its control, and the card refits, when the HUD and tray lay out again. */
  relayout(): void {
    if (this.isOpen && this.shown) this.place(this.shown);
    if (this.isOpen) this.fit();
  }

  /** Keyboard focus stays in the card: Tab wraps from the last control to the first (§2). */
  private trapTab(e: KeyboardEvent): void {
    const items = [...this.card.querySelectorAll<HTMLElement>('button, [tabindex="0"], .tutorial-title')].filter((b) => !b.hidden);
    if (!items.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const at = document.activeElement;
    if (e.shiftKey && (at === first || !this.card.contains(at))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (at === last || !this.card.contains(at))) {
      e.preventDefault();
      first.focus();
    }
  }

  /** Higher feedback comes first (§27.3): the card steps aside until it is over. */
  stepAside(): void {
    if (!this.isOpen) return;
    this.aside = { page: this.page, replaying: this.replaying, launcher: this.launcher };
    this.teardown();
  }

  /** Afterwards: back at the same page, in the same mode. */
  comeBack(): void {
    const a = this.aside;
    if (!a || this.isOpen) return;
    this.aside = null;
    this.replaying = a.replaying;
    this.launcher = a.launcher;
    this.show(a.page);
  }

  get waiting(): boolean {
    return this.aside !== null;
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Whether the first-run introduction is behind the player: done or skipped (§27.3). */
  get settled(): boolean {
    const i = this.lessons().intro;
    return i === 'completed' || i === 'skipped';
  }

  private save(change: Partial<Pick<Lessons, 'intro' | 'introPage'>>): void {
    if (this.replaying) return;
    Object.assign(this.lessons(), change);
    this.persist();
  }

  /**
   * The first-run offer (§27.1): once a session, when nothing else is in front, unless it was
   * finished or skipped; an interrupted one resumes at its page. `allowed` is false for a
   * read-only (future-schema) save, and in tests unless asked for.
   */
  maybeOffer(allowed: boolean): void {
    if (this.offered || this.isOpen) return;
    this.offered = true;
    if (!allowed || this.settled) return;
    this.replaying = false;
    this.launcher = null;
    const l = this.lessons();
    this.show(l.intro === 'inProgress' ? l.introPage : 1);
  }

  /** A preview from page 1, from `Tutorial & lessons`; what is saved stays (§27.3). */
  replay(launcher: HTMLElement | null): void {
    this.replaying = true;
    this.launcher = launcher;
    this.show(1);
  }

  /** Android Back: skips, like Close and Escape (§27.1). Returns whether it was open. */
  back(): boolean {
    if (!this.isOpen) return false;
    this.skip();
    return true;
  }

  private show(n: number): void {
    const t = tokens();
    if (!t) return;
    const first = !this.isOpen;
    this.page = Math.min(t.steps.length, Math.max(1, n));
    this.save({ intro: 'inProgress', introPage: this.page });
    if (first) {
      this.scene.cancelDrag();
      this.scene.inputPaused = true;
      // A preview opens over the sheet it was asked from: that waits too, and gets focus back.
      this.quieted = [...this.background(), ...document.querySelectorAll<HTMLElement>('.sheet-layer, .sheet, .scrim')].filter((b) => !b.inert);
      for (const b of this.quieted) b.inert = true;
      document.documentElement.dataset.tutorialOpen = 'true';
      this.root.hidden = false;
      this.root.classList.toggle('is-entering', !this.reducedMotion);
      if (!this.reducedMotion) requestAnimationFrame(() => this.root.classList.remove('is-entering'));
    }
    this.render(t);
  }

  private render(t: Tokens): void {
    const p = t.steps[this.page - 1]!;
    const total = t.steps.length;
    const header = t.header.replace('{n}', String(this.page));
    const stepLine = el('p', 'tutorial-step', header);
    const title = el('h2', 'tutorial-title', p.title);
    title.id = 'tutorial-title';
    title.tabIndex = -1;
    // One announcement per page: the heading, focused, names the page.
    title.setAttribute('aria-label', `${header}: ${p.title}`);
    this.card.setAttribute('aria-labelledby', title.id);
    const close = el('button', 'ui-button tutorial-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', t.actions.close);
    close.addEventListener('click', () => this.skip());

    const picture = el('div', 'tutorial-diagram', ...this.picture(p, t.iconCss));
    picture.setAttribute('aria-hidden', 'true');
    const body = el('div', 'tutorial-body', el('p', 'tutorial-text', p.body));

    const button = (label: string, cls: string, run: () => void) => {
      const b = el('button', `ui-button ${cls}`, label);
      b.type = 'button';
      b.addEventListener('click', run);
      return b;
    };
    const footer = el('div', 'tutorial-footer', button(t.actions.skip, 'tutorial-skip', () => this.skip()));
    if (this.page > 1) footer.append(button(t.actions.back, 'tutorial-back', () => this.show(this.page - 1)));
    footer.append(
      this.page < total
        ? button(t.actions.next, 'ui-primary tutorial-next', () => this.show(this.page + 1))
        : button(t.actions.done, 'ui-primary tutorial-finish', () => this.finish()),
    );
    this.card.replaceChildren(el('div', 'tutorial-head', stepLine, close), title, el('div', 'tutorial-main', picture, body), footer);
    this.card.dataset.page = p.id;
    this.shown = p;
    this.place(p);
    this.fit();
    this.card.scrollTop = 0;
    title.focus({ preventScroll: true });
  }

  /**
   * A page's picture (§27.1): its icon, or on page 2 two kids, a plus, an arrow and the unknown
   * result. A labelled demo: nothing is found by it.
   */
  private picture(p: Page, size: number): HTMLElement[] {
    const glyph = (name: string) => {
      const img = icon(name, '', 'tutorial-icon');
      img.style.width = img.style.height = `${size}px`;
      return img;
    };
    if (!p.demoTypes || !kidRig) return p.icons.map(glyph);
    const [a, b] = p.demoTypes;
    const kid = (type: string) => el('span', 'tutorial-kid', portrait(kidRig!, type, size));
    return [kid(a!), el('span', 'tutorial-sign', '+'), kid(b!), el('span', 'tutorial-sign', '→'), ...p.icons.map(glyph)];
  }

  /** Too short for the card with a readable body: the whole card scrolls as one, all in flow. */
  private fit(): void {
    this.card.dataset.flow = 'false';
    const main = this.card.querySelector<HTMLElement>('.tutorial-main');
    if (main && main.clientHeight < 44) this.card.dataset.flow = 'true';
  }

  /** A static outline 3 px around the page's control, if it is on screen (§27.1). */
  private place(p: Page): void {
    const target = p.pointer && POINTER[p.pointer] ? document.querySelector<HTMLElement>(POINTER[p.pointer]!) : null;
    const r = target?.getBoundingClientRect();
    this.spot.hidden = !r || r.width === 0;
    if (!r || this.spot.hidden) return;
    Object.assign(this.spot.style, { left: `${r.left - 3}px`, top: `${r.top - 3}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px` });
  }

  private finish(): void {
    this.save({ intro: 'completed', introPage: tokens()?.steps.length ?? 3 });
    this.close();
  }

  private skip(): void {
    this.save({ intro: 'skipped' });
    this.close();
  }

  private close(): void {
    // A preview's launcher, or the same control rebuilt in its sheet after a return summary
    // replaced it; else Garden.
    const rebuilt = this.replaying ? document.querySelector<HTMLElement>('.sheet .lessons-intro') : null;
    const back = this.launcher?.isConnected ? this.launcher : (rebuilt ?? this.home());
    this.teardown();
    this.replaying = false;
    this.launcher = null;
    back?.focus({ preventScroll: true });
  }

  /** Off screen, and everything it held back handed to its current owner again. */
  private teardown(): void {
    this.root.hidden = true;
    this.shown = null;
    delete document.documentElement.dataset.tutorialOpen;
    for (const b of this.quieted) b.inert = false;
    this.quieted = [];
    // A sheet open now (one beneath, or one that opened meanwhile) keeps world input paused.
    this.scene.inputPaused = this.sheetOpen();
  }
}
