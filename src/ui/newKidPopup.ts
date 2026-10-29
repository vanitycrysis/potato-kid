import { kidRig, kidWild, type KidRig } from '../content/artData';
import type { Content, KidId } from '../content/types';
import type { PendingArrival } from '../sim/game';
import { LINES, type MeetSource } from '../content/arrivalLines';
import { AnimatedPortrait } from './animatedPortrait';
import { bodyBox } from '../content/artRules';
import { wildBox, withSleeve } from './portrait';
import { el, icon, tierBadge, tierName } from './dom';

// The new-kid popup (D-087, D-088, docs/GUI_MVP.md §27.4-27.5, Codex's design): a large
// waving sprite and one line when a kind of kid arrives for the first time, from the Garden,
// a fusion or a plot, and for every kid a plot brings up. One at a time, first come first
// shown, each acknowledged by itself. The world keeps running underneath; nothing here
// changes the game (the sim already admitted the kid and paid any award).

export { LINES, type MeetSource } from '../content/arrivalLines';

/** One arrival to show: as saved with the game (D-087, §27.5). */
export type Meeting = PendingArrival;


/** The width between the safe-area insets (`--ui-ml`, `--ui-mr`), measured. */
function safeWidth(): number {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;top:0;height:0;left:var(--ui-ml,8px);right:var(--ui-mr,8px)';
  document.body.append(probe);
  const w = probe.getBoundingClientRect().width;
  probe.remove();
  return w;
}

/** A line for `source`, uniformly, never the one it used last if another exists (§27.5). */
export function pickLine(source: MeetSource, last: number | null, random: () => number = Math.random): number {
  const n = LINES[source].length;
  if (last === null || n < 2) return Math.floor(random() * n);
  const i = Math.floor(random() * (n - 1));
  return i >= last ? i + 1 : i;
}

/** The popup's greeting (§27.4): the wave, then 2.5 s still, again while it is open. */
const GREETING_IDLE_S = 2.5;
/** A compact panel needs this much width (§27.4); narrower, the single-column page is used. */
const COMPACT_MIN_WIDTH = 520;

/** How the panel is laid out (§27.4): portrait, compact (sprite left), or the single-column fallback. */
type Layout = { mode: 'portrait' | 'compact' | 'fallback'; sprite: number };

function layoutNow(): Layout {
  const w = safeWidth() + 16;
  const h = window.innerHeight;
  // The portrait panel needs its 256 sprite inside its content (360 less its 16 px padding and
  // 8 px border each side); a narrower screen gets the single column, its sprite no wider
  // than the content either.
  const content = Math.min(360, w - 16) - 48;
  if (h > 520 && content >= 256) return { mode: 'portrait', sprite: 256 };
  if (h > 520) return { mode: 'fallback', sprite: Math.max(48, Math.min(144, Math.floor(content))) };
  // The compact panels by the height left below any banner, within the safe insets (§27.4):
  // 280 high with a 192 sprite, else 224 with a 128 one, else the single column.
  const room = safeHeight();
  if (w - 16 < COMPACT_MIN_WIDTH || room < 224) return { mode: 'fallback', sprite: Math.max(48, Math.min(144, Math.floor(content))) };
  return { mode: 'compact', sprite: room < 280 ? 128 : 192 };
}

