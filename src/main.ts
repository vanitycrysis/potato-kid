import { Application } from 'pixi.js';
import { content } from './content';
import { gate4Data, kidRig, mapData, uiData } from './content/artData';
import { ambientFrom, lookTable, obstaclesFrom, rigCoverage, uiPaletteCoverage } from './content/artRules';
import type { Content } from './content/types';
import { handleBack } from './platform/back';
import { Lifecycle } from './platform/lifecycle';
import { exportedNames, TextureStore } from './render/art';
import { MapScene, type SceneArt } from './render/scene';
import { SaveManager, type SaveMode } from './save/manager';
import { SettingsStore, type Settings } from './save/settings';
import { PreferencesStorage } from './save/storage';
import type { GameEvent, OfflineReport } from './sim/game';
import { AudioPlayer } from './audio/player';
import { Hud, type SaveStatus } from './ui/hud';

/** How often a running game saves (plan §4). */
const SAVE_EVERY_MS = 10_000;

declare global {
  interface Window {
    __PK__?: {
      ready: boolean;
      fps: () => number;
      kids: () => {
        id: number;
        type: string;
        x: number;
        y: number;
        box: { left: number; top: number; right: number; bottom: number };
        look: { body: string; face: string; scale: number };
        activity: string;
        held: boolean;
      }[];
      discoveredRecipes: () => string[];
      wallet: () => { materials: number; potatokens: number };
      /** Building levels and the bias target. */
      buildings: () => { levels: Record<string, number>; biasTarget: string | null };
      save: () => { mode: SaveMode; failing: boolean; olderSaveLoaded: boolean };
      /** The last offline catch-up, if any. */
      lastOffline: () => OfflineReport | null;
      screenPointOf: (kidId: number) => { x: number; y: number } | undefined;
      /** The clip a kid is showing and its running effects. */
      presentationOf: (kidId: number) => { clip: string; effects: string[] } | undefined;
      centerOn: (x: number, y: number) => void;
      /** The player's zoom on top of the fitted zoom (D-071). */
      zoom: () => number;
      worldToScreen: (x: number, y: number) => { x: number; y: number };
      /** Only with `?debug=1`. */
      debugAdd?: (type: string, x: number, y: number, look?: { body?: string; face?: string; scale?: number }) => number;
      /** Only with `?debug=1`: suspend, then resume as if `awayMs` passed; resolves after the save. */
      debugAway?: (awayMs: number) => Promise<void>;
      /** Only with `?debug=1`: sends a UI command straight to the sim (refusal tests). */
      debugCommand?: (cmd: { type: 'upgrade'; building: 'garden' | 'capacity' | 'bias' | 'compendium' } | { type: 'plant'; kidIds: number[]; plot?: number } | { type: 'startGrowing'; plot: number } | { type: 'unplant'; plot: number; kidId: number } | { type: 'emptyPlot'; plot: number } | { type: 'unlockPlot' } | { type: 'feed'; kidId: number; food: string } | { type: 'name'; kidId: number; name: string | null }) => void;
      /** Only with `?debug=1`: readies a plot to sprout this kid at the next step (rare tests). */
      debugReadySeed?: (plot: number, type: string) => void;
      /**
       * Only with `?debug=1`: calls `fn` with each sim step's event types, after the HUD has
       * answered them and before the next frame draws anything (timing tests).
       */
      debugListenSteps?: (fn: (types: string[]) => void) => void;
      /** Only with `?debug=1`: adds currency (sheet tests and screenshots). */
      debugGive?: (amounts: { materials?: number; potatokens?: number }) => void;
      /** The audio runtime's state (tests). */
      audio: () => {
        unlocked: boolean;
        musicPlaying: boolean;
        music: { loop: boolean; seconds: number; sampleRate: number; at: number } | null;
        lastCue: string | null;
        played: string[];
        active: number;
      };
      /** Only with `?debug=1`: the system suspends audio while the game is in front. */
      debugAudioInterrupt?: () => void;
      /** Send home (D-048): the Garden target's state, and kids still waving goodbye. */
      home: () => { state: string };
      /** Forgiving drop (D-051): the kid under the finger while one is held, else null. */
      dropTarget: () => number | null;
      /** Planting (D-061): each plot's state, kids in it, growth and what the map shows. */
      plots: () => { state: 'empty' | 'filling' | 'growing' | 'ready'; kids: number; progress: number; waiting: string | null; shown: string[] }[];
      /** Rare sleeves and happy suns drawn now (GUI_MVP §16.2, §17.2). */
      rares: () => { id: number; sleeve: boolean; sleeveAlpha: number; sleeveScale: number; happy: boolean }[];
      /** The stored player settings (GUI_MVP §11). */
      settings: () => Settings;
      /** Only with `?debug=1`: costume types currently loaded (ROSTER-SCALE). */
      debugLoadedCostumes?: () => string[];
      /** Only with `?debug=1`: the kid types the feedback cards treat as already known. */
      debugKnown?: () => string[];
      /** Only with `?debug=1`: shows a save banner state until replaced (screenshots and tests). */
      debugSaveStatus?: (status: { unsaved: boolean; recovery: boolean; readOnly: boolean }) => void;
    };
  }
}

