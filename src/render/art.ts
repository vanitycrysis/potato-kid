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
  private readonly typeLoads = new Map<KidId, Promise<void>>();
  private readonly costumeAssets: Map<KidId, string[]>;

  constructor(private readonly rig: KidRig) {
    this.costumeAssets = new Map(Object.entries(rig.costumes).map(([type, c]) => [type, c.components.map((x) => x.asset)]));
  }

  /** Loads every non-costume asset: the shared art that is always on screen. */
  async loadShared(): Promise<void> {
    const costume = new Set([...this.costumeAssets.values()].flat());
    await Promise.all([...byName.keys()].filter((n) => !costume.has(n)).map((n) => this.loadOne(n)));
  }

  /** Whether a type's costume is ready to draw. */
  ready(type: KidId): boolean {
    return (this.costumeAssets.get(type) ?? []).every((a) => this.map.has(a));
  }

  /** Loads a type's costume (once, however often asked). */
  ensure(type: KidId): Promise<void> {
    const existing = this.typeLoads.get(type);
    if (existing) return existing;
    const p = Promise.all((this.costumeAssets.get(type) ?? []).map((a) => this.loadOne(a))).then(() => {});
    this.typeLoads.set(type, p);
    return p;
  }

  /** Frees a type's costume textures (no kid of that type is drawn any more). */
  release(type: KidId): void {
    if (!this.typeLoads.has(type)) return;
    this.typeLoads.delete(type);
    for (const a of this.costumeAssets.get(type) ?? []) {
      const t = this.map.get(a);
      this.map.delete(a);
      t?.destroy(false);
      const url = byName.get(a);
      if (url) void Assets.unload(url);
    }
  }

  /** Types whose costumes are loaded or loading. */
  get loadedTypes(): KidId[] {
    return [...this.typeLoads.keys()];
  }

  private async loadOne(name: string): Promise<void> {
    if (this.map.has(name)) return;
    const url = byName.get(name);
    if (!url) throw new Error(`Missing art "${name}" (rig coverage should have caught this at boot)`);
    const base = await Assets.load<Texture>(url);
    const t = trimOf(name);
    this.map.set(
      name,
      t
        ? new Texture({ source: base.source, frame: new Rectangle(0, 0, t[2], t[3]), orig: new Rectangle(0, 0, t[4], t[5]), trim: new Rectangle(t[0], t[1], t[2], t[3]) })
        : base,
    );
  }
}
