import { kidRig, type KidRig } from '../content/artData';
import type { Content, KidId } from '../content/types';
import { AnimatedPortrait } from './animatedPortrait';
import { el, icon, tierBadge, tierName } from './dom';

// The new-kid popup (D-087, D-088, docs/GUI_MVP.md §27.4-27.5, Codex's design): a large
// waving sprite and one line when a kind of kid arrives for the first time, from the Garden,
// a fusion or a plot, and for every kid a plot brings up. One at a time, first come first
// shown, each acknowledged by itself. The world keeps running underneath; nothing here
// changes the game (the sim already admitted the kid and paid any award).

export type MeetSource = 'garden' | 'plot' | 'fusion';

/** One arrival to show: what came, from where, whether its kind is new, and its award. */
export interface Meeting {
  source: MeetSource;
  type: KidId;
  look: { body: string; face: string };
  /** Its kind was not in the Dex before this birth (`New!`). */
  isNew: boolean;
  /** Potatokens the sim awarded with it (discovery and milestones); 0 hides the line. */
  potatokens: number;
  /** Which of the source's ten lines, chosen once (§27.5). */
  line: number;
  /** The kid on the map, while it is drawn there: the popup waits until it is. */
  kidId?: number;
}

/** Ten lines per source (§27.5): every one names the kind once, with no pronoun. */
export const LINES: Record<MeetSource, readonly string[]> = {
  garden: ['{name} wandered in!', '{name} arrived!', '{name} stopped by!', '{name} joined the garden!', '{name} found the garden!', '{name} came to visit!', '{name} made an entrance!', '{name} is here!', '{name} came along!', '{name} paid a visit!'],
  plot: ['{name} sprouted!', '{name} has sprouted!', '{name} grew from the plot!', '{name} is ready to meet!', "{name} is the plot's surprise!", '{name} has grown!', '{name} is fresh from the plot!', '{name} came from the plot!', '{name} is a growing surprise!', '{name} is the harvest!'],
  fusion: ['{name} is a new discovery!', '{name} appeared in a fusion!', '{name} came from a fusion!', '{name} joined the discoveries!', '{name} is a fresh find!', '{name} is a fusion surprise!', '{name} arrived through fusion!', '{name} is a brand-new find!', '{name} is a new kind to meet!', '{name} is a discovery to keep!'],
};

/** A line for `source`, uniformly, never the one it used last if another exists (§27.5). */
export function pickLine(source: MeetSource, last: number | null, random: () => number = Math.random): number {
  const n = LINES[source].length;
  if (last === null || n < 2) return Math.floor(random() * n);
  const i = Math.floor(random() * (n - 1));
  return i >= last ? i + 1 : i;
}

/** The popup's greeting (§27.4): the wave, then 2.5 s still, again while it is open. */
const GREETING_IDLE_S = 2.5;

