import { Container, Sprite, type Texture } from 'pixi.js';
import type { Kid } from '../sim/world';
import { ANCHOR_X, ANCHOR_Y, LAYER_ORDER, LAYER_SIZE, layerAssetName } from './layers';

/** World units a kid's 256 px canvas is drawn at. */
export const KID_WORLD_SIZE = 180;

const BASE_SCALE = KID_WORLD_SIZE / LAYER_SIZE;
const HOP_HEIGHT = 10;
const HOP_RATE = 9; // radians per second of the hop cycle
const MAX_TILT = 0.08;
/** Eye line on the 256 canvas; agreed with ChatGPT as part of the face layer. */
const EYE_Y = 116;

/**
 * One kid on screen: the shared body and face plus the type's overlays,
 * all moved together. Animation is procedural (D-016): hop and squash while
 * walking, tilt toward the direction of travel, and a blink.
 */
export class KidView {
  readonly root = new Container();
  private readonly rig = new Container();
  private readonly face: Sprite | undefined;
  private phase: number;
  private blinkIn: number;
  private blinkLeft = 0;

  constructor(kid: Kid, textures: Map<string, Texture>) {
    this.phase = (kid.id * 1.7) % (Math.PI * 2);
    this.blinkIn = 2 + (kid.id % 5);
    this.rig.scale.set(BASE_SCALE);
    let face: Sprite | undefined;
    for (const layer of LAYER_ORDER) {
      const tex = textures.get(layerAssetName(kid.type, layer));
      if (!tex) continue;
      const sprite = new Sprite(tex);
      sprite.anchor.set(ANCHOR_X, ANCHOR_Y);
      if (layer === 'face') {
        // Pivot the face at eye height so a blink squashes the eyes in place.
        sprite.anchor.y = EYE_Y / LAYER_SIZE;
        sprite.y = EYE_Y - ANCHOR_Y * LAYER_SIZE;
        face = sprite;
      }
      this.rig.addChild(sprite);
    }
    this.face = face;
    this.root.addChild(this.rig);
  }

  /** Position comes from the sim (already interpolated); `dt` is real frame time in seconds. */
  update(x: number, y: number, walking: boolean, dirX: number, dt: number): void {
    this.root.position.set(x, y);
    this.root.zIndex = y;

    if (walking) this.phase += HOP_RATE * dt;
    const hop = walking ? Math.abs(Math.sin(this.phase)) : 0;
    // Squash at the bottom of each hop, stretch at the top; a slow breath when idle.
    const squash = walking ? 1 + (hop - 0.5) * 0.08 : 1 + Math.sin(this.phase * 0.3) * 0.01;
    this.rig.position.y = -hop * HOP_HEIGHT;
    this.rig.scale.set(BASE_SCALE / squash, BASE_SCALE * squash);
    const targetTilt = walking ? Math.sign(dirX) * MAX_TILT : 0;
    this.rig.rotation += (targetTilt - this.rig.rotation) * Math.min(1, dt * 8);

    if (!walking) this.phase += dt;
    if (this.face) {
      if (this.blinkLeft > 0) {
        this.blinkLeft -= dt;
        this.face.scale.y = 0.15;
      } else {
        this.face.scale.y = 1;
        this.blinkIn -= dt;
        if (this.blinkIn <= 0) {
          this.blinkLeft = 0.12;
          this.blinkIn = 2.5 + ((this.phase * 997) % 4);
        }
      }
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
