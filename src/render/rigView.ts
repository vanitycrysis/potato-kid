import { Container, Sprite, type Texture } from 'pixi.js';
import { activityEffects, type Attachment, type Clip, type ClipFrame, type ComponentTransform, type KidRig, type MarkFrame, type Vec2, type WildData, type WildFrame } from '../content/artData';
import type { Activity, Kid } from '../sim/world';
import { ClipPicker, EffectTracks, type OneShot } from './presentation';

const DEG = Math.PI / 180;
const OPEN = 'open';
/** How far a greeting kid's face shifts toward the kid it greets, in source px. */
const GLANCE_PX = 4;
/** A wild kid's frame when its clip has none of its own: the stand, still (kid_wild_v1 fallbackTiming). */
const WILD_STAND: WildFrame = { durationMs: 0, frame: 'stand', offsetPx: [0, 0], faceState: 'inherit', opacity: 1 };
/** Farming (D-089, Codex's kid_activity_v1): the stomp clip and its soil stamp. */
const FARM_CLIP = 'farm_stomp';
/** What the clip picker is told a seated kid does: it draws the slot's clip itself. */
const SEATED: Activity = { kind: 'pause', left: 1 };

/**
 * Draws one kid from ChatGPT/Codex's rig (kid_rig_v2.json), following the spec's
 * transform order exactly with nested containers:
 *
 *   root (world ground point) → scale (appearance × worldCanvasSize/256)
 *     → shadow, effects and marks behind the kid
 *     → rig (clip offset/rotation/scale/opacity about the ground) → canvas (−groundAnchor)
 *       → back components, body, face, front components
 *     → marks and effects above the kid (marks in canvas coordinates, outside the rig
 *       transform: a z does not squash with the kid)
 *   component: attachment (position+offset, rotation, scale) → delta (clip component
 *   transform) → sprite (anchor = sourcePivot, scale = fitByBody)
 *
 * No motion is invented here (D-041): every pose and wiggle comes from authored clips
 * (Codex's frame-swaps, or Claude's motion v1 baked at 12 fps), and which clip plays is
 * decided by `ClipPicker` from the rig's scheduler priority. The one layered touch is a
 * greeting's glance toward the kid it greets.
 */
export class KidRigView {
  readonly root = new Container();
  private readonly scaled = new Container();
  private readonly rigC = new Container();
  private readonly canvas = new Container();
  /** The farming stamp, made on the first landing (D-089). */
  private stamp: Sprite | null = null;
  private readonly body = new Sprite();
  private readonly faceAttach = new Container();
  private readonly face = new Sprite();
  private readonly parts: { attachTo: string; asset: string; attach: Container; delta: Container; sprite: Sprite; pivot: Vec2; fit: Vec2 }[] = [];
  private readonly shadow: Sprite;
  private readonly fxBehind = new Container();
  private readonly fxAbove = new Container();
  private readonly fxSprites = new Map<string, Sprite>();
  /** Motion marks (D-100), pooled: behind and above the kid, in canvas coordinates. */
  private readonly marksBehind = new Container();
  private readonly marksAbove = new Container();
  private readonly markPool: Sprite[] = [];
  private marksUsed = 0;
  /** Where this frame's body puts each attachment, for marks anchored to one. */
  private anchors: Record<string, Vec2> = {};
  /** Whether marks are drawn: the scene turns them off when zoomed out (rig.marksMinZoom). */
  marksShown = true;
  private readonly picker: ClipPicker;
  private readonly effects: EffectTracks;
  private blinkIn: number;
  private blinkTime = -1;
  /**
   * A wild kid (kid_wild_v1, D-072/D-073): its own stand body with the shared face at its
   * anchor, and the sidecar's bob clips; no costume, and no shared body's frames.
   */
  private readonly wildType: WildData['types'][string] | undefined;
  /** A wild kid has no attachments: marks anchor to points of its lifetime box and its face. */
  private wildAnchors: Record<string, Vec2> = {};

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
    if (this.wildType) {
      // From the drawing's own box: the lifetime box less the margin motion added to it.
      const m = rig.marginPx ?? [0, 0, 0, 0];
      const [l, t, r, b] = [this.wildType.lifetimeBoundsPx[0] + m[0], this.wildType.lifetimeBoundsPx[1] + m[1], this.wildType.lifetimeBoundsPx[2] - m[2], this.wildType.lifetimeBoundsPx[3] - m[3]];
      const cx = (l + r) / 2;
      this.wildAnchors = { head_top: [cx, t + 14], torso: [cx, (t + b) / 2 + 20], hand_right: [r - 16, (t + b) / 2 + 20], face_centre: this.wildType.faceAnchorPx };
    }
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
      this.parts.push({ attachTo: c.attachTo, asset: c.asset, attach, delta, sprite, pivot: c.sourcePivot, fit: [fit[0], fit[1]] });
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
    for (const c of [this.marksBehind, this.marksAbove]) {
      c.eventMode = 'none';
      c.position.set(-rig.groundAnchor[0], -rig.groundAnchor[1]);
    }
    this.scaled.addChild(this.shadow, this.fxBehind, this.marksBehind, this.rigC, this.marksAbove, this.fxAbove);
    this.root.addChild(this.scaled);
    this.picker = new ClipPicker(rig, rig.habits?.[kid.type]);
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
  startEffect(clipName: string, delay = 0): void {
    if (!this.reducedMotion) this.effects.start(clipName, delay);
  }

