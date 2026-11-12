// The motion every kid shares (D-099, D-101): how it stands, walks, rests, is picked up and
// put down, greets, is born and fuses. Each replaces the frame-swap clip of the same name in
// kid_rig_v2.json on the map; the Dex and popup portraits keep the old ones.
import { bake, keys, sin, steps } from './lib.mjs';

/**
 * Source px every kid's lifetime box grows by, [left, top, right, bottom], so that kids in
 * motion still never overlap (D-043). Every clip a kid lives in (not the short event clips)
 * must keep its drawings inside box + margin: `npm run art:kids` checks each frame.
 */
export const MARGIN = [6, 12, 6, 4];

/** Mid-body height above the feet: rocking turns about here, so head and feet share the sway. */
const MID = 85;
const M = (asset, x, y, o = {}) => ({ asset, x, y, ...o });

// --- standing ------------------------------------------------------------------------------

/** Breathing: three seconds, the body rising a hair as it narrows. */
export const idle = bake(3, (t) => ({ sy: 1 + 0.018 * sin(t / 3), sx: 1 - 0.011 * sin(t / 3) }), { loop: true });

/**
 * The waddle: half a second per two steps. The body rocks onto the planted foot and bobs up
 * between steps; the foot frames are the existing ones.
 */
export const walk = bake(0.5, (t) => {
  const k = t / 0.5; // 0..1 over two steps
  return {
    body: steps([[0, 'step_left'], [1 / 3, 'stand'], [1 / 2, 'step_right'], [5 / 6, 'stand']])(k),
    rot: 3 * sin(k),
    pivotY: MID,
    y: -3.5 * Math.abs(sin(k)),
    sy: 1 + 0.02 * Math.abs(sin(k)) - 0.012,
    sx: 1 - 0.012 * Math.abs(sin(k)) + 0.008,
  };
}, { loop: true });

/** A glance each way: the face leads, the body leans after it. */
export const look_around = bake(1.5, (t) => {
  const side = keys([[0, 0], [0.25, -1, 'out'], [0.6, -1], [0.9, 1, 'inOut'], [1.25, 1], [1.5, 0, 'inOut']])(t);
  return { faceX: 5 * side, rot: 1.6 * side, pivotY: MID, sy: 1 + 0.008 * Math.abs(side) };
});

// --- sitting and sleeping ------------------------------------------------------------------

/** Down with a small bounce. The sim plays it backwards to stand up. */
export const sit_down = bake(0.5, (t) => ({
  body: steps([[0, 'stand'], [1 / 12, 'settle'], [3 / 12, 'sit']])(t),
  sy: keys([[0, 1], [1 / 12, 0.97, 'out'], [3 / 12, 0.93, 'in'], [4 / 12, 1.03, 'out'], [0.5, 1, 'inOut']])(t),
  sx: keys([[0, 1], [3 / 12, 1.05, 'in'], [4 / 12, 0.98, 'out'], [0.5, 1, 'inOut']])(t),
}));

export const seated = bake(3, (t) => ({ body: 'sit', sy: 1 + 0.02 * sin(t / 3), sx: 1 - 0.012 * sin(t / 3) }), { loop: true });

/** Asleep: slow deep breaths, and three z's that drift up from the head and fade. */
export const sleep = bake(4, (t) => {
  const breath = sin(t / 4);
  const zs = [0, 1, 2].map((i) => {
    const k = ((t / 4 + i / 3) % 1 + 1) % 1; // each z's life, 0..1, a third of a loop apart
    return M('fx_mark_z', 48 + 34 * k + 5 * sin(k * 2), 6 - 62 * k, { anchor: 'head_top', s: 0.55 + 0.6 * k, a: k < 0.15 ? k / 0.15 : k > 0.7 ? (1 - k) / 0.3 : 1, rot: -8 + 16 * k });
  });
  return { body: 'sit', face: 'asleep', sy: 1 + 0.03 * breath, sx: 1 - 0.018 * breath, marks: zs };
}, { loop: true });

/** Up with a stretch. */
export const wake = bake(0.5, (t) => ({
  body: steps([[0, 'sit'], [1 / 12, 'settle'], [2 / 12, 'stand']])(t),
  face: steps([[0, 'asleep'], [1 / 12, 'blink'], [3 / 12, 'open']])(t),
  sy: keys([[0, 1], [2 / 12, 0.96, 'out'], [4 / 12, 1.05, 'out'], [0.5, 1, 'inOut']])(t),
  sx: keys([[0, 1], [2 / 12, 1.03, 'out'], [4 / 12, 0.95, 'out'], [0.5, 1, 'inOut']])(t),
}));

// --- greeting ------------------------------------------------------------------------------

/**
 * The fast arm wiggle (D-059): a dip, then both stubby arms flap up and down six times while
 * the kid bounces. The arms move; they never stretch or thicken (D-098).
 */
