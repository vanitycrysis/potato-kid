import { kidWild, type Attachment, type ClipFrame, type ComponentTransform, type KidRig, type Vec2, type WildData, type WildFrame } from '../content/artData';
import type { KidId } from '../content/types';
import { assetUrl, trimOf } from '../render/art';
import { frameAt } from '../render/rigView';

// A kid portrait that can play a clip (the new-kid popup's wave, D-087, GUI_MVP §27.4): the
// same layers and rig transforms as `portrait`, re-posed each frame from the rig's clip, as the
// map's rigView does. A wild kid plays its own frames (its greeting bob for the wave). No new
// art, no Pixi: DOM layers whose sources and transforms change.

const OPEN = 'open';

/** CSS for an attachment (position + clip offset, rotation, scale), as rigView's setAttachment. */
function attachment(a: Attachment | undefined, offset: Vec2 | undefined): string {
  const p = a?.position ?? [0, 0];
  const o = offset ?? [0, 0];
  const s = a?.scale ?? [1, 1];
  return `translate(${p[0] + o[0]}px, ${p[1] + o[1]}px) rotate(${a?.rotationDeg ?? 0}deg) scale(${s[0]}, ${s[1]})`;
}

/** CSS for a clip's component transform, as rigView's setDelta. */
function delta(t: ComponentTransform | undefined): string {
  const o = t?.offsetPx ?? [0, 0];
  const s = t?.scale ?? [1, 1];
  return `translate(${o[0]}px, ${o[1]}px) rotate(${t?.rotationDeg ?? 0}deg) scale(${s[0]}, ${s[1]})`;
}

/** An image of `asset` inside its authored canvas, at its trim offset, the pivot at the origin. */
function source(asset: string, pivot: [number, number], fit: [number, number] = [1, 1]): { node: HTMLElement; img: HTMLImageElement } {
  const node = document.createElement('div');
  node.className = 'portrait-source';
  node.style.transform = `scale(${fit[0]}, ${fit[1]}) translate(${-pivot[0]}px, ${-pivot[1]}px)`;
  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  node.append(img);
  setImage(img, asset);
  return { node, img };
}

function setImage(img: HTMLImageElement, asset: string): void {
  if (img.dataset.asset === asset) return;
  const url = assetUrl(asset);
  if (!url) throw new Error(`Missing art "${asset}" for an animated portrait`);
  img.dataset.asset = asset;
  img.src = url;
  const t = trimOf(asset);
  img.style.left = `${t?.[0] ?? 0}px`;
  img.style.top = `${t?.[1] ?? 0}px`;
  img.style.width = `${t?.[2] ?? 256}px`;
  img.style.height = `${t?.[3] ?? 256}px`;
}

function holder(className = 'portrait-layer'): HTMLElement {
  const h = document.createElement('div');
  h.className = className;
  return h;
}

export class AnimatedPortrait {
  readonly node: HTMLElement;
  private readonly rigEl: HTMLElement;
  private readonly body: HTMLImageElement;
  private readonly face: HTMLImageElement;
  private readonly faceAttach: HTMLElement;
  private readonly parts: { attachTo: string; asset: string; attach: HTMLElement; delta: HTMLElement }[] = [];
  private readonly bodyId: string;
  private readonly faceId: string;
  private readonly wildType: WildData['types'][string] | undefined;
  /** The clip playing and how far in (seconds), or null: standing. */
  private clip: { name: string; time: number } | null = null;

