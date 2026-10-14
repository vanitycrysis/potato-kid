import { kidRig, uiData } from '../content/artData';
import type { MapScene } from '../render/scene';
import type { SettingsStore, TutorialRecord } from '../save/settings';
import { el, icon } from './dom';
import { portrait } from './portrait';

// The first-run tutorial (D-078, docs/GUI_MVP.md §24, Codex's design and copy): eight cards,
// skippable at every step, needing no game action. It is offered once on the first interactive
// opening with no record, existing saves included, resumes where it was left, and can be
// replayed from the Icon guide or Settings without touching the saved record. The game keeps
// running beneath it; world input and the rest of the page wait while it is open (§2).

interface Art {
  type?: string;
  icon?: string;
  css: number;
  dark?: boolean;
}

interface Step {
  step: number;
  spotlight: string;
  title: string;
  paragraphs: string[];
  diagramNodes: { label: string; art: Art[] }[];
}

interface Tokens {
  firstRunHeader: string;
  replayHeader: string;
  hint: string;
  actions: { skip: string; skipAccessible: string; back: string; next: string; finish: string; replay: string };
  card: { entryMs: number };
  steps: Step[];
}

const tokens = () => (uiData?.mvp as { round3?: { tutorial?: Tokens } } | undefined)?.round3?.tutorial;

/** The spotlight's target for each lesson (§24.2); a card demo has none. */
const SPOTLIGHT: Record<string, string> = {
  'Dex tray': '[data-nav=dex]',
  'HUD group': '.hud',
  'Garden tray': '[data-nav=garden]',
  'Notebook tray': '[data-nav=notebook]',
};

export class Tutorial {
  private readonly root = el('div', 'tutorial');
  private readonly scrim = el('div', 'tutorial-scrim');
  private readonly spot = el('div', 'tutorial-spot');
  private readonly card = el('section', 'tutorial-card ui-surface');
  private step = 1;
  /** A replay is a session of its own: the saved record is left as it was (§24.1). */
  private replaying = false;
  private launcher: HTMLElement | null = null;
  private offered = false;
  /** What it made inert, and whether world input was already paused (a sheet beneath). */
  private quieted: HTMLElement[] = [];
  private wasPaused = false;

  constructor(
    private readonly scene: MapScene,
    private readonly settings: SettingsStore,
    /** What waits while it is open: the HUD, the tray and the world (§2). */
    private readonly background: () => HTMLElement[],
    /** Where focus goes after a first-run tutorial: the Garden control (§24.1). */
    private readonly home: () => HTMLElement | null,
    private readonly reducedMotion: boolean,
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
      }
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  private get record(): TutorialRecord {
    return this.settings.value.guidedTutorial;
  }

  private save(change: Partial<TutorialRecord>): void {
    if (this.replaying) return;
    this.settings.set({ guidedTutorial: { ...this.record, ...change } });
  }

  /**
   * The first-run offer (§24.1): once, when nothing else is in front, if it was never finished
   * or skipped; an interrupted one resumes at its step. `allowed` is false for a read-only
   * (future-schema) save, and in tests unless asked for.
   */
  maybeOffer(allowed: boolean): void {
    if (this.offered || this.isOpen) return;
    this.offered = true;
    const r = this.record;
    if (!allowed || r.status === 'skipped' || r.status === 'completed') return;
    this.replaying = false;
    this.launcher = null;
    this.show(r.status === 'inProgress' ? r.nextStep : 1);
  }

  /** Replays from step 1, from the Icon guide or Settings; the saved record stays (§24.1). */
  replay(launcher: HTMLElement | null): void {
    this.replaying = true;
    this.launcher = launcher;
    this.show(1);
  }

  /** Android Back: skips, like Close and Escape (§24.1). Returns whether it was open. */
  back(): boolean {
    if (!this.isOpen) return false;
    this.skip();
    return true;
  }