export const wave = bake(1, (t) => {
  const flapping = t >= 2 / 12 && t < 10 / 12;
  const beat = Math.floor((t - 2 / 12) * 12);
  const hop = flapping ? Math.abs(sin((t - 2 / 12) / (4 / 12))) : 0; // two hops across the flaps
  return {
    body: flapping ? (beat % 2 === 0 ? 'wave_high' : 'wave_low') : 'stand',
    y: -5 * hop,
    sy: keys([[0, 1], [1 / 12, 0.95, 'out'], [2 / 12, 1.03, 'out'], [10 / 12, 1.02], [11 / 12, 0.96, 'in'], [1, 1, 'out']])(t),
    sx: keys([[0, 1], [1 / 12, 1.04, 'out'], [2 / 12, 0.97, 'out'], [10 / 12, 0.99], [11 / 12, 1.03, 'in'], [1, 1, 'out']])(t),
  };
});

// --- in the player's hand --------------------------------------------------------------------

/** Lifted: a quick stretch as the feet leave the ground. */
export const pick_up = bake(0.25, (t) => ({
  body: t < 1 / 12 ? 'stand' : 'held',
  face: 'open',
  sy: keys([[0, 0.94], [1 / 12, 1.1, 'out'], [0.25, 1.03, 'inOut']])(t),
  sx: keys([[0, 1.05], [1 / 12, 0.93, 'out'], [0.25, 0.98, 'inOut']])(t),
}));

/** Dangling: a slow pendulum, a little longer than it is wide. */
export const held = bake(1.5, (t) => ({ body: 'held', face: 'open', rot: 4 * sin(t / 1.5), sy: 1.03 + 0.01 * sin(t / 0.75), sx: 0.98 }), { loop: true });

/** Put down: a squash on landing with a puff of dust each side, then a small rebound. */
export const drop = bake(0.5, (t) => {
  const dust = (side) => {
    const k = (t - 1 / 12) / (4 / 12);
    return k < 0 || k > 1 ? null : M('fx_mark_dust', 128 + side * (78 + 26 * k), 214 - 10 * k, { s: 0.7 + 0.5 * k, a: 1 - k * k, rot: side * 20 * k });
  };
  return {
    body: steps([[0, 'held'], [1 / 12, 'settle'], [4 / 12, 'stand']])(t),
    face: 'open',
    sy: keys([[0, 1.06], [1 / 12, 0.84, 'in'], [3 / 12, 1.06, 'out'], [5 / 12, 0.98, 'inOut'], [0.5, 1, 'inOut']])(t),
    sx: keys([[0, 0.96], [1 / 12, 1.12, 'in'], [3 / 12, 0.96, 'out'], [5 / 12, 1.01, 'inOut'], [0.5, 1, 'inOut']])(t),
    marks: [dust(-1), dust(1)],
  };
});

// --- arriving --------------------------------------------------------------------------------

/** Born from the Garden or a plot: up out of the ground with a pop. The rig's spawn puff plays with it. */
export const spawn = bake(0.5, (t, i) => ({
  body: t < 1 / 12 ? 'settle' : t < 3 / 12 ? 'held' : 'stand',
  face: 'open',
  alpha: keys([[0, 0.4], [2 / 12, 1, 'out']])(t),
  sy: keys([[0, 0.5], [2 / 12, 1.14, 'out'], [4 / 12, 0.95, 'inOut'], [0.5, 1, 'inOut']])(t),
  sx: keys([[0, 1.2], [2 / 12, 0.9, 'out'], [4 / 12, 1.04, 'inOut'], [0.5, 1, 'inOut']])(t),
  fx: Math.min(2, i),
}), { effect: 'spawn' });

/** How long the two parents stay on screen as they come together (D-101). */
export const MEET_SECONDS = 5 / 12;

/**
 * A fusing parent: a hop, then it squashes down into the puff and is gone. The scene slides
 * the two together while this plays.
 */
export const fusion_parent = bake(MEET_SECONDS, (t) => ({
  face: 'open',
  y: keys([[0, 0], [1 / 12, -14, 'out'], [3 / 12, 0, 'in']])(t),
  sy: keys([[0, 0.94], [1 / 12, 1.08, 'out'], [2 / 12, 1], [4 / 12, 0.45, 'linear']])(t),
  sx: keys([[0, 1.04], [1 / 12, 0.95, 'out'], [2 / 12, 1], [4 / 12, 0.7, 'linear']])(t),
  alpha: keys([[0, 1], [2 / 12, 1], [4 / 12, 0.3, 'linear']])(t),
}));

/** The child of a fusion: unseen while its parents meet, then it stretches up out of the puff. */
export const fusion_child = bake(MEET_SECONDS + 0.5, (t) => {
  const u = t - MEET_SECONDS;
  if (u < 0) return { face: 'open', alpha: 0 };
  return {
    body: u < 2 / 12 ? 'held' : 'stand',
    face: 'open',
    sy: keys([[0, 0.55], [2 / 12, 1.2, 'out'], [4 / 12, 0.93, 'inOut'], [0.5, 1, 'inOut']])(u),
    sx: keys([[0, 1.25], [2 / 12, 0.86, 'out'], [4 / 12, 1.05, 'inOut'], [0.5, 1, 'inOut']])(u),
    y: keys([[0, 0], [2 / 12, -10, 'out'], [4 / 12, 0, 'in']])(u),
  };
});