// Before any asynchronous boot work: Back must work while loading and on a boot error.
const back = handleBack();

async function boot(): Promise<void> {
  // D-036: the engine never draws art of its own. If ChatGPT/Codex's art doesn't cover
  // the roster, stop with a clear message instead of inventing placeholders.
  if (!kidRig || !mapData) throw new Error('Art data missing: run `npm run art:export` (kid_rig_v2.json, map_garden_v3.json).');
  const coverage = [...rigCoverage(kidRig, content.kids, exportedNames), ...uiPaletteCoverage(uiData)];
  if (coverage.length) throw new Error(`Art coverage incomplete:\n${coverage.join('\n')}`);

  const app = new Application();
  await app.init({
    resizeTo: window,
    background: uiData!.palette!.world!,
    antialias: false,
    resolution: Math.min(window.devicePixelRatio, 2),
    autoDensity: true,
  });
  document.getElementById('app')!.appendChild(app.canvas);

  const params = new URLSearchParams(location.search);
  const seed = Number(params.get('seed') ?? Date.now() % 2 ** 32);
  // Test-only `?debug=1&rare=a,b`: these types count as rare kids (D-072), everywhere, so the
  // rare sleeve and marks can be tested before the rare kids' art and content exist.
  if (params.get('debug') === '1') for (const id of params.get('rare')?.split(',') ?? []) {
    const k = content.kids.find((x) => x.id === id);
    if (k) k.rare = true;
  }
  // Test-only `?calm=1`: no starting kids and no wandering, so e2e drags are deterministic
  // even on CI's slow software renderer.
  const gameContent = params.get('calm') === '1' ? calmed(content) : content;

  // Load before building the world (plan §4): nothing is written until this resolves.
  const storage = new PreferencesStorage();
  const saves = new SaveManager(storage, content);
  // Settings live beside the save, not in it; defaults are Codex's (GUI_MVP §11).
  const tokenDefaults = (uiData?.mvp as { settings?: { defaults?: Omit<Settings, 'plantV2Explained'> } } | undefined)?.settings?.defaults;
  const defaults: Settings = { ...(tokenDefaults ?? { audio: true, music: 70, sfx: 80 }), plantV2Explained: false };
  const settings = new SettingsStore(storage, defaults);
  const [loaded] = await Promise.all([saves.load(), settings.load()]);
  // A newer app's save: nothing is written, settings included (GUI_MVP §10).
  settings.persist = saves.mode !== 'readOnly';
  // Shared art, plus the costumes the map will show first: the Garden's spawn pool and
  // every type in the save (ROSTER-SCALE). Others load when a kid of that type appears.
  const textures = new TextureStore(kidRig);
  const firstTypes = new Set([...Object.keys(gameContent.balance.spawnWeights), ...(loaded.state?.world.kids.map((k) => k.type) ?? [])]);
  await Promise.all([textures.loadShared(), ...[...firstTypes].map((t) => textures.ensure(t))]);
  const scene = new MapScene(
    app,
    gameContent,
    Number.isFinite(seed) ? seed : 1,
    {
      rig: kidRig,
      map: mapData,
      textures,
      looks: lookTable(kidRig),
      ambient: ambientFrom(kidRig, gameContent.balance.wander.ambientChance),
      obstacles: obstaclesFrom(mapData),
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      home: homeArt(),
      planting: gate4Data?.planting,
    },
    loaded.state ?? undefined,
  );
  const hud = new Hud(scene, content, settings);
  // Codex's cues and music (ART_AUDIO_PLAN): one cue per sim step, volumes from Settings.
  // Not in read-only mode: the game is frozen there and has no lifecycle to pause it
  // (Codex review, PR #53).
  let audio: AudioPlayer | null = null;
  back.closeSheet = () => hud.back();
  // A debug override stays until replaced, so later saves don't clear it under a test.
  let forcedStatus: SaveStatus | null = null;
  const saveStatus = () =>
    hud.setSaveStatus(
      forcedStatus ?? { unsaved: saves.mode === 'unsaved' || saves.failing, recovery: loaded.olderSaveLoaded, readOnly: saves.mode === 'readOnly' },
    );
  saveStatus();

  // Reconcile the time since the save once, then save once (plan §4 steps 6-7). The HUD
  // shows the return summary for each report (GUI_MVP §8).
  let lastOffline: OfflineReport | null = null;
  const save = () => saves.save(scene.game.persisted()).then(saveStatus);
  if (saves.mode === 'readOnly') {
    // A newer app's save (GUI_MVP §10): freeze play and accounting; nothing is written or
    // credited until a version that can read it loads it.
    scene.suspend();
    window.__PK__ = { ...hooks(), lastOffline: () => null };
    return;
  }
  audio = new AudioPlayer(settings);
  const player = audio;
  scene.listenSteps((events) => player.onStep(events));
  scene.listenGesture((kind) => player.gesture(kind));
  if (loaded.state) lastOffline = scene.resume(Date.now());
  void save();
  const lifecycle = new Lifecycle({
    suspend: () => {
      scene.suspend();
      player.suspend();
      void save();
    },
    resume: (now) => {
      lastOffline = scene.resume(now);
      player.resume();
      void save();
    },
  });
  lifecycle.attach();
  window.setInterval(() => {
    if (lifecycle.state === 'active') void save();
  }, SAVE_EVERY_MS);
  // Also after every fusion, purchase and upgrade (plan §4).
  const saveAfter = (e: GameEvent) =>
    e.type === 'fused' || e.type === 'planted' || e.type === 'growing' || e.type === 'unplanted' || e.type === 'plotUnlocked' || e.type === 'upgraded' || e.type === 'biasSet' || e.type === 'fed' || e.type === 'named' || (e.type === 'spawned' && e.source !== 'garden');
  scene.listen((e) => {
    if (saveAfter(e)) void save();
  });

  function hooks(): Omit<NonNullable<Window['__PK__']>, 'lastOffline'> {
    return {
    ready: true,
    fps: () => app.ticker.FPS,
    kids: () =>
      scene.game.state.world.kids.map((k) => ({
        id: k.id,
        type: k.type,
        x: k.x,
        y: k.y,
        box: { ...k.box },
        look: { ...k.look },
        activity: k.activity.kind,
        held: k.held,
      })),
    discoveredRecipes: () => [...scene.game.state.discoveredRecipes],
    wallet: () => ({ materials: scene.game.state.materials, potatokens: scene.game.state.potatokens }),
    buildings: () => ({ levels: { ...scene.game.state.buildings }, biasTarget: scene.game.state.biasTarget }),
    save: () => ({ mode: saves.mode, failing: saves.failing, olderSaveLoaded: loaded.olderSaveLoaded }),
    settings: () => settings.value,
    audio: () => audio?.state ?? { unlocked: false, musicPlaying: false, music: null, lastCue: null, played: [], active: 0 },
    home: () => ({ state: scene.homeState }),
    dropTarget: () => scene.dropTarget,
    rares: () => scene.raresShown,
    plots: () =>
      scene.game.state.plots.map((p, i) => {
        const seed = p.seed;
        const progress = seed?.sprout ? seed.grown / scene.game.growSeconds : 0;
        const state = !seed ? 'empty' : !seed.sprout ? 'filling' : progress >= 1 ? 'ready' : 'growing';
        return { state, kids: seed?.planted.length ?? 0, progress, waiting: scene.game.plotWaiting(i), shown: scene.plotsShown[i] ?? [] };
      }),
    screenPointOf: (id) => scene.screenPointOf(id),
    presentationOf: (id) => scene.presentationOf(id),
    worldToScreen: (x, y) => scene.worldToScreen(x, y),
    centerOn: (x, y) => scene.centerOn(x, y),
    zoom: () => scene.zoom,
    ...(params.get('debug') === '1'
      ? {
          debugAdd: (t: string, x: number, y: number, look?: { body?: string; face?: string; scale?: number }) => scene.debugAdd(t, x, y, look),
          debugAway: async (awayMs: number) => {
            scene.suspend();
            lastOffline = scene.resume(scene.game.state.accountedUntil + awayMs);
            await save();
          },
          debugSaveStatus: (status: SaveStatus) => {
            forcedStatus = status;
            hud.setSaveStatus(status);
          },
          debugKnown: () => hud.knownKids,
          debugReadySeed: (plot: number, type: string) => scene.game.debugReadySeed(plot, { type }),
          debugListenSteps: (fn: (types: string[]) => void) => scene.listenSteps((events) => fn(events.map((e) => e.type))),
          debugAudioInterrupt: () => audio?.debugInterrupt(),
          debugLoadedCostumes: () => scene.loadedCostumes,
          debugGive: (amounts: { materials?: number; potatokens?: number }) => {
            scene.game.state.materials += amounts.materials ?? 0;
            scene.game.state.potatokens += amounts.potatokens ?? 0;
          },
          debugCommand: (cmd: { type: 'upgrade'; building: 'garden' | 'capacity' | 'bias' | 'compendium' } | { type: 'plant'; kidIds: number[]; plot?: number } | { type: 'startGrowing'; plot: number } | { type: 'unplant'; plot: number; kidId: number } | { type: 'emptyPlot'; plot: number } | { type: 'unlockPlot' } | { type: 'feed'; kidId: number; food: string } | { type: 'name'; kidId: number; name: string | null }) => scene.command(cmd),
        }
      : {}),
    };
  }
  window.__PK__ = { ...hooks(), lastOffline: () => lastOffline };
}

/** Codex's Send home tokens (GUI_MVP §13), if this art delivery has them. */
function homeArt(): SceneArt['home'] {
  const sh = (uiData?.mvp as { sendHome?: SendHomeTokens } | undefined)?.sendHome;
  const ink = uiData?.palette?.ink;
  if (!sh || !ink) return undefined;
  return {
    target: sh.target,
    tether: sh.target.tether,
    ink,
  };
}

type HomeArt = NonNullable<SceneArt['home']>;

interface SendHomeTokens {
  target: HomeArt['target'] & { tether: HomeArt['tether'] };
}

function calmed(c: Content): Content {
  const copy = structuredClone(c);
  copy.balance.spawn.startingKids = 0;
  copy.balance.wander = { ...copy.balance.wander, speed: 0, idleChancePerSecond: 0 };
  return copy;
}

boot().catch((e: unknown) => {
  // Make a boot failure visible on the device, not just in a console nobody sees.
  const pre = document.createElement('pre');
  pre.className = 'boot-error';
  pre.textContent = e instanceof Error ? e.message : String(e);
  document.body.appendChild(pre);
  throw e;
});
