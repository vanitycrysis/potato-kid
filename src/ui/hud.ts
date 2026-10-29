import { kidRig, uiData } from '../content/artData';
import type { Content, KidId } from '../content/types';
import type { MapScene } from '../render/scene';
import type { SettingsStore } from '../save/settings';
import type { GameEvent, OfflineReport, Recap } from '../sim/game';
import { feedbackFor, refusalText, type FeedbackItem } from './feedback';
import { Nameplates } from './nameplates';
import { NewKidPopup } from './newKidPopup';
import { formatCount, formatDuration, formatExact } from './format';
import { Arrivals } from './arrivals';
import { BuildingSheets } from './buildings';
import { FieldSheets } from './fields';
import { Dex } from './dex';
import { HomeOverlay } from './homeOverlay';
import { NameBubble, nameOnHold, type BubbleContent } from './nameBubble';
import { Tutorial } from './tutorial';
import { adoptLegacy, enqueue, noteEvents, relevantNow } from './lessons';
import { LessonNotes } from './lessonNotes';
import { LessonsSheet } from './lessonsSheet';
import { RecipePreview } from './recipePreview';
import type { PlotsSnapshot } from './gardenPlots';
import { KidCard, type CardSnapshot } from './kidCard';
import { KidsOnMap } from './kidsOnMap';
import { PlantingNotes } from './plantingNotes';
import { el, icon, tierBadge, tierName, tierShort, ui } from './dom';
import { NOTEBOOK_KEYS, Notebook } from './notebook';
import { openOfflineSummary } from './offline';
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
  private readonly hud = el('section', 'hud');
  private readonly materials = el('span', 'hud-count');
  private readonly potatokens = el('span', 'hud-count');
  private readonly count = el('span', 'hud-value');
  /** Each stat's name, value and purpose, one tap away (D-077, GUI_MVP §23.2). */
  private readonly bubble: NameBubble;
  /** The stat chips, by bubble key. */
  private readonly stats = new Map<'materials' | 'potatokens' | 'kids', HTMLButtonElement>();
  /** An icon-only control's name, above the tray (§23.2). */
  private readonly tip = el('div', 'name-tip ui-surface ui-toast');
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
  private readonly fields: FieldSheets;
  private readonly kidsOnMap: KidsOnMap;
  /** What map nicknames kept clear of in the last frame (test hook). */
  nameExclusions: { left: number; top: number; right: number; bottom: number }[] = [];
  /** Map nicknames (D-091); a test hook reads them. */
  private nameplates: Nameplates | null = null;
  private readonly arrivals: Arrivals;
  /** The navigation row: Garden, Dex, Notebook (GUI_MVP §19.1). */
  private readonly trayCells = new Map<'garden' | 'dex' | 'notebook', HTMLButtonElement>();
  /** The offline summary is up; and the sheet it interrupted, to bring back after (§8). */
  private summaryOpen = false;
  private interrupted: (SheetSnapshot & { search: string; plots: PlotsSnapshot | null; card: CardSnapshot | null; farm: ((scrollTop: number) => void) | null; gardenBack: { label: string; run: () => void } | null }) | null = null;

  /** The first-run introduction and its previews (D-086, GUI_MVP §27.1). */
  private readonly tutorial: Tutorial;
  /** The automatic lessons' quiet notes, and their replay sheet (D-086, §27.2-27.3). */
  private readonly lessonNotes: LessonNotes;
  private readonly lessonsSheet: LessonsSheet;
  /** The new-kid popup (D-087, D-088). */
  private readonly popup: NewKidPopup;
  /** A sheet put aside at a return, for its popups and summaries: it comes back after them. */
  private asideForReturn = false;
  /**
   * Saves the game now (set by the app): a popup or summary acknowledged is kept before the
   * next is shown (§27.5).
   */
  persist: () => void = () => {};

  constructor(
    private readonly scene: MapScene,
    private readonly content: Content,
    private readonly settings: SettingsStore,
    /**
     * Offer the introduction on a first run, and show lessons: off in tests unless asked for
     * (`?tutorial=1`, `?lessons=1`).
     */
    private readonly options: { tutorialAuto: boolean; arrivals: boolean; lessons: boolean } = { tutorialAuto: true, arrivals: true, lessons: true },
  ) {
    this.applyTokens();
    // A save from before lessons adopts them now, from the old tutorial's record and its own
    // evidence (§27.3); a read-only one is never written, so it gets none.
    const state = scene.game.state;
    if (state.lessons === null) state.lessons = adoptLegacy(scene.game, content.balance, settings.value.guidedTutorial.status);
    this.known = new Set(scene.game.state.discoveredKids);

    // Three stat chips (D-077, §23.1): a glyph and a count each; one tap opens its name bubble.
    this.bubble = new NameBubble(
      () => ({
        left: this.top.getBoundingClientRect().left,
        right: this.top.getBoundingClientRect().right,
        below: this.hud.getBoundingClientRect().bottom,
        bottom: (document.querySelector('.tray')?.getBoundingClientRect().top ?? window.innerHeight) - 8,
      }),
      (key, trigger, content) => this.statHelp(key, trigger, content),
      this.tip,
    );
    this.hud.append(
      this.stat('materials', 'hud-materials', 'icon_materials', this.materials),
      this.stat('potatokens', 'hud-potatokens', 'icon_potatokens', this.potatokens),
      this.stat('kids', 'hud-population', 'icon_kids', this.count),
    );
    this.tip.hidden = true;
    this.tip.setAttribute('aria-hidden', 'true');
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
      this.trayCell('garden', 'Garden', 'icon_r3_garden', (b) => this.buildings.open('garden', b)),
      this.trayCell('dex', 'Potato-Dex', 'icon_r3_dex', (b) => this.dex.open(b)),
      this.trayCell('notebook', 'Notebook', 'icon_r3_notebook', (b) => this.notebook.open(b)),
    );
    tray.setAttribute('aria-label', 'Main');
    // The arrivals waiting live in the game state, saved with the births they show (§27.5).
    this.popup = new NewKidPopup(
      content,
      () => scene.game.state.presentation.arrivals,
      () => matchMedia('(prefers-reduced-motion: reduce)').matches,
      // Save banners stay usable above it (§27.3).
      () => [this.top, tray, this.feedback, document.getElementById('app')].filter((e): e is HTMLElement => !!e),
      (paused) => (scene.inputPaused = paused),
      () => this.trayCells.get('garden') ?? null,
      () => this.persist(),
    );
    this.tutorial = new Tutorial(
      scene,
      () => scene.game.state.lessons!,
      () => [this.top, tray, document.getElementById('app')].filter((e): e is HTMLElement => !!e),
      () => this.trayCells.get('garden') ?? null,
      matchMedia('(prefers-reduced-motion: reduce)').matches,
      () => this.sheets.isOpen,
      () => this.persist(),
    );
    const dex = this.trayCells.get('dex')!;
    document.body.append(this.shield, this.banners, this.top, tray, this.tip);
    this.lessonNotes = new LessonNotes(() => scene.game.state.lessons, tray, () => this.top.getBoundingClientRect().bottom, () => this.trayCells.get('garden') ?? null, () => this.persist());
    this.sheets = new Sheets(
      scene,
      () => [this.top, tray, document.getElementById('app')!].filter(Boolean),
      () => (this.banners.childElementCount ? this.banners.getBoundingClientRect().height + 8 : 0),
      matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
    this.notes = new PlantingNotes(settings);
    this.arrivals = new Arrivals(scene, content, () => this.save.readOnly);
    // Food fields and the pantry (D-069, GUI_MVP §22).
    this.fields = new FieldSheets(scene, content, this.sheets, () => this.save.readOnly, (launcher, back) => this.buildings.openFields(launcher, back ?? null), (kidId, launcher, back, ordinal) => this.kidCard.open(kidId, launcher, back, undefined, ordinal), () => this.buildings.fieldsBack);
    this.buildings = new BuildingSheets(scene, content, this.sheets, this.notes, this.arrivals, (launcher) => this.fields.section(launcher));
    this.lessonsSheet = new LessonsSheet(this.sheets, () => scene.game.state.lessons, (launcher) => this.tutorial.replay(launcher));
    this.notebook = new Notebook(scene, this.sheets, this.buildings, settings, () => this.save.readOnly, () => this.openLessons(), (launcher) =>
      this.fields.openPantry(launcher, {
        label: 'Back to Notebook',
        run: () => {
          this.sheets.asPage();
          this.notebook.open(launcher, 'pantry');
        },
      }),
    );
    this.dex = new Dex(scene, content, this.sheets, this.buildings, (kidId, launcher, back, ordinal) => this.kidCard.open(kidId, launcher, back, undefined, ordinal), () => this.save.readOnly, (launcher, back) => this.kidsOnMap.open(launcher, { back }));
    // A tap on a kid opens its card (GUI_MVP §18.1). Closed, focus goes to the Dex control
    // (world kids are no focus targets); a read-only save can still browse it.
    this.kidCard = new KidCard(scene, content, this.sheets, this.buildings, this.notes, () => this.save.readOnly, (field, launcher) => this.fields.openField(field, launcher, { gardenBack: null }), {
      openPantry: (launcher, back) => this.fields.openPantry(launcher, back),
      openFields: (launcher, back) => this.buildings.openFields(launcher, back),
    });
    scene.listenKidTap((kidId) => this.kidCard.open(kidId, dex));
    // Every kid on the map, and a tap's candidates (GUI_MVP §§19.2, 20.1).
    this.kidsOnMap = new KidsOnMap(scene, content, this.sheets, (kidId, launcher, back, ordinal) => this.kidCard.open(kidId, launcher, back, undefined, ordinal));
    scene.listenKidChoice((ids) => this.kidsOnMap.open(dex, { ids }));
    // A tap on a plot opens the Garden on it (GUI_MVP §15.2); a read-only save changes nothing.
    const gardenCell = this.trayCells.get('garden')!;
    // A tap on a bought field opens its page (GUI_MVP §22.2).
    // From the map: a new visit, with no way back to an earlier one's Pantry (Codex review, #90).
    scene.listenFieldTap((field) => this.fields.openField(field, gardenCell, { gardenBack: null }));
    scene.listenWorkerTap((kidId) => this.kidCard.open(kidId, dex));
    // A ready plot's tap brings its kid up instead (D-088): the plot glows until then.
    // One harvest a plot until its answer arrives: a second quick tap is not a second request
    // (§27.6; Codex review, #115).
    const harvesting = new Set<number>();
    scene.listenSteps((events) => {
      for (const e of events) {
        if (e.type === 'spawned' && e.source === 'sprout' && e.plot !== undefined) harvesting.delete(e.plot);
        else if (e.type === 'rejected' && e.command === 'harvest') harvesting.clear();
      }
    });
    scene.listenPlotTap((plot) => {
      if (this.save.readOnly) return;
      const p = scene.game.state.plots[plot];
      if (p && scene.game.plotReady(p)) {
        if (harvesting.has(plot)) return;
        harvesting.add(plot);
        scene.command({ type: 'harvest', plot });
      } else this.buildings.openPlot(plot, gardenCell);
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
    // The recipe window beside the finger while a held kid is over a partner (D-083, §25).
    const recipe = new RecipePreview(
      content,
      () => {
        const top = this.top.getBoundingClientRect();
        const nav = tray.getBoundingClientRect();
        const hud = this.hud.getBoundingClientRect();
        return {
          band: { left: top.left, right: top.right, top: top.bottom + 8, bottom: nav.top - 8 },
          hud: { left: hud.left, right: hud.right, top: hud.top, bottom: hud.bottom },
          tray: { left: nav.left, right: nav.right, top: nav.top, bottom: nav.bottom },
        };
      },
      { hud: this.hud, tray },
    );
    scene.listenRecipe((v) => recipe.render(v));
    // Nicknames under named kids on the map (D-091, §27.7), while the setting is on: over the
    // world, under every control.
    const names = new Nameplates();
    document.body.insertBefore(names.root, this.shield);
    let showNames = settings.value.showNicknames;
    settings.onChange(() => {
      showNames = settings.value.showNicknames;
      if (!showNames) names.clear();
    });
    scene.listenFrame(() => {
      if (!showNames) return;
      const n = scene.namedOnScreen();
      // Nor any drop target or recipe window on screen (Codex review round 4, #114).
      this.nameExclusions = [...n.exclusions, ...home.visibleRects(), ...recipe.visibleRects()];
      names.update(n.kids, n.band, this.nameExclusions, n.finger, performance.now());
    });
    this.nameplates = names;

    // The camera must bring any kid out from under the GUI: banners, HUD and feedback at
    // the top; the navigation at the bottom (GUI_MVP §§2, 19.1; Codex review, PR #15).
    const measure = () => {
      // The top stack starts below any banner (+ 8 px).
      const banner = this.banners.childElementCount ? this.banners.getBoundingClientRect().height + 8 : 0;
      this.top.style.marginTop = `${banner}px`;
      // The tutorial's card keeps clear of it too.
      document.documentElement.style.setProperty('--ui-banner', `${banner}px`);
      this.layout();
      // Page mode changes what scrolls an open sheet.
      this.sheets.place();
      scene.setInsets(this.top.getBoundingClientRect().bottom, window.innerHeight - tray.getBoundingClientRect().top);
      // The tutorial's spotlight is measured on the new layout.
      this.tutorial.relayout();
      // And the new-kid popup, whose layout depends on the room a banner leaves (§27.4).
      this.popup.relayout();
    };
    new ResizeObserver(measure).observe(document.body);
    new ResizeObserver(measure).observe(this.top);
    // A count growing (a long amount) can outgrow its chip without the row changing size.
    for (const c of [this.materials, this.potatokens, this.count]) new ResizeObserver(measure).observe(c);
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
    // Lessons (§27.3): each step's mechanics used are seen, and what is newly relevant joins the
    // queue. Evaluated now for a loaded save too.
    scene.listenSteps((events) => this.evaluateLessons(events));
    this.evaluateLessons([]);
    // A newborn's card waits until the kid is actually drawn (its costume may still be
    // loading), then for its discovery effect (Codex review, PR #35).
    scene.listenShown((kidId) => this.kidShown(kidId, performance.now()));
    // Offline catch-up can discover types; the summary reports them, so no card later
    // should call them new (Codex review, PR #33).
    scene.listenResume((report) => {
      // Each kind first found while away meets the player first, one popup each, in the
      // report's order (D-087, §27.5); known arrivals are only counted in the summary.
      const fresh = new Set<KidId>();
      for (const k of report.spawned) {
        if (!this.options.arrivals || this.known.has(k.type) || fresh.has(k.type)) continue;
        fresh.add(k.type);
        this.popup.add({ source: 'garden', type: k.type, look: { body: k.look.body, face: k.look.face, scale: k.look.scale }, isNew: true, potatokens: report.awards[k.id] ?? 0, kidId: k.id });
      }
      for (const t of scene.game.state.discoveredKids) this.known.add(t);
      this.offlineSummary(report, fresh.size);
    });
    // With no summary after the popups, a sheet put aside for them comes back.
    this.popup.onDrained(() => this.returnDone());
    const tick = (now: number) => {
      this.render(now);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** Kid types the feedback treats as already discovered (tests). */
  /** Test hook: the map nicknames shown now (D-091). */
  get nameplatesShown(): { id: number; text: string; rect: DOMRect }[] {
    return this.nameplates?.shown() ?? [];
  }

  /** Test hook: the lesson note up now, if any (§27.3). */
  get lessonShown(): string | null {
    return this.lessonNotes.current;
  }

  /** Test hook: the new-kid popup up now, if any (D-087). */
  get arrivalShown(): { source: string; type: string; isNew: boolean; sentence: string; body: string; layout: string; sprite: number; scale: number; savedScale: number; clipTime: number | null; waiting: number } | null {
    const s = this.popup.shown;
    return s && { ...s, waiting: this.popup.waiting };
  }

  /** Debug: queues an arrival as given (tests of how the popup draws it). */
  debugMeet(m: { source: 'garden' | 'plot' | 'fusion'; type: KidId; look: { body: string; face: string; scale?: number }; isNew: boolean; potatokens: number }): void {
    this.popup.add(m);
  }

  /** Debug: treat `type` as found already (tests of the new-recipe card). */
  debugKnow(type: KidId): void {
    this.known.add(type);
  }

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

  /**
   * A navigation control (D-077, §23.1): a 28 px icon, named by its label (shown only in the
   * scroll-window and page layouts) and, on hover, focus or a hold, by a name above the tray.
   */
  private trayCell(key: 'garden' | 'dex' | 'notebook', label: string, glyph: string, open: (b: HTMLButtonElement) => void): HTMLButtonElement {
    const b = el('button', 'tray-cell', icon(glyph, '', 'ui-icon'), el('span', 'tray-label', label));
    b.type = 'button';
    b.dataset.nav = key;
    b.setAttribute('aria-label', label);
    this.trayCells.set(key, b);
    b.addEventListener('click', () => open(b));
    nameOnHold(b, label, this.tip, (r) => {
      // 8 px above the tray, centred on the control, inside the screen.
      const w = this.tip.offsetWidth;
      this.tip.style.left = `${Math.max(8, Math.min(window.innerWidth - 8 - w, (r.left + r.right) / 2 - w / 2))}px`;
      this.tip.style.top = `${b.closest('.tray')!.getBoundingClientRect().top - 8 - this.tip.offsetHeight}px`;
    });
    return b;
  }

  /** A stat chip (§23.1): a button that opens its name bubble, changing nothing else. */
  private stat(key: 'materials' | 'potatokens' | 'kids', className: string, glyph: string, count: HTMLElement): HTMLButtonElement {
    const b = el('button', `hud-stat ui-surface ${className}`, icon(glyph, '', 'ui-icon-24'), count);
    b.type = 'button';
    b.setAttribute('aria-expanded', 'false');
    b.addEventListener('click', () => this.bubble.toggle(key, b, this.statContent(key)));
    this.stats.set(key, b);
    return b;
  }

  /** The stat whose help sheet is open (or was, before the offline summary interrupted it). */
  private helpKey: 'materials' | 'potatokens' | 'kids' = 'materials';

  /**
   * A stat's name as an ordinary help sheet, when its bubble can't fit (§23.2). Its value and
   * lines stay current, quietly, as the game runs (Codex review, #105).
   */
  private statHelp(key: string, trigger: HTMLElement | null, content: BubbleContent, scrollTop = 0): void {
    const stat = key as 'materials' | 'potatokens' | 'kids';
    this.helpKey = stat;
    const glyph = stat === 'materials' ? 'icon_materials' : stat === 'potatokens' ? 'icon_potatokens' : 'icon_kids';
    const lines = el('div', 'stat-help-lines');
    let shown = '';
    const render = () => {
      const now = this.statContent(stat);
      sheet.setSubtitle(now.value);
      const text = now.lines.join('|');
      if (text === shown) return;
      shown = text;
      lines.replaceChildren(...now.lines.map((l) => el('p', 'sheet-body-text', l)));
    };
    const sheet = this.sheets.open({ key: 'stathelp', icon: glyph, title: content.title, requestedHeight: 480, update: () => render() }, trigger);
    sheet.body.append(lines);
    render();
    sheet.scrollTo(scrollTop);
  }

  /** A stat's bubble (§23.2): Codex's exact title, value and explanation. */
  private statContent(key: 'materials' | 'potatokens' | 'kids'): BubbleContent {
    const g = this.scene.game;
    const s = g.state;
    if (key === 'materials') return { title: 'Materials', value: `${formatExact(s.materials)} Materials`, lines: ['Kids on the map earn these. Spend them on buildings, plots, fields, names or Compendium returns.'] };
    if (key === 'potatokens') return { title: 'Potatokens', value: `${formatExact(s.potatokens)} Potatokens`, lines: ['Spend these on instant Garden spawns or Compendium returns. Each action shows its cost before you spend.'] };
    const onMap = s.world.kids.length;
    return {
      title: 'Kids on map',
      value: `${onMap} / ${g.capacity} on the map`,
      lines: ['Plot kids and farming kids are counted in their own pages. Capacity upgrades add map space.', ...(onMap >= g.capacity ? ['The map is full. Make room for another kid.'] : [])],
    };
  }

  /**
   * After a step, a load, or a while (§27.3): mechanics used are seen, the first fusion
   * discovery opens the gate, and lessons now relevant join the queue. Materials grow with no
   * event, so the frame loop evaluates too, a few times a second.
   */
  private evaluateLessons(events: GameEvent[]): void {
    const l = this.scene.game.state.lessons;
    if (!l) return;
    noteEvents(l, events);
    enqueue(l, relevantNow(this.scene.game, this.content.balance));
    this.lessonsAt = performance.now();
  }
  private lessonsAt = 0;

  /**
   * `Tutorial & lessons` (§27.3), from Settings or the Icon guide: a page of that sheet, with
   * its way back.
   */
  private openLessons(): void {
    const from = this.sheets.openKey === 'iconguide' ? 'iconguide' : 'settings';
    const open = this.sheets.snapshot();
    const scrollTop = open?.scrollTop ?? 0;
    // The Replay button goes with its sheet: closing comes back to what opened that sheet (the
    // Notebook control), still on the page (Codex review, #120).
    const launcher = (open?.launcher?.isConnected ? open.launcher : null) ?? this.trayCells.get('notebook') ?? null;
    this.lessonsBack = {
      label: from === 'iconguide' ? 'Back to Icon guide' : 'Back to Settings',
      run: () => this.notebook.openRow(from, launcher, undefined, { scrollTop }),
    };
    this.lessonsSheet.open(launcher, this.lessonsBack);
  }
  /** `Tutorial & lessons`' way back, kept for when a return summary brings the sheet back. */
  private lessonsBack: { label: string; run: () => void } | null = null;

  /**
   * Android Back: the new-kid popup first, then the introduction, a lesson note holding focus,
   * a name bubble, else an open sheet (returns whether it did).
   */
  back(): boolean {
    if (this.popup.back()) return true;
    if (this.tutorial.back()) return true;
    if (this.lessonNotes.back()) return true;
    if (this.bubble.openKey !== null) {
      this.bubble.hide(true);
      return true;
    }
    return this.sheets.back();
  }

  /**
   * A return (GUI_MVP §8, §27.5): its summary joins the saved queue, oldest first, and waits
   * for the new kinds' popups; a sheet that was open steps aside and comes back, where it was,
   * after all of them. A short absence (a quick app switch) gets no summary, though its new
   * kinds still meet the player; the rewards are credited all the same (D-049).
   */
  private offlineSummary(report: OfflineReport, newKinds = 0): void {
    if (this.save.readOnly) return;
    const recap = report.seconds >= this.content.balance.economy.offlineSummaryMinSeconds;
    if (recap) {
      this.scene.game.state.presentation.recaps.push({
        seconds: report.seconds,
        materials: report.materials,
        potatokens: report.potatokens,
        arrived: report.spawned.length,
        newKinds,
        plotsWaiting: report.plotsWaiting,
        food: { ...report.food },
      });
    }
    if (!recap && newKinds === 0) return;
    // The return comes first: an open tutorial steps aside until it is over (§24.1).
    this.tutorial.stepAside();
    if (this.asideForReturn || this.summaryOpen) return;
    const open = this.sheets.snapshot();
    this.interrupted = open && { ...open, search: this.buildings.searchText, plots: this.buildings.plotsSnapshot, card: this.kidCard.snapshot(), farm: this.fields.snapshot(), gardenBack: this.buildings.fieldsBack };
    // Gone at once: it comes back after the return, and must not still be fading out then.
    if (this.sheets.isOpen) this.sheets.close(false, true);
    this.asideForReturn = true;
  }

  /** The oldest summary waiting; dismissed, it leaves the queue. */
  private openSummary(recap: Recap): void {
    this.summaryOpen = true;
    openOfflineSummary(
      this.sheets,
      recap,
      this.content.balance.feeding.foods,
      (replaced) => {
        const queue = this.scene.game.state.presentation.recaps;
        if (queue[0] === recap) queue.shift();
        this.persist();
        this.summaryOpen = false;
        // Replaced by a sheet it handed back (a kid card, the Garden): that sheet is in front.
        if (replaced) this.asideForReturn = false;
        else this.returnDone();
      },
      recap.newKinds,
    );
  }

  /** Every popup and summary of a return seen: the sheet it put aside comes back. */
  private returnDone(): void {
    if (!this.asideForReturn || this.popup.waiting > 0 || this.summaryOpen || this.scene.game.state.presentation.recaps.length > 0) return;
    this.asideForReturn = false;
    this.restoreInterrupted();
  }

  /** Brings back the sheet the return put aside, where it was. */
  private restoreInterrupted(): void {
    {
      const back = this.interrupted;
      this.interrupted = null;
      if (!back) return;
      // A farming page comes back as it was, with its way back (Codex review, #90).
      if (back.farm) back.farm(back.scrollTop);
      else if (back.key === 'dex') this.dex.open(back.launcher);
      else if (back.key === 'kid' && back.card) this.kidCard.restore(back.card, back.launcher, back.scrollTop);
      else if (back.key === 'notebook') this.notebook.open(back.launcher, undefined, back.scrollTop);
      else if (KidsOnMap.isList(back.key)) this.kidsOnMap.reopen(back.scrollTop);
      // A field's pages come back as the Garden's Fields (D-069).
      else if (back.key === 'field' || back.key === 'field-food' || back.key === 'field-pick') this.buildings.openFields(back.launcher);
      // Every Notebook tool comes back as a page of it, with its way back (Codex review, PR #87).
      else if (Notebook.isTool(back.key)) this.notebook.openRow(back.key, back.launcher, undefined, { scrollTop: back.scrollTop, search: back.search, plots: back.plots });
      // A stat's help sheet comes back on the same stat (Codex review, #105).
      else if (back.key === 'lessons') this.lessonsSheet.open(back.launcher, this.lessonsBack);
      else if (back.key === 'stathelp') this.statHelp(this.helpKey, back.launcher, this.statContent(this.helpKey), back.scrollTop);
      // With the way back its Fields were opened with, if any (the Pantry, feeding).
      else if (back.key === 'garden') this.buildings.reopenGarden(back.launcher, { scrollTop: back.scrollTop, search: back.search, plots: back.plots }, back.gardenBack);
    }
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
    // Too narrow for the 156 px tray or for three 44 px chips: the labelled scroll windows,
    // whatever the height (§23.1; Codex review, #105).
    const safe = this.top.getBoundingClientRect().width;
    // A count wider than its chip, even with the glyph stacked above it, doesn't fit either
    // (enlarged text, a long amount; Codex review, #105).
    const overflows = [...this.stats.values()].some((c) => c.scrollWidth > c.clientWidth + 1);
    const narrow = safe < 156 || (safe - 16) / 3 < 44 || overflows;
    if (!narrow && band() >= PLAY_BAND) return;
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
    this.stats.get('materials')!.setAttribute('aria-label', `Materials: ${formatExact(s.materials)}. About Materials`);
    this.potatokens.textContent = formatCount(s.potatokens);
    this.stats.get('potatokens')!.setAttribute('aria-label', `Potatokens: ${formatExact(s.potatokens)}. About Potatokens`);
    const onMap = s.world.kids.length;
    this.count.textContent = `${onMap}/${g.capacity}`;
    // The kids glyph stays at full capacity: the bubble says the map is full (§23.1).
    this.stats.get('kids')!.setAttribute('aria-label', `Kids on map: ${onMap} of ${g.capacity}. About map space`);
    const open = this.bubble.openKey as 'materials' | 'potatokens' | 'kids' | null;
    // A sheet opening closes the bubble (§23.2); an open one keeps its amounts current.
    if (open !== null && this.sheets.openKey !== null) this.bubble.hide(false);
    else if (open !== null) this.bubble.update(open, this.statContent(open));

    this.feedback.style.visibility = this.bubble.openKey !== null ? 'hidden' : '';
    // The new-kid popup first (§27.3): once nothing else holds the screen (no sheet, gesture,
    // name bubble, tutorial card or unanswered recovery warning) and its kid is drawn.
    // An unanswered recovery notice comes first, but only while it is on screen: the unsaved
    // warning hides it, and the player can't answer what they can't see (Codex review round 5, #117).
    const urgent = this.save.recovery && !this.recoveryDismissed && !this.save.unsaved;
    // An arrival found while the tutorial is up comes first: it steps aside, keeping its step,
    // and comes back after (§27.3). One previewed over a sheet waits with the sheet.
    if (this.popup.waiting > 0 && this.tutorial.isOpen && !this.sheets.isOpen) this.tutorial.stepAside();
    this.popup.tick(
      now,
      !this.sheets.isOpen && !this.summaryOpen && !this.scene.busy && this.bubble.openKey === null && !this.tutorial.isOpen && !this.save.readOnly && !urgent,
      (m) => m.kidId === undefined || this.scene.viewState(m.kidId) !== 'pending',
    );
    // Then the return summaries waiting, oldest first, each once its popups are seen (§27.5).
    const recaps = this.scene.game.state.presentation.recaps;
    if (recaps.length && !this.summaryOpen && this.popup.waiting === 0 && !this.sheets.isOpen && !this.scene.busy && !this.save.readOnly && !urgent) this.openSummary(recaps[0]!);
    this.tickFeedback(now, dt);
    // The first-run offer, and a tutorial put aside, wait for every popup and return summary,
    // an unanswered recovery banner, a sheet or a name bubble to be out of the way; a read-only
    // save gets none (§24.1, §27.3).
    const returning = this.summaryOpen || this.popup.waiting > 0 || recaps.length > 0;
    if (!returning && this.sheets.openKey === null && this.bubble.openKey === null && !urgent && !this.scene.busy) this.tutorial.maybeOffer(this.options.tutorialAuto && !this.save.readOnly);
    // One put aside for the return comes back once it is over (over any sheet it brought back).
    if (this.tutorial.waiting && !returning) this.tutorial.comeBack();
    // Last, a lesson (§27.3): only with the introduction behind the player and nothing ahead of
    // it (a sheet, gesture, bubble, popup, summary, award card, the introduction, an urgent
    // banner); a read-only save shows none.
    const quiet = !returning && !this.sheets.isOpen && !this.scene.busy && this.bubble.openKey === null && !this.tutorial.isOpen && !this.tutorial.waiting && !urgent && !this.save.readOnly && !this.showing && this.queue.length === 0;
    if (now - this.lessonsAt >= 250 && !this.save.readOnly) this.evaluateLessons([]);
    this.lessonNotes.tick(now, this.options.lessons && this.tutorial.settled && quiet);
    this.sheets.tick();
    const sheet = this.sheets.openKey;
    const selected = sheet === null ? null : NOTEBOOK_KEYS.has(sheet) ? 'notebook' : sheet === 'dex' || sheet === 'kid' ? 'dex' : sheet === 'garden' ? 'garden' : null;
    for (const [key, cell] of this.trayCells) cell.classList.toggle('is-selected', selected === key);
  }

  // --- feedback ---------------------------------------------------------------------

  private onStep(events: GameEvent[]): void {
    // A sheet shows its own command's refusal inline; the world never repeats it (GUI_MVP §9).
    const inSheet = new Set([...this.buildings.onStep(events), ...this.kidCard.onStep(events), ...this.arrivals.onStep(events), ...this.fields.onStep(events)]);
    const items = feedbackFor(
      events.filter((e) => !inSheet.has(e)),
      this.known,
      this.scene.game.state.discoveredKids.length,
    );
    const now = performance.now();
    for (const item of items) {
      // A new kind, or a kid a plot brought up: the big popup (D-087, D-088).
      if (item.kind === 'meet') {
        if (!this.options.arrivals) continue;
        this.popup.add({ source: item.source, type: item.type, look: item.look, isNew: item.isNew, potatokens: item.potatokens, kidId: item.kidId });
        continue;
      }
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
    if (item.kind !== 'discovery') return now;
    const state = item.kidId === undefined ? 'shown' : this.scene.viewState(item.kidId);
    return state === 'pending' ? Infinity : now + this.scene.discoveryToastDelayMs;
  }

  private kidShown(kidId: number, now: number): void {
    for (const c of this.queue) {
      if (c.item.kind === 'discovery' && c.item.kidId === kidId) c.notBefore = this.readyAt(c.item, now);
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
    // Likewise while a name bubble or the tutorial is open: feedback waits, out of sight
    // (GUI_MVP §§23.2, 24.1).
    if (this.bubble.openKey !== null || this.tutorial.isOpen) return;
    // And while the new-kid popup holds the screen (§27.3: it comes first).
    if (this.popup.isOpen || this.popup.waiting > 0) return;
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
    const def = this.content.kids.find((k) => k.id === type) ?? { tier: 1 };
    const mark = el('span', 'tier', ...tierBadge(def, 'ui-icon-20'), tierShort(def));
    mark.setAttribute('aria-label', tierName(def));
    return mark;
  }

  private coinLine(text: string): HTMLElement {
    return el('span', 'card-line', icon('icon_potatokens', '', 'ui-icon-18'), text);
  }

  /** One feedback card, per GUI_MVP §9. */
  private card(item: Exclude<FeedbackItem, { kind: 'meet' }>, text?: string): HTMLElement {
    switch (item.kind) {
      case 'discovery': {
        // A new recipe for a kind already found (a new kind is a popup, D-087).
        const heading = 'New recipe found';
        const lines: Node[] = [el('span', 'card-heading', heading), el('span', 'card-name', this.name(item.childType)), this.tier(item.childType)];
        if (item.potatokens > 0) lines.push(this.coinLine(`+${formatExact(item.potatokens)} Potatokens`));
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
      case 'farming': {
        // Sent by drag: no sheet said it (GUI_MVP §22.4).
        const food = this.scene.game.state.fields[item.field]?.food;
        const foodName = food ? (this.content.balance.feeding.foods.find((x) => x.id === food)?.name ?? food) : '';
        return el(
          'div',
          'toast toast-short',
          icon('icon_fields', '', 'ui-icon-28'),
          el(
            'div',
            'card-text',
            el('span', 'card-heading', `${item.name ?? this.name(item.kidType)} is farming ${foodName} in Field ${item.field + 1}.`),
            el('span', 'card-line', 'No Materials while farming. Take back from this field.'),
          ),
        );
      }
      case 'fieldUnlocked':
        return el('div', 'toast toast-short', icon('icon_fields', '', 'ui-icon-28'), el('span', 'card-heading', `Field ${item.field + 1} unlocked. Choose a food to grow.`));
      case 'fieldFood': {
        const foodName = this.content.balance.feeding.foods.find((x) => x.id === item.food)?.name ?? item.food;
        return el('div', 'toast toast-short', icon('icon_fields', '', 'ui-icon-28'), el('span', 'card-heading', `Field ${item.field + 1} now grows ${foodName}.`));
      }
      case 'unfarmed':
        return el(
          'div',
          'toast toast-short',
          icon('icon_fields', '', 'ui-icon-28'),
          el('span', 'card-heading', item.count === 1 ? `${item.name ?? this.name(item.kidType)} is back by the Garden.` : `${item.count} kids are back by the Garden.`),
        );
      case 'named':
        return el(
          'div',
          'toast toast-short',
          icon('icon_check', '', 'ui-icon-28'),
          el('span', 'card-heading', item.name ? `Named ${item.name}.` : `Called ${this.name(item.kidType)} again.`),
        );
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
