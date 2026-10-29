import { uiData } from '../content/artData';
import type { LessonId, Lessons } from '../sim/game';
import { el, icon } from './dom';
import { markSeen } from './lessons';

// The automatic lessons on screen (D-086, docs/GUI_MVP.md §27.3, Codex's design and copy): a
// quiet notebook note above the tray, one at a time, nonmodal. It never takes focus, never
// blocks the map, and steps out of the way of any gesture or sheet; what to show and when is
// decided here, from the saved queue (`lessons.ts`).

export interface LessonItem {
  id: LessonId;
  title: string;
  body: string;
  icons: string[];
  pointer: string | null;
  route: string;
}

interface Tokens {
  initialIdleMs: number;
  subsequentIdleMs: number;
  actions: { acknowledge: string; close: string; where: string };
  replayTitle: string;
  replayIntro: string;
  replaySeen: string;
  replayUnseen: string;
  replayBack: string;
  items: LessonItem[];
}

/** What counts as feedback, not a deliberate action (§27.3): the popup, a return summary, cards. */
const FEEDBACK = '.arrival, .arrival-scrim, .sheet[data-key="offline"], .feedback';

export const lessonTokens = () => (uiData?.mvp as { round4?: { lessons?: Tokens } } | undefined)?.round4?.lessons;

/** The control a lesson outlines (§27.2), when it is on screen. */
export const LESSON_POINTER: Record<string, string> = {
  'Garden tray': '[data-nav=garden]',
  'Notebook tray': '[data-nav=notebook]',
  'Potatokens HUD': '.hud-potatokens',
};

