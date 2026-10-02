import { Texture, TextureSource } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { kidRig } from '../content/artData';
import { TextureStore, type TextureLoader } from './art';

const rig = kidRig!;
const tex = () => new Texture({ source: new TextureSource({ width: 8, height: 8 }) });

/** A loader whose loads and unloads complete only when the test says so. */
function manualLoader() {
  const log: string[] = [];
  const unloads: (() => void)[] = [];
  let failNext = 0;
  const loader: TextureLoader = {
    load: async (url) => {
      log.push(`load ${url}`);
      if (failNext > 0) {
        failNext--;
        throw new Error('fetch failed');
      }
      return tex();
    },
    unload: (url) =>
      new Promise<void>((resolve) => {
        log.push(`unload-start ${url}`);
        unloads.push(() => {
          log.push(`unload-done ${url}`);
          resolve();
        });
      }),
  };
  return { loader, log, unloads, fail: (n: number) => (failNext = n) };
}

describe('TextureStore (ROSTER-SCALE; Codex review, PR #35)', () => {
  it('a reload waits for the release still unloading the same asset', async () => {
    const m = manualLoader();
    const store = new TextureStore(rig, m.loader, (n) => n);
    await store.ensure('hero');
    store.release('hero');
    const again = store.ensure('hero');
    await Promise.resolve();
    const asset = rig.costumes.hero!.components[0]!.asset;
    // No reload has started while the unload is pending.
    expect(m.log.filter((l) => l === `load ${asset}`)).toHaveLength(1);
    for (const done of m.unloads) done();
    await again;
    const i = m.log.lastIndexOf(`load ${asset}`);
    expect(i).toBeGreaterThan(m.log.indexOf(`unload-done ${asset}`));
    expect(store.ready('hero')).toBe(true);
  });

  it('a failed load is forgotten, so the next attempt retries', async () => {
    const m = manualLoader();
    const store = new TextureStore(rig, m.loader, (n) => n);
    m.fail(1);
    await expect(store.ensure('hero')).rejects.toThrow('fetch failed');
    await Promise.resolve();
    await store.ensure('hero');
    expect(store.ready('hero')).toBe(true);
  });
});
