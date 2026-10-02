import { kidRig, uiData } from '../content/artData';
import type { Content, KidId } from '../content/types';
import type { MapScene } from '../render/scene';
import type { GameEvent } from '../sim/game';
import { feedbackFor, refusalText, type FeedbackItem } from './feedback';
import { formatClock, formatCount, formatExact } from './format';
import { portrait } from './portrait';
import './hud.css';
// Patrick Hand (D-031), chosen by Codex, bundled locally under the SIL OFL (assets/PROVENANCE.md).
import fontUrl from '../../assets/fonts/patrick-hand/PatrickHand-Regular.ttf?url';

// ChatGPT/Codex's native GUI SVGs (ui_v2.json), copied by art:export.
const uiUrls = import.meta.glob('../../assets/ui/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export function ui(name: string): string {
  const hit = Object.entries(uiUrls).find(([p]) => p.endsWith(`/${name}.svg`));
  if (!hit) throw new Error(`Missing GUI art "${name}" (D-036: run npm run art:export)`);
  return hit[1];
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  e.append(...children);
  return e;
}

export function icon(name: string, label = '', className = 'ui-icon'): HTMLImageElement {
  const img = el('img', className);
  img.src = ui(name);
  img.alt = label;
  if (!label) img.setAttribute('aria-hidden', 'true');
  return img;
}

/** Display name without the trailing " Kid" (cards); Potato Kid stays "Potato" (GUI_MVP §7). */
export function shortName(name: string): string {
  return name.replace(/ Kid$/, '');
}

/** How long a feedback card stays up (GUI_MVP §9). */
const FEEDBACK_MS = 2500;

export interface SaveStatus {
  /** "Progress can't be saved right now": unsaved session, or three failed writes. */
  unsaved: boolean;
  /** "We loaded an older save": one-time, until dismissed. */
  recovery: boolean;
  /** A newer app's save: frozen, "Please update the game". */
  readOnly: boolean;
}

type HudMode = 'portrait' | 'narrow' | 'compact';

/** A feedback card, queued or on screen; it keeps its remaining time across both. */
interface Card {
  item: FeedbackItem;
  node: HTMLElement;
  remaining: number;
  notBefore: number;
}

/**
 * The DOM HUD (D-022), built to Codex's GUI-MVP contract (docs/GUI_MVP.md §§3, 9, 10):
 * currencies, population, the spawn timer and instant spawn; the feedback region; and the
 * save banners. Every visual decision is Codex's (D-036); this class implements it.
 */
export class Hud {
  private readonly hud = el('section', 'hud ui-surface');
  private readonly materials = el('span', 'hud-count');
  private readonly potatokens = el('span', 'hud-count');
  private readonly count = el('span', 'hud-value');
  private readonly countdown = el('span', 'hud-countdown');
  private readonly track = el('div', 'hud-track');
  private readonly bar = el('div', 'hud-bar');
  private readonly spawn = el('button', 'ui-button ui-primary hud-spawn');
  private readonly spawnCost = el('span', 'hud-spawn-cost');
  private readonly top = el('div', 'top-stack');
  private readonly banners = el('div', 'banners');
  private readonly feedback = el('div', 'feedback');
  private readonly shield = el('div', 'readonly-shield');
  private readonly known: Set<KidId>;
  /** Waiting cards, refusals first (GUI_MVP §9). */
  private readonly queue: Card[] = [];
  private showing: Card | null = null;
  private hover = false;
  private inflight = false;
  private save: SaveStatus = { unsaved: false, recovery: false, readOnly: false };
  private recoveryDismissed = false;
  private last = performance.now();

