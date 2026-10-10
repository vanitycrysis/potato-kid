import { Container, Sprite, type Texture } from 'pixi.js';
import type { Attachment, Clip, ClipFrame, ComponentTransform, KidRig, Vec2, WildData, WildFrame } from '../content/artData';
import type { Activity, Kid } from '../sim/world';
import { ClipPicker, EffectTracks, type OneShot } from './presentation';

const DEG = Math.PI / 180;
const OPEN = 'open';
/** A wild kid's frame when its clip has none of its own: the stand, still (kid_wild_v1 fallbackTiming). */
const WILD_STAND: WildFrame = { durationMs: 0, frame: 'stand', offsetPx: [0, 0], faceState: 'inherit', opacity: 1 };
/** A farming kid's steps (Codex's farm_v1 `workerLoop`): body frames and their times. */
const FARM_STEPS = [
  { frame: 'stand', ms: 600 },
  { frame: 'step_left', ms: 160 },
  { frame: 'stand', ms: 600 },
  { frame: 'step_right', ms: 160 },
] as const;

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
  /**
   * A wild kid (kid_wild_v1, D-072/D-073): its own stand body with the shared face at its
   * anchor, and the sidecar's bob clips; no costume, and no shared body's frames.
   */
  private readonly wildType: WildData['types'][string] | undefined;

  constructor(
    private readonly kid: Kid,
    private readonly rig: KidRig,
    private readonly textures: Map<string, Texture>,
    private readonly reducedMotion: boolean,
    private readonly wild?: WildData,
  ) {
    const k = (kid.look.scale * rig.worldCanvasSize) / rig.canvas[0];
    this.scaled.scale.set(k);
    this.canvas.position.set(-rig.groundAnchor[0], -rig.groundAnchor[1]);
    this.wildType = wild?.types[kid.type];
    // A wild body replaces every shared body and costume layer: no legacy prop over it.
    const costume = this.wildType ? undefined : rig.costumes[kid.type];
    const face = rig.faces[kid.look.face]!;
    this.face.anchor.set(face.sourcePivot[0] / rig.canvas[0], face.sourcePivot[1] / rig.canvas[1]);
    this.faceAttach.addChild(this.face);
    if (this.wildType) {
      this.faceAttach.position.set(this.wildType.faceAnchorPx[0], this.wildType.faceAnchorPx[1]);
      this.faceAttach.scale.set(this.wildType.faceScale);
    }

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
    // Shadow and effects are decoration: only the kid itself is a press target, so a big
    // effect canvas never turns empty ground into a pick-up (Codex review, PR #24).
    this.shadow.eventMode = 'none';
    this.fxBehind.eventMode = 'none';
    this.fxAbove.eventMode = 'none';
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

  /** The player picked this kid up / let go of it (see ClipPicker.pickUp). */
  pickedUp(): void {
    this.picker.pickUp();
  }

  dropped(): void {
    this.picker.drop();
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

  /** What is drawn now, for tests: body and face assets, the clip's offset, the face's place, costume parts. */
  get drawn(): { body: string; face: string; offset: [number, number]; faceAt: [number, number]; parts: number } {
    const name = (t: Texture) => [...this.textures].find(([, v]) => v === t)?.[0] ?? '';
    return {
      body: name(this.body.texture),
      face: name(this.face.texture),
      offset: [this.rigC.position.x, this.rigC.position.y],
      faceAt: [this.faceAttach.position.x, this.faceAttach.position.y],
      parts: this.parts.length,
    };
  }

  /** Position comes from the sim (already interpolated or resolved); `dt` is real seconds. */
  update(x: number, y: number, activity: Activity, held: boolean, dt: number): void {
    this.root.position.set(x, y);
    this.root.zIndex = held ? 1e6 : y;

    const { clip, name, time, reverse } = this.picker.advance(activity, held, dt);
    this.lastClip = name;
    const canBlink = !held && (name === 'walk' || name === 'idle' || name === 'look_around' || name === 'seated');
    if (this.wildType) {
      // The shared scheduler picks the clip and keeps its time; the wild sidecar only draws it.
      const fade = this.reducedMotion && name === 'spawn' ? this.spawnFade(time) : undefined;
      this.applyWild(this.wildFrame(name, time), canBlink ? this.blink(dt) : undefined, fade);
      this.shadow.alpha = held ? this.rig.effects.shadow.heldOpacity : 1;
      this.drawEffects(dt);
      return;
    }
    let frame = this.reducedMotion || !clip ? this.staticFrame(name) : frameAt(clip, time, reverse);
    if (this.reducedMotion && name === 'spawn') {
      // Reduced motion: a newborn fades in briefly instead of playing its clip.
      frame = { ...frame, rig: { opacity: this.spawnFade(time) } };
    }

    // Blink: a face-only secondary clip, only where the rig allows it to run concurrently.
    this.apply(frame, canBlink ? this.blink(dt) : undefined);
    this.shadow.alpha = held ? this.rig.effects.shadow.heldOpacity : 1;
    this.drawEffects(dt);
  }

  /**
   * A kid farming (D-069, Codex's farm_v1 `workerLoop`): fixed on its pad, its feet tend the
   * furrow, stand → step_left → stand → step_right for 600 / 160 / 600 / 160 ms, then a pause
   * of 3 to 5 s that depends on its id, so a field's kids never step together. It blinks as
   * usual. Reduced motion: standing, blinking only. `ms`: the field's clock.
   */
  updateFarming(x: number, y: number, ms: number, dt: number): void {
    this.root.position.set(x, y);
    this.root.zIndex = y;
    if (this.wildType) {
      // No steps of its own: it stands at its pad and blinks (kid_wild_v1 has no step frames).
      this.lastClip = 'farming';
      this.applyWild(WILD_STAND, this.blink(dt));
      this.shadow.alpha = 1;
      return;
    }
    let bodyFrame = 'stand';
    if (!this.reducedMotion) {
      const pause = 3000 + ((this.kid.id * 977) % 2001);
      const steps = FARM_STEPS.reduce((a, s) => a + s.ms, 0);
      let t = (ms + this.kid.id * 1301) % (steps + pause);
      for (const s of FARM_STEPS) {
        if (t < s.ms) {
          bodyFrame = s.frame;
          break;
        }
        t -= s.ms;
      }
    }
    this.lastClip = 'farming';
    this.apply({ bodyFrame, faceState: 'inherit' }, this.blink(dt));
    this.shadow.alpha = 1;
  }

  /** The blink scheduler's face state now, or undefined (open). */
  private blink(dt: number): string | undefined {
    if (this.reducedMotion) return undefined;
    if (this.blinkTime >= 0) {
      this.blinkTime += dt;
      const blink = this.rig.clips.blink;
      const f = blink && this.blinkTime < blink.frames.length / blink.fps ? frameAt(blink, this.blinkTime, false) : undefined;
      if (f) return f.faceState;
      this.blinkTime = -1;
    } else if ((this.blinkIn -= dt) <= 0) {
      this.blinkTime = 0;
      this.blinkIn = this.blinkDelay();
    }
    return undefined;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }

  // --- internals ---------------------------------------------------------

  /** Reduced motion: a newborn fades in over the rig's transition instead of playing its clip. */
  private spawnFade(time: number): number {
    const ms = this.rig.reducedMotion.spawn?.opacityTransitionMs ?? 0;
    return ms > 0 ? Math.min(1, (time * 1000) / ms) : 1;
  }

  /**
   * A wild kid's frame for clip `name` at `time` seconds: its own clip's frame by duration,
   * else the stand (an alias borrows only the frame; the clip's timing is the scheduler's).
   * Reduced motion: the sidecar's still frame.
   */
  private wildFrame(name: string, time: number): WildFrame {
    const w = this.wild!;
    if (this.reducedMotion) {
      const m = w.reducedMotion[name] ?? w.reducedMotion.idle;
      return m ? { durationMs: 0, frame: m.frame, offsetPx: m.offsetPx, faceState: m.faceState, opacity: m.opacity } : WILD_STAND;
    }
    // A fallback clip borrows its alias's frames (looping as the alias does).
    const own = w.clips[name];
    const c = own?.frames ? own : own?.fallback ? w.clips[own.fallback] : undefined;
    const frames = c?.frames;
    if (!c || !frames || frames.length === 0) return WILD_STAND;
    const total = frames.reduce((a, f) => a + f.durationMs, 0);
    let t = time * 1000;
    t = total <= 0 ? 0 : c.loop ? ((t % total) + total) % total : Math.min(Math.max(0, t), total);
    for (const f of frames) {
      if (t < f.durationMs) return f;
      t -= f.durationMs;
    }
    return frames[frames.length - 1]!;
  }

  /** Draws a wild frame: its body, the clip's offset for body and face together, the face's state. */
  private applyWild(f: WildFrame, blinkFace: string | undefined, opacity?: number): void {
    const t = this.wildType!;
    this.body.texture = this.tex((t.frames[f.frame] ?? t.frames.stand)!.asset);
    this.rigC.position.set(f.offsetPx[0], f.offsetPx[1]);
    this.rigC.rotation = 0;
    this.rigC.alpha = opacity ?? f.opacity;
    const explicit = f.faceState && f.faceState !== 'inherit' ? f.faceState : undefined;
    const faceState = explicit ?? blinkFace ?? OPEN;
    const face = this.rig.faces[this.kid.look.face]!;
    this.face.texture = this.tex(face.states[faceState] ?? face.states[OPEN]!);
  }

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
