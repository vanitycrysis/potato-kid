import { kidWild, type Attachment, type KidRig, type WildData } from '../content/artData';
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
 * kid without art is a validation error, never a seed packet (GUI_MVP §7).
 */
/**
 * A discovered rare kid's portrait comes in its moving sleeve, wherever it is shown (D-094,
 * §27.7): a list's sleeve takes no room (`room: false`), drawn behind the row's words. `sleeve:
 * false` leaves it bare, for a caller that adds a sleeve with room of its own.
 */
export function portrait(rig: KidRig, type: KidId, sizePx: number, look?: { body: string; face: string }, wild: WildData | undefined = kidWild, opts: { sleeve?: boolean } = {}): HTMLElement {
  const bare = bareportrait(rig, type, sizePx, look, wild);
  const own = wild?.types[type];
  if (opts.sleeve === false || own?.collection !== 'rare') return bare;
  return withSleeve(rig, bare, sizePx, wildBox(rig, own.lifetimeBoundsPx), false);
}

/** A wild kid's lifetime box (absolute source px) in world units about its ground point, at scale 1. */
export function wildBox(rig: KidRig, px: readonly number[]): { left: number; top: number; right: number; bottom: number } {
  const k = rig.worldCanvasSize / rig.canvas[0];
  const [gx, gy] = rig.groundAnchor;
  return { left: (px[0]! - gx) * k, top: (px[1]! - gy) * k, right: (px[2]! - gx) * k, bottom: (px[3]! - gy) * k };
}

function bareportrait(rig: KidRig, type: KidId, sizePx: number, look?: { body: string; face: string }, wild: WildData | undefined = kidWild): HTMLElement {
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

  const own = wild?.types[type];
  if (own) {
    // A wild kid (kid_wild_v1 portraits): its own stand body, the face at its anchor, as on
    // the map; no shared body, no costume.
    const stand = own.frames.stand!;
    const at: Attachment = { position: own.faceAnchorPx, rotationDeg: 0, scale: [own.faceScale, own.faceScale] };
    canvas.append(layer(stand.asset, url(stand.asset), undefined, [0, 0]));
    canvas.append(layer(face.states.open!, url(face.states.open!), at, face.sourcePivot));
  } else {
    const part = (c: NonNullable<typeof costume>['components'][number]) =>
      layer(c.asset, url(c.asset), frame.attachments[c.attachTo], c.sourcePivot, c.fitByBody[bodyId] ?? [1, 1]);
    // Layer order back → body → face → front, as in the world (rigView).
    for (const c of costume?.components ?? []) if (c.layer === 'back') canvas.append(part(c));
    canvas.append(layer(frame.asset, url(frame.asset), undefined, [0, 0]));
    canvas.append(layer(face.states.open!, url(face.states.open!), frame.attachments.face_centre, face.sourcePivot));
    for (const c of costume?.components ?? []) if (c.layer === 'front') canvas.append(part(c));
  }

  const box = document.createElement('div');
  box.className = 'portrait';
  box.style.width = `${sizePx}px`;
  box.style.height = `${sizePx}px`;
  box.setAttribute('aria-hidden', 'true');
  box.append(canvas);
  return box;
}

/** The rare sleeve's source canvas centre (§16.2), as on the map. */
const SLEEVE = 'fx_rare_sparkle';
const SLEEVE_CENTRE = 128;

/**
 * A rare kid's portrait in its moving sleeve (D-094, GUI_MVP §27.7): the map's six-glint
 * sparkle, centred on the kid's lifetime box and sized as on the map (§16.2: max(.24,
 * (box width + 8) / 140) CSS px per source px), behind the kid and never clipped by the
 * portrait. It loops in CSS (`.portrait-sleeve`); reduced motion holds it still, and so does
 * being offscreen or in a hidden app, without catching up after. `box`: the lifetime box in
 * world units about the ground point, at look scale 1, as the portrait draws. `room`: the
 * layout reserves the whole sleeve (a card), or it takes none and lies behind what follows (a row).
 */
export function withSleeve(rig: KidRig, pic: HTMLElement, sizePx: number, box: { left: number; top: number; right: number; bottom: number }, room = true): HTMLElement {
  const src = assetUrl(SLEEVE);
  if (!src) return pic;
  const k = rig.canvas[0] / rig.worldCanvasSize;
  const css = sizePx / rig.canvas[0];
  const [gx, gy] = rig.groundAnchor;
  const left = (box.left * k + gx) * css;
  const right = (box.right * k + gx) * css;
  const top = (box.top * k + gy) * css;
  const bottom = (box.bottom * k + gy) * css;
  const s = Math.max(0.24, (right - left + 8) / 140);
  const art = document.createElement('div');
  art.className = 'portrait-sleeve-art';
  art.style.transform = `scale(${s}) translate(${-SLEEVE_CENTRE}px, ${-SLEEVE_CENTRE}px)`;
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.draggable = false;
  const t = trimOf(SLEEVE);
  if (t) {
    img.style.left = `${t[0]}px`;
    img.style.top = `${t[1]}px`;
    img.style.width = `${t[2]}px`;
    img.style.height = `${t[3]}px`;
  }
  art.append(img);
  const sleeve = document.createElement('div');
  sleeve.className = 'portrait-sleeve';
  sleeve.dataset.asset = SLEEVE;
  sleeve.style.left = `${(left + right) / 2}px`;
  sleeve.style.top = `${(top + bottom) / 2}px`;
  sleeve.append(art);
  watchSleeve(sleeve);
  const wrap = document.createElement('div');
  wrap.className = 'portrait-wrap';
  wrap.style.width = `${sizePx}px`;
  wrap.style.height = `${sizePx}px`;
  wrap.append(sleeve, pic);
  if (!room) return wrap;
  // Room for the whole sleeve at its largest, plus 8 px (§27.7): the layout grows, nothing clips.
  const [tx, ty, tw, th] = t ?? [0, 0, 256, 256];
  const reach = s * 1.02;
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const margin = (inside: number, edge: number) => `${Math.max(0, Math.ceil(edge - inside + 8 + 1))}px`;
  wrap.style.marginTop = margin(cy, (SLEEVE_CENTRE - ty) * reach);
  wrap.style.marginBottom = margin(sizePx - cy, (ty + th - SLEEVE_CENTRE) * reach);
  wrap.style.marginLeft = margin(cx, (SLEEVE_CENTRE - tx) * reach);
  wrap.style.marginRight = margin(sizePx - cx, (tx + tw - SLEEVE_CENTRE) * reach);
  return wrap;
}

/**
 * Sleeves pause while offscreen and while the app is hidden, and resume where they were
 * (§27.7): no catch-up. One observer and one listener for them all.
 */
let sleeveObserver: IntersectionObserver | null | undefined;
function watchSleeve(sleeve: HTMLElement): void {
  if (sleeveObserver === undefined) {
    sleeveObserver =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            for (const e of entries) e.target.classList.toggle('is-offscreen', !e.isIntersecting);
          });
    const hidden = () => document.documentElement.classList.toggle('app-hidden', document.hidden);
    document.addEventListener('visibilitychange', hidden);
    hidden();
  }
  sleeveObserver?.observe(sleeve);
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
