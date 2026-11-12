// The pieces habits are written with (docs/ART.md, "Habits"): where things attach, marks that
// fly, hops, stretches and shakes.
import { sin } from './lib.mjs';

/** Mid-body height above the feet: leans and rocks turn about here. */
export const MID = 85;
export const part = (id, name) => `kid_${id}_${name}`;
export const mark = (name, anchor, x, y, o = {}) => ({ asset: `fx_mark_${name}`, anchor, x, y, ...o });
export const HEAD = 'head_top';
export const HAND = 'hand_right';
export const TORSO = 'torso';

/** Progress 0..1 of a span starting at `t0` and lasting `d`, or -1 outside it. */
export const span = (t, t0, d) => {
  const k = (t - t0) / d;
  return k < 0 || k > 1 ? -1 : k;
};
/** Opacity of something that pops in, holds and fades over its life `k`. */
export const fade = (k, inBy = 0.15, outFrom = 0.65) => (k < inBy ? k / inBy : k > outFrom ? (1 - k) / (1 - outFrom) : 1);
/**
 * A mark that lives from `t0` for `d` seconds, travelling from (x, y) by (dx, dy) and growing
 * from scale `s0` by `s1`; `arc` lifts its path into a throw.
 */
export const fly = (name, anchor, t, t0, d, x, y, dx, dy, { s0 = 0.8, s1 = 0.3, rot = 0, arc = 0, behind = false } = {}) => {
  const k = span(t, t0, d);
  if (k < 0) return null;
  return mark(name, anchor, x + dx * k, y + dy * k - arc * 4 * k * (1 - k), { s: s0 + s1 * k, a: fade(k), rot: rot * k, behind });
};
/** A hop: up to `h` px and back between t0 and t0 + d; 0 outside. */
export const hop = (t, t0, d, h) => {
  const k = span(t, t0, d);
  return k < 0 ? 0 : -h * 4 * k * (1 - k);
};
/** Squash and stretch as a pair: returns { sx, sy } from one curve of sy. */
export const stretch = (sy) => ({ sy, sx: 1 - (sy - 1) * 0.7 });
/** A quick back-and-forth: `n` swings of `amp` between t0 and t0 + d, dying away. */
export const shake = (t, t0, d, n, amp) => {
  const k = span(t, t0, d);
  return k < 0 ? 0 : amp * sin(k * n) * (1 - k * 0.6);
};

/** The face's own attachment: marks about the eyes and smirk, never over them. */
export const FACE = 'face_centre';
/** On every other frame 1, else -1: a flutter at the clip's own 12 fps. */
export const flutter = (t) => (Math.floor(t * 12 + 1e-6) % 2 ? 1 : -1);
