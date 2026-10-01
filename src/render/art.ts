import { Assets, type Texture } from 'pixi.js';

// Every exported runtime PNG (kids, buildings, FX, map tiles and decor), keyed by asset
// name. Vite resolves the URLs at build time. GUI art is native DOM SVG and isn't here.
const urls = import.meta.glob('../../assets/{sprites,maps}/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<
  string,
  string
>;

export function assetName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1, -'.png'.length);
}

/** Names of all exported runtime PNGs (for the D-036 coverage check). */
export const exportedNames = new Set(Object.keys(urls).map(assetName));

export async function loadTextures(): Promise<Map<string, Texture>> {
  const out = new Map<string, Texture>();
  await Promise.all(
    Object.entries(urls).map(async ([path, url]) => {
      out.set(assetName(path), await Assets.load<Texture>(url));
    }),
  );
  return out;
}
