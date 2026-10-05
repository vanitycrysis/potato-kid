import type { Attachment, KidRig } from '../content/artData';
import type { KidId } from '../content/types';
import { assetUrl, trimOf } from '../render/art';

// Kid portraits for the DOM GUI (docs/GUI_MVP.md §7 "Portrait contract"): the same
// exported layers the world uses, composed with the rig's own transforms. Neutral
// exemplar: round body standing, classic face open, scale 1.00; the whole 256 canvas
// scales uniformly into the requested size. No new art and no Pixi render target.

const BODY = 'round';
const FRAME = 'stand';
const FACE = 'classic';

/** A positioned layer: placed at an attachment, then offset so its source pivot sits there. */
function layer(name: string, src: string, at: Attachment | undefined, pivot: [number, number], fit: [number, number] = [1, 1]): HTMLElement {
  const holder = document.createElement('div');
  holder.className = 'portrait-layer';
  // Which asset, by name: a small one may be inlined, so its URL won't say (tests, debugging).
  holder.dataset.asset = name;
  const p = at?.position ?? [0, 0];
  const s = at?.scale ?? [1, 1];
  holder.style.transform = `translate(${p[0]}px, ${p[1]}px) rotate(${at?.rotationDeg ?? 0}deg) scale(${s[0]}, ${s[1]})`;
  // The authored canvas, with the (possibly cropped) image at its trim offset (ROSTER-SCALE).
  const canvas = document.createElement('div');
  canvas.className = 'portrait-source';
  canvas.style.transform = `scale(${fit[0]}, ${fit[1]}) translate(${-pivot[0]}px, ${-pivot[1]}px)`;
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.draggable = false;
  const t = trimOf(name);
  if (t) {
    img.style.left = `${t[0]}px`;
    img.style.top = `${t[1]}px`;
    img.style.width = `${t[2]}px`;
    img.style.height = `${t[3]}px`;
  }
  canvas.append(img);
  holder.append(canvas);
  return holder;
}

/**
 * A portrait of `type` at `sizePx` CSS px. Throws if any layer is missing: a discovered
 * kid without art is a validation error, never a seed packet (GUI_MVP §7). `rare`: a rare
 * kid's own look (GUI_MVP §16.1-16.2; small portraits omit the sleeve). A Mini at its saved
 * scale about the ground point, its pebbles at their normal placement; any other variant
 * with its mark placed as on the map (centred, 36/55 of the canvas wide, its visible bottom
 * 4/55 above the body's box), kid and mark then fitted together into the box.
 */
