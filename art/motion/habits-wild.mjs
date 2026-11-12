// Habits of the wild kids, D-099: the twenty specials and the rares (Star is in habits.mjs).
// A wild kid is one drawing, so its habit is how the whole body moves, and a few marks. Marks
// anchor to points of its lifetime box: HEAD its top middle, TORSO its middle, HAND its right
// side. See habits.mjs for how habits are written.
import { flutter, fly, hop, mark, MID, shake, span, stretch, HEAD, TORSO } from './habit-kit.mjs';
import { bake, clamp01, keys, sin } from './lib.mjs';

/** A pulse: 0 to 1 and back over `d` seconds from `t0`. */
const pulse = (t, t0, d) => {
  const k = span(t, t0, d);
  return k < 0 ? 0 : Math.sin(k * Math.PI);
};

export const wildHabits = {
  // === Specials ==================================================================================

  /** Gift Kid: rattles itself to guess what is inside, then jumps at the answer. */
  gift: bake(2.6, (t) => ({
    x: t > 0.3 && t < 1.0 ? 2.5 * flutter(t) : 0,
    rot: t > 0.3 && t < 1.0 ? 3 * flutter(t) : 0,
    pivotY: MID,
    y: hop(t, 1.3, 0.45, 6),
    ...stretch(keys([[0, 1], [1.2, 1], [1.3, 0.93, 'out'], [1.5, 1.03, 'out'], [1.75, 0.95, 'in'], [2.0, 1, 'out']])(t)),
    marks: [fly('spark', HEAD, t, 1.45, 0.6, 0, -24, 0, -18, { s0: 0.4, s1: 0.5 }), fly('tick', HEAD, t, 0.4, 0.3, -70, 20, -14, -4, { s0: 0.7, rot: 20 }), fly('tick', HEAD, t, 0.7, 0.3, 70, 20, 14, -4, { s0: 0.7, rot: -20 })],
  })),

  /** Origami Kid: beats its folded wings, three times, and lifts a little with each. */
  origami: bake(2.4, (t) => {
    const flap = pulse(t, 0.3, 0.35) + pulse(t, 0.75, 0.35) + pulse(t, 1.2, 0.35);
    return { sx: 1 - 0.13 * flap, sy: 1 + 0.04 * flap, y: -6 * flap, marks: [fly('tick', TORSO, t, 0.45, 0.3, -70, 34, -14, 14, { s0: 0.7, rot: 60 }), fly('tick', TORSO, t, 0.9, 0.3, 70, 34, 14, 14, { s0: 0.7, rot: -60 })] };
  }),

  /** Puzzle Kid: turns this way and that looking for its fit, and snaps square with a click. */
  puzzle: bake(2.4, (t) => ({
    rot: keys([[0, 0], [0.5, -5.5, 'inOut'], [1.1, 5.5, 'inOut'], [1.45, -2, 'inOut'], [1.55, 0, 'in']])(t),
    pivotY: MID,
    ...stretch(keys([[0, 1], [1.5, 1], [1.58, 0.94, 'out'], [1.8, 1.02, 'out'], [2.0, 1]])(t)),
    marks: [fly('tick', HEAD, t, 1.56, 0.25, -44, -4, -16, -10, { s0: 0.8, rot: 30 }), fly('tick', HEAD, t, 1.56, 0.25, 44, -4, 16, -10, { s0: 0.8, rot: -30 })],
  })),

  /** Rubber Duck Kid: gets a squeeze from nowhere, squeaks, and bobs as if the bath were moving. */
  rubber_duck: bake(2.6, (t) => ({
    ...stretch(keys([[0, 1], [0.35, 0.9, 'inOut'], [0.5, 1.06, 'out'], [0.75, 0.98], [1.0, 1, 'inOut']])(t)),
    rot: 3.5 * sin((t - 1) / 0.8) * (t > 1 && t < 2.6 ? 1 - (t - 1) / 1.6 : 0),
    pivotY: MID,
    marks: [fly('note', HEAD, t, 0.5, 0.8, 26, -20, 14, -34, { s0: 0.6, s1: 0.2, rot: 15 })],
  })),

  /** Handbell Kid: rings itself, four swings dying away, and two notes ring out. */
  handbell: bake(2.6, (t) => ({
    rot: shake(t, 0.3, 1.5, 4, 6.5),
    pivotY: MID,
    marks: [
      fly('note', HEAD, t, 0.45, 0.9, -40, 10, -24, -34, { s0: 0.6, s1: 0.2, rot: -15 }),
      fly('note', HEAD, t, 0.85, 0.9, 40, 10, 24, -34, { s0: 0.6, s1: 0.2, rot: 15 }),
      fly('tick', TORSO, t, 0.4, 0.25, -80, 30, -16, 0, { s0: 0.7 }),
      fly('tick', TORSO, t, 0.62, 0.25, 80, 30, 16, 0, { s0: 0.7 }),
    ],
  })),

  /** Fossil Kid: stirs after a very long sleep, shedding a little dust, and settles heavily. */
  fossil: bake(3, (t) => ({
    rot: keys([[0, 0], [0.8, -3, 'inOut'], [1.6, 3, 'inOut'], [2.2, 0, 'inOut']])(t),
    pivotY: 40,
    ...stretch(keys([[0, 1], [2.2, 1], [2.32, 0.95, 'in'], [2.6, 1.01, 'out'], [2.8, 1]])(t)),
    face: t < 0.5 ? 'asleep' : t < 0.7 ? 'blink' : 'inherit',
    marks: [fly('dust', HEAD, t, 0.9, 0.9, -84, 14, -8, 54, { s0: 0.3, s1: 0.1 }), fly('dust', HEAD, t, 1.7, 0.9, 86, 12, 8, 56, { s0: 0.3, s1: 0.1 }), fly('tick', TORSO, t, 2.32, 0.25, -84, 60, -16, 0, { s0: 0.7 }), fly('tick', TORSO, t, 2.32, 0.25, 84, 60, 16, 0, { s0: 0.7 })],
  })),

  /** Pocket Watch Kid: ticks. Six crisp little turns, left and right, one each third of a second. */
  pocket_watch: bake(2.4, (t) => {
    const n = Math.floor(clamp01(span(t, 0.2, 2.0)) * 6);
    const on = t > 0.2 && t < 2.2;
    return {
      rot: on ? (n % 2 ? 3.5 : -3.5) : 0,
      pivotY: MID,
      marks: [0, 1, 2, 3, 4, 5].map((i) => fly('tick', HEAD, t, 0.2 + i / 3, 0.22, (i % 2 ? 1 : -1) * 34, -18, (i % 2 ? 1 : -1) * 12, -10, { s0: 0.6, rot: (i % 2 ? -1 : 1) * 40 })),
    };
  }),

  /** Accordion Kid: draws itself in, lets itself out, and in again; three notes come of it. */
  accordion: bake(2.6, (t) => {
    const bellows = keys([[0, 1], [0.5, 0.82, 'inOut'], [1.0, 1.05, 'inOut'], [1.5, 0.86, 'inOut'], [2.0, 1.02, 'inOut'], [2.4, 1, 'inOut']])(t);
    return {
      sx: bellows,
      sy: 1 + (1 - bellows) * 0.25,
      marks: [
        fly('note', HEAD, t, 0.5, 0.8, -30, -14, -18, -34, { s0: 0.6, s1: 0.2, rot: -12 }),
        fly('note', HEAD, t, 1.0, 0.8, 30, -16, 18, -34, { s0: 0.6, s1: 0.2, rot: 12 }),
        fly('note', HEAD, t, 1.5, 0.8, 0, -22, 0, -36, { s0: 0.6, s1: 0.2 }),
      ],
    };
  }),

  /** Storybook Kid: turns two pages of itself, and a star slips out from between them. */
  storybook: bake(2.8, (t) => {
    const page = pulse(t, 0.3, 0.6) + pulse(t, 1.1, 0.6);
    return {
      sx: 1 - 0.2 * page,
      rot: -2 * page,
      pivotY: MID,
      marks: [fly('star', HEAD, t, 1.5, 0.9, 10, -14, 22, -44, { s0: 0.35, s1: 0.4, rot: 120, arc: 8 })],
    };
  }),

  /** Yo-Yo Kid: climbs its own string in two rocking hops and drops back down. */
  yo_yo: bake(2.6, (t) => {
    const k1 = span(t, 0.3, 0.7);
    const k2 = span(t, 1.2, 0.7);
    const up = (k1 < 0 ? 0 : Math.sin(k1 * Math.PI)) + (k2 < 0 ? 0 : Math.sin(k2 * Math.PI));
    return {
      y: -9 * up,
      rot: k1 >= 0 ? 7 * Math.sin(k1 * Math.PI * 2) : k2 >= 0 ? -7 * Math.sin(k2 * Math.PI * 2) : 0,
      pivotY: MID,
      ...stretch(keys([[0, 1], [0.25, 0.95, 'out'], [0.4, 1.03], [1.0, 1], [1.08, 0.95, 'in'], [1.25, 1.03, 'out'], [1.9, 1], [1.98, 0.95, 'in'], [2.2, 1, 'out']])(t)),
    };
  }),

  /** Acorn Kid: spins on its point like a top, wobbling wider as it slows, and rights itself. */
  acorn: bake(2.8, (t) => {
    const k = clamp01(span(t, 0.3, 1.9));
    return {
      rot: (1 + 3 * k) * sin(t * (4 - 2.5 * k)) * (t > 0.3 && t < 2.2 ? 1 : 0) * (t > 2.0 ? (2.2 - t) / 0.2 : 1),
      pivotY: 20,
      marks: [fly('leaf', HEAD, t, 1.6, 1.0, 26, -10, 30, 70, { s0: 0.5, s1: 0, rot: 200 })],
    };
  }),

  /** Postcard Kid: a breeze catches it; it flutters, slides a step, and is set straight again. */
  postcard: bake(2.6, (t) => {
    const gust = keys([[0, 0], [0.3, 0, 'out'], [0.6, 1, 'out'], [1.5, 1], [2.0, 0, 'inOut']])(t);
    return {
      rot: gust * (5 + 3 * sin(t * 4)),
      pivotY: 30,
      x: 4 * gust,
      sx: 1 - 0.06 * gust * (0.5 + 0.5 * sin(t * 4)),
      marks: [fly('tick', TORSO, t, 0.4, 0.4, -110, -30, 60, 0, { s0: 1, behind: true }), fly('tick', TORSO, t, 0.9, 0.4, -112, 10, 62, 0, { s0: 0.85, behind: true })],
    };
  }),

  /** Music Box Kid: plays its tune, rocking in waltz time, the notes going up by turns. */
  music_box: bake(3.2, (t) => {
    const on = keys([[0, 0], [0.4, 1, 'out'], [2.6, 1], [3.2, 0, 'inOut']])(t);
    return {
      rot: 3.5 * on * sin(t / 1.2),
      pivotY: MID,
      ...stretch(1 + 0.015 * on * sin(t / 0.4)),
      marks: [0, 1, 2, 3].map((i) => fly('note', HEAD, t, 0.5 + i * 0.55, 0.9, (i % 2 ? 26 : -26), -16, (i % 2 ? 14 : -14), -36, { s0: 0.55, s1: 0.2, rot: i % 2 ? 12 : -12 })),
    };
  }),

  /** Magic Slate Kid: shakes itself clean in a blur, and blinks at the empty page. */
  magic_slate: bake(2.4, (t) => ({
    x: t > 0.3 && t < 1.0 ? 3 * flutter(t) : 0,
    ...stretch(keys([[0, 1], [0.3, 0.97, 'out'], [1.0, 0.97], [1.2, 1.03, 'out'], [1.5, 1]])(t)),
    face: t > 1.2 && t < 1.4 ? 'blink' : t > 1.7 && t < 1.9 ? 'blink' : 'inherit',
    marks: [fly('dust', TORSO, t, 0.5, 0.7, -70, -40, -30, -14, { s0: 0.35, s1: 0.4 }), fly('dust', TORSO, t, 0.7, 0.7, 70, -44, 30, -12, { s0: 0.35, s1: 0.4 })],
  })),

  /** Marble Run Kid: tilts one way and the other, and a marble skips along its top from end to end. */
  marble_run: bake(3, (t) => {
    const k = span(t, 0.4, 2.0);
    const tilt = k < 0 ? 0 : 3 * Math.sin(k * Math.PI * 3);
    return {
      rot: tilt,
      pivotY: MID,
      marks: [k < 0 ? null : mark('bubble', HEAD, -64 + 128 * k, -26 - 16 * Math.abs(Math.sin(k * Math.PI * 4)), { s: 0.42, a: k > 0.9 ? (1 - k) / 0.1 : Math.min(1, k * 8) })],
    };
  }),

  /** Toy Train Kid: chuffs on the spot, three puffs of smoke trailing back over its roof. */
  toy_train: bake(2.8, (t) => {
    const chug = pulse(t, 0.3, 0.3) + pulse(t, 0.8, 0.3) + pulse(t, 1.3, 0.3);
    return {
      x: 3 * chug,
      ...stretch(1 - 0.035 * chug),
      marks: [0.35, 0.85, 1.35].map((t0) => fly('dust', HEAD, t, t0, 0.9, 30, -20, -60, -30, { s0: 0.4, s1: 0.6 })),
    };
  }),

  /** Puppet Theatre Kid: takes a bow, low and slow, to two sparks of applause. */
  puppet_theatre: bake(2.8, (t) => ({
    rot: keys([[0, 0], [0.3, -1, 'out'], [0.9, 3, 'inOut'], [1.5, 3], [2.1, 0, 'inOut']])(t),
    pivotY: MID,
    y: keys([[0, 0], [0.9, -2, 'inOut'], [1.5, -2], [2.1, 0, 'inOut']])(t),
    ...stretch(keys([[0, 1], [0.9, 0.96, 'inOut'], [1.5, 0.96], [2.1, 1.02, 'inOut'], [2.5, 1]])(t)),
    face: t > 0.9 && t < 1.6 ? 'asleep' : 'inherit',
    marks: [fly('spark', HEAD, t, 1.7, 0.6, -50, -10, -10, -24, { s0: 0.35, s1: 0.5 }), fly('spark', HEAD, t, 1.95, 0.6, 54, -14, 10, -24, { s0: 0.35, s1: 0.5 })],
  })),

  /** Toy Castle Kid: draws itself up tall, as if on guard, holds it, and stands easy. */
  toy_castle: bake(2.8, (t) => {
    const up = keys([[0, 0], [0.3, -0.5, 'out'], [0.6, 1, 'out'], [1.8, 1], [2.3, 0, 'inOut']])(t);
    return {
      ...stretch(1 + 0.045 * up),
      face: up > 0.9 ? 'open' : 'inherit',
      marks: [fly('tick', HEAD, t, 0.65, 0.3, -30, -18, -12, -14, { s0: 0.7, rot: 60 }), fly('tick', HEAD, t, 0.65, 0.3, 30, -18, 12, -14, { s0: 0.7, rot: -60 })],
    };
  }),

  /** Paper Town Kid: a ripple runs through its paper streets, twice, and one scrap blows free. */
  paper_town: bake(2.6, (t) => {
    const wave = shake(t, 0.3, 1.5, 4, 1);
    return {
      sx: 1 + 0.035 * wave,
      sy: 1 - 0.035 * wave,
      rot: 1.5 * wave,
      pivotY: MID,
      marks: [fly('dust', HEAD, t, 0.9, 1.0, 20, -10, 50, -30, { s0: 0.25, s1: 0.1, rot: 300, arc: 10 })],
    };
  }),

  /** Treasure Chest Kid: something inside wants out: it bumps, hops, and gold glints from under the lid. */
  treasure_chest: bake(2.6, (t) => ({
    y: hop(t, 0.9, 0.4, 6),
    x: t > 0.3 && t < 0.8 ? 1.8 * flutter(t) : 0,
    ...stretch(keys([[0, 1], [0.8, 1], [0.9, 0.92, 'out'], [1.1, 1.03, 'out'], [1.32, 0.94, 'in'], [1.6, 1, 'out']])(t)),
    marks: [
      fly('spark', HEAD, t, 1.0, 0.6, -30, 0, -16, -26, { s0: 0.35, s1: 0.5 }),
      fly('spark', HEAD, t, 1.1, 0.6, 0, -6, 0, -30, { s0: 0.4, s1: 0.5 }),
      fly('spark', HEAD, t, 1.2, 0.6, 30, 0, 16, -26, { s0: 0.35, s1: 0.5 }),
    ],
  })),

  // === Rares =====================================================================================

  /** Rainbow Kid: swings slowly from one end of its arc to the other, a spark at each foot. */
  rainbow: bake(3, (t) => ({
    rot: keys([[0, 0], [0.8, -4, 'inOut'], [1.9, 4, 'inOut'], [2.7, 0, 'inOut']])(t),
    pivotY: 30,
    marks: [fly('spark', TORSO, t, 0.9, 0.6, -84, 40, -6, -10, { s0: 0.3, s1: 0.5 }), fly('spark', TORSO, t, 2.0, 0.6, 84, 40, 6, -10, { s0: 0.3, s1: 0.5 })],
  })),

  /** Blimp Kid: lifts off, noses up, drifts a little, and settles back as lightly. */
  blimp: bake(3.2, (t) => {
    const up = keys([[0, 0], [0.8, 1, 'inOut'], [2.2, 1], [3.1, 0, 'inOut']])(t);
    return {
      y: -8 * up,
      x: 3 * up * sin(t / 2.4),
      rot: -3 * up * Math.cos(t / 1.6 * Math.PI),
      pivotY: MID,
      marks: [fly('tick', TORSO, t, 1.0, 0.4, 96, -10, 40, 0, { s0: 0.9, behind: true }), fly('tick', TORSO, t, 1.6, 0.4, 100, 14, 40, 0, { s0: 0.8, behind: true })],
    };
  }),

  /** Spool Kid: rolls a full turn one way, as if paying out thread, and winds itself back. */
  spool: bake(3, (t) => {
    const roll = keys([[0, 0], [1.2, 1, 'inOut'], [1.5, 1], [2.7, 0, 'inOut']])(t);
    return { rot: 3 * Math.sin(roll * Math.PI * 2), x: 3 * roll * (1 - roll) * 4 * 0.5, pivotY: MID, ...stretch(1 + 0.02 * Math.sin(roll * Math.PI)) };
  }),

  /** Paper Fan Kid: snaps shut and open three times, sending a breeze off to one side. */
  paper_fan: bake(2.6, (t) => {
    const shut = pulse(t, 0.3, 0.35) + pulse(t, 0.8, 0.35) + pulse(t, 1.3, 0.35);
    return {
      sx: 1 - 0.28 * shut,
      sy: 1 + 0.03 * shut,
      marks: [0.5, 1.0, 1.5].map((t0, i) => fly('tick', TORSO, t, t0, 0.35, 80, -30 + i * 14, 40, 0, { s0: 0.9, s1: 0.3 })),
    };
  }),

  /** Jelly Kid: wobbles. A poke from nowhere sets it going and it takes its time to stop. */
  jelly: bake(2.8, (t) => {
    const wob = shake(t, 0.3, 2.0, 6, 1);
    return { sx: 1 + 0.085 * wob, sy: 1 - 0.085 * wob, rot: 2.5 * shake(t, 0.3, 2.0, 3, 1), pivotY: 20 };
  }),

  /** Cushion Kid: flops flat with a sigh, then plumps itself up fuller than before. */
  cushion: bake(2.8, (t) => ({
    ...stretch(keys([[0, 1], [0.5, 0.9, 'in'], [1.2, 0.91], [1.5, 1.05, 'out'], [1.9, 0.98, 'inOut'], [2.3, 1, 'inOut']])(t)),
    face: t > 0.6 && t < 1.2 ? 'asleep' : 'inherit',
    marks: [fly('dust', TORSO, t, 0.5, 0.6, -80, 50, -26, -6, { s0: 0.4, s1: 0.4 }), fly('dust', TORSO, t, 0.5, 0.6, 80, 50, 26, -6, { s0: 0.4, s1: 0.4 })],
  })),

  /** Seashell Kid: rocks as if the tide were under it, and rings spread out from its foot. */
  seashell: bake(3.2, (t) => {
    const on = keys([[0, 0], [0.5, 1, 'inOut'], [2.6, 1], [3.2, 0, 'inOut']])(t);
    const ring = (t0) => {
      const k = span(t, t0, 1.0);
      return k < 0 ? null : mark('ring', TORSO, 0, 78, { s: 1 + 1.6 * k, a: 0.9 * (1 - k), behind: true });
    };
    return { rot: 4.5 * on * sin(t / 1.6), pivotY: 10, marks: [ring(0.6), ring(1.4), fly('drop', HEAD, t, 1.9, 0.6, 30, -6, 16, -30, { s0: 0.4, s1: 0.1, arc: 8 })] };
  }),

  /** Flying Saucer Kid: lifts into a hover, tilting about its rim, lights flickering underneath. */
  flying_saucer: bake(3, (t) => {
    const up = keys([[0, 0], [0.5, 1, 'out'], [2.2, 1], [2.9, 0, 'inOut']])(t);
    return {
      y: -8 * up,
      rot: 5 * up * sin(t / 0.9),
      pivotY: MID,
      marks: [0, 1, 2, 3, 4, 5].map((i) => fly('tick', TORSO, t, 0.6 + i * 0.27, 0.22, (i % 3 - 1) * 26, 66, 0, 12, { s0: 0.7, rot: 90 })),
    };
  }),

  /** Ring Planet Kid: tips its ring one way and the other while a small moon goes once round it. */
  ring_planet: bake(3.2, (t) => {
    const k = span(t, 0.4, 2.4);
    const a = k < 0 ? 0 : k * Math.PI * 2;
    return {
      rot: keys([[0, 0], [0.8, -8, 'inOut'], [2.0, 8, 'inOut'], [2.9, 0, 'inOut']])(t),
      pivotY: MID,
      marks: [k < 0 ? null : mark('star', TORSO, 104 * Math.cos(a), -20 + 26 * Math.sin(a), { s: 0.34, a: k > 0.9 ? (1 - k) / 0.1 : Math.min(1, k * 8), behind: Math.sin(a) < 0, rot: 360 * k })],
    };
  }),

  /** Wind-Up Key Kid: winds itself up, click by click, and lets go in one unwinding whirr. */
  wind_up_key: bake(3, (t) => {
    const clicks = Math.min(5, Math.floor(clamp01(span(t, 0.3, 1.5)) * 6));
    const wound = t < 0.3 ? 0 : t < 1.8 ? clicks * 1.6 : 8 * (1 - clamp01((t - 1.8) / 0.5)) * Math.cos((t - 1.8) * 26);
    return {
      rot: wound,
      pivotY: MID,
      ...stretch(1 - (t < 1.8 ? clicks * 0.008 : 0) + (t > 1.8 && t < 2.3 ? 0.03 * Math.sin(clamp01((t - 1.8) / 0.5) * Math.PI) : 0)),
      marks: [0, 1, 2, 3, 4].map((i) => fly('tick', HEAD, t, 0.3 + (i * 1.5) / 6, 0.2, 30, -12, 12, -10, { s0: 0.55, rot: -40 })),
    };
  }),
};
