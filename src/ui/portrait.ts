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
export function portrait(rig: KidRig, type: KidId, sizePx: number): HTMLElement {
  const url = (name: string) => {
    const u = assetUrl(name);
    if (!u) throw new Error(`Missing art "${name}" for the ${type} portrait`);
    return u;
  };
  const [cw, ch] = rig.canvas;
  const frame = rig.bodies[BODY]!.frames[FRAME]!;
  const face = rig.faces[FACE]!;
  const costume = rig.costumes[type];

  const canvas = document.createElement('div');
  canvas.className = 'portrait-canvas';
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;
  canvas.style.transform = `scale(${sizePx / cw})`;

  const part = (c: NonNullable<typeof costume>['components'][number]) =>
    layer(c.asset, url(c.asset), frame.attachments[c.attachTo], c.sourcePivot, c.fitByBody[BODY] ?? [1, 1]);
  // Layer order back → body → face → front, as in the world (rigView).
  for (const c of costume?.components ?? []) if (c.layer === 'back') canvas.append(part(c));
  canvas.append(layer(frame.asset, url(frame.asset), undefined, [0, 0]));
  canvas.append(layer(face.states.open!, url(face.states.open!), frame.attachments.face_centre, face.sourcePivot));
  for (const c of costume?.components ?? []) if (c.layer === 'front') canvas.append(part(c));

  const box = document.createElement('div');
  box.className = 'portrait';
  box.style.width = `${sizePx}px`;
  box.style.height = `${sizePx}px`;
  box.setAttribute('aria-hidden', 'true');
  box.append(canvas);
  return box;
}

/**
 * A portrait that is composed only when it scrolls near view (long lists, GUI_MVP §7): the
 * box reserves its size at once, so rows never jump. `root` is the scrolling container.
 */
export function lazyPortrait(rig: KidRig, type: KidId, sizePx: number, root: HTMLElement): HTMLElement {
  const box = document.createElement('div');
  box.className = 'portrait';
  box.style.width = `${sizePx}px`;
  box.style.height = `${sizePx}px`;
  box.setAttribute('aria-hidden', 'true');
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      box.replaceWith(portrait(rig, type, sizePx));
    },
    // About one row of overscan above and below (GUI_MVP §7).
    { root, rootMargin: `${sizePx + 80}px 0px` },
  );
  io.observe(box);
  return box;
}