  private show(n: number): void {
    const t = tokens();
    if (!t) return;
    const first = !this.isOpen;
    this.step = Math.min(t.steps.length, Math.max(1, n));
    this.save({ status: 'inProgress', nextStep: this.step });
    if (first) {
      this.scene.cancelDrag();
      this.wasPaused = this.scene.inputPaused;
      this.scene.inputPaused = true;
      // A replay opens over the sheet it was asked from: that waits too, and gets focus back.
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
    const s = t.steps[this.step - 1]!;
    const total = t.steps.length;
    const header = (this.replaying ? t.replayHeader : t.firstRunHeader).replace('{n}', String(this.step));
    const stepLine = el('p', 'tutorial-step', header);
    const title = el('h2', 'tutorial-title', s.title);
    title.id = 'tutorial-title';
    title.tabIndex = -1;
    // One announcement per page: the heading, focused, names the step (§24.1).
    title.setAttribute('aria-label', `${header}: ${s.title}`);
    this.card.setAttribute('aria-labelledby', title.id);
    const close = el('button', 'ui-button tutorial-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', t.actions.skipAccessible);
    close.addEventListener('click', () => this.skip());

    const diagram = el(
      'div',
      'tutorial-diagram',
      ...s.diagramNodes.map((node) =>
        el(
          'figure',
          'tutorial-node',
          el('div', 'tutorial-art', ...node.art.map((a) => this.art(a))),
          el('figcaption', 'tutorial-label', node.label),
        ),
      ),
    );
    diagram.setAttribute('aria-hidden', 'true');
    const body = el('div', 'tutorial-body', ...s.paragraphs.map((p) => el('p', 'tutorial-text', p)));

    const button = (label: string, cls: string, run: () => void, accessible?: string) => {
      const b = el('button', `ui-button ${cls}`, label);
      b.type = 'button';
      if (accessible) b.setAttribute('aria-label', accessible);
      b.addEventListener('click', run);
      return b;
    };
    const footer = el('div', 'tutorial-footer', button(t.actions.skip, 'tutorial-skip', () => this.skip()));
    if (this.step > 1) footer.append(button(t.actions.back, 'tutorial-back', () => this.show(this.step - 1)));
    footer.append(
      this.step < total
        ? button(t.actions.next, 'ui-primary tutorial-next', () => this.show(this.step + 1))
        : button(t.actions.finish, 'ui-primary tutorial-finish', () => this.finish()),
    );
    this.card.replaceChildren(el('div', 'tutorial-head', stepLine, close), title, el('div', 'tutorial-main', diagram, body), footer, el('p', 'tutorial-hint', t.hint));
    this.place(s);
    title.focus({ preventScroll: true });
  }

  /** One diagram picture: a kid's portrait (dark if an unfound result) or a GUI icon. */
  private art(a: Art): HTMLElement {
    if (a.type && kidRig) {
      const p = el('span', `tutorial-kid${a.dark ? ' recipe-unfound' : ''}`, portrait(kidRig, a.type, a.css));
      return p;
    }
    const img = icon(a.icon ?? 'icon_check', '', 'tutorial-icon');
    img.style.width = img.style.height = `${a.css}px`;
    return img;
  }

  /** A static outline 3 px around the lesson's control, behind the card (§24.2). */
  private place(s: Step): void {
    const target = SPOTLIGHT[s.spotlight] ? document.querySelector<HTMLElement>(SPOTLIGHT[s.spotlight]!) : null;
    const r = target?.getBoundingClientRect();
    this.spot.hidden = !r || r.width === 0;
    if (!r || this.spot.hidden) return;
    Object.assign(this.spot.style, { left: `${r.left - 3}px`, top: `${r.top - 3}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px` });
  }

  private finish(): void {
    this.save({ status: 'completed', nextStep: tokens()?.steps.length ?? 8 });
    this.close();
  }

  private skip(): void {
    this.save({ status: 'skipped' });
    this.close();
  }

  private close(): void {
    this.root.hidden = true;
    delete document.documentElement.dataset.tutorialOpen;
    for (const b of this.quieted) b.inert = false;
    this.quieted = [];
    this.scene.inputPaused = this.wasPaused;
    const back = this.launcher?.isConnected ? this.launcher : this.home();
    this.replaying = false;
    this.launcher = null;
    back?.focus({ preventScroll: true });
  }
}
