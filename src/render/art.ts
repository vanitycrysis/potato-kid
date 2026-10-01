import { Assets, type Texture } from 'pixi.js';

// Real art exported by `npm run art:export` (ASSETS.md). Vite resolves these
// at build time, so a missing file just means "use the placeholder".
const kidUrls = import.meta.glob('../../assets/sprites/kids/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const mapUrls = import.meta.glob('../../assets/maps/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export interface Art {
  /** Kid layer textures keyed by asset name, e.g. `kid_plain_body`. */
  kids: Map<string, Texture>;
  map: Texture | undefined;
}

function assetName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1, -'.png'.length);
}

/** Loads whatever real art exists; the scene falls back to placeholders per asset. */
export async function loadArt(): Promise<Art> {
  const kids = new Map<string, Texture>();
  await Promise.all(
    Object.entries(kidUrls).map(async ([path, url]) => {
      kids.set(assetName(path), await Assets.load<Texture>(url));
    }),
  );
  const mapUrl = Object.entries(mapUrls).find(([p]) => assetName(p) === 'map_garden')?.[1];
  const map = mapUrl ? await Assets.load<Texture>(mapUrl) : undefined;
  return { kids, map };
}
