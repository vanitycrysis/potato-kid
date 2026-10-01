import { Container, Sprite, type Texture } from 'pixi.js';
import type { Attachment, Clip, ClipFrame, ComponentTransform, KidRig, Vec2 } from '../content/artData';
import type { Activity, Kid } from '../sim/world';

const DEG = Math.PI / 180;
const OPEN = 'open';

/**
 * Draws one kid from ChatGPT/Codex's rig (kid_rig_v2.json), following the spec's
 * transform order exactly with nested containers:
 *
 *   root (world ground point) → scale (appearance × worldCanvasSize/256)
 *     → rig (clip offset/rotation about the ground) → canvas (−groundAnchor)
 *       → back components, body, face, front components
 *   component: attachment (position+offset, rotation, scale) → delta (clip component
 *   transform) → sprite (anchor = sourcePivot, scale = fitByBody)
 *
 * No motion is invented here (D-041): every pose and wiggle comes from authored clips.
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
  private clipName = '';
  private clipTime = 0;
  private blinkIn: number;
  private blinkTime = -1;
  private lastKind: Activity['kind'] | 'held' | '' = '';

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

    this.rigC.addChild(this.canvas);
    this.scaled.addChild(this.rigC);
    this.root.addChild(this.scaled);
    this.blinkIn = this.blinkDelay();
  }

  /** Position comes from the sim (already interpolated or resolved); `dt` is real seconds. */
  update(x: number, y: number, activity: Activity, held: boolean, dt: number): void {
    this.root.position.set(x, y);
    this.root.zIndex = held ? 1e6 : y;

    const kind = held ? 'held' : activity.kind;
    if (kind !== this.lastKind) {
      this.lastKind = kind;
      this.clipTime = 0;
    } else {
      this.clipTime += dt;
    }
    const { clip, name, time, reverse } = this.pickClip(activity, held);
    if (name !== this.clipName) this.clipName = name;
    const frame = this.reducedMotion || !clip ? this.staticFrame(name) : frameAt(clip, time, reverse);

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
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }

  // --- internals ---------------------------------------------------------

  private pickClip(a: Activity, held: boolean): { clip: Clip | undefined; name: string; time: number; reverse: boolean } {
    const clips = this.rig.clips;
    const len = (n: string) => (clips[n] ? clips[n].frames.length / clips[n].fps : 0);
    if (held) return { clip: undefined, name: 'held', time: 0, reverse: false }; // deferred clip → reducedMotion static
    switch (a.kind) {
      case 'walk':
        return { clip: clips.walk, name: 'walk', time: this.clipTime, reverse: false };
      case 'pause':
        return { clip: clips.idle, name: 'idle', time: this.clipTime, reverse: false };
      case 'look':
        return { clip: clips.look_around, name: 'look_around', time: this.clipTime, reverse: false };
      case 'sit': {
        const down = len('sit_down');
        const elapsed = a.total - a.left;
        if (elapsed < down) return { clip: clips.sit_down, name: 'sit_down', time: elapsed, reverse: false };
        // Until a stand-up drawing exists, the authored sit-down plays backwards (spec: stand/sit fallback).
        if (a.left < down) return { clip: clips.sit_down, name: 'sit_down', time: down - a.left, reverse: true };
        return { clip: clips.seated, name: 'seated', time: elapsed - down, reverse: false };
      }
      case 'sleep': {
        const down = len('sit_down');
        const wake = len('wake');
        const elapsed = a.total - a.left;
        if (elapsed < down) return { clip: clips.sit_down, name: 'sit_down', time: elapsed, reverse: false };
        if (a.left < wake) return { clip: clips.wake, name: 'wake', time: wake - a.left, reverse: false };
        return { clip: clips.sleep, name: 'sleep', time: elapsed - down, reverse: false };
      }
    }
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
    this.root.alpha = rig.opacity ?? 1;

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