export class NewKidPopup {
  private readonly queue: Meeting[];
  private open: { meeting: Meeting; scrim: HTMLElement; dialog: HTMLElement; sprite: AnimatedPortrait; idle: number; restore: HTMLElement | null } | null = null;
  private readonly lastLine: Partial<Record<MeetSource, number>> = {};
  private last = 0;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly content: Content,
    /** Saved arrivals not yet acknowledged, and where to keep them (§27.5). */
    private readonly store: { load(): Meeting[]; save(queue: readonly Meeting[]): void },
    private readonly reducedMotion: () => boolean,
    /** What goes inert behind the popup. */
    private readonly background: () => HTMLElement[],
    /** Pauses or resumes world input (the simulation keeps running). */
    private readonly pauseInput: (paused: boolean) => void,
    private readonly rig: KidRig | undefined = kidRig,
  ) {
    this.queue = store.load().filter((m) => content.kids.some((k) => k.id === m.type));
  }

  /** Whether a popup is up. */
  get isOpen(): boolean {
    return this.open !== null;
  }

  /** Arrivals waiting, the one up included. */
  get waiting(): number {
    return this.queue.length;
  }

  /** The arrivals waiting, oldest first (tests). */
  get queued(): readonly Meeting[] {
    return this.queue;
  }

  /** Calls `fn` whenever the last waiting popup is acknowledged. */
  onDrained(fn: () => void): void {
    this.listeners.add(fn);
  }

  /** Queues an arrival; its line is chosen now and kept. */
  add(m: Omit<Meeting, 'line'>): void {
    const line = pickLine(m.source, this.lastLine[m.source] ?? null);
    this.lastLine[m.source] = line;
    this.queue.push({ ...m, line });
    this.store.save(this.queue);
  }

  /**
   * Called every frame. `canShow`: nothing else holds the screen (no sheet, drag, pointer
   * down, name bubble or tutorial card). `ready(m)`: its kid is drawn (or gone).
   */
  tick(now: number, canShow: boolean, ready: (m: Meeting) => boolean): void {
    const dt = this.last ? Math.min(0.25, (now - this.last) / 1000) : 0;
    this.last = now;
    if (this.open) {
      const s = this.open.sprite;
      if (document.hidden) return;
      if (s.playing) s.tick(dt);
      else if (!this.reducedMotion() && (this.open.idle += dt) >= GREETING_IDLE_S) {
        this.open.idle = 0;
        s.play('wave');
      }
      return;
    }
    const next = this.queue[0];
    if (!next || !canShow || !ready(next)) return;
    this.mount(next);
  }

  /** Takes the popup down for a while (a sheet must open, the app is leaving); it comes back. */
  hide(): void {
    if (!this.open) return;
    this.unmount();
  }

  private mount(m: Meeting): void {
    const def = this.content.kids.find((k) => k.id === m.type);
    const name = def?.name ?? m.type;
    const sentence = LINES[m.source][m.line]!.replace('{name}', name);
    const compact = window.innerHeight <= 520;
    const size = compact ? (window.innerHeight < 280 + 2 * 8 ? 128 : 192) : 256;
    const sprite = new AnimatedPortrait(this.rig!, m.type, size, m.look, this.reducedMotion());

    const scrim = el('div', 'arrival-scrim');
    let pressed = false;
    scrim.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      pressed = true;
    });
    scrim.addEventListener('click', () => {
      if (pressed) this.acknowledge();
      pressed = false;
    });
    const last = this.queue.length === 1;
    const status = el('p', 'arrival-status', m.isNew ? 'New!' : 'From your plot');
    status.id = 'arrival-status';
    const close = el('button', 'ui-button arrival-close', icon('icon_close', '', 'ui-icon-24'));
    close.type = 'button';
    close.setAttribute('aria-label', last ? 'Close arrival' : 'Continue to next arrival');
    close.addEventListener('click', () => this.acknowledge());
    const title = el('h2', 'arrival-sentence', sentence);
    title.id = 'arrival-sentence';
    title.tabIndex = -1;
    const category = el('p', 'arrival-category', ...(def ? tierBadge(def, 'ui-icon-24') : []), def ? tierName(def) : '');
    category.id = 'arrival-category';
    const parts: HTMLElement[] = [title, category];
    if (m.potatokens > 0) {
      const award = el('p', 'arrival-award', icon('icon_potatokens', '', 'ui-icon-20'), `+${m.potatokens} ${m.potatokens === 1 ? 'Potatoken' : 'Potatokens'}`);
      award.id = 'arrival-award';
      parts.push(award);
    }
    const go = el('button', 'ui-button ui-primary arrival-continue', 'Continue');
    go.type = 'button';
    go.addEventListener('click', () => this.acknowledge());
    const art = el('div', 'arrival-sprite', sprite.node);
    const text = el('div', 'arrival-text', ...parts, go);
    const dialog = el('section', `arrival ui-surface${compact ? ' is-compact' : ''}`, el('header', 'arrival-header', status, close), art, text);
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'arrival-sentence');
    dialog.setAttribute('aria-describedby', ['arrival-status', 'arrival-category', ...(m.potatokens > 0 ? ['arrival-award'] : [])].join(' '));
    dialog.dataset.source = m.source;
    // Its own keys: Escape (and Android back) acknowledge this one; Tab stays inside. A held
    // key never drains the queue (§27.4).
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!e.repeat) this.acknowledge();
      } else if (e.key === 'Enter' && e.repeat) {
        e.preventDefault();
      } else if (e.key === 'Tab') {
        const stops = [close, go];
        const i = stops.indexOf(document.activeElement as HTMLButtonElement);
        e.preventDefault();
        stops[(i + (e.shiftKey ? stops.length - 1 : 1)) % stops.length]!.focus();
      }
    });
    dialog.addEventListener('pointerdown', (e) => e.stopPropagation());
    const restore = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    document.body.append(scrim, dialog);
    for (const b of this.background()) b.inert = true;
    this.pauseInput(true);
    this.open = { meeting: m, scrim, dialog, sprite, idle: 0, restore };
    title.focus({ preventScroll: true });
    // The greeting starts on mount (§27.4).
    sprite.play('wave');
  }

  private acknowledge(): void {
    if (!this.open) return;
    const restore = this.open.restore;
    this.unmount();
    this.queue.shift();
    this.store.save(this.queue);
    if (this.queue.length === 0) {
      if (restore?.isConnected) restore.focus({ preventScroll: true });
      for (const fn of this.listeners) fn();
    }
  }

  private unmount(): void {
    const o = this.open!;
    o.scrim.remove();
    o.dialog.remove();
    for (const b of this.background()) b.inert = false;
    this.pauseInput(false);
    this.open = null;
  }

  /** Test hook: what is up now. */
  get shown(): { source: MeetSource; type: KidId; isNew: boolean; sentence: string; body: string } | null {
    if (!this.open) return null;
    const m = this.open.meeting;
    return { source: m.source, type: m.type, isNew: m.isNew, sentence: this.open.dialog.querySelector('.arrival-sentence')?.textContent ?? '', body: this.open.sprite.bodyAsset };
  }
}