export function portrait(rig: KidRig, type: KidId, sizePx: number, look?: { body: string; face: string }, rare?: { variant: string; miniScale: number }): HTMLElement {
  const url = (name: string) => {
    const u = assetUrl(name);
    if (!u) throw new Error(`Missing art "${name}" for the ${type} portrait`);
    return u;
  };
  const [cw, ch] = rig.canvas;
  // A particular kid's body and face, else the neutral exemplar.
  const bodyId = look && rig.bodies[look.body] ? look.body : BODY;
  const frame = rig.bodies[bodyId]!.frames[FRAME]!;
  const face = rig.faces[look && rig.faces[look.face] ? look.face : FACE]!;
  const costume = rig.costumes[type];

  const canvas = document.createElement('div');
  canvas.className = 'portrait-canvas';
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;
  canvas.style.transform = `scale(${sizePx / cw})`;

  const part = (c: NonNullable<typeof costume>['components'][number]) =>
    layer(c.asset, url(c.asset), frame.attachments[c.attachTo], c.sourcePivot, c.fitByBody[bodyId] ?? [1, 1]);
  // Layer order back → body → face → front, as in the world (rigView).
  for (const c of costume?.components ?? []) if (c.layer === 'back') canvas.append(part(c));
  canvas.append(layer(frame.asset, url(frame.asset), undefined, [0, 0]));
  canvas.append(layer(face.states.open!, url(face.states.open!), frame.attachments.face_centre, face.sourcePivot));
  for (const c of costume?.components ?? []) if (c.layer === 'front') canvas.append(part(c));
  if (rare?.variant === 'mini') {
    // The kid's own layers shrink about the ground point; the pebbles keep their place.
    const kid = document.createElement('div');
    kid.className = 'portrait-layer';
    const [gx, gy] = rig.groundAnchor;
    kid.style.transform = `translate(${gx}px, ${gy}px) scale(${rare.miniScale}) translate(${-gx}px, ${-gy}px)`;
    kid.append(...canvas.childNodes);
    canvas.append(kid, layer('fx_variant_mini', url('fx_variant_mini'), undefined, [0, 0]));
  } else if (rare) {
    const name = `fx_variant_${rare.variant}`;
    const t = trimOf(name) ?? [0, 0, cw, ch, cw, ch];
    const [bl, bt, br] = rig.bodies[bodyId]!.boundsPx;
    const width = (cw * 36) / 55;
    const k = width / t[2];
    const markTop = bt - (cw * 4) / 55 - t[3] * k;
    // Its visible bottom centre lands 4/55 of the canvas above the box, centred on it.
    canvas.append(layer(name, url(name), { position: [(bl + br) / 2, bt - (cw * 4) / 55], rotationDeg: 0, scale: [k, k] }, [t[0] + t[2] / 2, t[1] + t[3]]));
    // Kid and mark fitted into the box together, centred across.
    const tall = ch - Math.min(0, markTop);
    const f = sizePx / tall;
    canvas.style.transform = `scale(${f}) translate(${(sizePx / f - cw) / 2}px, ${-Math.min(0, markTop)}px)`;
  }

  const box = document.createElement('div');
  box.className = 'portrait';
  box.style.width = `${sizePx}px`;
  box.style.height = `${sizePx}px`;
  box.setAttribute('aria-hidden', 'true');
  box.append(canvas);
  return box;
}

/**
 * Portraits composed only when they scroll near view (long lists, GUI_MVP §7): each box
 * reserves its size at once, so rows never jump. One observer serves a whole list and is
 * re-targeted whenever what scrolls changes (the body, a tight sheet or the page), so
 * lazy loading holds in every layout (Codex review, PR #41).
 */
export class LazyPortraits {
  private io: IntersectionObserver | null = null;
  private root: Element | null | undefined = undefined;
  private readonly waiting = new Map<Element, () => void>();

  constructor(
    private readonly rig: KidRig,
    private readonly sizePx: number,
  ) {}

  /** A reserved box for `type`, composed when it nears view. */
  add(type: KidId): HTMLElement {
    const box = document.createElement('div');
    box.className = 'portrait';
    box.style.width = `${this.sizePx}px`;
    box.style.height = `${this.sizePx}px`;
    box.setAttribute('aria-hidden', 'true');
    this.waiting.set(box, () => box.replaceWith(portrait(this.rig, type, this.sizePx)));
    this.io?.observe(box);
    return box;
  }

  /** Watches against `root`, the element that scrolls now (null: the page itself). */
  watch(root: Element | null): void {
    if (root === this.root) return;
    this.root = root;
    this.io?.disconnect();
    this.io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const compose = e.isIntersecting ? this.waiting.get(e.target) : undefined;
          if (!compose) continue;
          this.waiting.delete(e.target);
          this.io?.unobserve(e.target);
          compose();
        }
      },
      // About one row of overscan above and below (GUI_MVP §7).
      { root, rootMargin: `${this.sizePx + 80}px 0px` },
    );
    for (const box of this.waiting.keys()) this.io.observe(box);
  }

  /** The list is gone: nothing waits any more. */
  dispose(): void {
    this.io?.disconnect();
    this.io = null;
    this.root = undefined;
    this.waiting.clear();
  }

  /** Portraits still waiting (tests). */
  get pending(): number {
    return this.waiting.size;
  }
}
