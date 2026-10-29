import type { Lessons } from '../sim/game';
import { el } from './dom';
import { lessonIcons, lessonTokens, type LessonItem } from './lessonNotes';
import type { OpenSheet, Sheets } from './sheet';

/**
 * `Tutorial & lessons` (D-086, docs/GUI_MVP.md §27.3, Codex's design and copy): the
 * introduction as a preview, then every lesson by name, each replayable on its own inside the
 * sheet. A replay changes nothing: no seen flag, no purchase, no reveal; no funds are needed.
 */
export class LessonsSheet {
  /** The lesson replayed in the sheet now, if any: a return summary brings it back (§27.3). */
  private viewing: LessonItem | null = null;

  constructor(
    private readonly sheets: Sheets,
    private readonly lessons: () => Lessons | null,
    /** Previews the introduction over this sheet; its launcher gets focus back. */
    private readonly previewIntro: (launcher: HTMLElement) => void,
  ) {}

  /**
   * The list, as a page of the sheet it was asked from (`page`: its way back); `focusId` is the
   * row to focus, coming back from a lesson.
   */
  open(launcher: HTMLElement | null, page: { label: string; run: () => void } | null, focusId?: string): OpenSheet | null {
    const t = lessonTokens();
    if (!t) return null;
    this.viewing = null;
    this.sheets.asPage(page);
    const sheet = this.sheets.open({ key: 'lessons', icon: 'icon_compendium', title: t.replayTitle, requestedHeight: 600 }, launcher);
    const seen = new Set(this.lessons()?.seen ?? []);
    const intro = el('button', 'ui-button lessons-row lessons-intro', el('span', 'lessons-title', t.replayIntro));
    intro.type = 'button';
    intro.addEventListener('click', () => this.previewIntro(intro));
    const rows = t.items.map((item) => {
      const state = seen.has(item.id) ? t.replaySeen : t.replayUnseen;
      const b = el('button', 'ui-button lessons-row', ...lessonIcons(item, 'ui-icon-28').slice(0, 1), el('span', 'lessons-title', item.title), el('span', 'lessons-state', state));
      b.type = 'button';
      b.dataset.lesson = item.id;
      b.addEventListener('click', () => this.lesson(item, launcher, page));
      return b;
    });
    const list = el('div', 'lessons-list', intro, ...rows);
    sheet.body.append(list);
    const back = focusId ? rows.find((r) => r.dataset.lesson === focusId) : undefined;
    back?.focus({ preventScroll: true });
    back?.scrollIntoView({ block: 'nearest' });
    return sheet;
  }

  /** One lesson, replayed in the same sheet with its route shown (§27.3). */
  private lesson(item: LessonItem, launcher: HTMLElement | null, page: { label: string; run: () => void } | null): OpenSheet {
    const t = lessonTokens()!;
    this.sheets.asPage(page);
    const sheet = this.sheets.open({ key: 'lessons', icon: 'icon_compendium', title: t.replayTitle, requestedHeight: 600 }, launcher);
    this.viewing = item;
    const title = el('h3', 'lessons-lesson-title', ...lessonIcons(item, 'ui-icon-28'), el('span', '', item.title));
    title.tabIndex = -1;
    const back = el('button', 'ui-button sheet-action', t.replayBack);
    back.type = 'button';
    back.addEventListener('click', () => this.open(launcher, page, item.id));
    const close = el('button', 'ui-button sheet-action', 'Close');
    close.type = 'button';
    close.addEventListener('click', () => this.sheets.close());
    sheet.body.append(
      el('div', 'lessons-lesson', title, el('p', 'lesson-body', item.body), el('p', 'lesson-route', el('span', 'lesson-route-label', 'How to find it'), ` ${item.route}`)),
      el('div', 'lessons-actions', back, close),
    );
    title.focus({ preventScroll: true });
    return sheet;
  }

  /**
   * Back after a return summary (Codex review round 3, #120): the lesson that was being read,
   * else the list, scrolled where it was.
   */
  reopen(launcher: HTMLElement | null, page: { label: string; run: () => void } | null, scrollTop: number): void {
    const item = this.viewing;
    const sheet = item ? this.lesson(item, launcher, page) : this.open(launcher, page);
    sheet?.scrollTo(scrollTop);
  }
}
