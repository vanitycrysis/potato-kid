// Motion authoring helpers (docs/ART.md, "Animation"). A clip is written as a function of
// time that returns a pose; `bake` samples it at 12 frames a second into the frame list the
// engine plays. Nothing here runs in the game: `npm run motion:build` writes the result to
// art/data/kid_motion_v1.json.

export const FPS = 12;
const TAU = Math.PI * 2;

export const sin = (turns) => Math.sin(turns * TAU);
export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const lerp = (a, b, k) => a + (b - a) * k;
/** Eases, each mapping 0..1 to 0..1. */
export const ease = {
  linear: (k) => k,
  in: (k) => k * k,
  out: (k) => 1 - (1 - k) * (1 - k),
  inOut: (k) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k)),
  /** Past the target and back: a little overshoot. */
  back: (k) => 1 + 2.4 * (k - 1) ** 3 + 1.4 * (k - 1) ** 2,
};

/**
 * A value that follows keyframes: keys([[0, 1], [0.2, 1.1, 'out'], [0.5, 1]]) gives a function
 * of time. A key's ease shapes the way into it. Before the first key and after the last, the
 * value holds.
 */
export function keys(list) {
  return (t) => {
    if (t <= list[0][0]) return list[0][1];
    for (let i = 1; i < list.length; i++) {
      const [t1, v1, e] = list[i];
      if (t <= t1) {
        const [t0, v0] = list[i - 1];
        return lerp(v0, v1, (ease[e ?? 'inOut'])(clamp01((t - t0) / (t1 - t0))));
      }
    }
    return list[list.length - 1][1];
  };
}

/** The latest of [[time, value], ...] at or before t: for body frames and face states. */
export function steps(list) {
  return (t) => {
    let v = list[0][1];
    for (const [at, value] of list) if (t >= at - 1e-9) v = value;
    return v;
  };
}

const r1 = (n) => Math.round(n * 10) / 10;
const r3 = (n) => Math.round(n * 1000) / 1000;
const zero = (n) => Math.abs(n) < 0.05;

/**
 * Samples `pose(t)` at 12 fps for `seconds` and returns an engine clip. A pose may set:
 *   body: body frame name ('stand')           face: face state ('inherit')
 *   x, y: rig offset px                       rot: degrees, clockwise, about the ground point
 *   sx, sy: rig scale about the ground point  alpha: the kid's opacity
 *   faceX, faceY: face offset px              hands: { hand_right: [dx, dy] } attachment offsets
 *   parts: { asset: { x, y, rot, sx, sy, about } }   marks: [{ asset, x, y, rot, s, a, behind, anchor }]
 *   (a part turns and scales about the point it attaches to; `about: 'centre'` makes that the
 *   middle of its drawing, for wheels and anything that spins in place)
 *   fx: frame of the clip's shared effect
 * Offsets and mark positions are source px on the 256 canvas. A mark with an `anchor`
 * ('head_top', 'hand_right', 'torso', 'face_centre') is placed from that attachment of the
 * kid's own body instead, so it sits right on every body shape. `pivotY` on a pose (px above the
 * ground) turns `rot` about that height instead of the feet, so a rocking kid sways half as far.
 */
