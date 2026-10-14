import { el } from './dom';

// How every icon names itself (D-077, docs/GUI_MVP.md §23.2, Codex's design). A HUD stat opens
// a name bubble on one tap: its name, full value and what it's for. An icon-only control shows
// its name on hover (300 ms), keyboard focus (at once) or a touch hold (450 ms); a recognised
// hold doesn't also activate it.

type Box = { left: number; top: number; right: number; bottom: number };

export interface BubbleContent {
  title: string;
  value: string;
  lines: string[];
}

const HOLD_MS = 450;
const HOVER_MS = 300;
const SLOP = 8;

/** The bubble: nonmodal, one at a time, with a 44 px Close; no timeout. */
export class NameBubble {
  readonly root = el('div', 'name-bubble ui-surface ui-toast');
  private readonly title = el('p', 'name-bubble-title');
  private readonly value = el('p', 'name-bubble-value');
  private readonly lines = el('div', 'name-bubble-lines');
  private readonly close = el('button', 'ui-button name-bubble-close', '×');
  private trigger: HTMLElement | null = null;
  private key: string | null = null;

  constructor(
    /** Where it may go: the screen's safe sides, the HUD's bottom and how far down it may reach. */
    private readonly frame: () => { left: number; right: number; below: number; bottom: number },
    /** It doesn't fit (a short screen, enlarged text): the same content as a help sheet (§23.2). */
    private readonly overflow: (key: string, trigger: HTMLElement, content: BubbleContent) => void,
  ) {
    this.root.id = 'name-bubble';
    this.root.hidden = true;
    this.root.setAttribute('role', 'group');
    this.close.type = 'button';
    this.close.setAttribute('aria-label', 'Close');
    this.close.addEventListener('click', () => this.hide(true));
    this.root.append(this.title, this.value, this.lines, this.close);
    document.body.append(this.root);
    // A tap anywhere else closes it; on the world it does only that, never a pickup or pan.
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (this.key === null) return;
        const t = e.target as Node;
        if (this.root.contains(t) || this.trigger?.contains(t)) return;
        this.hide(false);
        if (t instanceof HTMLCanvasElement) {
          e.stopPropagation();
          e.preventDefault();
        }
      },
      true,
    );
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.key !== null) {
        e.stopPropagation();
        this.hide(true);
      }
    });
  }

  get openKey(): string | null {
    return this.key;
  }

  /** Opens for `trigger` (or closes, if it was already open for it). */
  toggle(key: string, trigger: HTMLElement, content: BubbleContent): void {
    if (this.key === key) {
      this.hide(false);
      return;
    }
    this.trigger?.setAttribute('aria-expanded', 'false');
    this.key = key;
    this.trigger = trigger;
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-controls', this.root.id);
    this.root.hidden = false;
    this.update(key, content);
  }

  /** Quietly keeps an open bubble's amounts current (no announcements). */
  update(key: string, content: BubbleContent): void {
    if (this.key !== key) return;
    this.title.textContent = content.title;
    this.value.textContent = content.value;
    this.lines.replaceChildren(...content.lines.map((l) => el('p', 'name-bubble-line', l)));
    this.place();
    // Every line and its Close must be reachable: if it would run past the room below the
    // HUD, it becomes an ordinary help sheet instead (§23.2; Codex review, #105).
    if (this.root.getBoundingClientRect().bottom > this.frame().bottom) {
      const trigger = this.trigger!;
      this.hide(false);
      this.overflow(key, trigger, content);
    }
  }

  /** 8 px below the HUD, centred on its stat, kept inside the safe sides (§23.2). */
  private place(): void {
    if (!this.trigger) return;
    const f = this.frame();
    const width = Math.min(320, f.right - f.left);
    this.root.style.width = `${width}px`;
    const t = this.trigger.getBoundingClientRect();
    const left = Math.min(Math.max((t.left + t.right) / 2 - width / 2, f.left), f.right - width);
    this.root.style.left = `${left}px`;
    this.root.style.top = `${f.below + 8}px`;
  }

  /** `refocus`: back to its stat (Escape, Close); an outside tap or a sheet leaves focus be. */
  hide(refocus: boolean): void {
    if (this.key === null) return;
    const trigger = this.trigger;
    this.key = null;
    this.trigger = null;
    this.root.hidden = true;
    trigger?.setAttribute('aria-expanded', 'false');
    if (refocus) trigger?.focus({ preventScroll: true });
  }
}

/**
 * An icon-only control's name (§23.2): shown above `place()` on hover after 300 ms, at once on
 * keyboard focus, or after a 450 ms touch hold, which then doesn't activate it. Moving more
 * than 8 px, leaving, or cancelling hides it with no deferred activation.
 */
export function nameOnHold(button: HTMLButtonElement, label: string, tip: HTMLElement, place: (b: Box) => void): void {
  let timer = 0;
  let later = 0;
  /** A touch that moved off before naming: its release must not activate (§23.2). */
  let moved = false;
  let held = false;
  let start: { x: number; y: number; id: number } | null = null;
  const show = () => {
    clearTimeout(later);
    tip.dataset.owner = label;
    tip.textContent = label;
    tip.hidden = false;
    const r = button.getBoundingClientRect();
    place({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  };
  // Hides this control's name only: another control may own the shared tip by now.
  const hide = () => {
    clearTimeout(timer);
    clearTimeout(later);
    if (tip.dataset.owner === label) tip.hidden = true;
  };
  button.addEventListener('pointerdown', (e) => {
    held = false;
    moved = false;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    clearTimeout(timer);
    if (e.pointerType !== 'mouse')
      timer = window.setTimeout(() => {
        held = true;
        show();
      }, HOLD_MS);
  });
  button.addEventListener('pointermove', (e) => {
    if (start && e.pointerId === start.id && Math.hypot(e.clientX - start.x, e.clientY - start.y) > SLOP) {
      // A touch moving more than 8 px cancels the gesture: no naming, and no activation on its
      // release (Codex review, #105). A mouse press is an ordinary click.
      if (e.pointerType !== 'mouse') moved = true;
      start = null;
      hide();
    }
  });
  button.addEventListener('pointerup', () => {
    start = null;
    clearTimeout(timer);
    if (held) later = window.setTimeout(hide, 900);
  });
  // A cancelled gesture has no release click to swallow: a later activation must go through
  // (Codex review, #105).
  button.addEventListener('pointercancel', () => {
    start = null;
    held = false;
    hide();
  });
  button.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse') timer = window.setTimeout(show, HOVER_MS);
  });
  button.addEventListener('pointerleave', (e) => {
    start = null;
    // A finger sliding off ends the gesture: no click follows to swallow.
    if (e.pointerType !== 'mouse') held = false;
    hide();
  });
  button.addEventListener('focus', () => {
    if (button.matches(':focus-visible')) show();
  });
  button.addEventListener('blur', hide);
  // A recognised hold names the control and suppresses this release's activation.
  button.addEventListener(
    'click',
    (e) => {
      if (!held && !moved) return;
      held = false;
      moved = false;
      e.stopImmediatePropagation();
      e.preventDefault();
    },
    true,
  );
}
