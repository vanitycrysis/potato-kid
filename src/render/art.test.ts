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

describe('TextureStore releases (Codex review, PR #35 round 2)', () => {
  /** A loader whose loads complete only when released by the test. */
  function gatedLoader(failing: Set<string> = new Set()) {
    const gates: { url: string; open: () => void }[] = [];
    const unloaded: string[] = [];
    const loader: TextureLoader = {
      load: (url) =>
        new Promise<Texture>((resolve, reject) => {
          gates.push({ url, open: () => (failing.has(url) ? reject(new Error('fetch failed')) : resolve(tex())) });
        }),
      unload: async (url) => {
        unloaded.push(url);
      },
    };
    return { loader, gates, unloaded };
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('a load that lands after its type was released never repopulates the map', async () => {
    const g = gatedLoader();
    const store = new TextureStore(rig, g.loader, (n) => n);
    const pending = store.ensure('hero');
    await flush();
    store.release('hero');
    for (const gate of g.gates) gate.open();
    await pending;
    await flush();
    expect(store.ready('hero')).toBe(false);
    for (const c of rig.costumes.hero!.components) expect(store.map.has(c.asset)).toBe(false);
    expect(g.unloaded).toEqual(expect.arrayContaining(rig.costumes.hero!.components.map((c) => c.asset)));
  });

  it('a partly failed load still owns what it loaded, so release frees it', async () => {
    const parts = rig.costumes.hero!.components.map((c) => c.asset);
    expect(parts.length).toBeGreaterThan(1);
    const g = gatedLoader(new Set([parts[1]!]));
    const store = new TextureStore(rig, g.loader, (n) => n);
    const pending = store.ensure('hero');
    await flush();
    for (const gate of g.gates) gate.open();
    await expect(pending).rejects.toThrow('fetch failed');
    await flush();
    expect(store.map.has(parts[0]!)).toBe(true);
    expect(store.loadedTypes).toContain('hero');
    store.release('hero');
    expect(store.map.has(parts[0]!)).toBe(false);
    await flush(); // unloads run through the asset's work queue
    expect(g.unloaded).toContain(parts[0]);
  });
});

describe('TextureStore with Pixi-style deduplication (Codex review, PR #35 round 3)', () => {
  it('a reload never shares a source with a released, still-loading generation', async () => {
    // Like Pixi Assets: one load per URL is shared until unloaded; unload destroys it.
    const cache = new Map<string, Promise<Texture>>();
    const gates: (() => void)[] = [];
    const loader: TextureLoader = {
      load: (url) => {
        let p = cache.get(url);
        if (!p) {
          p = new Promise<Texture>((resolve) => gates.push(() => resolve(tex())));
          cache.set(url, p);
        }
        return p;
      },
      unload: async (url) => {
        const p = cache.get(url);
        cache.delete(url);
        if (p) (await p).destroy(true);
      },
    };
    const flush = () => new Promise((r) => setTimeout(r, 0));
    const store = new TextureStore(rig, loader, (n) => n);
    const first = store.ensure('hero');
    await flush();
    store.release('hero'); // last kid consumed while the costume still loads
    const second = store.ensure('hero'); // a respawn asks again before the first load lands
    await flush();
    while (gates.length) {
      gates.shift()!();
      await flush();
    }
    await first.catch(() => {});
    await second;
    await flush();
    expect(store.ready('hero')).toBe(true);
    for (const c of rig.costumes.hero!.components) expect(store.map.get(c.asset)!.source.destroyed).toBe(false);
  });
});
