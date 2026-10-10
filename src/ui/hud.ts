import { kidRig, uiData } from '../content/artData';
import type { Content, KidId } from '../content/types';
import type { MapScene } from '../render/scene';
import type { SettingsStore } from '../save/settings';
import type { GameEvent, OfflineReport } from '../sim/game';
import { feedbackFor, refusalText, type FeedbackItem } from './feedback';
import { formatCount, formatDuration, formatExact } from './format';
import { Arrivals } from './arrivals';
import { BuildingSheets } from './buildings';
import { Dex } from './dex';
import { HomeOverlay } from './homeOverlay';
import type { PlotsSnapshot } from './gardenPlots';
import { KidCard, type CardSnapshot } from './kidCard';
import { KidsOnMap } from './kidsOnMap';
import { PlantingNotes } from './plantingNotes';
import { el, icon, ui } from './dom';
import { NOTEBOOK_KEYS, Notebook } from './notebook';
import { openOfflineSummary } from './offline';
import { kindMark } from './plotRoute';
import { portrait } from './portrait';
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

/** The play band the GUI must always leave (GUI_MVP §§2, 19.3). */
const PLAY_BAND = 44;

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
  /** The population's icon: kids, or a warning when the map is full (§19.1). */
  private readonly countIcon = el('span', 'hud-count-icon');
  private countFull: boolean | null = null;
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
  private save: SaveStatus = { unsaved: false, recovery: false, readOnly: false };
  private recoveryDismissed = false;
  private last = performance.now();
  private readonly sheets: Sheets;
  private readonly buildings: BuildingSheets;
  private readonly dex: Dex;
  private readonly notes: PlantingNotes;
  private readonly kidCard: KidCard;
  private readonly notebook: Notebook;
  private readonly kidsOnMap: KidsOnMap;
  private readonly arrivals: Arrivals;
  /** The navigation row: Garden, Dex, Notebook (GUI_MVP §19.1). */
  private readonly trayCells = new Map<'garden' | 'dex' | 'notebook', HTMLButtonElement>();
  /** The offline summary is up; and the sheet it interrupted, to bring back after (§8). */
  private summaryOpen = false;
  private interrupted: (SheetSnapshot & { search: string; plots: PlotsSnapshot | null; card: CardSnapshot | null }) | null = null;

  constructor(
    private readonly scene: MapScene,
    private readonly content: Content,
    private readonly settings: SettingsStore,
  ) {
    this.applyTokens();
    this.known = new Set(scene.game.state.discoveredKids);

    // Three noninteractive stats (§19.1): the timer, Spawn now and Settings moved to sheets.
    this.hud.append(
      el('span', 'hud-stat hud-materials', icon('icon_materials', '', 'ui-icon-24'), this.materials),
      el('span', 'hud-stat hud-potatokens', icon('icon_potatokens', '', 'ui-icon-24'), this.potatokens),
      el('span', 'hud-stat hud-population', this.countIcon, this.count),
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
      this.trayCell('garden', 'Garden', 'icon_garden', (b) => this.buildings.open('garden', b)),
      this.trayCell('dex', 'Dex', 'icon_dex', (b) => this.dex.open(b)),
      this.trayCell('notebook', 'Notebook', 'icon_compendium', (b) => this.notebook.open(b)),
    );
    tray.setAttribute('aria-label', 'Main');
    const dex = this.trayCells.get('dex')!;
    document.body.append(this.shield, this.banners, this.top, tray);
    this.sheets = new Sheets(
      scene,
      () => [this.top, tray, document.getElementById('app')!].filter(Boolean),
      () => (this.banners.childElementCount ? this.banners.getBoundingClientRect().height + 8 : 0),
      matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
    this.notes = new PlantingNotes(settings);
    this.arrivals = new Arrivals(scene, content, () => this.save.readOnly);
    this.buildings = new BuildingSheets(scene, content, this.sheets, this.notes, this.arrivals);
    this.notebook = new Notebook(scene, this.sheets, this.buildings, settings, () => this.save.readOnly);
    this.dex = new Dex(scene, content, this.sheets, this.buildings, (kidId, launcher, back, ordinal) => this.kidCard.open(kidId, launcher, back, undefined, ordinal), () => this.save.readOnly, (launcher, back) => this.kidsOnMap.open(launcher, { back }));
    // A tap on a kid opens its card (GUI_MVP §18.1). Closed, focus goes to the Dex control
    // (world kids are no focus targets); a read-only save can still browse it.
    this.kidCard = new KidCard(scene, content, this.sheets, this.buildings, this.notes, () => this.save.readOnly);
    scene.listenKidTap((kidId) => this.kidCard.open(kidId, dex));
    // Every kid on the map, and a tap's candidates (GUI_MVP §§19.2, 20.1).
    this.kidsOnMap = new KidsOnMap(scene, content, this.sheets, (kidId, launcher, back, ordinal) => this.kidCard.open(kidId, launcher, back, undefined, ordinal));
    scene.listenKidChoice((ids) => this.kidsOnMap.open(dex, { ids }));
    // A tap on a plot opens the Garden on it (GUI_MVP §15.2); a read-only save changes nothing.
    const gardenCell = this.trayCells.get('garden')!;
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
        bottom: tray.getBoundingClientRect().top - 8,
      };
    });
    scene.homeFits = (t, h) => home.fits(t, h);
    scene.listenHome((v) => home.render(v));

    // The camera must bring any kid out from under the GUI: banners, HUD and feedback at
    // the top; the navigation at the bottom (GUI_MVP §§2, 19.1; Codex review, PR #15).
    const measure = () => {
      // The top stack starts below any banner (+ 8 px).
      const banner = this.banners.childElementCount ? this.banners.getBoundingClientRect().height + 8 : 0;
      this.top.style.marginTop = `${banner}px`;
      this.layout();
      // Page mode changes what scrolls an open sheet.
      this.sheets.place();
      scene.setInsets(this.top.getBoundingClientRect().bottom, window.innerHeight - tray.getBoundingClientRect().top);
    };
    new ResizeObserver(measure).observe(document.body);
    new ResizeObserver(measure).observe(this.top);
    // The navigation is sized by its content: a font that loads, or text that wraps, can change
    // it with no other resize (Codex review round 4, PR #87).
    new ResizeObserver(measure).observe(tray);
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

  /** A navigation control (§19.1): a 24 px glyph beside its label. */
  private trayCell(key: 'garden' | 'dex' | 'notebook', label: string, glyph: string, open: (b: HTMLButtonElement) => void): HTMLButtonElement {
    const b = el('button', 'tray-cell', icon(glyph, '', 'ui-icon-24'), el('span', 'tray-label', label));
    b.type = 'button';
    b.dataset.nav = key;
    this.trayCells.set(key, b);
    b.addEventListener('click', () => open(b));
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
      this.interrupted = open && { ...open, search: this.buildings.searchText, plots: this.buildings.plotsSnapshot, card: this.kidCard.snapshot() };
    }
    this.summaryOpen = true;
    openOfflineSummary(this.sheets, report, this.content.balance.economy.offlineCapHours, (replaced) => {
      if (replaced) return;
      this.summaryOpen = false;
      const back = this.interrupted;
      this.interrupted = null;
      if (!back) return;
      if (back.key === 'dex') this.dex.open(back.launcher);
      else if (back.key === 'kid' && back.card) this.kidCard.restore(back.card, back.launcher, back.scrollTop);
      else if (back.key === 'notebook') this.notebook.open(back.launcher, undefined, back.scrollTop);
      else if (KidsOnMap.isList(back.key)) this.kidsOnMap.reopen(back.scrollTop);
      // Every Notebook tool comes back as a page of it, with its way back (Codex review, PR #87).
      else if (Notebook.isTool(back.key)) this.notebook.openRow(back.key, back.launcher, undefined, { scrollTop: back.scrollTop, search: back.search, plots: back.plots });
      else if (back.key === 'garden') this.buildings.open('garden', back.launcher, { scrollTop: back.scrollTop, search: back.search, plots: back.plots });
    });
  }

  /**
   * The natural layout first: one 60 px stat strip and one 60 px navigation row, each
   * growing into stacked lines if its content doesn't fit (GUI_MVP §19.1). If that leaves
   * less than the 44 px play band (a banner, large text, a short window), both become 60 px
   * scroll windows; if even that doesn't leave it, the world is hidden and everything flows
   * as one page until the window grows (§19.3). The natural layout is always tried first.
   */
  private layout(): void {
    const root = document.documentElement;
    const tray = document.querySelector<HTMLElement>('.tray');
    // Staying in the scroll windows keeps their offsets; entering them starts at 0.
    const wasWindow = root.dataset.hudFit === 'window';
    const scroll = wasWindow ? [this.hud.scrollTop, tray?.scrollTop ?? 0] : [0, 0];
    // Measuring the natural layout briefly shortens the page, which would clamp a page-mode
    // scroll to the top: it is put back if the page stays (Codex review, PR #41 follow-up).
    const page = document.scrollingElement ?? root;
    const pageScroll = root.dataset.hudFit === 'page' ? page.scrollTop : null;
    const h = window.visualViewport?.height ?? window.innerHeight;
    root.dataset.compact = h <= 520 ? 'true' : 'false';
    root.dataset.hudFit = 'usual';
    for (const e of [this.hud, tray]) if (e) e.style.height = '';
    // Read-only hides the HUD and freezes the world: nothing to fit.
    if (this.save.readOnly) return;
    const band = () => (tray?.getBoundingClientRect().top ?? h) - 8 - (this.hud.getBoundingClientRect().bottom + 8);
    if (band() >= PLAY_BAND) return;
    root.dataset.hudFit = 'window';
    // Each window is 60 px, or taller to show its tallest item whole (enlarged text), plus
    // its 16 px of border (§19.3; Codex review, PR #87).
    for (const e of [this.hud, tray]) {
      if (!e) continue;
      const tallest = Math.max(0, ...[...e.children].map((c) => (c as HTMLElement).offsetHeight));
      if (tallest + 16 > 60) e.style.height = `${Math.ceil(tallest) + 16}px`;
    }
    this.hud.scrollTop = scroll[0]!;
    if (tray) tray.scrollTop = scroll[1]!;
    if (band() >= PLAY_BAND) return;
    // No room even for the windows and the band: held input is settled first (§19.3).
    this.scene.cancelDrag();
    root.dataset.hudFit = 'page';
    for (const e of [this.hud, tray]) if (e) e.style.height = '';
    if (pageScroll !== null) page.scrollTop = pageScroll;
  }

  /** An unsaved or recovery banner is up (read-only hides the HUD instead). */
  private persistentBanner(): boolean {
    return !this.save.readOnly && this.banners.childElementCount > 0;
  }

  // --- per-frame rendering --------------------------------------------------------

  private render(now: number): void {
    const dt = Math.min(250, now - this.last);
    this.last = now;
    const g = this.scene.game;
    const s = g.state;
    this.materials.textContent = formatCount(s.materials);
    this.materials.parentElement!.setAttribute('aria-label', `Materials: ${formatExact(s.materials)}`);
    this.potatokens.textContent = formatCount(s.potatokens);
    this.potatokens.parentElement!.setAttribute('aria-label', `Potatokens: ${formatExact(s.potatokens)}`);
    const onMap = s.world.kids.length;
    this.count.textContent = `${onMap}/${g.capacity}`;
    // A full map swaps the kids icon for a warning, keeping the count (§19.1).
    const full = onMap >= g.capacity;
    if (full !== this.countFull) {
      this.countFull = full;
      this.countIcon.replaceChildren(icon(full ? 'icon_warning' : 'icon_kids', '', 'ui-icon-24'));
    }
    this.count.parentElement!.setAttribute('aria-label', full ? `Map is full: ${onMap} of ${g.capacity} kids` : `${onMap} of ${g.capacity} kids on the map`);

    this.tickFeedback(now, dt);
    this.sheets.tick();
    const open = this.sheets.openKey;
    const selected = open === null ? null : NOTEBOOK_KEYS.has(open) ? 'notebook' : open === 'dex' || open === 'kid' ? 'dex' : open === 'garden' ? 'garden' : null;
    for (const [key, cell] of this.trayCells) cell.classList.toggle('is-selected', selected === key);
  }

  // --- feedback ---------------------------------------------------------------------

  private onStep(events: GameEvent[]): void {
    // A sheet shows its own command's refusal inline; the world never repeats it (GUI_MVP §9).
    const inSheet = new Set([...this.buildings.onStep(events), ...this.kidCard.onStep(events), ...this.arrivals.onStep(events)]);
    const items = feedbackFor(
      events.filter((e) => !inSheet.has(e)),
      this.known,
      this.scene.game.state.discoveredKids.length,
    );
    const now = performance.now();
    for (const item of items) {
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
    return (document.querySelector('.tray')?.getBoundingClientRect().top ?? window.innerHeight) - top;
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
        // A planting-only special or rare found for the first time says so (GUI_MVP §15.5, D-072).
        const kind = kindMark(this.content.kids.find((k) => k.id === item.childType));
        const heading = item.kind === 'newKid' ? (kind ? `${kind} found` : 'New kid discovered') : item.newKid ? 'New discovery' : 'New recipe found';
        const lines: Node[] = [el('span', 'card-heading', heading), el('span', 'card-name', this.name(item.childType)), this.tier(item.childType)];
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
      case 'fed': {
        // Its card had closed before the bite was accepted: the result is still said (§17.2).
        const f = this.content.balance.feeding;
        const who = item.name ?? this.name(item.kidType);
        const food = f.foods.find((x) => x.id === item.food)?.name ?? item.food;
        const lines = item.favourite
          ? [`${food} is ${who}’s favourite!`, `Happy for ${formatDuration(f.favouriteSeconds)}.`]
          : [`${who} enjoyed ${food}.`, `Happy for ${formatDuration(f.happySeconds)}.`];
        return el('div', 'toast toast-short', icon('icon_happy', '', 'ui-icon-28'), el('div', 'card-text', el('span', 'card-heading', lines[0]!), el('span', 'card-line', lines[1]!)));
      }
      case 'named':
        return el(
          'div',
          'toast toast-short',
          icon('icon_check', '', 'ui-icon-28'),
          el('span', 'card-heading', item.name ? `Named ${item.name}.` : `Called ${this.name(item.kidType)} again.`),
        );
      case 'sprouted': {
        // The reveals (GUI_MVP §15.5): by the actual kid, never by which roll hit. A type new to
        // the Dex gets the discovery card instead.
        const kind = kindMark(this.content.kids.find((k) => k.id === item.kidType));
        const from = `From Plot ${item.plot + 1}.`;
        const helper = kind ? `${kind} kid · ${from}` : from;
        return el('div', 'toast toast-short', portrait(kidRig!, item.kidType, 48), el('div', 'card-text', el('span', 'card-heading', `${this.name(item.kidType)} sprouted!`), el('span', 'card-line', helper)));
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
    // Read-only: the Garden and the Dex are visibly unavailable, with the reason announced
    // (GUI_MVP §10; Codex review, PR #39). The Notebook stays, for Settings and Map view; its
    // building rows are unavailable in the same way.
    for (const key of ['garden', 'dex'] as const) {
      const cell = this.trayCells.get(key)!;
      cell.disabled = this.save.readOnly;
      if (this.save.readOnly) cell.setAttribute('aria-label', `${cell.textContent}: Update the game to continue.`);
      else cell.removeAttribute('aria-label');
    }
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
