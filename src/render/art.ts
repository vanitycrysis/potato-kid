import { Assets, type Texture } from 'pixi.js';

// Real art exported by `npm run art:export` (ASSETS.md). Vite resolves these
// at build time, so a missing file just means "use the placeholder".
const kidUrls = import.meta.glob('../../assets/sprites/kids/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export interface Art {
  /** Kid layer textures keyed by asset name, e.g. `kid_plain_body`. */
  kids: Map<string, Texture>;
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
  // The single map plate is superseded by tiles + decor (D-040); those load here once Codex delivers them.
  return { kids };
}
