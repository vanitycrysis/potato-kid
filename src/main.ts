import { Application } from 'pixi.js';
import { content } from './content';
import { MapScene } from './render/scene';

declare global {
  interface Window {
    __PK__?: { ready: boolean; kids: number; fps: () => number };
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

  // Until spawning exists (BUILD-PLAYABLE), `?kids=N` seeds the map for testing.
  const params = new URLSearchParams(location.search);
  const kids = Number(params.get('kids') ?? 12);
  const scene = new MapScene(app, content, Number(params.get('seed') ?? Date.now() % 2 ** 32));
  scene.spawnRandom(Number.isFinite(kids) ? Math.max(0, Math.min(kids, 200)) : 12);

  window.__PK__ = { ready: true, kids: scene.world.kids.length, fps: () => app.ticker.FPS };
}

void boot();