  constructor(
    private readonly rig: KidRig,
    readonly type: KidId,
    sizePx: number,
    look: { body: string; face: string; scale?: number },
    private reducedMotion: boolean,
    private readonly wild: WildData | undefined = kidWild,
  ) {
    const [cw, ch] = rig.canvas;
    this.bodyId = rig.bodies[look.body] ? look.body : 'round';
    this.faceId = rig.faces[look.face] ? look.face : 'classic';
    this.wildType = wild?.types[type];
    const canvas = holder('portrait-canvas');
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    this.canvas = canvas;
    // Its saved scale, about the ground point; held to 8 px inside the slot if it would
    // overflow (§27.4), so nothing is cropped.
    const scaler = holder('portrait-layer');
    scaler.style.width = `${cw}px`;
    scaler.style.height = `${ch}px`;
    scaler.style.transformOrigin = `${rig.groundAnchor[0]}px ${rig.groundAnchor[1]}px`;
    this.scale = this.contained(look.scale ?? 1);
    scaler.style.transform = `scale(${this.scale})`;
    // The clip's root transform turns about the ground point, as on the map.
    this.rigEl = holder('portrait-layer portrait-rig');
    this.rigEl.style.width = `${cw}px`;
    this.rigEl.style.height = `${ch}px`;
    this.rigEl.style.transformOrigin = `${rig.groundAnchor[0]}px ${rig.groundAnchor[1]}px`;
    scaler.append(this.rigEl);
    canvas.append(scaler);
    const face = rig.faces[this.faceId]!;
    const faceSource = source(face.states[OPEN]!, face.sourcePivot);
    this.face = faceSource.img;
    this.faceAttach = holder();
    this.faceAttach.append(faceSource.node);
    if (this.wildType) {
      const own = this.wildType;
      const body = source(own.frames.stand!.asset, [0, 0]);
      this.body = body.img;
      const bodyLayer = holder();
      bodyLayer.append(body.node);
      this.faceAttach.style.transform = attachment({ position: own.faceAnchorPx, rotationDeg: 0, scale: [own.faceScale, own.faceScale] }, undefined);
      this.rigEl.append(bodyLayer, this.faceAttach);
    } else {
      const costume = rig.costumes[type];
      const part = (c: NonNullable<typeof costume>['components'][number]) => {
        const attach = holder();
        const d = holder();
        d.append(source(c.asset, c.sourcePivot, c.fitByBody[this.bodyId] ?? [1, 1]).node);
        attach.append(d);
        this.parts.push({ attachTo: c.attachTo, asset: c.asset, attach, delta: d });
        return attach;
      };
      const body = source(rig.bodies[this.bodyId]!.frames.stand!.asset, [0, 0]);
      this.body = body.img;
      const bodyLayer = holder();
      bodyLayer.append(body.node);
      // Back → body → face → front, as in the world (rigView).
      for (const c of costume?.components ?? []) if (c.layer === 'back') this.rigEl.append(part(c));
      this.rigEl.append(bodyLayer, this.faceAttach);
      for (const c of costume?.components ?? []) if (c.layer === 'front') this.rigEl.append(part(c));
    }
    const box = document.createElement('div');
    box.className = 'portrait portrait-animated';
    box.setAttribute('aria-hidden', 'true');
    box.append(canvas);
    this.node = box;
    this.resize(sizePx);
    this.pose();
  }

  private readonly canvas: HTMLElement;
  /** The scale drawn: the saved one, contained. */
  readonly scale: number;

  /** A new slot size (a rotation): the same portrait, its clip going on where it was. */
  resize(sizePx: number): void {
    this.node.style.width = `${sizePx}px`;
    this.node.style.height = `${sizePx}px`;
    this.canvas.style.transform = `scale(${sizePx / this.rig.canvas[0]})`;
  }

  /**
   * `s`, or less if the lifetime box scaled by it about the ground point would come within
   * 8 source-canvas px of the edge (at 256 px, 8 CSS px).
   */
  private contained(s: number): number {
    const [cw, ch] = this.rig.canvas;
    const [gx, gy] = this.rig.groundAnchor;
    const b = this.wildType?.lifetimeBoundsPx ?? this.rig.bodies[this.bodyId]!.boundsPx;
    const [l, t, r, bt] = b;
    const room = 8;
    const fit = Math.min(
      l < gx ? (gx - room) / (gx - l) : Infinity,
      r > gx ? (cw - room - gx) / (r - gx) : Infinity,
      t < gy ? (gy - room) / (gy - t) : Infinity,
      bt > gy ? (ch - room - gy) / (bt - gy) : Infinity,
    );
    return Math.max(0.1, Math.min(s, Math.max(1, fit)));
  }

