import { Container, Sprite, type Texture } from 'pixi.js';
import type { Attachment, Clip, ClipFrame, ComponentTransform, KidRig, Vec2 } from '../content/artData';
import type { Activity, Kid } from '../sim/world';
import { ClipPicker, EffectTracks, type OneShot } from './presentation';

const DEG = Math.PI / 180;
const OPEN = 'open';

/**
 * Draws one kid from ChatGPT/Codex's rig (kid_rig_v2.json), following the spec's
 * transform order exactly with nested containers:
 *
 *   root (world ground point) → scale (appearance × worldCanvasSize/256)
 *     → shadow, effects behind the kid
 *     → rig (clip offset/rotation/opacity about the ground) → canvas (−groundAnchor)
 *       → back components, body, face, front components
 *     → effects above the kid
 *   component: attachment (position+offset, rotation, scale) → delta (clip component
 *   transform) → sprite (anchor = sourcePivot, scale = fitByBody)
 *
 * No motion is invented here (D-041): every pose and wiggle comes from authored clips,
 * and which clip plays is decided by `ClipPicker` from the rig's scheduler priority.
 */
export class KidRigView {
  readonly root = new Container();
  private readonly scaled = new Container();
  private readonly rigC = new Container();
  private readonly canvas = new Container();
  private readonly body = new Sprite();
  private readonly faceAttach = new Container();
  private readonly face = new Sprite();
  private readonly parts: { attachTo: string; asset: string; attach: Container; delta: Container; sprite: Sprite }[] = [];
  private readonly shadow: Sprite;
  private readonly fxBehind = new Container();
  private readonly fxAbove = new Container();
  private readonly fxSprites = new Map<string, Sprite>();
  private readonly picker: ClipPicker;
  private readonly effects: EffectTracks;
  private blinkIn: number;
  private blinkTime = -1;

  constructor(
    private readonly kid: Kid,
    private readonly rig: KidRig,
    private readonly textures: Map<string, Texture>,
    private readonly reducedMotion: boolean,
  ) {
    const k = (kid.look.scale * rig.worldCanvasSize) / rig.canvas[0];
    this.scaled.scale.set(k);
    this.canvas.position.set(-rig.groundAnchor[0], -rig.groundAnchor[1]);
    const costume = rig.costumes[kid.type];
    const face = rig.faces[kid.look.face]!;
    this.face.anchor.set(face.sourcePivot[0] / rig.canvas[0], face.sourcePivot[1] / rig.canvas[1]);
    this.faceAttach.addChild(this.face);

    const makePart = (c: NonNullable<typeof costume>['components'][number]) => {
      const sprite = new Sprite(this.tex(c.asset));
      sprite.anchor.set(c.sourcePivot[0] / rig.canvas[0], c.sourcePivot[1] / rig.canvas[1]);
      const fit = c.fitByBody[kid.look.body] ?? [1, 1];
      sprite.scale.set(fit[0], fit[1]);
      const delta = new Container();
      const attach = new Container();
      delta.addChild(sprite);
      attach.addChild(delta);
      this.parts.push({ attachTo: c.attachTo, asset: c.asset, attach, delta, sprite });
      return attach;
    };
    // Layer order back → body → face → front; within a layer, the authored array order.
    for (const c of costume?.components ?? []) if (c.layer === 'back') this.canvas.addChild(makePart(c));
    this.canvas.addChild(this.body, this.faceAttach);
    for (const c of costume?.components ?? []) if (c.layer === 'front') this.canvas.addChild(makePart(c));

    const sh = rig.effects.shadow;
    this.shadow = new Sprite(this.tex(sh.asset));
    this.shadow.anchor.set(sh.sourcePivot[0] / sh.canvas[0], sh.sourcePivot[1] / sh.canvas[1]);
    this.shadow.position.set(sh.offsetPx[0], sh.offsetPx[1]);

    this.rigC.addChild(this.canvas);
    this.scaled.addChild(this.shadow, this.fxBehind, this.rigC, this.fxAbove);
    this.root.addChild(this.scaled);
    this.picker = new ClipPicker(rig);
    this.effects = new EffectTracks(rig);
    this.blinkIn = this.blinkDelay();
  }

  /** A one-shot event clip (spawn on birth); it also starts the clip's effect, if any. */
  play(name: OneShot): void {
    this.picker.play(name);
    this.startEffect(name);
  }

  /**
   * An effect-only clip on this kid (fusion, discovery). Reduced motion shows no effects
   * (rig reducedMotion: effect "none").
   */
  startEffect(clipName: string): void {
    if (!this.reducedMotion) this.effects.start(clipName);
  }

  /** What is playing, for tests: the clip name and running effects. */
  get presenting(): { clip: string; effects: string[] } {
    return { clip: this.lastClip, effects: this.effects.active };
  }

  private lastClip = '';

