import { Graphics, Rectangle, type Renderer, type Texture } from 'pixi.js';
import type { KidDef } from '../content/types';
import { createRng } from '../sim/rng';
import { LAYER_SIZE, layerAssetName } from './layers';

// Code-drawn stand-ins that follow the layer contract exactly, so ChatGPT's
// real PNGs can replace them one file at a time. Not final art.

const INK = '#1a1a1a';
const STROKE = 8; // ≈ 2 CSS px at 64 px display (PR #2 review, point 2)
const GROUND_Y = 224;
const CX = 128;

function lumpyPoints(cx: number, cy: number, rx: number, ry: number, seed: number): number[] {
  const rng = createRng(seed);
  const pts: number[] = [];
  const n = 28;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wobble = 1 + (rng.next() - 0.5) * 0.08;
    pts.push(cx + Math.cos(a) * rx * wobble, cy + Math.sin(a) * ry * wobble);
  }
  return pts;
}

function drawBody(g: Graphics): void {
  // Feet nubs first so the body overlaps them.
  g.moveTo(CX - 40, GROUND_Y - 14).lineTo(CX - 44, GROUND_Y).stroke({ color: INK, width: STROKE, cap: 'round' });
  g.moveTo(CX + 40, GROUND_Y - 14).lineTo(CX + 44, GROUND_Y).stroke({ color: INK, width: STROKE, cap: 'round' });
  g.poly(lumpyPoints(CX, 140, 92, 80, 11)).fill('#fbf3df').stroke({ color: INK, width: STROKE, join: 'round' });
}

function drawFace(g: Graphics): void {
  g.circle(CX - 40, 116, 5).circle(CX + 40, 116, 5).fill(INK);
  g.moveTo(CX - 10, 122).lineTo(CX + 12, 120).stroke({ color: INK, width: STROKE - 2, cap: 'round' });
}

function drawOverlay(g: Graphics, kid: KidDef, layer: 'overlay_back' | 'overlay_front'): boolean {
  // Types added after D-036 have no code-drawn overlay (default case) and no accent.
  const c = kid.accent ?? INK;
  const line = { color: INK, width: STROKE - 2, join: 'round' as const, cap: 'round' as const };
  switch (`${kid.id}:${layer}`) {
    case 'fire:overlay_front':
      g.poly([CX - 30, 62, CX - 18, 20, CX - 4, 44, CX + 6, 8, CX + 18, 40, CX + 30, 62]).fill(c).stroke(line);
      return true;
    case 'water:overlay_front':
      g.poly([CX, 14, CX + 22, 50, CX, 66, CX - 22, 50]).fill(c).stroke(line);
      return true;
    case 'snow:overlay_front':
      g.roundRect(CX - 56, 52, 112, 40, 18).fill(c).stroke(line);
      g.circle(CX, 46, 12).fill('#ffffff').stroke(line);
      g.roundRect(CX - 70, 168, 140, 18, 8).fill('#e8613c').stroke(line);
      return true;
    case 'chef:overlay_front':
      g.rect(CX - 30, 40, 60, 30).fill(c).stroke(line);
      g.roundRect(CX - 44, 8, 88, 40, 18).fill(c).stroke(line);
      return true;
    case 'firefighter:overlay_front':
      g.ellipse(CX, 66, 80, 18).fill(c).stroke(line);
      g.roundRect(CX - 52, 28, 104, 44, 22).fill(c).stroke(line);
      g.rect(CX - 10, 36, 20, 22).fill('#f2c230').stroke(line);
      return true;
    case 'snowman:overlay_back':
      g.circle(CX + 70, 196, 40).fill(c).stroke(line);
      return true;
    case 'snowman:overlay_front':
      g.rect(CX - 36, 34, 72, 26).fill(INK);
      g.rect(CX - 50, 58, 100, 10).fill(INK);
      return true;
    case 'steam:overlay_front':
      for (const [x, y, r] of [
        [CX - 34, 44, 20],
        [CX, 30, 26],
        [CX + 34, 44, 20],
      ] as const) {
        g.circle(x, y, r).fill(c).stroke(line);
      }
      return true;
    case 'hero:overlay_back':
      g.poly([CX - 70, 110, CX + 70, 110, CX + 104, 214, CX - 104, 214]).fill('#d63c3c').stroke(line);
      return true;
    case 'hero:overlay_front':
      g.circle(CX, 176, 18).fill(c).stroke(line);
      return true;
    case 'sundae:overlay_front':
      g.poly([CX - 80, 170, CX + 80, 170, CX + 50, 222, CX - 50, 222]).fill(c).stroke(line);
      g.circle(CX, 46, 14).fill('#d63c3c').stroke(line);
      return true;
    default:
      return false;
  }
}

/** Builds placeholder textures for every kid layer, keyed by asset name. */
export function buildPlaceholderTextures(renderer: Renderer, kids: KidDef[]): Map<string, Texture> {
  const out = new Map<string, Texture>();
  const frame = new Rectangle(0, 0, LAYER_SIZE, LAYER_SIZE);
  const bake = (name: string, draw: (g: Graphics) => boolean | void) => {
    const g = new Graphics();
    if (draw(g) === false) {
      g.destroy();
      return;
    }
    out.set(name, renderer.generateTexture({ target: g, frame, resolution: 1, antialias: true }));
    g.destroy();
  };
  bake('kid_plain_body', drawBody);
  bake('kid_plain_face', drawFace);
  for (const kid of kids) {
    bake(layerAssetName(kid.id, 'overlay_back'), (g) => drawOverlay(g, kid, 'overlay_back'));
    bake(layerAssetName(kid.id, 'overlay_front'), (g) => drawOverlay(g, kid, 'overlay_front'));
  }
  return out;
}
