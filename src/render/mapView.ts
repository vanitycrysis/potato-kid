import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import type { MapData } from '../content/artData';

/**
 * Builds the world from ChatGPT/Codex's map sidecar (map_garden_v3.json): the explicit
 * ground cells, path decals and scenery instances it lists. Nothing is improvised here:
 * no generated layout, no reshuffle, no whole-world cache texture (ART_AUDIO_PLAN.md).
 * Scenery draws behind kids.
 */
export function buildMap(map: MapData, textures: Map<string, Texture>): Container {
  const root = new Container();
  const tex = (name: string) => {
    const t = textures.get(name);
    if (!t) throw new Error(`Missing map art "${name}"`);
    return t;
  };
  const size = map.tileSize;

  // Ground: explicit cells. The world isn't a whole number of tiles, so cells on the
  // final column/row use a cropped texture frame: exact clipping with no per-frame mask
  // (a stencil mask cost a lot on software renderers).
  const [w, h] = map.worldSize;
  const ground = new Container();
  const cropped = new Map<string, Texture>();
  const tileFor = (asset: string, cw: number, ch: number): Texture => {
    const full = tex(asset);
    if (cw >= size && ch >= size) return full;
    const key = `${asset}:${cw}x${ch}`;
    let t = cropped.get(key);
    if (!t) {
      t = new Texture({ source: full.source, frame: new Rectangle(full.frame.x, full.frame.y, cw, ch) });
      cropped.set(key, t);
    }
    return t;
  };
  for (const c of map.groundCells) {
    const x = c.col * size;
    const y = c.row * size;
    if (x >= w || y >= h) continue;
    const s = new Sprite(tileFor(c.asset, Math.min(size, w - x), Math.min(size, h - y)));
    s.position.set(x, y);
    ground.addChild(s);
  }
  // Paths: rotated about the tile centre, never the kid ground anchor.
  const [ox, oy] = map.pathGridOrigin;
  for (const p of map.pathCells) {
    const s = new Sprite(tex(p.asset));
    s.anchor.set(0.5);
    s.position.set(ox + p.col * size + size / 2, oy + p.row * size + size / 2);
    s.rotation = (p.rotationDeg * Math.PI) / 180;
    ground.addChild(s);
  }
  root.addChild(ground);

  // Scenery instances in authored draw order (then by ground y), anchored at their pivots.
  const scenery = [...map.instances].sort((a, b) => a.drawOrder - b.drawOrder || a.worldGround[1] - b.worldGround[1]);
  for (const i of scenery) {
    const t = tex(i.asset);
    const s = new Sprite(t);
    s.anchor.set(i.sourcePivot[0] / t.width, i.sourcePivot[1] / t.height);
    s.position.set(i.worldGround[0], i.worldGround[1]);
    s.scale.set(i.scale);
    s.rotation = (i.rotationDeg * Math.PI) / 180;
    root.addChild(s);
  }
  return root;
}
