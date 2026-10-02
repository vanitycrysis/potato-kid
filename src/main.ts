import { Application } from 'pixi.js';
import { content } from './content';
import { kidRig, mapData, uiData } from './content/artData';
import { ambientFrom, lookTable, obstaclesFrom, rigCoverage, uiPaletteCoverage } from './content/artRules';
import type { Content } from './content/types';
import { Lifecycle } from './platform/lifecycle';
import { exportedNames, loadTextures } from './render/art';
import { MapScene } from './render/scene';
import { SaveManager, type SaveMode } from './save/manager';
import { PreferencesStorage } from './save/storage';
import type { GameEvent, OfflineReport } from './sim/game';
import { Hud } from './ui/hud';

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
      }[];
      discoveredRecipes: () => string[];
      wallet: () => { materials: number; potatokens: number };
      save: () => { mode: SaveMode; failing: boolean; olderSaveLoaded: boolean };
      /** The last offline catch-up, if any. */
      lastOffline: () => OfflineReport | null;
      screenPointOf: (kidId: number) => { x: number; y: number } | undefined;
      /** The clip a kid is showing and its running effects. */
      presentationOf: (kidId: number) => { clip: string; effects: string[] } | undefined;
      centerOn: (x: number, y: number) => void;
      worldToScreen: (x: number, y: number) => { x: number; y: number };
      /** Only with `?debug=1`. */
      debugAdd?: (type: string, x: number, y: number, look?: { body?: string; face?: string; scale?: number }) => number;
      /** Only with `?debug=1`: suspend, then resume as if `awayMs` passed; resolves after the save. */
      debugAway?: (awayMs: number) => Promise<void>;
    };
  }
}

async function boot(): Promise<void> {
  // D-036: the engine never draws art of its own. If ChatGPT/Codex's art doesn't cover
  // the roster, stop with a clear message instead of inventing placeholders.
  if (!kidRig || !mapData) throw new Error('Art data missing: run `npm run art:export` (kid_rig_v2.json, map_garden_v2.json).');
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
  // Test-only `?calm=1`: no starting kids and no wandering, so e2e drags are deterministic
  // even on CI's slow software renderer.
  const gameContent = params.get('calm') === '1' ? calmed(content) : content;

  // Load before building the world (plan §4): nothing is written until this resolves.
  const saves = new SaveManager(new PreferencesStorage(), content);
  const loaded = await saves.load();
  const scene = new MapScene(
    app,
    gameContent,
    Number.isFinite(seed) ? seed : 1,
    {
      rig: kidRig,
      map: mapData,
      textures: await loadTextures(),
      looks: lookTable(kidRig),
      ambient: ambientFrom(kidRig, gameContent.balance.wander.ambientChance),
      obstacles: obstaclesFrom(mapData),
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    },
    loaded.state ?? undefined,
  );
  new Hud(scene, content);

  // Reconcile the time since the save once, then save once (plan §4 steps 6-7). The
  // return summary and save banners are drawn by the GUI-MVP panels (pending Codex's design).
  let lastOffline: OfflineReport | null = loaded.state ? scene.resume(Date.now()) : null;
  const save = () => saves.save(scene.game.persisted());
  void save();
  const lifecycle = new Lifecycle({
    suspend: () => {
      scene.suspend();
      void save();
    },
    resume: (now) => {
      lastOffline = scene.resume(now);
      void save();
    },
  });
  lifecycle.attach();
  window.setInterval(() => {
    if (lifecycle.state === 'active') void save();
  }, SAVE_EVERY_MS);
  // Also after every fusion, purchase and upgrade (plan §4).
  const saveAfter = (e: GameEvent) =>
    e.type === 'fused' || e.type === 'upgraded' || e.type === 'biasSet' || (e.type === 'spawned' && e.source !== 'garden');
  scene.listen((e) => {
    if (saveAfter(e)) void save();
  });

  window.__PK__ = {
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
      })),
    discoveredRecipes: () => [...scene.game.state.discoveredRecipes],
    wallet: () => ({ materials: scene.game.state.materials, potatokens: scene.game.state.potatokens }),
    save: () => ({ mode: saves.mode, failing: saves.failing, olderSaveLoaded: loaded.olderSaveLoaded }),
    lastOffline: () => lastOffline,
    screenPointOf: (id) => scene.screenPointOf(id),
    presentationOf: (id) => scene.presentationOf(id),
    worldToScreen: (x, y) => scene.worldToScreen(x, y),
    centerOn: (x, y) => scene.centerOn(x, y),
    ...(params.get('debug') === '1'
      ? {
          debugAdd: (t: string, x: number, y: number, look?: { body?: string; face?: string; scale?: number }) => scene.debugAdd(t, x, y, look),
          debugAway: async (awayMs: number) => {
            scene.suspend();
            lastOffline = scene.resume(scene.game.state.accountedUntil + awayMs);
            await save();
          },
        }
      : {}),
  };
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
