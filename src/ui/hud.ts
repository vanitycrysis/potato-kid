import { kidRig, uiData } from '../content/artData';
import type { Content, KidId } from '../content/types';
import type { MapScene } from '../render/scene';
import type { SettingsStore } from '../save/settings';
import type { GameEvent, OfflineReport } from '../sim/game';
import { feedbackFor, refusalText, type FeedbackItem } from './feedback';
import { formatClock, formatCount, formatDuration, formatExact } from './format';
import { BuildingSheets } from './buildings';
import { Dex } from './dex';
import { HomeOverlay } from './homeOverlay';
import type { PlotsSnapshot } from './gardenPlots';
import { KidCard } from './kidCard';
import { PlantingNotes } from './plantingNotes';
import { el, icon, ui } from './dom';
import { openOfflineSummary } from './offline';
import { portrait } from './portrait';
import { openSettings } from './settings';
import { Sheets, type SheetSnapshot } from './sheet';
import './hud.css';
// Patrick Hand (D-031), chosen by Codex, bundled locally under the SIL OFL (assets/PROVENANCE.md).
import fontUrl from '../../assets/fonts/patrick-hand/PatrickHand-Regular.ttf?url';

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

type HudMode = 'portrait' | 'narrow' | 'compact' | 'tworow';

/** The play band the GUI must always leave (GUI_MVP §2). */
const PLAY_BAND = 44;
/** Smallest HUD scroll window: one complete 44 px target plus padding (GUI_MVP §3.1). */
const HUD_WINDOW_MIN = 16 + 44;

/** A feedback card, queued or on screen; it keeps its remaining time across both. */
interface Card {
  item: FeedbackItem;
  node: HTMLElement;
  remaining: number;
  notBefore: number;
  /** Brings live copy up to date before the card is measured and shown. */
  refresh?: () => void;
  /** Runs once the card is actually visible. */
  mounted?: (() => void) | undefined;
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
  private readonly pageHint = el('p', 'page-hint', 'Make this window taller to move kids.');
  private readonly known: Set<KidId>;
  /** Waiting cards, refusals first (GUI_MVP §9). */
  private readonly queue: Card[] = [];
  private showing: Card | null = null;
  private hover = false;
  private inflight = false;
  private save: SaveStatus = { unsaved: false, recovery: false, readOnly: false };
  private recoveryDismissed = false;
  private last = performance.now();
  private readonly sheets: Sheets;
  private readonly buildings: BuildingSheets;
  private readonly dex: Dex;
  private readonly notes: PlantingNotes;
  private readonly kidCard: KidCard;
  private readonly dexButton = el('button', 'ui-button dex-button', icon('icon_dex', '', 'ui-icon-24'));
  private readonly trayCells = new Map<string, HTMLButtonElement>();
  /** The offline summary is up; and the sheet it interrupted, to bring back after (§8). */
  private summaryOpen = false;
  private interrupted: (SheetSnapshot & { search: string; plots: PlotsSnapshot | null }) | null = null;

