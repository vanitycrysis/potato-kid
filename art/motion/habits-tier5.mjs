// Habits of the tier 5 kids, D-099 (Wizard is in habits.mjs). See habits.mjs for how habits
// are written.
import { fly, hop, mark, MID, part, shake, span, stretch, HAND, HEAD } from './habit-kit.mjs';
import { bake, clamp01, keys, sin } from './lib.mjs';

/** A pulse: 0 to 1 and back over `d` seconds from `t0`. */
const pulse = (t, t0, d) => {
  const k = span(t, t0, d);
  return k < 0 ? 0 : Math.sin(k * Math.PI);
};

export const tier5 = {
  /** Festival Kid: four beats on the drum, bobbing to them, and the bunting swings in time. */
  festival: bake(2.6, (t) => {
    const beat = pulse(t, 0.3, 0.2) + pulse(t, 0.7, 0.2) + pulse(t, 1.1, 0.2) + pulse(t, 1.5, 0.2);
    return {
      ...stretch(1 - 0.035 * beat),
      rot: 2.5 * sin((t - 0.3) / 0.8) * (t > 0.3 && t < 1.9 ? 1 : 0),
      pivotY: MID,
      parts: {
        [part('festival', 'front_drum')]: { y: 3 * beat, rot: -4 * beat },
        [part('festival', 'front_bunting')]: { rot: 5 * sin((t - 0.3) / 0.8) * (t > 0.3 && t < 1.9 ? 1 : 0) },
      },
      marks: [
        fly('note', HAND, t, 0.35, 0.8, 30, -40, 14, -40, { s0: 0.6, s1: 0.2, rot: 12 }),
        fly('note', HAND, t, 1.15, 0.8, 16, -46, -10, -38, { s0: 0.6, s1: 0.2, rot: -12 }),
        fly('tick', HAND, t, 0.72, 0.22, 44, -12, 14, -8, { s0: 0.6, rot: -30 }),
        fly('tick', HAND, t, 1.52, 0.22, 44, -12, 14, -8, { s0: 0.6, rot: -30 }),
      ],
    };
  }),

  /** Observatory Kid: raises the telescope to the sky, the dome turning with it, and finds a star. */
  observatory: bake(3, (t) => {
    const up = keys([[0, 0], [0.7, 1, 'inOut'], [2.0, 1], [2.7, 0, 'inOut']])(t);
    const found = span(t, 1.1, 1.0);
    return {
      rot: -2.5 * up,
      pivotY: MID,
      faceY: -2 * up,
      parts: {
        [part('observatory', 'front_telescope')]: { rot: -20 * up, y: -3 * up },
        [part('observatory', 'front_dome')]: { rot: -5 * up },
      },
      marks: [found < 0 ? null : mark('star', HEAD, 74, -40, { s: 0.25 + 0.45 * clamp01(found / 0.25), a: found > 0.75 ? (1 - found) / 0.25 : 1, rot: 20 * found })],
    };
  }),

  /** Botanical Garden Kid: holds the tray up to show what has come on, and the trellis sways. */
  botanical_garden: bake(2.8, (t) => {
    const show = keys([[0, 0], [0.6, 1, 'inOut'], [1.8, 1], [2.4, 0, 'inOut']])(t);
    return {
      ...stretch(1 + 0.025 * show),
      parts: {
        [part('botanical_garden', 'front_tray')]: { y: -6 * show, rot: -4 * show },
        [part('botanical_garden', 'back_trellis')]: { rot: 3 * sin(t / 1.4) * show },
      },
      marks: [
        fly('leaf', HAND, t, 0.8, 1.0, 20, -34, 16, -34, { s0: 0.45, s1: 0.15, rot: -80 }),
        fly('leaf', HAND, t, 1.2, 1.0, 34, -30, -4, -38, { s0: 0.4, s1: 0.15, rot: 80 }),
      ],
    };
  }),

  /** Moon Garden Kid: the crescent rocks like a cradle and the lamp swings with it, slow and even. */
  moon_garden: bake(3.2, (t) => {
    const on = keys([[0, 0], [0.5, 1, 'inOut'], [2.6, 1], [3.2, 0, 'inOut']])(t);
    const rock = on * sin(t / 1.6);
    return {
      rot: 1.5 * rock,
      pivotY: MID,
      face: t > 1.4 && t < 2.2 ? 'asleep' : 'inherit',
      parts: {
        [part('moon_garden', 'front_crescent')]: { rot: 8 * rock },
        [part('moon_garden', 'front_lamp')]: { rot: -9 * rock },
      },
      marks: [fly('spark', HAND, t, 1.0, 0.7, 26, -18, 4, -10, { s0: 0.3, s1: 0.4 })],
    };
  }),

  /** Patisserie Kid: three squeezes of the piping bag, a dot of cream each, and the cake gets its sparkle. */
  patisserie: bake(2.8, (t) => {
    const squeeze = pulse(t, 0.4, 0.3) + pulse(t, 0.9, 0.3) + pulse(t, 1.4, 0.3);
    return {
      ...stretch(1 - 0.02 * squeeze),
      parts: {
        [part('patisserie', 'front_bag')]: { sx: 1 - 0.12 * squeeze, sy: 1 + 0.08 * squeeze, rot: -4 * squeeze },
        [part('patisserie', 'front_cake')]: { y: keys([[0, 0], [1.9, 0], [2.05, -3, 'out'], [2.3, 0, 'in']])(t) },
      },
      marks: [
        fly('dust', HAND, t, 0.55, 0.5, 34, 6, 6, 18, { s0: 0.22, s1: 0.1 }),
        fly('dust', HAND, t, 1.05, 0.5, 36, 4, 8, 20, { s0: 0.22, s1: 0.1 }),
        fly('dust', HAND, t, 1.55, 0.5, 32, 6, 6, 18, { s0: 0.22, s1: 0.1 }),
        fly('spark', HEAD, t, 2.0, 0.6, 26, -34, 6, -8, { s0: 0.3, s1: 0.5 }),
      ],
    };
  }),

  /** Winter Market Kid: snow gathers on the awning until the kid shakes it off in one go. */
  winter_market: bake(3, (t) => {
    const load = keys([[0, 0], [1.5, 1, 'linear'], [1.7, 1], [1.85, 0, 'out']])(t);
    const off = shake(t, 1.7, 0.6, 4, 1);
    return {
      x: 2 * off,
      ...stretch(1 - 0.03 * load + (t > 1.85 && t < 2.3 ? 0.03 * Math.sin(clamp01((t - 1.85) / 0.45) * Math.PI) : 0)),
      parts: {
        [part('winter_market', 'front_awning')]: { y: 3 * load, rot: 5 * off },
        [part('winter_market', 'front_apron')]: { rot: -2 * off },
      },
      marks: [
        fly('snow', HEAD, t, 0.2, 0.7, -30, -70, 4, 40, { s0: 0.35, rot: 90 }),
        fly('snow', HEAD, t, 0.6, 0.7, 20, -74, -4, 42, { s0: 0.35, rot: -90 }),
        fly('snow', HEAD, t, 1.0, 0.7, -6, -72, 2, 40, { s0: 0.35, rot: 90 }),
        fly('dust', HEAD, t, 1.75, 0.6, -50, -12, -30, 26, { s0: 0.35, s1: 0.3, arc: 10 }),
        fly('dust', HEAD, t, 1.8, 0.6, 52, -12, 30, 26, { s0: 0.35, s1: 0.3, arc: 10 }),
      ],
    };
  }),

  /** Harbor Kid: swings the anchor out, lets it drop, and rings spread where it went in. */
  harbor: bake(3, (t) => {
    const swing = keys([[0, 0], [0.4, -3, 'out'], [0.8, 14, 'inOut'], [1.0, 14], [1.9, 0, 'inOut']])(t);
    const drop = keys([[0, 0], [1.0, 0], [1.2, 7, 'in'], [1.6, 7], [2.2, 0, 'inOut']])(t);
    const ring = (t0) => {
      const k = span(t, t0, 0.8);
      return k < 0 ? null : mark('ring', HAND, 22, 52, { s: 0.4 + 0.9 * k, a: 1 - k });
    };
    return {
      rot: swing * 0.15,
      pivotY: MID,
      ...stretch(keys([[0, 1], [1.0, 1.02, 'inOut'], [1.2, 0.97, 'in'], [1.7, 1, 'out']])(t)),
      parts: { [part('harbor', 'front_anchor')]: { rot: swing, y: drop }, [part('harbor', 'back_posts')]: { rot: -swing * 0.1 } },
      marks: [ring(1.2), ring(1.5), fly('drop', HAND, t, 1.22, 0.4, 20, 40, -12, -20, { s0: 0.35, s1: 0.05, arc: 10 })],
    };
  }),

  /** Sky Fair Kid: cannot wait for its turn: two eager hops, waving the ticket. */
  sky_fair: bake(2.6, (t) => {
    const hops = hop(t, 0.4, 0.4, 7) + hop(t, 1.0, 0.4, 7);
    const land = keys([[0, 1], [0.3, 0.95, 'out'], [0.45, 1.03, 'out'], [0.78, 1.01], [0.86, 0.95, 'in'], [1.05, 1.03, 'out'], [1.38, 1.01], [1.46, 0.95, 'in'], [1.75, 1, 'out']])(t);
    const wave = t > 0.3 && t < 1.7 ? 14 * sin((t - 0.3) / 0.35) : 0;
    return {
      y: hops,
      ...stretch(land),
      parts: {
        [part('sky_fair', 'front_ticket')]: { rot: wave, y: hops * 0.4 },
        [part('sky_fair', 'back_wheel')]: { y: -hops * -0.25 },
      },
    };
  }),

  /** Rescue Station Kid: on the alert. It rises on its toes, looks both ways, and flashes the torch twice. */
  rescue_station: bake(2.8, (t) => {
    const alert = keys([[0, 0], [0.3, 1, 'out'], [2.2, 1], [2.7, 0, 'inOut']])(t);
    const flash = (t0) => [-1, 0, 1].map((i) => fly('tick', HAND, t, t0, 0.3, 36, -30 + i * 12, 22, i * 10 - 4, { s0: 0.8, s1: 0.3, rot: i * 25 }));
    return {
      ...stretch(1 + 0.035 * alert),
      y: -1.5 * alert,
      faceX: 4.5 * keys([[0, 0], [0.5, -1, 'inOut'], [1.0, -1], [1.5, 1, 'inOut'], [2.0, 1], [2.5, 0, 'inOut']])(t),
      parts: {
        [part('rescue_station', 'front_torch')]: { rot: -10 * alert, y: -3 * alert },
        [part('rescue_station', 'back_stretcher')]: { rot: 1.5 * alert },
      },
      marks: [...flash(0.7), ...flash(1.7)],
    };
  }),

  /** Sculpture Park Kid: holds a statue's stillness, eyes open, until its own sculpture wobbles and gives it away. */
  sculpture_park: bake(3, (t) => ({
    rot: shake(t, 1.9, 0.8, 3, 2.5),
    pivotY: MID,
    face: t > 1.95 && t < 2.2 ? 'blink' : 'open',
    parts: {
      [part('sculpture_park', 'front_spiral')]: { rot: shake(t, 1.3, 1.2, 4, 6) },
      [part('sculpture_park', 'front_plinth')]: { rot: shake(t, 1.9, 0.8, 3, -1) },
    },
  })),

  /** Windmill Kid: a gust leans the mill; the kid braces, hefts the sack of grain, and a little flour gets out. */
  windmill: bake(2.8, (t) => {
    const gust = keys([[0, 0], [0.3, 0, 'out'], [0.7, 1, 'out'], [1.7, 1], [2.3, 0, 'inOut']])(t);
    return {
      rot: -2.5 * gust,
      pivotY: MID,
      ...stretch(1 - 0.02 * gust),
      parts: {
        [part('windmill', 'back_sails')]: { rot: -3 * gust + gust * 1.2 * sin(t * 3) },
        [part('windmill', 'front_grain')]: { y: -5 * gust, rot: shake(t, 0.8, 0.9, 3, 9) },
      },
      marks: [
        fly('tick', HEAD, t, 0.4, 0.4, 96, -30, -60, 0, { s0: 1, behind: true }),
        fly('tick', HEAD, t, 0.75, 0.4, 100, -4, -64, 0, { s0: 0.85, behind: true }),
        fly('dust', HAND, t, 1.0, 0.8, 30, -18, 18, -20, { s0: 0.3, s1: 0.4 }),
      ],
    };
  }),

  /** Mosaic Kid: turns its tiles to the light, and they glint one after another along the row. */
  mosaic: bake(2.8, (t) => ({
    rot: keys([[0, 0], [0.6, -2.5, 'inOut'], [1.6, 2.5, 'inOut'], [2.4, 0, 'inOut']])(t),
    pivotY: MID,
    parts: {
      [part('mosaic', 'front_tiles')]: { rot: keys([[0, 0], [0.6, -4, 'inOut'], [1.6, 4, 'inOut'], [2.4, 0, 'inOut']])(t) },
    },
    marks: [-1, 0, 1, 2].map((i) => fly('spark', HEAD, t, 0.5 + (i + 1) * 0.3, 0.5, i * 24 - 12, -24, 0, -8, { s0: 0.25, s1: 0.5 })),
  })),
};
