import { Application, Container, Graphics, type Texture } from 'pixi.js';
import type { Content } from '../content/types';
import { createRng, type Rng } from '../sim/rng';
import { addKid, createWorld, STEP, stepWander, type Bounds, type World } from '../sim/world';
import { KidView } from './kidView';
import { buildPlaceholderTextures } from './placeholderArt';

/** World layout (ENGINEERING_PLAN.md §5): 1080 wide, 1920 safe band, 240 bleed above and below. */
export const WORLD_WIDTH = 1080;
export const SAFE_HEIGHT = 1920;
export const BLEED = 240;
const HUD_TOP = 160;
const TRAY_BOTTOM = 280;
const SIDE_MARGIN = 70;

export const PLAY_BOUNDS: Bounds = {
  minX: SIDE_MARGIN,
  minY: HUD_TOP + 120, // leave room for the kid's height above its ground point
  maxX: WORLD_WIDTH - SIDE_MARGIN,
  maxY: SAFE_HEIGHT - TRAY_BOTTOM,
};

interface Prev {
  x: number;
  y: number;
}

/**
 * Owns the Pixi stage for the map. Runs the fixed-step sim and interpolates
 * kid positions between steps for rendering.
 */
export class MapScene {
  readonly world: World;
  private readonly rng: Rng;
  private readonly camera = new Container();
  private readonly kidLayer = new Container({ sortableChildren: true });
  private readonly views = new Map<number, KidView>();
  private readonly prev = new Map<number, Prev>();
  private readonly textures: Map<string, Texture>;
  private acc = 0;

  constructor(
    private readonly app: Application,
    private readonly content: Content,
    seed: number,
  ) {
    this.rng = createRng(seed);
    this.world = createWorld(PLAY_BOUNDS);
    this.textures = buildPlaceholderTextures(app.renderer, content.kids);
    this.camera.addChild(drawPlaceholderBackground(), this.kidLayer);
    app.stage.addChild(this.camera);
    this.layout();
    app.renderer.on('resize', () => this.layout());
    app.ticker.add((t) => this.frame(t.deltaMS / 1000));
  }

  /**
   * Fits the whole 1080 × 1920 safe band on screen and centres it. On phones in
   * portrait the width is the limit (the usual case); on short or landscape
   * viewports the height is, and the background bleed fills the sides. This
   * keeps every playable position visible (Codex review, PR #4).
   */
  private layout(): void {
    const { width, height } = this.app.screen;
    const scale = Math.min(width / WORLD_WIDTH, height / SAFE_HEIGHT);
    this.camera.scale.set(scale);
    this.camera.x = (width - WORLD_WIDTH * scale) / 2;
    this.camera.y = (height - SAFE_HEIGHT * scale) / 2;
  }

  spawnRandom(count: number): void {
    const types = this.content.kids.map((k) => k.id);
    const { minX, minY, maxX, maxY } = PLAY_BOUNDS;
    for (let i = 0; i < count; i++) {
      const type = types[i % types.length]!;
      const kid = addKid(this.world, type, minX + this.rng.next() * (maxX - minX), minY + this.rng.next() * (maxY - minY), this.rng);
      const view = new KidView(kid, this.textures);
      this.views.set(kid.id, view);
      this.kidLayer.addChild(view.root);
    }
  }

  private frame(dt: number): void {
    // Clamp long frames (tab switch) so the sim never spirals.
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= STEP) {
      for (const k of this.world.kids) this.prev.set(k.id, { x: k.x, y: k.y });
      stepWander(this.world, this.rng, this.content.balance.wander);
      this.acc -= STEP;
    }
    const alpha = this.acc / STEP;
    for (const k of this.world.kids) {
      const view = this.views.get(k.id);
      if (!view) continue;
      const p = this.prev.get(k.id) ?? k;
      const x = p.x + (k.x - p.x) * alpha;
      const y = p.y + (k.y - p.y) * alpha;
      view.update(x, y, k.idle === 0, Math.cos(k.heading), dt);
    }
  }
}

/** Stand-in for ChatGPT's garden plate: cream ground, sage blobs in the bleed and margins. */
function drawPlaceholderBackground(): Graphics {
  const g = new Graphics();
  // Generous side bleed for landscape / wide viewports (fit-by-height).
  g.rect(-WORLD_WIDTH * 2, -BLEED, WORLD_WIDTH * 5, SAFE_HEIGHT + BLEED * 2).fill('#f4efe2');
  const rng = createRng(2024);
  for (let i = 0; i < 26; i++) {
    const edge = rng.next() < 0.5;
    const x = edge ? (rng.next() < 0.5 ? rng.next() * 60 : WORLD_WIDTH - rng.next() * 60) : rng.next() * WORLD_WIDTH;
    const y = edge ? rng.next() * SAFE_HEIGHT : rng.next() < 0.5 ? -BLEED + rng.next() * 380 : SAFE_HEIGHT - 140 + rng.next() * 380;
    g.ellipse(x, y, 30 + rng.next() * 40, 16 + rng.next() * 20).fill({ color: '#b9c9a3', alpha: 0.6 });
  }
  return g;
}
