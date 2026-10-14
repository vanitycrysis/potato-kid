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
    /** Where it may go: the screen's safe sides and the HUD's bottom. */
    private readonly frame: () => { left: number; right: number; below: number },
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
  let held = false;
  let start: { x: number; y: number; id: number } | null = null;
  const show = () => {
    tip.textContent = label;
    tip.hidden = false;
    const r = button.getBoundingClientRect();
    place({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  };
  const hide = () => {
    clearTimeout(timer);
    tip.hidden = true;
  };
  button.addEventListener('pointerdown', (e) => {
    held = false;
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
      start = null;
      hide();
    }
  });
  for (const type of ['pointerup', 'pointercancel'] as const)
    button.addEventListener(type, () => {
      start = null;
      clearTimeout(timer);
      if (held) window.setTimeout(hide, 900);
    });
  button.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse') timer = window.setTimeout(show, HOVER_MS);
  });
  button.addEventListener('pointerleave', () => {
    start = null;
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
      if (!held) return;
      held = false;
      e.stopImmediatePropagation();
      e.preventDefault();
    },
    true,
  );
}