  constructor(
    private readonly scene: MapScene,
    private readonly content: Content,
  ) {
    this.applyTokens();
    this.known = new Set(scene.game.state.discoveredKids);

    this.track.append(this.bar);
    this.track.setAttribute('role', 'progressbar');
    this.track.setAttribute('aria-label', 'Next kid');
    this.spawn.type = 'button';
    this.spawn.append(el('span', 'hud-spawn-label', 'Spawn now'), el('span', 'hud-spawn-price', icon('icon_potatokens', '', 'ui-icon-18'), this.spawnCost));
    this.spawn.addEventListener('click', () => this.instantSpawn());
    const settings = this.comingSoon('icon_settings', 'Settings', 'hud-settings');
    this.hud.append(
      el('span', 'hud-stat hud-materials', icon('icon_materials', 'Materials', 'ui-icon-24'), this.materials),
      el('span', 'hud-stat hud-potatokens', icon('icon_potatokens', 'Potatokens', 'ui-icon-24'), this.potatokens),
      settings,
      el('span', 'hud-stat hud-population', icon('icon_kids', 'Kids', 'ui-icon-24'), this.count),
      el('span', 'hud-stat hud-timer', icon('icon_timer', '', 'ui-icon-24'), this.countdown),
      this.track,
      this.spawn,
    );
    this.hud.setAttribute('aria-label', 'Garden status');
    this.feedback.setAttribute('role', 'status');
    this.feedback.addEventListener('pointerenter', () => (this.hover = true));
    this.feedback.addEventListener('pointerleave', () => (this.hover = false));
    this.top.append(this.banners, this.hud, this.feedback);

    const tray = el(
      'nav',
      'tray ui-surface ui-tray',
      this.trayCell('icon_garden', 'Garden'),
      this.trayCell('icon_capacity', 'Capacity'),
      this.trayCell('icon_bias', 'Bias'),
      this.trayCell('icon_compendium', 'Compendium'),
    );
    tray.setAttribute('aria-label', 'Buildings');
    const dex = this.comingSoon('icon_dex', 'Potato-Dex', 'dex-button');
    document.body.append(this.shield, this.top, dex, tray);

    // The camera must bring any kid out from under the GUI: banners, HUD and feedback at
    // the top; the tray and Dex button at the bottom (GUI_MVP §2; Codex review, PR #15).
    const measure = () => {
      this.layout();
      scene.setInsets(this.top.getBoundingClientRect().bottom, window.innerHeight - Math.min(tray.getBoundingClientRect().top, dex.getBoundingClientRect().top));
    };
    new ResizeObserver(measure).observe(document.body);
    new ResizeObserver(measure).observe(this.top);
    measure();
    scene.listenSteps((events) => this.onStep(events));
    // A newborn's card waits until the kid is actually drawn (its costume may still be
    // loading), then for its discovery effect (Codex review, PR #35).
    scene.listenShown((kidId) => this.kidShown(kidId, performance.now()));
    // Offline catch-up can discover types; the summary reports them, so no card later
    // should call them new (Codex review, PR #33).
    scene.listenResume(() => {
      for (const t of scene.game.state.discoveredKids) this.known.add(t);
    });
    const tick = (now: number) => {
      this.render(now);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** Kid types the feedback treats as already discovered (tests). */
  get knownKids(): string[] {
    return [...this.known];
  }

  /** Save banners and read-only state (GUI_MVP §10), from the save coordinator. */
  setSaveStatus(status: SaveStatus): void {
    const changed = status.unsaved !== this.save.unsaved || status.recovery !== this.save.recovery || status.readOnly !== this.save.readOnly;
    this.save = status;
    if (!changed) return;
    // A banner shifts the HUD and the camera's limits: settle a held kid first, so it
    // isn't displaced mid-gesture (GUI_MVP §2; Codex review, PR #33).
    this.scene.cancelDrag();
    this.renderBanners();
  }

  // --- tokens and controls --------------------------------------------------

  /** Colours and type from ui_v2.json; surfaces as nine-slice border images (never stretched). */
  private applyTokens(): void {
    const s = document.documentElement.style;
    for (const [k, v] of Object.entries(uiData?.palette ?? {})) s.setProperty(`--ui-${k}`, v);
    const surfaces: [string, string][] = [
      ['panel', 'ui_panel'],
      ['tray', 'ui_tray'],
      ['toast', 'ui_toast'],
      ['button', 'ui_button_normal'],
      ['button-pressed', 'ui_button_pressed'],
      ['button-disabled', 'ui_button_disabled'],
      ['button-primary', 'ui_button_primary'],
      ['banner-problem', 'ui_banner_problem'],
      ['banner-recovery', 'ui_banner_recovery'],
      ['spawn-full', 'ui_spawn_full'],
    ];
    for (const [k, name] of surfaces) s.setProperty(`--ui-${k}`, `url("${ui(name)}")`);
    // The font loads under the family name Codex's token gives, from the bundled file;
    // until it is ready (or if it fails), the token's fallback stack shows.
    const type = uiData?.typography as { family: string; fallback: string } | undefined;
    if (type) {
      s.setProperty('--ui-font', `"${type.family}", ${type.fallback}`);
      const face = new FontFace(type.family, `url("${fontUrl}")`, { display: 'swap' });
      document.fonts.add(face);
      face.load().catch(() => {});
    }
  }

  /** Not built yet (sheets arrive with the next GUI slice): visibly disabled, reason announced. */
  private comingSoon(iconName: string, label: string, className: string): HTMLButtonElement {
    const b = el('button', `ui-button ${className}`, icon(iconName, '', 'ui-icon-24'));
    b.type = 'button';
    b.disabled = true;
    b.setAttribute('aria-label', `${label} (coming soon)`);
    return b;
  }

  private trayCell(iconName: string, label: string): HTMLButtonElement {
    const b = el('button', 'tray-cell', icon(iconName), el('span', 'tray-label', label));
    b.type = 'button';
    b.disabled = true;
    b.setAttribute('aria-label', `${label} (coming soon)`);
    return b;
  }

  /** Portrait three rows, narrow four rows, compact one row (GUI_MVP §3). */
  private layout(): void {
    const w = window.visualViewport?.width ?? window.innerWidth;
    const h = window.visualViewport?.height ?? window.innerHeight;
    const inner = this.hud.clientWidth - 16;
    let mode: HudMode = w < 360 && h > 520 ? 'narrow' : 'portrait';
    if (h <= 520) mode = inner >= 556 ? 'compact' : 'portrait';
    this.hud.dataset.mode = mode;
    document.documentElement.dataset.compact = h <= 520 ? 'true' : 'false';
  }

  // --- instant spawn ------------------------------------------------------------

  private spawnState(): { ok: boolean; reason: string } {
    const g = this.scene.game;
    const cost = this.content.balance.economy.instantSpawnPotatokens;
    if (this.save.readOnly) return { ok: false, reason: 'Update the game to continue.' };
    if (g.state.world.kids.length >= g.capacity) return { ok: false, reason: refusalText('full', 'instantSpawn') };
    if (g.state.potatokens < cost) return { ok: false, reason: refusalText('cost', 'instantSpawn', 'potatokens') };
    return { ok: !this.inflight, reason: '' };
  }

  private instantSpawn(): void {
    // A disabled control sends nothing; only a valid tap is dispatched, one at a time.
    if (!this.spawnState().ok) return;
    this.inflight = true;
    this.scene.command({ type: 'instantSpawn' });
  }

  // --- per-frame rendering --------------------------------------------------------

  private render(now: number): void {
    const dt = Math.min(250, now - this.last);
    this.last = now;
    const g = this.scene.game;
    const s = g.state;
    this.materials.textContent = formatCount(s.materials);
    this.materials.parentElement!.setAttribute('aria-label', `${formatExact(s.materials)} Materials`);
    this.potatokens.textContent = formatCount(s.potatokens);
    this.potatokens.parentElement!.setAttribute('aria-label', `${formatExact(s.potatokens)} Potatokens`);
    this.count.textContent = `${s.world.kids.length}/${g.capacity}`;
    const full = s.world.kids.length >= g.capacity;
    const compact = this.hud.dataset.mode === 'compact';
    const clock = formatClock(Math.max(0, g.interval - s.spawnProgress));
    if (full) this.countdown.textContent = compact ? 'Full' : 'Garden is full';
    else if (g.waitingForRoom) this.countdown.textContent = compact ? 'Waiting' : 'Waiting for room';
    else this.countdown.textContent = compact ? clock : `Next kid ${clock}`;
    this.countdown.setAttribute('aria-label', full ? 'Garden is full' : g.waitingForRoom ? 'Waiting for room' : `Next kid in ${clock}`);
    this.bar.style.width = `${Math.min(1, s.spawnProgress / g.interval) * 100}%`;
    this.track.classList.toggle('full', full);

    const cost = this.content.balance.economy.instantSpawnPotatokens;
    this.spawnCost.textContent = formatExact(cost);
    const st = this.spawnState();
    this.spawn.setAttribute('aria-disabled', String(!st.ok));
    this.spawn.classList.toggle('is-disabled', !st.ok);
    this.spawn.classList.toggle('is-full', full);
    this.spawn.setAttribute('aria-label', st.reason ? `Spawn now: ${st.reason}` : `Spawn a random Garden kid for ${formatExact(cost)} Potatokens`);

    this.tickFeedback(now, dt);
  }

  // --- feedback ---------------------------------------------------------------------

  private onStep(events: GameEvent[]): void {
    const items = feedbackFor(events, this.known, this.scene.game.state.discoveredKids.length);
    for (const e of events) if (e.type === 'spawned' && e.source === 'instant') this.inflight = false;
    const now = performance.now();
    for (const item of items) {
      if (item.kind === 'refusal' && item.command === 'instantSpawn') this.inflight = false;
      const notBefore = this.readyAt(item, now);
      // The command implies the currency, except a respawn (whose sheet keeps its own context).
      const currency = item.kind === 'refusal' ? ({ instantSpawn: 'potatokens', upgrade: 'materials' } as const)[item.command as 'instantSpawn' | 'upgrade'] : undefined;
      const text = item.kind === 'refusal' ? refusalText(item.reason, item.command, currency) : undefined;
      const card: Card = { item, node: this.card(item, text), remaining: FEEDBACK_MS, notBefore };
      // Refusals are never dropped: they wait like any card, but ahead of rewards.
      const firstReward = this.queue.findIndex((c) => c.item.kind !== 'refusal');
      if (item.kind === 'refusal' && firstReward >= 0) this.queue.splice(firstReward, 0, card);
      else this.queue.push(card);
    }
  }

  /**
   * When a card may show: a newborn's card once the kid is drawn (and, for a discovery,
   * after its effect); Infinity while its costume is still loading.
   */
  private readyAt(item: FeedbackItem, now: number): number {
    if (item.kind !== 'discovery' && item.kind !== 'newKid') return now;
    const after = item.kind === 'discovery' ? this.scene.discoveryToastDelayMs : 0;
    const state = item.kidId === undefined ? 'shown' : this.scene.viewState(item.kidId);
    return state === 'pending' ? Infinity : now + after;
  }

  private kidShown(kidId: number, now: number): void {
    for (const c of this.queue) {
      if ((c.item.kind === 'discovery' || c.item.kind === 'newKid') && c.item.kidId === kidId) c.notBefore = this.readyAt(c.item, now);
    }
  }

  /**
   * Feedback scheduling (GUI_MVP §§2, 9): one card at a time; nothing moves while a kid is
   * held; a card is shown only while a 44 px play band remains above the tray and Dex
   * button, and a visible card that stops fitting (a banner, a resize) goes back to the
   * queue with its remaining time. A refusal pre-empts a reward, which then resumes.
   */
  private tickFeedback(now: number, dt: number): void {
    // Geometry first, even mid-drag: a card that stops fitting (resize, banner) leaves at
    // once, which only ever frees space under a held kid (Codex review, PR #33).
    if (this.showing && this.bandBelow(this.top.getBoundingClientRect().bottom) < 44) this.unshow();
    if (this.scene.dragging || this.save.readOnly) return;
    const refusal = this.queue.findIndex((c) => c.item.kind === 'refusal');
    if (this.showing && this.showing.item.kind !== 'refusal' && refusal >= 0 && this.fits(this.queue[refusal]!.node)) {
      const r = this.queue.splice(refusal, 1)[0]!;
      this.unshow(); // the reward resumes after the refusal
      this.queue.unshift(r);
    }
    if (this.showing) {
      if (!this.hover && !this.feedback.contains(document.activeElement)) this.showing.remaining -= dt;
      if (this.showing.remaining > 0) return;
      this.showing.node.remove();
      this.showing = null;
    }
    // A card still waiting for its kid never holds up the ones behind it; one whose kid
    // was consumed before it appeared is shown anyway (the discovery did happen).
    for (const c of this.queue) {
      if (c.notBefore === Infinity && 'kidId' in c.item && c.item.kidId !== undefined && this.scene.viewState(c.item.kidId) === 'gone') c.notBefore = now;
    }
    const at = this.queue.findIndex((c) => c.notBefore <= now);
    const next = this.queue[at];
    if (!next || !this.fits(next.node)) return;
    this.queue.splice(at, 1);
    this.showing = next;
    this.feedback.append(next.node);
  }

  /**
   * Takes the visible card off screen and back into the queue, time kept: first in line,
   * but a reward stays behind any waiting refusal (GUI_MVP §9; Codex review, PR #33).
   */
  private unshow(): void {
    if (!this.showing) return;
    this.showing.node.remove();
    const at = this.showing.item.kind === 'refusal' ? 0 : this.queue.findIndex((c) => c.item.kind !== 'refusal');
    this.queue.splice(at < 0 ? this.queue.length : at, 0, this.showing);
    this.showing = null;
  }

  /** Free height between `top` and the highest bottom control (tray or Dex button). */
  private bandBelow(top: number): number {
    const bounds = ['.tray', '.dex-button'].map((q) => document.querySelector(q)?.getBoundingClientRect().top ?? window.innerHeight);
    return Math.min(...bounds) - top;
  }

  /** Whether `node` can be shown and still leave the 44 px play band; measured off-screen. */
  private fits(node: HTMLElement): boolean {
    const probe = el('div', 'feedback feedback-probe');
    probe.style.width = `${this.feedback.clientWidth || this.top.clientWidth}px`;
    probe.append(node);
    document.body.append(probe);
    const height = node.getBoundingClientRect().height;
    node.remove();
    probe.remove();
    return this.bandBelow(this.hud.getBoundingClientRect().bottom + 8 + height) >= 44;
  }

  private name(type: KidId): string {
    return this.content.kids.find((k) => k.id === type)?.name ?? type;
  }

  private tier(type: KidId): HTMLElement {
    const t = this.content.kids.find((k) => k.id === type)?.tier ?? 1;
    const mark = el('span', 'tier', icon(`badge_tier_${t}`, '', 'ui-icon-20'), `T${t}`);
    mark.setAttribute('aria-label', `Tier ${t}`);
    return mark;
  }

  private coinLine(text: string): HTMLElement {
    return el('span', 'card-line', icon('icon_potatokens', '', 'ui-icon-18'), text);
  }

  /** One feedback card, per GUI_MVP §9. */
  private card(item: FeedbackItem, text?: string): HTMLElement {
    switch (item.kind) {
      case 'discovery':
      case 'newKid': {
        const heading = item.kind === 'newKid' ? 'New kid discovered' : item.newKid ? 'New discovery' : 'New recipe found';
        const lines: Node[] = [el('span', 'card-heading', heading), el('span', 'card-name', this.name(item.childType)), this.tier(item.childType)];
        if (item.kind === 'discovery' && item.potatokens > 0) lines.push(this.coinLine(`+${formatExact(item.potatokens)} Potatokens`));
        if (item.milestone > 0) lines.push(el('span', 'card-line', `Dex milestone · +${formatExact(item.milestone)} Potatokens`));
        return el('div', 'toast toast-reward', portrait(kidRig!, item.childType, 56), el('div', 'card-text', ...lines));
      }
      case 'milestone':
        return el(
          'div',
          'toast toast-reward',
          icon('icon_potatokens', '', 'ui-icon-28'),
          el(
            'div',
            'card-text',
            el('span', 'card-heading', 'Dex milestone'),
            el('span', 'card-name', `+${formatExact(item.potatokens)} Potatokens earned`),
            el('span', 'card-line', `${item.kids} kids discovered`),
          ),
        );
      case 'recipeReward':
        return el('div', 'toast toast-reward', icon('icon_potatokens', '', 'ui-icon-28'), el('span', 'card-heading', `Recipe found · +${formatExact(item.potatokens)} Potatokens`));
      case 'arrival':
        return el('div', 'toast toast-short', icon('icon_spawn', '', 'ui-icon-28'), el('span', 'card-heading', item.count === 1 ? 'Kid arrived at the Garden.' : `${item.count} kids arrived at the Garden.`));
      case 'refusal':
        return el('div', 'toast toast-short', icon('icon_warning', '', 'ui-icon-28'), el('span', 'card-heading', text ?? refusalText(item.reason, item.command)));
    }
  }

  // --- save banners (GUI_MVP §10) -----------------------------------------------------

  private renderBanners(): void {
    this.banners.replaceChildren();
    document.documentElement.dataset.readonly = String(this.save.readOnly);
    this.shield.replaceChildren();
    if (this.save.readOnly) {
      this.banners.append(this.banner('problem', 'icon_warning', 'Please update the game.', 'Your save needs a newer version.'));
      this.shield.append(
        el(
          'div',
          'readonly-notice ui-surface',
          icon('icon_lock', '', 'ui-icon-28'),
          el('span', 'notice-title', 'Your save is kept safe.'),
          el('span', 'notice-body', 'Close and update the game to continue.'),
        ),
      );
      return;
    }
    if (this.save.unsaved) {
      this.banners.append(this.banner('problem', 'icon_warning', 'Progress can’t be saved right now.', 'You can keep playing in this session.'));
      return; // the recovery notice waits behind the warning
    }
    if (this.save.recovery && !this.recoveryDismissed) {
      const b = this.banner('recovery', 'icon_check', 'We loaded an older save.', 'Your newer one is kept safe.');
      const close = el('button', 'ui-button banner-close', icon('icon_close', '', 'ui-icon-24'));
      close.type = 'button';
      close.setAttribute('aria-label', 'Dismiss save recovery notice');
      close.addEventListener('click', () => {
        this.recoveryDismissed = true;
        this.renderBanners();
      });
      b.append(close);
      this.banners.append(b);
    }
  }

  private banner(kind: 'problem' | 'recovery', iconName: string, title: string, body: string): HTMLElement {
    const b = el('div', `banner banner-${kind}`, icon(iconName, '', 'ui-icon-28'), el('div', 'banner-text', el('span', 'banner-title', title), el('span', 'banner-body', body)));
    b.setAttribute('role', kind === 'problem' ? 'alert' : 'status');
    return b;
  }
}