  constructor(
    private readonly scene: MapScene,
    private readonly content: Content,
    private readonly settings: SettingsStore,
  ) {
    this.applyTokens();
    this.known = new Set(scene.game.state.discoveredKids);

    this.track.append(this.bar);
    this.track.setAttribute('role', 'progressbar');
    this.track.setAttribute('aria-label', 'Next kid');
    this.spawn.type = 'button';
    this.spawn.dataset.cue = 'success'; // the spawn cue is its sound
    this.spawn.append(el('span', 'hud-spawn-label', 'Spawn now'), el('span', 'hud-spawn-price', icon('icon_potatokens', '', 'ui-icon-18'), this.spawnCost));
    this.spawn.addEventListener('click', () => this.instantSpawn());
    const gear = el('button', 'ui-button hud-settings', icon('icon_settings', '', 'ui-icon-24'));
    gear.type = 'button';
    gear.setAttribute('aria-label', 'Settings');
    gear.addEventListener('click', () => openSettings(this.sheets, this.settings, gear));
    this.hud.append(
      el('span', 'hud-stat hud-materials', icon('icon_materials', 'Materials', 'ui-icon-24'), this.materials),
      el('span', 'hud-stat hud-potatokens', icon('icon_potatokens', 'Potatokens', 'ui-icon-24'), this.potatokens),
      gear,
      el('span', 'hud-stat hud-population', icon('icon_kids', 'Kids', 'ui-icon-24'), this.count),
      el('span', 'hud-stat hud-timer', icon('icon_timer', '', 'ui-icon-24'), this.countdown),
      this.track,
      this.spawn,
    );
    this.hud.setAttribute('aria-label', 'Garden status');
    this.feedback.setAttribute('role', 'status');
    this.feedback.addEventListener('pointerenter', () => (this.hover = true));
    this.feedback.addEventListener('pointerleave', () => (this.hover = false));
    // Page mode orders banner, hint, HUD (GUI_MVP §3.1); the hint is hidden otherwise.
    // Banners have their own layer above any sheet (z 80) and are never made inert; the
    // top stack sits below them (GUI_MVP §§2, 10; Codex review, PR #39).
    this.top.append(this.pageHint, this.hud, this.feedback);

    const tray = el(
      'nav',
      'tray ui-surface ui-tray',
      this.trayCell('garden', 'Garden'),
      this.trayCell('capacity', 'Capacity'),
      this.trayCell('bias', 'Bias'),
      this.trayCell('compendium', 'Compendium'),
    );
    tray.setAttribute('aria-label', 'Buildings');
    const dex = this.dexButton;
    dex.type = 'button';
    dex.setAttribute('aria-label', 'Potato-Dex');
    dex.addEventListener('click', () => this.dex.open(dex));
    document.body.append(this.shield, this.banners, this.top, dex, tray);
    this.sheets = new Sheets(
      scene,
      () => [this.top, tray, dex, document.getElementById('app')!].filter(Boolean),
      () => (this.banners.childElementCount ? this.banners.getBoundingClientRect().height + 8 : 0),
      matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
    this.notes = new PlantingNotes(settings);
    this.buildings = new BuildingSheets(scene, content, this.sheets, this.notes);
    this.dex = new Dex(scene, content, this.sheets, this.buildings, this.notes, () => this.save.readOnly);
    // A tap on a kid opens its card (GUI_MVP §18.1). Closed, focus goes to the Dex button
    // (world kids are no focus targets); a read-only save can still browse it.
    this.kidCard = new KidCard(scene, content, this.sheets, this.buildings, this.notes, () => this.save.readOnly);
    scene.listenKidTap((kidId) => this.kidCard.open(kidId, this.dexButton));
    // A tap on a plot opens the Garden on it (GUI_MVP §15.2); a read-only save changes nothing.
    const gardenCell = tray.querySelector<HTMLElement>('.tray-cell');
    scene.listenPlotTap((plot) => {
      if (!this.save.readOnly) this.buildings.openPlot(plot, gardenCell);
    });
    // Send home (D-048): the target's label stays in the world area between HUD and tray.
    const home = new HomeOverlay(() => {
      const top = this.top.getBoundingClientRect();
      return {
        left: top.left,
        right: top.right,
        top: top.bottom + 8,
        bottom: Math.min(tray.getBoundingClientRect().top, dex.getBoundingClientRect().top) - 8,
      };
    });
    scene.homeFits = (t, h) => home.fits(t, h);
    scene.listenHome((v) => home.render(v));

    // The camera must bring any kid out from under the GUI: banners, HUD and feedback at
    // the top; the tray and Dex button at the bottom (GUI_MVP §2; Codex review, PR #15).
    const measure = () => {
      // The top stack starts below any banner (+ 8 px).
      const banner = this.banners.childElementCount ? this.banners.getBoundingClientRect().height + 8 : 0;
      this.top.style.marginTop = `${banner}px`;
      this.layout();
      // Page mode changes what scrolls an open sheet.
      this.sheets.place();
      scene.setInsets(this.top.getBoundingClientRect().bottom, window.innerHeight - Math.min(tray.getBoundingClientRect().top, dex.getBoundingClientRect().top));
    };
    new ResizeObserver(measure).observe(document.body);
    new ResizeObserver(measure).observe(this.top);
    // A banner appearing or changing size moves the HUD down and re-places an open sheet.
    new ResizeObserver(() => {
      measure();
      this.sheets.place();
    }).observe(this.banners);
    // In page mode the body sizes to its content, so a taller window doesn't resize it:
    // the viewport itself must trigger re-selection too (GUI_MVP §3.1).
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    measure();
    scene.listenSteps((events) => this.onStep(events));
    // A newborn's card waits until the kid is actually drawn (its costume may still be
    // loading), then for its discovery effect (Codex review, PR #35).
    scene.listenShown((kidId) => this.kidShown(kidId, performance.now()));
    // Offline catch-up can discover types; the summary reports them, so no card later
    // should call them new (Codex review, PR #33).
    scene.listenResume((report) => {
      for (const t of scene.game.state.discoveredKids) this.known.add(t);
      this.offlineSummary(report);
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
    this.layout();
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
      ['button-selected', 'ui_button_selected'],
      ['banner-problem', 'ui_banner_problem'],
      ['banner-recovery', 'ui_banner_recovery'],
      ['spawn-full', 'ui_spawn_full'],
      ['slider-thumb', 'ui_slider_thumb'],
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

  /** A tray button: opens its building's sheet. */
  private trayCell(key: 'garden' | 'capacity' | 'bias' | 'compendium', label: string): HTMLButtonElement {
    const b = el('button', 'tray-cell', icon(`icon_${key}`), el('span', 'tray-label', label));
    b.type = 'button';
    this.trayCells.set(key, b);
    b.setAttribute('aria-label', label);
    b.addEventListener('click', () => this.buildings.open(key, b));
    return b;
  }

  /** Android Back: closes an open sheet (returns whether it did). */
  back(): boolean {
    return this.sheets.back();
  }

  /**
   * The offline-return summary, once per report (GUI_MVP §8). A sheet that was open is put
   * away and comes back, where it was, when the summary is dismissed; a second report while
   * the summary is up replaces it. A short absence (a quick app switch) shows nothing: the
   * rewards are credited all the same (D-049).
   */
  private offlineSummary(report: OfflineReport): void {
    if (this.save.readOnly) return;
    if (report.seconds + report.discardedSeconds < this.content.balance.economy.offlineSummaryMinSeconds) return;
    if (!this.summaryOpen) {
      const open = this.sheets.snapshot();
      this.interrupted = open && { ...open, search: this.buildings.searchText, plots: this.buildings.plotsSnapshot };
    }
    this.summaryOpen = true;
    openOfflineSummary(this.sheets, report, this.content.balance.economy.offlineCapHours, (replaced) => {
      if (replaced) return;
      this.summaryOpen = false;
      const back = this.interrupted;
      this.interrupted = null;
      if (!back) return;
      if (back.key === 'dex') this.dex.open(back.launcher);
      else if (back.key === 'settings') openSettings(this.sheets, this.settings, back.launcher, back.scrollTop);
      else if (back.key === 'garden' || back.key === 'capacity' || back.key === 'bias' || back.key === 'compendium')
        this.buildings.open(back.key, back.launcher, { scrollTop: back.scrollTop, search: back.search, plots: back.plots });
    });
  }

  /**
   * Portrait three rows, narrow four rows, compact one row (GUI_MVP §3); with a persistent
   * save banner, whichever of those, a two-row HUD, a HUD scroll window or a page without
   * the world first leaves the 44 px play band (§3.1). The usual HUD is always tried first.
   */
  private layout(): void {
    const root = document.documentElement;
    // Staying in the HUD scroll window keeps its offset; entering it starts at 0 (§3.1).
    const wasWindow = root.dataset.hudFit === 'window';
    const scroll = wasWindow ? this.hud.scrollTop : 0;
    // Measuring the usual layout briefly shortens the page, which would clamp a page-mode
    // scroll to the top: it is put back if the page stays (Codex review, PR #41 follow-up).
    const page = document.scrollingElement ?? root;
    const pageScroll = root.dataset.hudFit === 'page' ? page.scrollTop : null;
    const w = window.visualViewport?.width ?? window.innerWidth;
    const h = window.visualViewport?.height ?? window.innerHeight;
    root.dataset.compact = h <= 520 ? 'true' : 'false';
    root.dataset.hudFit = 'usual';
    this.hud.style.height = '';
    const inner = this.hud.clientWidth - 16;
    let mode: HudMode = w < 360 && h > 520 ? 'narrow' : 'portrait';
    if (h <= 520) mode = inner >= 556 ? 'compact' : 'portrait';
    this.hud.dataset.mode = mode;
    if (!this.persistentBanner()) return;

    const banner = this.banners.getBoundingClientRect().height;
    const top = this.banners.getBoundingClientRect().top;
    const bottom = Math.min(...['.tray', '.dex-button'].map((q) => document.querySelector(q)?.getBoundingClientRect().top ?? h)) - 8;
    // A: the tallest HUD that still leaves the band (Y = HUD top, E = band bottom).
    const hudTop = top + banner + 8;
    const room = bottom - hudTop - 8 - PLAY_BAND;
    if (this.hud.offsetHeight <= room) return;
    // The two-row HUD needs 340 px of content width (C = HUD width − 32).
    if (104 <= room && this.hud.clientWidth + 16 - 32 >= 340) {
      this.hud.dataset.mode = 'tworow';
      return;
    }
    if (room >= HUD_WINDOW_MIN) {
      // A vertical scroll window of height A over the two-row content when it fits beside
      // the 6 px gutter, else the four-row content (§3.1).
      root.dataset.hudFit = 'window';
      this.hud.dataset.mode = this.hud.clientWidth + 16 - 32 - 6 >= 340 ? 'tworow' : 'narrow';
      this.hud.style.height = `${Math.floor(room)}px`;
      this.hud.scrollTop = wasWindow ? scroll : 0;
      return;
    }
    // No room even for one target and the band: the world is hidden and everything flows
    // as one page until the window grows (§3.1). Held input is settled first.
    this.scene.cancelDrag();
    root.dataset.hudFit = 'page';
    this.hud.dataset.mode = 'narrow';
    if (pageScroll !== null) page.scrollTop = pageScroll;
  }

  /** An unsaved or recovery banner is up (read-only hides the HUD instead). */
  private persistentBanner(): boolean {
    return !this.save.readOnly && this.banners.childElementCount > 0;
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
    this.sheets.tick();
    for (const [key, cell] of this.trayCells) cell.classList.toggle('is-selected', this.sheets.openKey === key);
  }

  // --- feedback ---------------------------------------------------------------------

  private onStep(events: GameEvent[]): void {
    // A sheet shows its own command's refusal inline; the world never repeats it (GUI_MVP §9).
    const inSheet = new Set([...this.buildings.onStep(events), ...this.dex.onStep(events), ...this.kidCard.onStep(events)]);
    const items = feedbackFor(
      events.filter((e) => !inSheet.has(e)),
      this.known,
      this.scene.game.state.discoveredKids.length,
    );
    for (const e of events) if (e.type === 'spawned' && e.source === 'instant') this.inflight = false;
    const now = performance.now();
    for (const item of items) {
      if (item.kind === 'refusal' && item.command === 'instantSpawn') this.inflight = false;
      const notBefore = this.readyAt(item, now);
      // The command implies the currency, except a respawn (whose sheet keeps its own context).
      const currency = item.kind === 'refusal' ? ({ instantSpawn: 'potatokens', upgrade: 'materials' } as const)[item.command as 'instantSpawn' | 'upgrade'] : undefined;
      const text = item.kind === 'refusal' ? refusalText(item.reason, item.command, currency) : undefined;
      const card: Card =
        item.kind === 'planted' ? this.sentHomeCard(item) : { item, node: this.card(item, text), remaining: FEEDBACK_MS, notBefore };
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
    // A sprout's card waits for its kid too: a costume still loading would leave it on show
    // for a kid nobody can see yet (Codex review, PR #77).
    if (item.kind === 'sprouted') return this.scene.viewState(item.kidId) === 'pending' ? Infinity : now;
    if (item.kind !== 'discovery' && item.kind !== 'newKid') return now;
    const after = item.kind === 'discovery' ? this.scene.discoveryToastDelayMs : 0;
    const state = item.kidId === undefined ? 'shown' : this.scene.viewState(item.kidId);
    return state === 'pending' ? Infinity : now + after;
  }

  private kidShown(kidId: number, now: number): void {
    for (const c of this.queue) {
      if ((c.item.kind === 'discovery' || c.item.kind === 'newKid' || c.item.kind === 'sprouted') && c.item.kidId === kidId) c.notBefore = this.readyAt(c.item, now);
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
    // While a sheet is open, a visible card keeps its time and nothing new is shown, so no
    // card plays out unseen behind the modal (GUI_MVP §9; Codex review, PR #39).
    if (this.sheets.isOpen) return;
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
    next?.refresh?.();
    if (!next || !this.fits(next.node)) return;
    this.queue.splice(at, 1);
    this.showing = next;
    this.feedback.append(next.node);
    next.mounted?.();
    next.mounted = undefined;
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
        // A planting-only special found for the first time says so (GUI_MVP §15.5).
        const special = this.content.kids.find((k) => k.id === item.childType)?.special === true;
        const heading = item.kind === 'newKid' ? (special ? 'Special found' : 'New kid discovered') : item.newKid ? 'New discovery' : 'New recipe found';
        const lines: Node[] = [el('span', 'card-heading', heading), el('span', 'card-name', this.name(item.childType)), this.tier(item.childType)];
        // New type and new variant at once: one card for both (§15.5).
        if (item.kind === 'newKid' && item.variant) lines.push(el('span', 'card-line', `${item.variant[0]!.toUpperCase()}${item.variant.slice(1)} found`));
        if (item.kind === 'discovery' && item.potatokens > 0) lines.push(this.coinLine(`+${formatExact(item.potatokens)} Potatokens`));
        if (item.milestone > 0) lines.push(el('span', 'card-line', `Dex milestone · +${formatExact(item.milestone)} Potatokens`));
        // The whole card opens this kid in the Potato-Dex (GUI_MVP §9).
        const card = el('button', 'toast toast-reward toast-button', portrait(kidRig!, item.childType, 56), el('div', 'card-text', ...lines));
        card.type = 'button';
        // The card is the launcher: closing the Dex returns focus to it (Codex review, PR #43).
        card.addEventListener('click', () => this.dex.open(card, item.childType));
        return card;
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
      case 'planted':
        return el('div', 'toast', el('span', 'card-heading', this.notes.heading(this.name(item.kidType), item.plot, item.added)));
      case 'growing':
        return el(
          'div',
          'toast toast-short',
          icon('icon_garden', '', 'ui-icon-28'),
          el(
            'div',
            'card-text',
            el('span', 'card-heading', `Plot ${item.plot + 1} is growing.`),
            el('span', 'card-line', `One kid sprouts in ${formatDuration(this.scene.game.growSeconds)}.`),
          ),
        );
      case 'sprouted': {
        // The four reveals (GUI_MVP §15.5): by the actual kid, never by which roll hit.
        const special = this.content.kids.find((k) => k.id === item.kidType)?.special === true;
        const variant = item.variant ? `${item.variant[0]!.toUpperCase()}${item.variant.slice(1)} ` : '';
        const from = `From Plot ${item.plot + 1}.`;
        const helper = special ? (item.variant ? `Rare special kid · ${from}` : `Special kid · ${from}`) : item.variant ? `Rare variant · ${from}` : from;
        // A variant new to the Dex reads as its discovery, "{variant} found · {type}", and like
        // any discovery the whole card opens that kid in the Dex (§9; Codex review, PR #77).
        const heading = item.found ? `${variant.trim()} found · ${this.name(item.kidType)}` : `${variant}${this.name(item.kidType)} sprouted!`;
        const parts = [portrait(kidRig!, item.kidType, 48), el('div', 'card-text', el('span', 'card-heading', heading), el('span', 'card-line', helper))];
        if (!item.found) return el('div', 'toast toast-short', ...parts);
        const card = el('button', 'toast toast-reward toast-button', ...parts);
        card.type = 'button';
        card.addEventListener('click', () => this.dex.open(card, item.kidType));
        return card;
      }
    }
  }

  /**
   * "{name} added to Plot {n}." (GUI_MVP §15.6). The first one in this profile explains
   * planting, stays 6 s and can be closed; only once it is visible is it marked as shown.
   */
  private sentHomeCard(item: Extract<FeedbackItem, { kind: 'planted' }>): Card {
    const first = this.notes.claimFirst();
    const lines = (first ? this.notes.firstLines() : [this.notes.later(item.count)]).map((t) => el('span', 'card-line', t));
    const text = el('div', 'card-text', el('span', 'card-heading', this.notes.heading(this.name(item.kidType), item.plot, item.added)), ...lines);
    const node = el('div', 'toast toast-reward toast-home', icon('icon_garden', '', 'ui-icon-28'), text);
    // Shown as soon as the queue allows: a planted kid leaves the map at once, no farewell.
    const card: Card = { item, node, remaining: this.notes.visibleMs(first), notBefore: 0 };
    if (first) {
      const close = el('button', 'ui-button card-close', icon('icon_close', '', 'ui-icon-24'));
      close.type = 'button';
      close.setAttribute('aria-label', 'Dismiss');
      close.addEventListener('click', () => {
        if (this.showing === card) card.remaining = 0;
      });
      node.append(close);
      card.mounted = () => this.notes.markShown();
    }
    return card;
  }

  // --- save banners (GUI_MVP §10) -----------------------------------------------------

  private renderBanners(): void {
    // Read-only: the building launchers are visibly unavailable, with the reason announced
    // (GUI_MVP §10; Codex review, PR #39).
    for (const cell of this.trayCells.values()) {
      const label = cell.querySelector('.tray-label')?.textContent ?? '';
      cell.disabled = this.save.readOnly;
      cell.setAttribute('aria-label', this.save.readOnly ? `${label}: Update the game to continue.` : label);
    }
    // A read-only save gives the Dex nothing real to show (GUI_MVP §10).
    this.dexButton.disabled = this.save.readOnly;
    this.dexButton.setAttribute('aria-label', this.save.readOnly ? 'Potato-Dex: Update the game to continue.' : 'Potato-Dex');
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
        this.layout();
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