// Two lessons' pictograms are the plot's own map art (§27.2: `fx_plant_ready`, `fx_plant_plot`).
const fxUrls = import.meta.glob('../../assets/sprites/fx/fx_plant_*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** A lesson's pictograms, decorative: GUI icons, or the plot's map art drawn the same size. */
export function lessonIcons(item: LessonItem, cls: string): HTMLElement[] {
  return item.icons.map((name) => {
    const fx = name.startsWith('fx_') ? Object.entries(fxUrls).find(([p]) => p.endsWith(`/${name}.png`))?.[1] : undefined;
    if (!fx) return icon(name, '', cls);
    const img = el('img', `${cls} lesson-fx`);
    img.src = fx;
    img.dataset.icon = name;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    return img;
  });
}

export class LessonNotes {
  private readonly note = el('section', 'lesson-note ui-surface');
  private readonly spot = el('div', 'tutorial-spot lesson-spot');
  /** Tips are announced here, politely, once each a session (§27.3). */
  private readonly live = el('p', 'tray-label');
  private shown: LessonItem | null = null;
  private readonly announced = new Set<LessonId>();
  /** The last input anywhere: notes wait for the player to be idle. */
  private lastInput = performance.now();
  /** Pointers down now: no note while any is. */
  private readonly pointers = new Set<number>();
  /** After a note is acknowledged, the next waits for a deliberate action and a longer idle. */
  private acknowledged = false;
  private actedSince = false;
  /** Focus as it was when the note appeared: where Got it hands it back. */
  private before: HTMLElement | null = null;

  constructor(
    private readonly lessons: () => Lessons | null,
    /** The navigation tray: the note sits above it, and before it in the DOM. */
    private readonly tray: HTMLElement,
    /** The top of the play band (below the HUD and any banner). */
    private readonly bandTop: () => number,
    /** Where focus goes when nothing that had it is left (the Garden control). */
    private readonly home: () => HTMLElement | null,
    /** Saves the game: an acknowledged lesson is kept so (Codex review round 2, #120). */
    private readonly persist: () => void = () => {},
  ) {
    this.note.hidden = true;
    this.note.setAttribute('role', 'region');
    this.note.id = 'lesson-note';
    this.live.setAttribute('aria-live', 'polite');
    this.spot.hidden = true;
    tray.before(this.note);
    document.body.append(this.spot, this.live);
    // Input inside the note is the note's; a press anywhere else is a gesture beginning, and
    // the note gets out of its way first (§27.3).
    this.note.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.note.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      this.acknowledge(true);
    });
    // A key counts as input but never hides it: Tab must be able to reach it. Handling feedback
    // (a new-kid popup, a return summary, a card) is input, but no deliberate action (§27.3).
    const input = (e: Event) => {
      if (this.note.contains(e.target as Node)) return;
      this.lastInput = performance.now();
      const feedback = e.target instanceof Element && !!e.target.closest(FEEDBACK);
      if (this.acknowledged && !feedback) this.actedSince = true;
      if (this.shown && e.type !== 'keydown') this.hide();
    };
    document.addEventListener('pointerdown', input, true);
    document.addEventListener('keydown', input, true);
    document.addEventListener('wheel', input, { capture: true, passive: true });
    // A finger down anywhere holds notes back, and the idle time runs from its last move or its
    // release, not its press (Codex review, #120).
    const down = (e: PointerEvent) => this.pointers.add(e.pointerId);
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      this.lastInput = performance.now();
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
    // Hidden, a note goes back to waiting; back in front is a fresh session (§27.3): the first
    // note needs only 1000 ms idle again, and no finger is still down.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.shown) this.hide();
        return;
      }
      this.acknowledged = false;
      this.actedSince = false;
      this.pointers.clear();
      this.lastInput = performance.now();
    });
    document.addEventListener(
      'pointermove',
      (e) => {
        if (this.pointers.has(e.pointerId)) this.lastInput = performance.now();
      },
      { capture: true, passive: true },
    );
  }

  /** The lesson up now, if any. */
  get current(): LessonId | null {
    return this.shown?.id ?? null;
  }

  /** The lesson's note region, when up (tests, focus order). */
  get element(): HTMLElement {
    return this.note;
  }

  /**
   * Called every frame. `canShow`: nothing ahead of lessons holds the screen (§27.3: no sheet,
   * gesture, bubble, popup, summary, award, introduction or urgent banner), and the
   * introduction is done or skipped.
   */
  tick(now: number, canShow: boolean): void {
    const l = this.lessons();
    const t = lessonTokens();
    if (!l || !t) return;
    // Nothing while the app is hidden.
    if (document.hidden) {
      if (this.shown) this.hide();
      return;
    }
    if (this.shown) {
      // Seen meanwhile, its mechanic used: no longer needed.
      if (!l.pending.includes(this.shown.id)) this.hide();
      else if (!canShow || !this.fits()) this.hide();
      else this.place();
      return;
    }
    const next = l.pending[0];
    if (!canShow || !next || this.pointers.size > 0) return;
    const idle = now - this.lastInput;
    if (this.acknowledged ? !this.actedSince || idle < t.subsequentIdleMs : idle < t.initialIdleMs) return;
    const item = t.items.find((i) => i.id === next);
    if (item) this.show(item, t);
  }

  /** Android Back while focus is in the note acknowledges it, as Escape does (§27.3). */
  back(): boolean {
    if (!this.shown || !this.note.contains(document.activeElement)) return false;
    this.acknowledge(true);
    return true;
  }

  /** Out of sight, still waiting at the front of the queue (§27.3). */
  hide(): void {
    this.shown = null;
    this.note.hidden = true;
    this.spot.hidden = true;
  }

  private show(item: LessonItem, t: Tokens): void {
    this.before = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const title = el('h2', 'lesson-title', item.title);
    title.id = 'lesson-title';
    this.note.setAttribute('aria-labelledby', title.id);
    const close = el('button', 'ui-button lesson-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', t.actions.close);
    close.addEventListener('click', () => this.acknowledge(false));
    const route = el('p', 'lesson-route', el('span', 'lesson-route-label', 'How to find it'), ` ${item.route}`);
    route.id = 'lesson-route';
    route.hidden = true;
    const where = el('button', 'ui-button lesson-where', ...lessonIcons(item, 'ui-icon-28').slice(0, 1));
    where.type = 'button';
    where.setAttribute('aria-label', t.actions.where.replace('{title}', item.title));
    where.setAttribute('aria-expanded', 'false');
    where.setAttribute('aria-controls', route.id);
    where.addEventListener('click', () => {
      route.hidden = !route.hidden;
      where.setAttribute('aria-expanded', String(!route.hidden));
    });
    const ok = el('button', 'ui-button ui-primary lesson-ok', t.actions.acknowledge);
    ok.type = 'button';
    ok.addEventListener('click', () => this.acknowledge(false));
    this.note.replaceChildren(el('div', 'lesson-head', where, title, close), el('p', 'lesson-body', item.body), route, el('div', 'lesson-footer', ok));
    this.note.dataset.lesson = item.id;
    this.note.hidden = false;
    this.shown = item;
    if (!this.fits()) {
      this.hide();
      return;
    }
    this.place();
    if (!this.announced.has(item.id)) {
      this.announced.add(item.id);
      this.live.textContent = `Tip: ${item.title}. ${item.body}`;
    }
  }

  /** Wholly inside the play band, above the tray (§27.3); the route, expanded, may scroll. */
  private fits(): boolean {
    if (document.documentElement.dataset.hudFit === 'page') return false;
    const bottom = this.tray.getBoundingClientRect().top - 8;
    const room = bottom - this.bandTop() - 8;
    this.note.style.bottom = `${window.innerHeight - bottom}px`;
    // Its own height, without an expanded route (which may scroll instead), must fit.
    this.note.style.maxHeight = '';
    const route = this.note.querySelector<HTMLElement>('.lesson-route');
    const open = !!route && !route.hidden;
    if (open) route.hidden = true;
    const base = this.note.offsetHeight;
    if (open) route.hidden = false;
    this.note.style.maxHeight = `${Math.max(0, room)}px`;
    return base <= room;
  }

  /** The static outline round its control, if one is on screen and clear of the note. */
  private place(): void {
    const sel = this.shown?.pointer ? LESSON_POINTER[this.shown.pointer] : undefined;
    const target = sel ? document.querySelector<HTMLElement>(sel) : null;
    const r = target?.getBoundingClientRect();
    this.spot.hidden = !r || r.width === 0 || r.bottom <= 0 || r.top >= window.innerHeight;
    if (!r || this.spot.hidden) return;
    Object.assign(this.spot.style, { left: `${r.left - 3}px`, top: `${r.top - 3}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px` });
  }

  /**
   * Got it, Close, or Escape inside it (§27.3): seen for good. Focus goes back where it was, or
   * to the Garden, if it was in the note; a tap elsewhere doesn't move it.
   */
  private acknowledge(keyboard: boolean): void {
    const l = this.lessons();
    if (!this.shown || !l) return;
    const hadFocus = keyboard || this.note.contains(document.activeElement);
    markSeen(l, this.shown.id);
    this.persist();
    this.hide();
    this.acknowledged = true;
    this.actedSince = false;
    this.lastInput = performance.now();
    if (hadFocus) (this.before?.isConnected ? this.before : this.home())?.focus({ preventScroll: true });
  }
}
