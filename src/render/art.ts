import { Assets, Rectangle, Texture } from 'pixi.js';
import { trimData, type KidRig, type WildData } from '../content/artData';
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
  /**
   * Per-asset work queue: every load, stale-load cleanup and unload of an asset runs after
   * the previous one has settled. Pixi deduplicates loads of one URL to one source, so a
   * reload must never overlap an older generation's cleanup (Codex review, PR #35).
   */
  private readonly chain = new Map<string, Promise<void>>();
  private readonly costumeAssets: Map<KidId, string[]>;

  constructor(
    private readonly rig: KidRig,
    private readonly loader: TextureLoader = pixiLoader,
    private readonly urlOf: (name: string) => string | undefined = (n) => byName.get(n),
    /** Wild kids (kid_wild_v1): each type's own body frames stand in for its costume, loaded alike. */
    wild?: WildData,
  ) {
    this.costumeAssets = new Map(Object.entries(rig.costumes).map(([type, c]) => [type, c.components.map((x) => x.asset)]));
    for (const [type, t] of Object.entries(wild?.types ?? {})) this.costumeAssets.set(type, Object.values(t.frames).map((f) => f.asset));
  }

  /** Loads every non-costume asset: the shared art that is always on screen. */
  async loadShared(): Promise<void> {
    // Per-type art waits for its type: costumes, wild bodies, and legacy special costumes a
    // wild body replaced (never drawn, so never loaded).
    const costume = new Set([...this.costumeAssets.values()].flat());
    for (const c of Object.values(this.rig.costumes)) for (const x of c.components) costume.add(x.asset);
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
      void this.enqueue(a, () => this.unload(a));
    }
    this.owned.delete(type);
  }

  /** Types whose costumes are loaded, partly loaded or loading. */
  get loadedTypes(): KidId[] {
    return [...new Set([...this.typeLoads.keys(), ...[...this.owned].filter(([, set]) => set.size > 0).map(([t]) => t)])];
  }

  private loadCostume(type: KidId, name: string, gen: number): Promise<void> {
    return this.enqueue(name, async () => {
      if (this.map.has(name)) return;
      const tex = await this.fetch(name);
      if ((this.generation.get(type) ?? 0) !== gen) {
        // Released while this was loading: never repopulate the map, and finish freeing
        // it before any newer load of the asset may start (Codex review, PR #35).
        tex.destroy(false);
        await this.unload(name);
        return;
      }
      this.map.set(name, tex);
      let set = this.owned.get(type);
      if (!set) this.owned.set(type, (set = new Set()));
      set.add(name);
    });
  }

  /** Runs `job` after all earlier work on the asset has settled (success or failure). */
  private enqueue(name: string, job: () => Promise<void>): Promise<void> {
    const prior = this.chain.get(name) ?? Promise.resolve();
    const run = prior.then(job, job);
    const settled = run.catch(() => {});
    this.chain.set(name, settled);
    void settled.then(() => {
      if (this.chain.get(name) === settled) this.chain.delete(name);
    });
    return run;
  }

  /** Fetches one asset (after any unload of it still in flight), with its trim applied. */
  private async fetch(name: string): Promise<Texture> {
    const url = this.urlOf(name);
    if (!url) throw new Error(`Missing art "${name}" (rig coverage should have caught this at boot)`);
    const base = await this.loader.load(url);
    const t = trimOf(name);
    return t
      ? new Texture({ source: base.source, frame: new Rectangle(0, 0, t[2], t[3]), orig: new Rectangle(0, 0, t[4], t[5]), trim: new Rectangle(t[0], t[1], t[2], t[3]) })
      : base;
  }

  private async unload(name: string): Promise<void> {
    const url = this.urlOf(name);
    if (url) await this.loader.unload(url).catch(() => {});
  }
}