export function bake(seconds, pose, { loop = false, effect, note } = {}) {
  const n = Math.max(1, Math.round(seconds * FPS));
  const frames = [];
  for (let i = 0; i < n; i++) {
    const p = pose(i / FPS, i, n) ?? {};
    const f = { bodyFrame: p.body ?? 'stand', faceState: p.face ?? 'inherit' };
    const rot = p.rot ?? 0;
    // Rotation is about the ground point; shifting x keeps the height `pivotY` still instead.
    const x = (p.x ?? 0) - (p.pivotY ? p.pivotY * Math.sin((rot * Math.PI) / 180) : 0);
    const y = p.y ?? 0;
    const rig = {};
    if (!zero(x) || !zero(y)) rig.offsetPx = [r1(x), r1(y)];
    if (!zero(rot)) rig.rotationDeg = r1(rot);
    const sx = p.sx ?? 1;
    const sy = p.sy ?? 1;
    if (Math.abs(sx - 1) > 0.0005 || Math.abs(sy - 1) > 0.0005) rig.scale = [r3(sx), r3(sy)];
    if (p.alpha !== undefined && p.alpha < 0.999) rig.opacity = r3(Math.max(0, p.alpha));
    if (Object.keys(rig).length) f.rig = rig;
    const offsets = { ...(p.hands ?? {}) };
    if (!zero(p.faceX ?? 0) || !zero(p.faceY ?? 0)) offsets.face_centre = [r1(p.faceX ?? 0), r1(p.faceY ?? 0)];
    for (const k of Object.keys(offsets)) offsets[k] = offsets[k].map(r1);
    if (Object.keys(offsets).length) f.attachmentOffsets = offsets;
    const parts = {};
    for (const [asset, d] of Object.entries(p.parts ?? {})) {
      const t = {};
      if (!zero(d.x ?? 0) || !zero(d.y ?? 0)) t.offsetPx = [r1(d.x ?? 0), r1(d.y ?? 0)];
      if (!zero(d.rot ?? 0)) t.rotationDeg = r1(d.rot);
      if (Math.abs((d.sx ?? 1) - 1) > 0.0005 || Math.abs((d.sy ?? 1) - 1) > 0.0005) t.scale = [r3(d.sx ?? 1), r3(d.sy ?? 1)];
      // What the part turns and scales about: 'centre' (of its drawing; the build fills it in),
      // or a point on its canvas. Without it, the point it attaches to.
      if (d.about && (t.rotationDeg !== undefined || t.scale !== undefined)) t.pivotPx = d.about;
      if (Object.keys(t).length) parts[asset] = t;
    }
    if (Object.keys(parts).length) f.componentTransforms = parts;
    const marks = (p.marks ?? []).filter((m) => m && (m.a ?? 1) > 0.02).map((m) => {
      const o = { asset: m.asset, at: [r1(m.x), r1(m.y)] };
      if (!zero(m.rot ?? 0)) o.rotationDeg = r1(m.rot);
      if (Math.abs((m.s ?? 1) - 1) > 0.0005) o.scale = r3(m.s);
      if ((m.a ?? 1) < 0.999) o.opacity = r3(m.a);
      if (m.behind) o.behind = true;
      if (m.anchor) o.anchor = m.anchor;
      return o;
    });
    if (marks.length) f.marks = marks;
    if (p.fx !== undefined) f.effectFrame = p.fx;
    frames.push(f);
  }
  return { fps: FPS, loop, motion: true, ...(effect ? { effect } : {}), ...(note ? { note } : {}), frames };
}

/**
 * How far a clip's rig transform carries a kid beyond `box` ([l, t, r, b] on the canvas), as
 * [left, top, right, bottom] px. The build uses it to size the margin every lifetime box
 * grows by, so moving kids still never overlap (D-043).
 *
 * The kid is taken as a rounded square filling its box (a superellipse): rounder than the box,
 * as kids are, but still reaching toward the corners where a wide hat or canopy can be. It is
 * an estimate; `npm run art:kids` checks the real drawings in every frame of their clips.
 */
export function excursion(clip, box, ground) {
  const out = [0, 0, 0, 0];
  const [gx, gy] = ground;
  const [cx, cy] = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
  const [rx, ry] = [(box[2] - box[0]) / 2, (box[3] - box[1]) / 2];
  const outline = [];
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * TAU;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    const k = (Math.abs(c) ** 4 + Math.abs(s) ** 4) ** (-1 / 4);
    outline.push([cx + rx * k * c, cy + ry * k * s]);
  }
  for (const f of clip.frames) {
    const rig = f.rig ?? {};
    const [ox, oy] = rig.offsetPx ?? [0, 0];
    const [sx, sy] = rig.scale ?? [1, 1];
    const a = ((rig.rotationDeg ?? 0) * Math.PI) / 180;
    if ((rig.opacity ?? 1) <= 0) continue;
    for (const [px, py] of outline) {
      const lx = (px - gx) * sx;
      const ly = (py - gy) * sy;
      const x = gx + ox + lx * Math.cos(a) - ly * Math.sin(a);
      const y = gy + oy + lx * Math.sin(a) + ly * Math.cos(a);
      out[0] = Math.max(out[0], box[0] - x);
      out[1] = Math.max(out[1], box[1] - y);
      out[2] = Math.max(out[2], x - box[2]);
      out[3] = Math.max(out[3], y - box[3]);
    }
  }
  return out;
}
