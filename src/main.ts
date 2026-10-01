import { Application } from 'pixi.js';
import { content } from './content';
import { kidRig, mapData } from './content/artData';
import { ambientFrom, lookTable, obstaclesFrom, rigCoverage } from './content/artRules';
import type { Content } from './content/types';
import { exportedNames, loadTextures } from './render/art';
import { MapScene } from './render/scene';
import { Hud } from './ui/hud';

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
      screenPointOf: (kidId: number) => { x: number; y: number } | undefined;
      centerOn: (x: number, y: number) => void;
      worldToScreen: (x: number, y: number) => { x: number; y: number };
      /** Only with `?debug=1`. */
      debugAdd?: (type: string, x: number, y: number) => number;
    };
  }
}

async function boot(): Promise<void> {
  // D-036: the engine never draws art of its own. If ChatGPT/Codex's art doesn't cover
  // the roster, stop with a clear message instead of inventing placeholders.
  if (!kidRig || !mapData) throw new Error('Art data missing: run `npm run art:export` (kid_rig_v2.json, map_garden_v2.json).');
  const coverage = rigCoverage(kidRig, content.kids, exportedNames);
  if (coverage.length) throw new Error(`Art coverage incomplete:\n${coverage.join('\n')}`);

  const app = new Application();
  await app.init({
    resizeTo: window,
    background: '#f4efe2',
    antialias: true,
    resolution: Math.min(window.devicePixelRatio, 2),
    autoDensity: true,
  });
  document.getElementById('app')!.appendChild(app.canvas);

  const params = new URLSearchParams(location.search);
  const seed = Number(params.get('seed') ?? Date.now() % 2 ** 32);
  // Test-only `?calm=1`: no starting kids and no wandering, so e2e drags are deterministic
  // even on CI's slow software renderer.
  const gameContent = params.get('calm') === '1' ? calmed(content) : content;
  const scene = new MapScene(app, gameContent, Number.isFinite(seed) ? seed : 1, {
    rig: kidRig,
    map: mapData,
    textures: await loadTextures(),
    looks: lookTable(kidRig),
    ambient: ambientFrom(kidRig, gameContent.balance.wander.ambientChance),
    obstacles: obstaclesFrom(mapData),
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  });
  new Hud(scene, content);

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
    screenPointOf: (id) => scene.screenPointOf(id),
    worldToScreen: (x, y) => scene.worldToScreen(x, y),
    centerOn: (x, y) => scene.centerOn(x, y),
    ...(params.get('debug') === '1' ? { debugAdd: (t: string, x: number, y: number) => scene.debugAdd(t, x, y) } : {}),
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