  /** Position comes from the sim (already interpolated or resolved); `dt` is real seconds. */
  update(x: number, y: number, activity: Activity, held: boolean, dt: number): void {
    this.root.position.set(x, y);
    this.root.zIndex = held ? 1e6 : y;

    const { clip, name, time, reverse } = this.picker.advance(activity, held, dt);
    this.lastClip = name;
    let frame = this.reducedMotion || !clip ? this.staticFrame(name) : frameAt(clip, time, reverse);
    if (this.reducedMotion && name === 'spawn') {
      // Reduced motion: a newborn fades in briefly instead of playing its clip.
      const ms = this.rig.reducedMotion.spawn?.opacityTransitionMs ?? 0;
      frame = { ...frame, rig: { opacity: ms > 0 ? Math.min(1, (time * 1000) / ms) : 1 } };
    }

    // Blink: a face-only secondary clip, only where the rig allows it to run concurrently.
    const canBlink = !held && (name === 'walk' || name === 'idle' || name === 'look_around' || name === 'seated');
    let blinkFace: string | undefined;
    if (canBlink && !this.reducedMotion) {
      if (this.blinkTime >= 0) {
        this.blinkTime += dt;
        const blink = this.rig.clips.blink;
        const f = blink && this.blinkTime < blink.frames.length / blink.fps ? frameAt(blink, this.blinkTime, false) : undefined;
        if (f) blinkFace = f.faceState;
        else this.blinkTime = -1;
      } else if ((this.blinkIn -= dt) <= 0) {
        this.blinkTime = 0;
        this.blinkIn = this.blinkDelay();
      }
    }

    this.apply(frame, blinkFace);
    this.shadow.alpha = held ? this.rig.effects.shadow.heldOpacity : 1;
    this.drawEffects(dt);
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }

  // --- internals ---------------------------------------------------------

  private staticFrame(name: string): ClipFrame {
    const m = this.rig.reducedMotion[name] ?? this.rig.reducedMotion.idle ?? { bodyFrame: 'stand', faceState: OPEN };
    return { ...(m.bodyFrame ? { bodyFrame: m.bodyFrame } : {}), ...(m.faceState ? { faceState: m.faceState } : {}) };
  }

  private apply(frame: ClipFrame, blinkFace: string | undefined): void {
    const body = this.rig.bodies[this.kid.look.body]!;
    const bf = body.frames[frame.bodyFrame ?? 'stand'] ?? body.frames.stand!;
    this.body.texture = this.tex(bf.asset);

    const rig = frame.rig ?? {};
    const off = rig.offsetPx ?? [0, 0];
    this.rigC.position.set(off[0], off[1]);
    this.rigC.rotation = (rig.rotationDeg ?? 0) * DEG;
    // Clip opacity fades the kid's own layers only; effect opacity is independent (effects spec).
    this.rigC.alpha = rig.opacity ?? 1;

    const offsets = frame.attachmentOffsets ?? {};
    // Explicit states (sleep, wake) override the blink scheduler; "inherit" lets it blink.
    const explicit = frame.faceState && frame.faceState !== 'inherit' ? frame.faceState : undefined;
    const faceState = explicit ?? blinkFace ?? OPEN;
    const face = this.rig.faces[this.kid.look.face]!;
    this.face.texture = this.tex(face.states[faceState] ?? face.states[OPEN]!);
    setAttachment(this.faceAttach, bf.attachments.face_centre, offsets.face_centre);

    const deltas = frame.componentTransforms ?? {};
    for (const p of this.parts) {
      setAttachment(p.attach, bf.attachments[p.attachTo], offsets[p.attachTo]);
      setDelta(p.delta, deltas[p.asset]);
    }
  }

  private drawEffects(dt: number): void {
    const live = new Set<string>();
    for (const f of this.effects.advance(dt)) {
      live.add(f.effect);
      let sprite = this.fxSprites.get(f.effect);
      if (!sprite) {
        sprite = new Sprite();
        const { canvas, sourcePivot, offsetPx, layer } = f.def;
        sprite.anchor.set(sourcePivot[0] / canvas[0], sourcePivot[1] / canvas[1]);
        sprite.position.set(offsetPx[0], offsetPx[1]);
        (layer === 'above_kid' ? this.fxAbove : this.fxBehind).addChild(sprite);
        this.fxSprites.set(f.effect, sprite);
      }
      sprite.texture = this.tex(f.asset);
      sprite.alpha = f.opacity;
    }
    for (const [name, sprite] of this.fxSprites) {
      if (live.has(name)) continue;
      sprite.destroy();
      this.fxSprites.delete(name);
    }
  }

  private tex(asset: string): Texture {
    const t = this.textures.get(asset);
    if (!t) throw new Error(`Missing art "${asset}" (rig coverage should have caught this at boot)`);
    return t;
  }

  private blinkDelay(): number {
    const [lo, hi] = this.rig.scheduler.blinkDelaySeconds;
    // Cosmetic only and never saved, so a per-kid pseudo-random phase is enough here.
    const r = ((this.kid.id * 9301 + 49297) % 233280) / 233280;
    return lo + r * (hi - lo);
  }
}

function frameAt(clip: Clip, time: number, reverse: boolean): ClipFrame {
  const n = clip.frames.length;
  let i = Math.floor(time * clip.fps);
  i = clip.loop ? ((i % n) + n) % n : Math.min(n - 1, Math.max(0, i));
  if (reverse) i = n - 1 - i;
  return clip.frames[i]!;
}

function setAttachment(c: Container, a: Attachment | undefined, offset: Vec2 | undefined): void {
  const p = a?.position ?? [0, 0];
  const o = offset ?? [0, 0];
  c.position.set(p[0] + o[0], p[1] + o[1]);
  c.rotation = (a?.rotationDeg ?? 0) * DEG; // clockwise degrees in data, radians here
  const s = a?.scale ?? [1, 1];
  c.scale.set(s[0], s[1]);
}

function setDelta(c: Container, t: ComponentTransform | undefined): void {
  const o = t?.offsetPx ?? [0, 0];
  c.position.set(o[0], o[1]);
  c.rotation = (t?.rotationDeg ?? 0) * DEG;
  const s = t?.scale ?? [1, 1];
  c.scale.set(s[0], s[1]);
}
