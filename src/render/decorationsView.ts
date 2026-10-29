import { Container, Sprite, type Texture } from 'pixi.js';
import { activityEffects, type DecorationData, type MapData } from '../content/artData';

// The decorations kids use (D-090), drawn from Codex's `decorations_v1.json` as map v5 places
// them. Each one's back layer lies under every kid, as the rest of the scenery does; its front
// layer sorts with the kids at the decoration's depth (its ground y plus its footprint's bottom),
// so a walker behind it is covered and one in front is not. A kid in a slot draws between the
// two, and a splash above the front (Codex's layer order: back 10, slots 20/21, front 30, FX 40).

const SPLASH = 'decoration_splash';

export class DecorationsView {
  /** The back layers: under the kids. */
  readonly back = new Container({ label: 'decorations' });
  private readonly depths: number[] = [];
  /** Each slot's splash, by site and slot id, created when first needed. */
  private readonly splashes = new Map<string, Sprite>();

  constructor(
    map: MapData,
    data: DecorationData,
    private readonly textures: Map<string, Texture>,
    /** The sorted layer kids are in: the front layers go there. */
    private readonly kidLayer: Container,
  ) {
    this.back.eventMode = 'none';
    for (const i of map.activityDecorations?.instances ?? []) {
      const d = data.definitions[i.definition];
      const [x, y] = i.worldGround;
      const depth = y + (d?.footprintRelative[3] ?? 0);
      this.depths.push(depth);
      if (!d) continue;
      for (const l of [...d.layers].sort((a, b) => a.drawOrder - b.drawOrder)) {
        const t = textures.get(l.asset);
        if (!t) continue;
        const s = new Sprite(t);
        s.anchor.set(l.sourcePivot[0] / t.width, l.sourcePivot[1] / t.height);
        s.position.set(x, y);
        s.scale.set(l.scale);
        s.rotation = (l.rotationDeg * Math.PI) / 180;
        s.eventMode = 'none';
        if (l.drawOrder < 20) this.back.addChild(s);
        else {
          s.zIndex = depth + 0.3;
          s.label = `decoration-front:${i.id}`;
          kidLayer.addChild(s);
        }
      }
    }
  }

  /** Where a kid in slot `order` (0, 1) of site `site` sorts among the kids. */
  slotDepth(site: number, order: number): number {
    return (this.depths[site] ?? 0) + 0.2 + order * 0.01;
  }

  /**
   * A splash kid's effect this frame (kid_activity_v1 `effects.decoration_splash`), above the
   * front layer, at the kid's ground and scale; off when `on` is false.
   */
  splash(site: number, slot: string, x: number, y: number, scale: number, on: boolean): void {
    const fx = activityEffects[SPLASH];
    if (!fx) return;
    const key = `${site}:${slot}`;
    let s = this.splashes.get(key);
    if (!s && on) {
      const t = this.textures.get(fx.asset);
      if (!t) return;
      s = new Sprite(t);
      s.anchor.set(fx.sourcePivot[0] / fx.canvas[0], fx.sourcePivot[1] / fx.canvas[1]);
      s.eventMode = 'none';
      s.zIndex = (this.depths[site] ?? 0) + 0.4;
      this.kidLayer.addChild(s);
      this.splashes.set(key, s);
    }
    if (!s) return;
    s.visible = on;
    s.position.set(x + fx.offsetPx[0], y + fx.offsetPx[1]);
    s.scale.set(scale);
  }

  /** Every splash off: each frame turns on only those of kids still splashing. */
  hideSplashes(): void {
    for (const s of this.splashes.values()) s.visible = false;
  }

  /** Whether `clip` comes with the splash effect, and on which of its frames. */
  static splashFrames(clip: string): readonly number[] {
    return clip === SPLASH ? (activityEffects[SPLASH]?.onFrames ?? []) : [];
  }
}