/** The height between the top safe inset (and any banner, `--ui-banner`) and the bottom one, measured. */
function safeHeight(): number {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;left:0;width:0;top:calc(var(--ui-st,0px) + var(--ui-banner,0px));bottom:var(--ui-sb,0px)';
  document.body.append(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return h;
}

export class NewKidPopup {
  private open: { meeting: Meeting; scrim: HTMLElement; dialog: HTMLElement; sprite: AnimatedPortrait; art: HTMLElement; idle: number; reduced: boolean; layout: Layout } | null = null;
  private readonly lastLine: Partial<Record<MeetSource, number>> = {};
  private last = 0;
  private readonly listeners = new Set<() => void>();
  /**
   * Where focus goes when the last of a run of popups is acknowledged: the control that had
   * it when the first opened (§27.4). Undefined between runs.
   */
  private restoreTo: HTMLElement | null | undefined = undefined;

  constructor(
    private readonly content: Content,
    /** The arrivals not yet acknowledged, oldest first, as saved with the game (§27.5). */
    private readonly queue: () => Meeting[],
    private readonly reducedMotion: () => boolean,
    /** What goes inert behind the popup. */
    private readonly background: () => HTMLElement[],
    /** Pauses or resumes world input (the simulation keeps running). */
    private readonly pauseInput: (paused: boolean) => void,
    /** Where focus goes when nothing that had it is left (the Garden control). */
    private readonly fallbackFocus: () => HTMLElement | null,
    /** Saves the game: an acknowledgement is kept before the next popup (§27.5). */
    private readonly persist: () => void = () => {},
    private readonly rig: KidRig | undefined = kidRig,
  ) {
    window.addEventListener('resize', () => this.relayout());
    // Frames stop while the app is hidden: back in front, the greeting goes on where it was,
    // not a frame's worth on (Codex review round 5, #117).
    document.addEventListener('visibilitychange', () => (this.last = 0));
  }

  /** Whether a popup is up. */
  get isOpen(): boolean {
    return this.open !== null;
  }

  /** Arrivals waiting, the one up included. */
  get waiting(): number {
    return this.queue().length;
  }

  /** Calls `fn` whenever the last waiting popup is acknowledged. */
  onDrained(fn: () => void): void {
    this.listeners.add(fn);
  }

  /** Queues an arrival; its line is chosen now and kept. */
  add(m: Omit<Meeting, 'line'>): void {
    const line = pickLine(m.source, this.lastLine[m.source] ?? null);
    this.lastLine[m.source] = line;
    this.queue().push({ ...m, line });
  }

  /** Android Back (§27.4): acknowledges the popup up, if any. */
  back(): boolean {
    if (!this.open) return false;
    this.acknowledge();
    return true;
  }

  /**
   * Called every frame. `canShow`: nothing else holds the screen (no sheet, gesture, name
   * bubble, tutorial card or recovery warning). `ready(m)`: its kid is drawn (or gone).
   */
  tick(now: number, canShow: boolean, ready: (m: Meeting) => boolean): void {
    const dt = this.last ? Math.min(0.25, (now - this.last) / 1000) : 0;
    this.last = now;
    if (this.open) {
      const o = this.open;
      if (document.hidden) return;
      // A changed motion preference applies at once: still now, or a full rest before waving.
      const reduced = this.reducedMotion();
      if (reduced !== o.reduced) {
        o.reduced = reduced;
        o.sprite.setReducedMotion(reduced);
        o.idle = 0;
      }
      if (o.sprite.playing) o.sprite.tick(dt);
      else if (!reduced && (o.idle += dt) >= GREETING_IDLE_S) {
        o.idle = 0;
        o.sprite.play('wave');
      }
      return;
    }
    const next = this.queue()[0];
    if (!next || !canShow || !ready(next)) return;
    this.mount(next);
  }

  /**
   * A new screen size, rotation or banner (the HUD calls this when its banners change): the
   * same arrival, laid out again, its line kept.
   */
  relayout(): void {
    const o = this.open;
    if (!o) return;
    const layout = layoutNow();
    if (layout.mode === o.layout.mode && layout.sprite === o.layout.sprite) return;
    o.layout = layout;
    o.dialog.classList.toggle('is-compact', layout.mode === 'compact');
    o.dialog.classList.toggle('is-fallback', layout.mode === 'fallback');
    o.dialog.classList.toggle('is-short', layout.mode === 'compact' && layout.sprite < 192);
    // The same portrait, resized: a greeting under way goes on where it was (§27.4).
    o.sprite.resize(layout.sprite);
    o.art.replaceChildren(this.dressed(o.meeting, o.sprite, layout.sprite));
  }

  /** A Rare's portrait moves in its sleeve, as everywhere else (D-094, §27.7). */
  private dressed(m: Meeting, sprite: AnimatedPortrait, size: number): HTMLElement {
    if (!this.rig || !this.content.kids.find((k) => k.id === m.type)?.rare) return sprite.node;
    // Its box at scale 1, as the kid card measures it: a wild kind's own, else its body's.
    const own = kidWild?.types[m.type];
    const body = this.rig.bodies[m.look.body] ?? this.rig.bodies.round!;
    const box = own ? wildBox(this.rig, own.lifetimeBoundsPx) : bodyBox(this.rig, body.boundsPx);
    // The whole sleeve, at its largest, fits the sprite's slot (Codex review round 4, #117): the
    // kid is drawn smaller until it does, and the layout reserves the sleeve, so nothing clips.
    const extent = (px: number) => {
      const w = withSleeve(this.rig!, el('div', ''), px, box, true);
      const m = (k: 'marginLeft' | 'marginRight' | 'marginTop' | 'marginBottom') => parseFloat(w.style[k]) || 0;
      return Math.max(px + m('marginLeft') + m('marginRight'), px + m('marginTop') + m('marginBottom'));
    };
    let px = size;
    for (let i = 0; i < 4 && extent(px) > size; i++) px = Math.floor((px * size) / extent(px));
    sprite.resize(px);
    return withSleeve(this.rig, sprite.node, px, box, true);
  }

  private mount(m: Meeting): void {
    const def = this.content.kids.find((k) => k.id === m.type);
    const name = def?.name ?? m.type;
    const sentence = LINES[m.source][m.line]!.replace('{name}', name);
    const layout = layoutNow();
    const reduced = this.reducedMotion();
    const sprite = new AnimatedPortrait(this.rig!, m.type, layout.sprite, m.look, reduced);

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
    const last = this.queue().length === 1;
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
    const art = el('div', 'arrival-sprite', this.dressed(m, sprite, layout.sprite));
    const text = el('div', 'arrival-text', ...parts, go);
    const dialog = el('section', `arrival ui-surface${layout.mode === 'compact' ? ' is-compact' : ''}${layout.mode === 'compact' && layout.sprite < 192 ? ' is-short' : ''}${layout.mode === 'fallback' ? ' is-fallback' : ''}`, el('header', 'arrival-header', status, close), art, text);
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'arrival-sentence');
    dialog.setAttribute('aria-describedby', ['arrival-status', 'arrival-category', ...(m.potatokens > 0 ? ['arrival-award'] : [])].join(' '));
    dialog.dataset.source = m.source;
    // Its own keys: Escape acknowledges this one; Tab stays inside. A held key never drains
    // the queue (§27.4).
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
    // The first of a run remembers what had focus; the rest keep that (§27.4).
    if (this.restoreTo === undefined) this.restoreTo = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    document.body.append(scrim, dialog);
    // The page-mode layout (§3.1) puts it in the page's flow, in place of the HUD and tray.
    document.documentElement.dataset.arrivalOpen = 'true';
    if (document.documentElement.dataset.hudFit === 'page') dialog.scrollIntoView({ block: 'start' });
    for (const b of this.background()) b.inert = true;
    this.pauseInput(true);
    this.open = { meeting: m, scrim, dialog, sprite, art, idle: 0, reduced, layout };
    title.focus({ preventScroll: true });
    // The greeting starts on mount (§27.4).
    sprite.play('wave');
  }

  private acknowledge(): void {
    if (!this.open) return;
    const queue = this.queue();
    const shown = this.open.meeting;
    this.unmount();
    if (queue[0] === shown) queue.shift();
    this.persist();
    if (queue.length > 0) return;
    // The run is over: focus back where it was, else on the Garden.
    const to = this.restoreTo?.isConnected ? this.restoreTo : this.fallbackFocus();
    this.restoreTo = undefined;
    to?.focus({ preventScroll: true });
    for (const fn of this.listeners) fn();
  }

  private unmount(): void {
    const o = this.open!;
    delete document.documentElement.dataset.arrivalOpen;
    o.scrim.remove();
    o.dialog.remove();
    for (const b of this.background()) b.inert = false;
    this.pauseInput(false);
    this.open = null;
  }

  /** Test hook: what is up now. */
  get shown(): { source: MeetSource; type: KidId; isNew: boolean; sentence: string; body: string; layout: string; sprite: number; scale: number; savedScale: number; clipTime: number | null } | null {
    if (!this.open) return null;
    const m = this.open.meeting;
    return { source: m.source, type: m.type, isNew: m.isNew, sentence: this.open.dialog.querySelector('.arrival-sentence')?.textContent ?? '', body: this.open.sprite.bodyAsset, layout: this.open.layout.mode, sprite: this.open.layout.sprite, scale: this.open.sprite.scale, savedScale: m.look.scale ?? 1, clipTime: this.open.sprite.clipTime };
  }
}
