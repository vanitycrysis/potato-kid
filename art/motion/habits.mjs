// One habit per kid (D-099): a short animation of its own that it does now and then while it
// rests. Keyed by kid id; the build names each clip habit_<id>.
//
// How they are written (docs/ART.md, "Habits"):
// - A habit is two or three seconds: a small wind-up, one clear action, and a settle.
// - It moves the kid's own costume parts (`parts`, turned and scaled about the point they
//   attach to), the body (hop, squash, lean) and a few marks. The face only blinks or sleeps.
// - Marks are placed from an attachment (`anchor`), so they sit right on every body shape.
// - A wild kid (specials, rares) has one drawing: its habit is body motion and marks only.
import { fly, hop, mark, MID, part, shake, span, stretch, HAND, HEAD, TORSO } from './habit-kit.mjs';
import { tier3 } from './habits-tier3.mjs';
import { tier4 } from './habits-tier4.mjs';
import { tier5 } from './habits-tier5.mjs';
import { wildHabits } from './habits-wild.mjs';
import { bake, clamp01, ease, keys, sin, steps } from './lib.mjs';


export const habits = {
  // === Tier 1 ===================================================================================

  /** Potato Kid: rocks from heel to heel, twice, then a pleased little hop. */
  plain: bake(2.2, (t) => ({
    rot: keys([[0, 0], [0.3, -6, 'out'], [0.7, 6], [1.1, -5], [1.4, 0, 'out']])(t),
    pivotY: MID,
    y: hop(t, 1.45, 0.4, 9),
    ...stretch(keys([[0, 1], [1.35, 1], [1.45, 0.94, 'out'], [1.6, 1.06, 'out'], [1.85, 0.96, 'in'], [2.05, 1.01, 'out'], [2.2, 1]])(t)),
    face: t > 1.85 && t < 2.05 ? 'blink' : 'inherit',
  })),

  /** Fire Kid: the flame flares up tall, flickers, and sheds two sparks of fire. */
  fire: bake(2, (t) => {
    const flare = keys([[0, 1], [0.2, 0.9, 'out'], [0.5, 1.16, 'out'], [1.3, 1.12], [1.7, 0.96, 'in'], [2, 1, 'out']])(t);
    const flick = t > 0.4 && t < 1.5 ? 5 * sin((t - 0.4) * 4) : 0;
    return {
      ...stretch(keys([[0, 1], [0.2, 0.96, 'out'], [0.5, 1.02, 'out'], [1.5, 1.01], [1.8, 1, 'inOut']])(t)),
      parts: {
        [part('fire', 'back_flame')]: { sy: flare, sx: 1 + (flare - 1) * 0.9, rot: flick },
        [part('fire', 'front_crest')]: { sy: 1 + (flare - 1) * 0.7, rot: -flick * 0.8 },
      },
      marks: [
        fly('flame', HEAD, t, 0.55, 0.7, -22, -52, -16, -34, { s0: 0.5, s1: 0.2, rot: -20 }),
        fly('flame', HEAD, t, 0.85, 0.7, 24, -50, 18, -36, { s0: 0.45, s1: 0.2, rot: 25 }),
      ],
    };
  }),

  /** Water Kid: shakes itself like a wet dog, and the drops fly. */
  water: bake(2, (t) => {
    const wob = shake(t, 0.35, 0.9, 5, 1);
    return {
      rot: 5 * wob,
      pivotY: MID,
      ...stretch(keys([[0, 1], [0.3, 0.95, 'out'], [0.45, 1.02], [1.3, 1.01], [1.5, 1, 'inOut']])(t)),
      parts: { [part('water', 'front_hood')]: { sx: 1 + 0.05 * Math.abs(wob), sy: 1 - 0.03 * Math.abs(wob), rot: -2 * wob } },
      marks: [
        fly('drop', 'face_centre', t, 0.45, 0.6, -86, -20, -42, 10, { arc: 22, s0: 0.6, rot: -60 }),
        fly('drop', 'face_centre', t, 0.6, 0.6, 88, -24, 44, 6, { arc: 22, s0: 0.6, rot: 60 }),
        fly('drop', 'face_centre', t, 0.8, 0.6, -80, 6, -38, 22, { arc: 16, s0: 0.5, rot: -70 }),
        fly('drop', 'face_centre', t, 0.95, 0.6, 82, 2, 40, 24, { arc: 16, s0: 0.5, rot: 70 }),
      ],
    };
  }),

  /** Snow Kid: a shiver runs through it, the pom on its beanie bobbling, and two flakes drift off. */
  snow: bake(2.2, (t) => {
    const shiver = t > 0.3 && t < 1.3 ? (Math.floor(t * 12) % 2 ? 1 : -1) * (1 - span(t, 0.3, 1) * 0.5) : 0;
    return {
      x: 2.2 * shiver,
      ...stretch(keys([[0, 1], [0.3, 0.97, 'out'], [1.3, 0.97], [1.6, 1.03, 'out'], [1.9, 1, 'inOut']])(t)),
      parts: {
        [part('snow', 'front_beanie')]: { rot: 4 * shiver + keys([[0, 0], [1.3, 0], [1.6, -7, 'out'], [2, 0, 'inOut']])(t) },
        [part('snow', 'front_scarf')]: { rot: keys([[0, 0], [1.3, 0], [1.55, 6, 'out'], [1.9, 0, 'inOut']])(t) },
      },
      marks: [
        fly('snow', HEAD, t, 0.5, 1.1, -48, -18, -14, 44, { s0: 0.55, s1: 0.1, rot: 90 }),
        fly('snow', HEAD, t, 0.8, 1.1, 54, -24, 12, 46, { s0: 0.5, s1: 0.1, rot: -90 }),
      ],
    };
  }),

  /** Wind Kid: a gust fills the windsock; the kid leans into it as the air streaks by. */
  wind: bake(2.2, (t) => {
    const gust = keys([[0, 0], [0.3, 0, 'out'], [0.6, 1, 'out'], [1.5, 1], [1.9, 0, 'inOut']])(t);
    const flap = gust * 6 * sin(t * 5);
    return {
      rot: -4.5 * gust,
      pivotY: MID,
      ...stretch(1 - 0.02 * gust),
      parts: { [part('wind', 'front_windsock')]: { rot: -6 * gust + flap * 0.6, sx: 1 + 0.12 * gust } },
      marks: [
        fly('tick', TORSO, t, 0.5, 0.45, 110, -70, -70, 0, { s0: 1.2, s1: 0.4, behind: true }),
        fly('tick', TORSO, t, 0.8, 0.45, 118, -20, -78, 0, { s0: 1, s1: 0.4, behind: true }),
        fly('tick', TORSO, t, 1.1, 0.45, 108, -100, -66, 0, { s0: 0.9, s1: 0.4, behind: true }),
      ],
    };
  }),

  /** Stone Kid: bumps the pebble off its head, twice, and catches it each time with a thud. */
  stone: bake(2.2, (t) => {
    const up = hop(t, 0.35, 0.55, 20) + hop(t, 1.1, 0.5, 13);
    const land = (t0) => keys([[t0 - 0.01, 1], [t0 + 0.06, 0.93, 'out'], [t0 + 0.22, 1.02, 'out'], [t0 + 0.4, 1, 'inOut']])(t);
    const sy = t < 0.3 ? keys([[0, 1], [0.2, 0.95, 'out'], [0.3, 1.04, 'out']])(t) : t < 1.02 ? land(0.9) : t < 1.1 ? 1.03 : land(1.6);
    return {
      ...stretch(sy),
      parts: { [part('stone', 'front_pebble')]: { y: up, rot: -up * 0.9, about: 'centre' } },
      marks: [
        fly('tick', HEAD, t, 0.9, 0.25, -34, -6, -14, -6, { s0: 0.8, rot: 20 }),
        fly('tick', HEAD, t, 0.9, 0.25, 34, -6, 14, -6, { s0: 0.8, rot: -20 }),
      ],
    };
  }),

  // === Tier 2 ===================================================================================

  /** Chef Kid: flips what is in the pan, watches it turn in the air, and catches it. */
  chef: bake(2.2, (t) => {
    const flick = keys([[0, 0], [0.3, 12, 'out'], [0.45, -34, 'out'], [0.7, 0, 'inOut'], [1.25, 0], [1.35, 8, 'out'], [1.6, 0, 'inOut']])(t);
    const k = span(t, 0.45, 0.85);
    return {
      ...stretch(keys([[0, 1], [0.3, 0.96, 'out'], [0.5, 1.04, 'out'], [1.25, 1.01], [1.35, 0.96, 'in'], [1.6, 1, 'out']])(t)),
      faceY: k < 0 ? 0 : -2.5 * Math.sin(k * Math.PI),
      parts: {
        [part('chef', 'front_pan')]: { rot: flick },
        [part('chef', 'front_hat')]: { rot: keys([[0, 0], [0.45, 0], [0.6, -6, 'out'], [0.9, 3], [1.2, 0, 'inOut']])(t) },
      },
      marks: [k < 0 ? null : mark('dust', HAND, 22, -14 - 74 * 4 * k * (1 - k), { s: 0.62, rot: 540 * k, a: 1 })],
    };
  }),

  /** Firefighter Kid: braces, and the nozzle lets go a burst of water. */
  firefighter: bake(2.2, (t) => {
    const on = t > 0.5 && t < 1.5;
    const kick = on ? 1.2 * (Math.floor(t * 12) % 2 ? 1 : -1) : 0;
    return {
      rot: keys([[0, 0], [0.4, 2, 'out'], [0.55, -3, 'out'], [1.5, -3], [1.9, 0, 'inOut']])(t) + kick * 0.4,
      pivotY: MID,
      ...stretch(keys([[0, 1], [0.4, 0.96, 'out'], [0.6, 1.01], [1.9, 1]])(t)),
      parts: {
        [part('firefighter', 'front_nozzle')]: { rot: keys([[0, 0], [0.4, -4, 'out'], [0.55, 7, 'out'], [1.5, 7], [1.9, 0, 'inOut']])(t) + kick },
        [part('firefighter', 'front_helmet')]: { rot: keys([[0, 0], [0.55, -5, 'out'], [1.5, -5], [1.9, 0, 'inOut']])(t) },
      },
      marks: [0, 1, 2, 3, 4].map((i) => fly('drop', HAND, t, 0.55 + i * 0.19, 0.45, 38, -34, 26, 8 + (i % 2) * 14, { arc: 12, s0: 0.5, s1: 0.2, rot: 80 })),
    };
  }),

  /** Snowman Kid: tips the snowball on its head, nearly loses it, and sets it straight. */
  snowman: bake(2.4, (t) => {
    const tip = keys([[0, 0], [0.4, -9, 'out'], [0.8, 14, 'inOut'], [1.05, 17, 'out'], [1.3, -4, 'out'], [1.6, 2], [1.9, 0, 'inOut']])(t);
    return {
      rot: tip * 0.22,
      pivotY: MID,
      ...stretch(keys([[0, 1], [0.95, 1], [1.08, 1.04, 'out'], [1.35, 0.96, 'in'], [1.7, 1, 'out']])(t)),
      face: t > 0.95 && t < 1.2 ? 'blink' : 'inherit',
      parts: {
        [part('snowman', 'back_snowball')]: { rot: tip, x: tip * 0.5 },
        [part('snowman', 'front_buttons')]: { y: keys([[0, 0], [1.08, -2, 'out'], [1.35, 1.5], [1.7, 0]])(t) },
      },
      marks: [fly('snow', HEAD, t, 1.05, 0.9, 40, -30, 18, 60, { s0: 0.5, rot: 120 }), fly('snow', HEAD, t, 1.2, 0.9, 26, -18, 10, 52, { s0: 0.4, rot: -120 })],
    };
  }),

  /** Steam Kid: holds its breath, swells, and lets it all out in two curls of steam. */
  steam: bake(2.4, (t) => {
    const hold = keys([[0, 1], [0.7, 1.07, 'inOut'], [0.9, 1.08], [1.1, 0.95, 'out'], [1.6, 1, 'inOut']])(t);
    return {
      sx: hold,
      sy: 2 - hold,
      parts: { [part('steam', 'front_vapour')]: { sy: keys([[0, 1], [0.9, 0.7, 'inOut'], [1.15, 1.06, 'out'], [1.8, 1, 'inOut']])(t), sx: keys([[0, 1], [0.9, 0.9], [1.15, 1.25, 'out'], [1.8, 1]])(t) } },
      marks: [
        fly('steam', HEAD, t, 1.0, 1.0, -24, -44, -10, -40, { s0: 0.8, s1: 0.6, rot: -12 }),
        fly('steam', HEAD, t, 1.15, 1.0, 22, -48, 12, -40, { s0: 0.7, s1: 0.6, rot: 12 }),
      ],
    };
  }),

  /** Sprout Kid: the leaves wag, then stretch up for the sun, and one lets a leaf go. */
  sprout: bake(2.4, (t) => {
    const wag = shake(t, 0.2, 0.8, 3, 12);
    const grow = keys([[0, 1], [1.0, 0.9, 'inOut'], [1.4, 1.2, 'out'], [1.9, 1.16], [2.3, 1, 'inOut']])(t);
    return {
      ...stretch(keys([[0, 1], [1.0, 0.96, 'inOut'], [1.4, 1.03, 'out'], [1.9, 1.02], [2.3, 1, 'inOut']])(t)),
      parts: { [part('sprout', 'front_leaves')]: { rot: wag, sy: grow, sx: 1 + (grow - 1) * 0.3 } },
      marks: [fly('leaf', HEAD, t, 1.45, 0.9, 34, -40, 26, 70, { s0: 0.7, s1: 0, rot: 200 })],
    };
  }),

  /** Sail Kid: the sail takes the wind and carries the kid up on its toes. */
  sail: bake(2.4, (t) => {
    const fill = keys([[0, 0], [0.4, -0.3, 'out'], [0.8, 1, 'out'], [1.6, 0.9], [2.1, 0, 'inOut']])(t);
    return {
      rot: 4 * fill,
      pivotY: MID,
      y: -3 * Math.max(0, fill),
      ...stretch(1 + 0.03 * fill),
      parts: {
        [part('sail', 'back_sail')]: { sx: 1 + 0.14 * fill, rot: 3 * fill + (fill > 0.5 ? 1.5 * sin(t * 4) : 0) },
        [part('sail', 'front_rope')]: { rot: -2 * fill },
      },
      marks: [fly('tick', HEAD, t, 0.6, 0.4, -100, -20, 46, 0, { s0: 1.1, behind: true }), fly('tick', HEAD, t, 0.85, 0.4, -106, 12, 50, 0, { s0: 0.9, behind: true })],
    };
  }),

  /** Blizzard Kid: the snowflake on its head spins right round and flings three flakes. */
  blizzard: bake(2.2, (t) => {
    const spin = keys([[0, 0], [0.3, -25, 'out'], [1.3, 385, 'inOut'], [1.6, 360, 'out']])(t);
    return {
      ...stretch(keys([[0, 1], [0.3, 0.96, 'out'], [0.7, 1.03, 'out'], [1.4, 1.01], [1.7, 1]])(t)),
      parts: {
        [part('blizzard', 'front_snowflake')]: { rot: t >= 1.6 ? 0 : spin, sx: 1 + 0.06 * Math.sin(clamp01(span(t, 0.3, 1.3)) * Math.PI), sy: 1 + 0.06 * Math.sin(clamp01(span(t, 0.3, 1.3)) * Math.PI), about: 'centre' },
        [part('blizzard', 'front_muffler')]: { rot: shake(t, 0.5, 0.9, 2, 2.5) },
      },
      marks: [
        fly('snow', HEAD, t, 0.6, 0.6, -20, -26, -44, -16, { s0: 0.5, rot: -180 }),
        fly('snow', HEAD, t, 0.85, 0.6, 20, -28, 46, -10, { s0: 0.5, rot: 180 }),
        fly('snow', HEAD, t, 1.1, 0.6, 0, -40, 6, -34, { s0: 0.45, rot: 180 }),
      ],
    };
  }),

  /** Builder Kid: tosses the brick straight up, watches it hang, and catches it with a bump. */
  builder: bake(2.2, (t) => {
    const k = span(t, 0.45, 0.8);
    const up = k < 0 ? 0 : 4 * k * (1 - k);
    return {
      ...stretch(keys([[0, 1], [0.35, 0.95, 'out'], [0.5, 1.04, 'out'], [1.2, 1.01], [1.3, 0.94, 'in'], [1.55, 1.02, 'out'], [1.8, 1]])(t)),
      faceY: -2.5 * up,
      parts: {
        [part('builder', 'front_brick')]: { x: 3 * up, y: -34 * up + keys([[0, 0], [0.35, 4, 'out'], [0.45, 0], [1.25, 0], [1.32, 5, 'out'], [1.55, 0]])(t), rot: k < 0 ? 0 : 7 * Math.sin(k * Math.PI * 2), about: 'centre' },
        [part('builder', 'front_belt')]: { y: keys([[0, 0], [1.25, 0], [1.32, 1.5], [1.55, 0]])(t) },
      },
      marks: [fly('tick', HAND, t, 1.27, 0.25, 30, -46, 6, -12, { s0: 0.8, rot: -70 }), fly('tick', HAND, t, 1.27, 0.25, 48, -30, 14, -6, { s0: 0.8, rot: -30 })],
    };
  }),

  /** Forge Kid: the anvil jumps and comes down with a clang of sparks. */
  forge: bake(2.2, (t) => {
    const up = hop(t, 0.4, 0.45, 10);
    return {
      ...stretch(keys([[0, 1], [0.3, 0.94, 'out'], [0.45, 1.03, 'out'], [0.85, 1.01], [0.93, 0.9, 'in'], [1.15, 1.02, 'out'], [1.4, 1, 'inOut']])(t)),
      face: t > 0.87 && t < 1.1 ? 'blink' : 'inherit',
      parts: {
        [part('forge', 'front_anvil')]: { y: up, rot: shake(t, 0.87, 0.5, 2, 5) },
        [part('forge', 'front_apron')]: { y: keys([[0, 0], [0.87, 0], [0.95, 2.5], [1.2, 0]])(t) },
      },
      marks: [
        fly('spark', HEAD, t, 0.88, 0.5, -30, -16, -34, -22, { s0: 0.5, s1: 0.35, rot: 60 }),
        fly('spark', HEAD, t, 0.88, 0.5, 32, -18, 36, -20, { s0: 0.5, s1: 0.35, rot: -60 }),
        fly('spark', HEAD, t, 0.94, 0.5, 2, -40, 4, -34, { s0: 0.4, s1: 0.35 }),
      ],
    };
  }),

  /** Kite Kid: the kite catches a breeze and tugs; the kid reels the spool to hold it. */
  kite: bake(2.4, (t) => {
    const pull = keys([[0, 0], [0.5, 1, 'out'], [1.7, 1], [2.2, 0, 'inOut']])(t);
    const sway = pull * sin(t * 1.2);
    return {
      rot: 2.5 * sway,
      pivotY: MID,
      ...stretch(1 + 0.02 * pull),
      parts: {
        [part('kite', 'back_kite')]: { x: 6 * sway, y: -2 * pull, rot: 9 * sway },
        [part('kite', 'front_spool')]: { rot: pull * (Math.floor(t * 12) % 2 ? 16 : -16), about: 'centre' },
      },
      marks: [fly('tick', HEAD, t, 0.7, 0.4, -90, -44, 40, -6, { s0: 1, rot: -8, behind: true }), fly('tick', HEAD, t, 1.2, 0.4, -84, -70, 40, -6, { s0: 0.9, rot: -8, behind: true })],
    };
  }),

  // === The five of D-104 ========================================================================

  /** Bee Kid: the wings blur, and it lifts a little way off the ground and hangs there. */
  bee: bake(2.6, (t) => {
    const up = keys([[0, 0], [0.3, 0, 'out'], [0.7, 1, 'out'], [1.8, 1], [2.3, 0, 'in']])(t);
    const buzz = up > 0.02 || (t > 0.15 && t < 2.35) ? (Math.floor(t * 12) % 2 ? 1 : -1) : 0;
    return {
      y: -9 * up + 1.5 * up * sin(t * 1.5),
      ...stretch(keys([[0, 1], [0.3, 0.95, 'out'], [0.6, 1.04, 'out'], [1.8, 1.02], [2.3, 1.03], [2.4, 0.95, 'in'], [2.6, 1, 'out']])(t)),
      parts: {
        [part('bee', 'back_wing_left')]: { rot: 13 * buzz, sy: 1 - 0.12 * Math.abs(buzz) * (buzz > 0 ? 1 : 0) },
        [part('bee', 'back_wing_right')]: { rot: -13 * buzz, sy: 1 - 0.12 * Math.abs(buzz) * (buzz > 0 ? 1 : 0) },
        [part('bee', 'front_feelers')]: { rot: 5 * sin(t * 2.5) * up },
        [part('bee', 'front_band')]: { y: -1 * up },
      },
      marks: [fly('tick', TORSO, t, 0.7, 0.35, -34, 62, -12, 6, { s0: 0.8, rot: 70 }), fly('tick', TORSO, t, 0.7, 0.35, 34, 62, 12, 6, { s0: 0.8, rot: -70 })],
    };
  }),

  /** Sleepy Kid: nods off on its feet, sags, and catches itself with a start. */
  sleepy: bake(3, (t) => ({
    rot: keys([[0, 0], [0.5, 0], [1.6, 4.5, 'in'], [1.75, 5], [1.9, -1.5, 'out'], [2.2, 0, 'inOut']])(t),
    pivotY: MID,
    ...stretch(keys([[0, 1], [0.5, 1], [1.6, 0.95, 'in'], [1.75, 0.95], [1.92, 1.04, 'out'], [2.2, 0.98, 'inOut'], [2.5, 1, 'inOut']])(t)),
    y: hop(t, 1.78, 0.3, 4),
    face: steps([[0, 'inherit'], [0.5, 'blink'], [0.75, 'asleep'], [1.8, 'open'], [2.3, 'blink'], [2.45, 'inherit']])(t),
    parts: {
      [part('sleepy', 'front_cap')]: { rot: keys([[0, 0], [1.6, 5, 'in'], [1.78, 6], [1.95, -4, 'out'], [2.3, 2], [2.6, 0, 'inOut']])(t) },
      [part('sleepy', 'front_pillow')]: { y: keys([[0, 0], [1.6, 2, 'in'], [1.78, 2], [1.95, -2, 'out'], [2.3, 0, 'inOut']])(t), rot: keys([[0, 0], [1.6, -5, 'in'], [1.78, -5], [2.0, 2, 'out'], [2.3, 0]])(t) },
    },
    marks: [
      fly('z', HEAD, t, 0.9, 0.9, 52, -8, 24, -44, { s0: 0.6, s1: 0.5, rot: 14 }),
      fly('tick', HEAD, t, 1.8, 0.28, -52, -6, -16, -12, { s0: 0.8, rot: 30 }),
      fly('tick', HEAD, t, 1.8, 0.28, 62, 14, 16, -10, { s0: 0.8, rot: -30 }),
    ],
  })),

  /** Umbrella Kid: gives the umbrella a twirl, and the last of the rain flies off its rim. */
  umbrella: bake(2.4, (t) => {
    const k = span(t, 0.4, 1.2);
    const turn = k < 0 ? 0 : ease.inOut(k) * 2; // two turns of the canopy, seen as it narrows and widens
    const wide = Math.cos(turn * Math.PI * 2) * 0.5 + 0.5; // 1 facing us, 0 edge on
    return {
      ...stretch(keys([[0, 1], [0.35, 0.96, 'out'], [0.6, 1.03, 'out'], [1.6, 1.01], [1.9, 1]])(t)),
      parts: {
        [part('umbrella', 'front_canopy')]: { sx: 0.78 + 0.22 * wide, y: k < 0 ? 0 : -2 * Math.sin(k * Math.PI) },
        [part('umbrella', 'front_handle')]: { rot: keys([[0, 0], [0.35, 3, 'out'], [0.6, -2], [1.6, -1], [1.9, 0, 'inOut']])(t) },
      },
      marks: [
        fly('drop', HEAD, t, 0.6, 0.5, -96, 16, -30, 6, { arc: 12, s0: 0.5, rot: -70 }),
        fly('drop', HEAD, t, 0.85, 0.5, 96, 16, 28, 8, { arc: 12, s0: 0.5, rot: 70 }),
        fly('drop', HEAD, t, 1.1, 0.5, -90, 18, -26, 10, { arc: 10, s0: 0.45, rot: -70 }),
        fly('drop', HEAD, t, 1.3, 0.5, 92, 18, 24, 10, { arc: 10, s0: 0.45, rot: 70 }),
      ],
    };
  }),

  /** Wizard Kid: winds up, flicks the wand, and something goes off: a puff and a scatter of stars. */
  wizard: bake(2.4, (t) => {
    const wand = keys([[0, 0], [0.45, -14, 'inOut'], [0.6, 6, 'out'], [0.8, 3], [1.0, 5], [1.6, 0, 'inOut']])(t);
    return {
      rot: keys([[0, 0], [0.45, -2.5, 'inOut'], [0.6, 2.5, 'out'], [1.2, 1], [1.6, 0, 'inOut']])(t),
      pivotY: MID,
      ...stretch(keys([[0, 1], [0.45, 0.95, 'inOut'], [0.62, 1.04, 'out'], [1.0, 1.01], [1.6, 1]])(t)),
      face: t > 0.62 && t < 0.85 ? 'blink' : 'inherit',
      parts: {
        [part('wizard', 'front_wand')]: { rot: wand },
        [part('wizard', 'front_hat')]: { rot: keys([[0, 0], [0.6, 0], [0.75, 6, 'out'], [1.1, -3], [1.5, 0, 'inOut']])(t), y: hop(t, 0.6, 0.35, 3) },
      },
      marks: [
        fly('dust', HAND, t, 0.62, 0.7, 30, -84, 6, -14, { s0: 0.7, s1: 0.9 }),
        fly('star', HAND, t, 0.66, 0.8, 26, -90, -30, -34, { s0: 0.45, s1: 0.4, rot: -90, arc: 6 }),
        fly('star', HAND, t, 0.72, 0.8, 34, -92, 26, -40, { s0: 0.4, s1: 0.4, rot: 90, arc: 6 }),
        fly('spark', HAND, t, 0.8, 0.8, 30, -96, 0, -50, { s0: 0.5, s1: 0.4 }),
      ],
    };
  }),

  /** Star Kid: twinkles. It swells, turns a little each way, and sparks light at its points. */
  star: bake(2.4, (t) => {
    const glow = keys([[0, 0], [0.3, -0.4, 'out'], [0.7, 1, 'out'], [1.1, 0.6], [1.5, 1, 'inOut'], [2.1, 0, 'inOut']])(t);
    return {
      sx: 1 + 0.05 * glow,
      sy: 1 + 0.05 * glow,
      rot: 5 * sin(t / 1.2) * Math.max(0, glow),
      pivotY: MID,
      marks: [
        fly('spark', HEAD, t, 0.7, 0.55, 0, -22, 0, -18, { s0: 0.5, s1: 0.5 }),
        fly('spark', TORSO, t, 0.95, 0.55, -96, -52, -14, -8, { s0: 0.45, s1: 0.4 }),
        fly('spark', TORSO, t, 1.2, 0.55, 96, -52, 14, -8, { s0: 0.45, s1: 0.4 }),
        fly('spark', HEAD, t, 1.5, 0.55, 4, -24, 0, -18, { s0: 0.4, s1: 0.4 }),
      ],
    };
  }),
  ...tier3,
  ...tier4,
  ...tier5,
  ...wildHabits,
};
