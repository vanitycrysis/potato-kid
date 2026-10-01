import { Container, Sprite, type Texture } from 'pixi.js';
import type { MapData } from '../content/artData';

/**
 * Builds the world from ChatGPT/Codex's map sidecar (map_garden_v2.json): the explicit
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

  // Ground: explicit cells. The world isn't a whole number of tiles, so the final column
  // and row are clipped by a mask at the world edge.
  const ground = new Container();
  for (const c of map.groundCells) {
    const s = new Sprite(tex(c.asset));
    s.position.set(c.col * size, c.row * size);
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
  const [w, h] = map.worldSize;
  const clip = new Sprite(tex(map.groundCells[0]!.asset));
  clip.width = w;
  clip.height = h;
  ground.mask = clip;
  root.addChild(ground, clip);

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