  /** Plays clip `name` from its start, then stands; reduced motion stays still. */
  play(name: string): void {
    if (this.reducedMotion) return;
    this.clip = { name, time: 0 };
    this.pose();
  }

  /** The motion preference changed: turned on, it stands still at once (§27.4). */
  setReducedMotion(on: boolean): void {
    this.reducedMotion = on;
    if (on && this.clip) {
      this.clip = null;
      this.pose();
    }
  }

  /** Whether a clip is still playing. */
  get playing(): boolean {
    return this.clip !== null;
  }

  /** Advances the clip by `dt` seconds. */
  tick(dt: number): void {
    if (!this.clip) return;
    this.clip.time += dt;
    if (this.clip.time >= this.duration(this.clip.name)) this.clip = null;
    this.pose();
  }

  /** Test hook: the body art shown now. */
  get bodyAsset(): string {
    return this.body.dataset.asset ?? '';
  }

  private duration(name: string): number {
    if (this.wildType) {
      const own = this.wild?.clips[name];
      const c = own?.frames ? own : own?.fallback ? this.wild?.clips[own.fallback] : undefined;
      return (c?.frames ?? []).reduce((a, f) => a + f.durationMs, 0) / 1000;
    }
    const clip = this.rig.clips[name];
    return clip ? clip.frames.length / clip.fps : 0;
  }

  private pose(): void {
    if (this.wildType) return this.poseWild();
    const clip = this.clip ? this.rig.clips[this.clip.name] : undefined;
    const frame: ClipFrame = clip && this.clip ? frameAt(clip, this.clip.time, false) : { bodyFrame: 'stand', faceState: 'inherit' };
    const body = this.rig.bodies[this.bodyId]!;
    const bf = body.frames[frame.bodyFrame ?? 'stand'] ?? body.frames.stand!;
    setImage(this.body, bf.asset);
    const r = frame.rig ?? {};
    const off = r.offsetPx ?? [0, 0];
    this.rigEl.style.transform = `translate(${off[0]}px, ${off[1]}px) rotate(${r.rotationDeg ?? 0}deg)`;
    this.rigEl.style.opacity = String(r.opacity ?? 1);
    const offsets = frame.attachmentOffsets ?? {};
    const face = this.rig.faces[this.faceId]!;
    const state = frame.faceState && frame.faceState !== 'inherit' ? frame.faceState : OPEN;
    setImage(this.face, face.states[state] ?? face.states[OPEN]!);
    this.faceAttach.style.transform = attachment(bf.attachments.face_centre, offsets.face_centre);
    const deltas = frame.componentTransforms ?? {};
    for (const p of this.parts) {
      p.attach.style.transform = attachment(bf.attachments[p.attachTo], offsets[p.attachTo]);
      p.delta.style.transform = delta(deltas[p.asset]);
    }
  }

  private poseWild(): void {
    const t = this.wildType!;
    let f: WildFrame = { durationMs: 0, frame: 'stand', offsetPx: [0, 0], faceState: 'inherit', opacity: 1 };
    if (this.clip) {
      const own = this.wild?.clips[this.clip.name];
      const c = own?.frames ? own : own?.fallback ? this.wild?.clips[own.fallback] : undefined;
      let ms = this.clip.time * 1000;
      for (const x of c?.frames ?? []) {
        if (ms < x.durationMs) {
          f = x;
          break;
        }
        ms -= x.durationMs;
      }
    }
    setImage(this.body, (t.frames[f.frame] ?? t.frames.stand)!.asset);
    this.rigEl.style.transform = `translate(${f.offsetPx[0]}px, ${f.offsetPx[1]}px)`;
    this.rigEl.style.opacity = String(f.opacity);
    const face = this.rig.faces[this.faceId]!;
    const state = f.faceState && f.faceState !== 'inherit' ? f.faceState : OPEN;
    setImage(this.face, face.states[state] ?? face.states[OPEN]!);
  }
}
