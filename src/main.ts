import { Application } from 'pixi.js';
import { content } from './content';
import type { Content } from './content/types';
import { loadArt } from './render/art';
import { MapScene } from './render/scene';
import { Hud } from './ui/hud';

declare global {
  interface Window {
    __PK__?: {
      ready: boolean;
      fps: () => number;
      kids: () => { id: number; type: string; x: number; y: number; radius: number }[];
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
  const scene = new MapScene(app, gameContent, Number.isFinite(seed) ? seed : 1, await loadArt());
  new Hud(scene, content);

  window.__PK__ = {
    ready: true,
    fps: () => app.ticker.FPS,
    kids: () => scene.game.state.world.kids.map((k) => ({ id: k.id, type: k.type, x: k.x, y: k.y, radius: k.radius })),
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

void boot();
