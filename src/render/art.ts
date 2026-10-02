import { Assets, Rectangle, Texture } from 'pixi.js';
import { trimData, type KidRig } from '../content/artData';
import type { KidId } from '../content/types';

// Every exported runtime PNG (kids, buildings, FX, map tiles and decor), keyed by asset
// name. Vite resolves the URLs at build time. GUI art is native DOM SVG and isn't here.
const urls = import.meta.glob('../../assets/{sprites,maps}/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<
  string,
  string
>;

export function assetName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1, -'.png'.length);
}

const byName = new Map(Object.entries(urls).map(([path, url]) => [assetName(path), url]));

/** The URL of an exported PNG by asset name (DOM portraits reuse the same files). */
export function assetUrl(name: string): string | undefined {
  return byName.get(name);
}

/** Names of all exported runtime PNGs (for the D-036 coverage check). */
export const exportedNames = new Set(byName.keys());

/**
 * Where a cropped export sits on its authored canvas: [x, y, w, h, canvasW, canvasH]
 * (ROSTER-SCALE; written by art:export). Absent for full-size assets.
 */
export function trimOf(name: string): [number, number, number, number, number, number] | undefined {
  return trimData?.[name];
}

/** Decoded RGBA bytes of an asset as loaded (its cropped size when trimmed). */
export function textureBytes(name: string, fullSize: [number, number]): number {
  const t = trimOf(name);
  return t ? t[2] * t[3] * 4 : fullSize[0] * fullSize[1] * 4;
}

/** How textures are fetched and freed (Pixi's Assets; injectable for tests). */
export interface TextureLoader {
  load(url: string): Promise<Texture>;
  unload(url: string): Promise<void>;
}

const pixiLoader: TextureLoader = {
  load: (url) => Assets.load<Texture>(url),
  unload: (url) => Assets.unload(url),
};

/**
 * Runtime textures (ROSTER-SCALE, D-046). Shared art (bodies, faces, effects, map) stays
 * resident; a kid type's costume components load when the first kid of that type needs
 * drawing and are released when none is left, so memory follows what is on the map, not
 * the size of the roster. Cropped exports are rebuilt with Pixi's orig/trim rects, so
 * anchors and pivots still refer to the authored canvas.
 */
export class TextureStore {
  /** Loaded textures by asset name; views read this map directly. */
  readonly map = new Map<string, Texture>();
  /** Each type's costume load, in flight or done; dropped on failure so it can retry. */
  private readonly typeLoads = new Map<KidId, Promise<void>>();
  /**
   * Costume textures actually loaded, per type, tracked apart from the load promise: a
   * partly failed load still owns what it loaded, so release frees it (Codex review, PR #35).
   */
  private readonly owned = new Map<KidId, Set<string>>();
  /** Bumped by every release: a load that started before it is stale when it lands. */
  private readonly generation = new Map<KidId, number>();
  /** Unloads in flight: a reload waits for them, or Pixi would hand back a texture being destroyed. */
  private readonly unloading = new Map<string, Promise<void>>();
  private readonly costumeAssets: Map<KidId, string[]>;

  constructor(
    private readonly rig: KidRig,
    private readonly loader: TextureLoader = pixiLoader,
    private readonly urlOf: (name: string) => string | undefined = (n) => byName.get(n),
  ) {
    this.costumeAssets = new Map(Object.entries(rig.costumes).map(([type, c]) => [type, c.components.map((x) => x.asset)]));
  }

  /** Loads every non-costume asset: the shared art that is always on screen. */
  async loadShared(): Promise<void> {
    const costume = new Set([...this.costumeAssets.values()].flat());
    await Promise.all(
      [...byName.keys()]
        .filter((n) => !costume.has(n))
        .map(async (n) => {
          if (!this.map.has(n)) this.map.set(n, await this.fetch(n));
        }),
    );
  }

  /** Whether a type's costume is ready to draw. */
  ready(type: KidId): boolean {
    return (this.costumeAssets.get(type) ?? []).every((a) => this.map.has(a));
  }

  /**
   * Loads a type's costume (once, however often asked). A failed load is forgotten, so the
   * next call tries again rather than repeating the failure (Codex review, PR #35).
   */
  ensure(type: KidId): Promise<void> {
    const existing = this.typeLoads.get(type);
    if (existing) return existing;
    const gen = this.generation.get(type) ?? 0;
    const p = Promise.all((this.costumeAssets.get(type) ?? []).map((a) => this.loadCostume(type, a, gen))).then(() => {});
    this.typeLoads.set(type, p);
    p.catch(() => {
      if (this.typeLoads.get(type) === p) this.typeLoads.delete(type);
    });
    return p;
  }

  /** Frees a type's costume textures (no kid of that type is drawn any more). */
  release(type: KidId): void {
    // Any load still in flight for this type is now stale and frees itself when it lands.
    this.generation.set(type, (this.generation.get(type) ?? 0) + 1);
    this.typeLoads.delete(type);
    for (const a of this.owned.get(type) ?? []) {
      const t = this.map.get(a);
      this.map.delete(a);
      t?.destroy(false);
      this.unload(a);
    }
    this.owned.delete(type);
  }

  /** Types whose costumes are loaded, partly loaded or loading. */
  get loadedTypes(): KidId[] {
    return [...new Set([...this.typeLoads.keys(), ...[...this.owned].filter(([, set]) => set.size > 0).map(([t]) => t)])];
  }

  private async loadCostume(type: KidId, name: string, gen: number): Promise<void> {
    if (this.map.has(name)) return;
    const tex = await this.fetch(name);
    if ((this.generation.get(type) ?? 0) !== gen) {
      // Released while this was loading: never repopulate the map (Codex review, PR #35).
      tex.destroy(false);
      this.unload(name);
      return;
    }
    this.map.set(name, tex);
    let set = this.owned.get(type);
    if (!set) this.owned.set(type, (set = new Set()));
    set.add(name);
  }

  /** Fetches one asset (after any unload of it still in flight), with its trim applied. */
  private async fetch(name: string): Promise<Texture> {
    const url = this.urlOf(name);
    if (!url) throw new Error(`Missing art "${name}" (rig coverage should have caught this at boot)`);
    // A release of this asset may still be unloading: finish it first (Codex review, PR #35).
    await this.unloading.get(name);
    const base = await this.loader.load(url);
    const t = trimOf(name);
    return t
      ? new Texture({ source: base.source, frame: new Rectangle(0, 0, t[2], t[3]), orig: new Rectangle(0, 0, t[4], t[5]), trim: new Rectangle(t[0], t[1], t[2], t[3]) })
      : base;
  }

  private unload(name: string): void {
    const url = this.urlOf(name);
    if (!url) return;
    const done = this.loader.unload(url).catch(() => {});
    this.unloading.set(name, done);
    void done.then(() => {
      if (this.unloading.get(name) === done) this.unloading.delete(name);
    });
  }
}