  /** What is playing, for tests: the clip name and running effects. */
  get presenting(): { clip: string; effects: string[] } {
    return { clip: this.lastClip, effects: this.effects.active };
  }

  private lastClip = '';

  /** What is drawn now, for tests: body and face assets, the clip's offset, the face's place, costume parts. */
  get drawn(): { body: string; face: string; offset: [number, number]; scale: [number, number]; rotation: number; faceAt: [number, number]; parts: number; stamp: boolean; marks: number } {
    const name = (t: Texture) => [...this.textures].find(([, v]) => v === t)?.[0] ?? '';
    return {
      body: name(this.body.texture),
      face: name(this.face.texture),
      offset: [this.rigC.position.x, this.rigC.position.y],
      scale: [this.rigC.scale.x, this.rigC.scale.y],
      rotation: this.rigC.rotation / DEG,
      faceAt: [this.faceAttach.position.x, this.faceAttach.position.y],
      parts: this.parts.length,
      stamp: this.stamp?.visible ?? false,
      marks: this.markPool.filter((s) => s.visible).length,
    };
  }

  /** Position comes from the sim (already interpolated or resolved); `dt` is real seconds. */
  update(x: number, y: number, activity: Activity, held: boolean, dt: number): void {
    this.root.position.set(x, y);
    this.root.zIndex = held ? 1e6 : y;

    const { clip, name, time, reverse } = this.picker.advance(activity, held, dt);
    this.lastClip = name;
    const canBlink = !held && (name === 'walk' || name === 'idle' || name === 'look_around' || name === 'seated' || name === 'habit' || name === 'wave');
    // A greeting glances at the kid it greets (D-101): the face shifts that way.
    const glance = name === 'wave' && activity.kind === 'wave' && activity.toward && !this.reducedMotion ? activity.toward * GLANCE_PX : 0;
    if (this.wildType && !clip?.motion) {
      // The shared scheduler picks the clip and keeps its time; the wild sidecar only draws it.
      const fade = this.reducedMotion && name === 'spawn' ? this.spawnFade(time) : undefined;
      this.applyWild(this.wildFrame(name, time), canBlink ? this.blink(dt) : undefined, fade);
      this.drawMarks(undefined);
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
    this.apply(frame, canBlink ? this.blink(dt) : undefined, glance);
    // Under reduced motion `frame` is the clip's still frame, which carries no marks.
    this.drawMarks(frame.marks);
    this.shadow.alpha = held ? this.rig.effects.shadow.heldOpacity : 1;
    this.drawEffects(dt);
  }

  /**
   * Debug and review captures: holds the kid on clip `clipName` at `t` seconds, marks and all.
   * A wild kid shows a motion clip on its own body; any other clip it has no drawing for.
   */
  updatePosed(x: number, y: number, clipName: string, t: number): void {
    this.root.position.set(x, y);
    this.root.zIndex = y;
    this.lastClip = clipName;
    const clip = this.rig.clips[clipName];
    if (!clip || (this.wildType && !clip.motion)) return;
    const frame = frameAt(clip, t, false);
    this.apply(frame, undefined, 0);
    this.drawMarks(frame.marks);
    this.shadow.alpha = 1;
  }

  /**
   * A parent of a fusion on its way into the puff (D-101, motion v1 `fusion_parent`): no longer
   * in the sim, it plays the clip once from `t` seconds while the scene slides it to its partner.
   */
  updateGhost(x: number, y: number, t: number): void {
    this.root.position.set(x, y);
    this.root.zIndex = y;
    this.lastClip = 'fusion_parent';
    const clip = this.rig.clips.fusion_parent;
    if (clip) this.apply(frameAt(clip, t, false), undefined, 0);
    this.drawMarks(undefined);
    this.shadow.alpha = Math.max(0, this.rigC.alpha);
  }

  /**
   * A kid farming (D-089, Codex's kid_activity_v1 `farm_stomp`): fixed on its pad, it stomps,
   * left foot then right, with a soil stamp on each landing, in a 1.5 s loop whose phase is
   * its id's, so a field's kids never stomp together. A wild kid tamps with its own bob. It
   * blinks as usual. Reduced motion: standing, blinking only, no stamp. `ms`: the field's clock.
   */
  updateFarming(x: number, y: number, ms: number, dt: number): void {
    this.root.position.set(x, y);
    this.root.zIndex = y;
    this.lastClip = 'farming';
    this.shadow.alpha = 1;
    const clip = this.rig.clips[FARM_CLIP];
    const period = clip ? clip.frames.length / clip.fps : 0;
    const t = period > 0 ? (((ms / 1000 + ((this.kid.id * 1301) % 1500) / 1000) % period) + period) % period : 0;
    const index = clip ? Math.floor(t * clip.fps) % clip.frames.length : -1;
    this.showStamp(!this.reducedMotion && activityEffects[FARM_CLIP]?.onFrames.includes(index) === true);
    if (this.wildType) {
      this.applyWild(this.wildFrame(FARM_CLIP, t), this.blink(dt));
      return;
    }
    const frame = this.reducedMotion || !clip ? this.staticFrame(FARM_CLIP) : frameAt(clip, t, false);
    this.apply(frame, this.blink(dt));
    this.drawMarks(undefined);
  }

  /**
   * A kid in a decoration's slot (D-090, Codex's kid_activity_v1): fixed there, it plays the
   * slot's clip (`decoration_sitting`, `decoration_splash`) in a loop phased by its id, sorting
   * at `depth` between the decoration's back and front. A wild kid uses its own bob. Reduced
   * motion: the clip's still frame. Returns the frame index shown (-1: still), for the splash.
   */
  updateVisiting(x: number, y: number, clipName: string, depth: number, ms: number, dt: number): number {
    this.root.position.set(x, y);
    this.root.zIndex = depth;
    this.shadow.alpha = 1;
    this.showStamp(false);
    // A one-shot under way (the drop that seated it) and any effect (a discovery) play out
    // in their own time, not frozen until it leaves (Codex review round 3, #121).
    this.picker.advance(SEATED, false, dt);
    this.drawEffects(dt);
    this.lastClip = clipName;
    const clip = this.rig.clips[clipName];
    const period = clip ? clip.frames.length / clip.fps : 0;
    const t = period > 0 ? (((ms / 1000 + ((this.kid.id * 1301) % 1500) / 1000) % period) + period) % period : 0;
    const index = !this.reducedMotion && clip ? Math.floor(t * clip.fps) % clip.frames.length : -1;
    if (this.wildType) {
      this.applyWild(this.wildFrame(clipName, t), this.blink(dt));
      return index;
    }
    const frame = this.reducedMotion || !clip ? this.staticFrame(clipName) : frameAt(clip, t, false);
    this.apply(frame, this.blink(dt));
    this.drawMarks(undefined);
    return index;
  }

  /** Source px to world units for this kid (its rig scale and its look's). */
  get sourceScale(): number {
    return this.scaled.scale.x;
  }

  /** The farming stamp under the feet, on a landing (kid_activity_v1 `effects.farm_stomp`). */
  private showStamp(on: boolean): void {
    const fx = activityEffects[FARM_CLIP];
    if (!fx) return;
    if (on && !this.stamp) {
      const s = new Sprite(this.tex(fx.asset));
      s.anchor.set(fx.sourcePivot[0] / fx.canvas[0], fx.sourcePivot[1] / fx.canvas[1]);
      s.position.set(fx.offsetPx[0], fx.offsetPx[1]);
      // On the ground with the shadow: a wild kid's bob doesn't lift it.
      this.scaled.addChildAt(s, this.scaled.getChildIndex(this.shadow) + 1);
      this.stamp = s;
    }
    if (this.stamp) this.stamp.visible = on;
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
    this.rigC.scale.set(1, 1);
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

  private apply(frame: ClipFrame, blinkFace: string | undefined, glance = 0): void {
    const rig = frame.rig ?? {};
    const off = rig.offsetPx ?? [0, 0];
    this.rigC.position.set(off[0], off[1]);
    this.rigC.rotation = (rig.rotationDeg ?? 0) * DEG;
    const sc = rig.scale ?? [1, 1];
    this.rigC.scale.set(sc[0], sc[1]);
    // Clip opacity fades the kid's own layers only; effect opacity is independent (effects spec).
    this.rigC.alpha = rig.opacity ?? 1;

    const offsets = frame.attachmentOffsets ?? {};
    // Explicit states (sleep, wake) override the blink scheduler; "inherit" lets it blink.
    const explicit = frame.faceState && frame.faceState !== 'inherit' ? frame.faceState : undefined;
    const faceState = explicit ?? blinkFace ?? OPEN;
    const face = this.rig.faces[this.kid.look.face]!;
    this.face.texture = this.tex(face.states[faceState] ?? face.states[OPEN]!);
    const look = offsets.face_centre ?? [0, 0];
    if (this.wildType) {
      // A wild kid plays a motion clip on its one body: the rig transform, the face's state and
      // its glance (scaled as its face is). Body frames, attachments and costume parts don't apply.
      this.body.texture = this.tex(this.wildType.frames.stand!.asset);
      this.anchors = this.wildAnchors;
      const k = this.wildType.faceScale;
      this.faceAttach.position.set(this.wildType.faceAnchorPx[0] + (look[0] + glance) * k, this.wildType.faceAnchorPx[1] + look[1] * k);
      return;
    }
    const body = this.rig.bodies[this.kid.look.body]!;
    const bf = body.frames[frame.bodyFrame ?? 'stand'] ?? body.frames.stand!;
    this.body.texture = this.tex(bf.asset);
    for (const name in bf.attachments) this.anchors[name] = bf.attachments[name]!.position;
    setAttachment(this.faceAttach, bf.attachments.face_centre, glance ? [look[0] + glance, look[1]] : offsets.face_centre);

    const deltas = frame.componentTransforms ?? {};
    for (const p of this.parts) {
      setAttachment(p.attach, bf.attachments[p.attachTo], offsets[p.attachTo]);
      setDelta(p.delta, deltas[p.asset], p.pivot, p.fit);
    }
  }

  /** Shows this frame's motion marks (D-100), or none; hidden while the scene has them off. */
  private drawMarks(marks: MarkFrame[] | undefined): void {
    const list = this.marksShown && marks ? marks : [];
    for (let i = 0; i < list.length; i++) {
      const m = list[i]!;
      let s = this.markPool[i];
      if (!s) {
        s = new Sprite();
        s.anchor.set(0.5);
        this.markPool[i] = s;
      }
      const parent = m.behind ? this.marksBehind : this.marksAbove;
      if (s.parent !== parent) parent.addChild(s);
      s.texture = this.tex(m.asset);
      const from: Vec2 = (m.anchor ? this.anchors[m.anchor] : undefined) ?? [0, 0];
      s.position.set(from[0] + m.at[0], from[1] + m.at[1]);
      s.rotation = (m.rotationDeg ?? 0) * DEG;
      s.scale.set(m.scale ?? 1);
      s.alpha = m.opacity ?? 1;
      s.visible = true;
    }
    for (let i = list.length; i < this.marksUsed; i++) this.markPool[i]!.visible = false;
    this.marksUsed = list.length;
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

/** A clip's frame at 	ime seconds (looping or held at its end), as the map plays it. */
export function frameAt(clip: Clip, time: number, reverse: boolean): ClipFrame {
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

/**
 * A part's clip transform. It turns and scales about the point the part attaches to, or about
 * `pivotPx` on the part's canvas: in the delta's space that is its offset from the part's own
 * pivot, scaled by the part's fit for this body.
 */
function setDelta(c: Container, t: ComponentTransform | undefined, sourcePivot: Vec2, fit: Vec2): void {
  const o = t?.offsetPx ?? [0, 0];
  const about: Vec2 = t?.pivotPx ? [(t.pivotPx[0] - sourcePivot[0]) * fit[0], (t.pivotPx[1] - sourcePivot[1]) * fit[1]] : [0, 0];
  c.pivot.set(about[0], about[1]);
  c.position.set(o[0] + about[0], o[1] + about[1]);
  c.rotation = (t?.rotationDeg ?? 0) * DEG;
  const s = t?.scale ?? [1, 1];
  c.scale.set(s[0], s[1]);
}
