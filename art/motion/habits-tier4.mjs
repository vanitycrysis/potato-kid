// Habits of the tier 4 kids, D-099 (Lantern is with tier 3; Bee, Sleepy and Umbrella are in
// habits.mjs). See habits.mjs for how habits are written.
import { flutter, fly, hop, mark, MID, part, shake, span, stretch, HAND, HEAD, TORSO } from './habit-kit.mjs';
import { bake, keys, sin } from './lib.mjs';

export const tier4 = {
  /** Picnic Kid: swings the basket back and forth and does two small skips on the spot. */
  picnic: bake(2.4, (t) => {
    const swing = 13 * sin(t / 1.2) * keys([[0, 0], [0.3, 1, 'out'], [1.9, 1], [2.4, 0, 'inOut']])(t);
    const land = keys([[0, 1], [0.5, 1], [0.6, 0.96, 'out'], [0.75, 1.03, 'out'], [1.1, 1], [1.2, 0.96, 'out'], [1.35, 1.03, 'out'], [1.7, 1, 'inOut']])(t);
    return {
      y: hop(t, 0.62, 0.4, 7) + hop(t, 1.22, 0.4, 7),
      ...stretch(land),
      parts: {
        [part('picnic', 'front_basket')]: { rot: swing },
        [part('picnic', 'front_hat')]: { y: (hop(t, 0.62, 0.4, 7) + hop(t, 1.22, 0.4, 7)) * -0.3, rot: swing * 0.2 },
        [part('picnic', 'front_bib')]: { rot: -swing * 0.1 },
      },
    };
  }),

  /** Greenhouse Kid: lifts the roof like a lid to let the air in, and a leaf escapes. */
  greenhouse: bake(2.6, (t) => {
    const lift = keys([[0, 0], [0.4, -3, 'out'], [0.8, 16, 'out'], [1.6, 14], [2.1, 0, 'in'], [2.25, -2, 'out'], [2.5, 0]])(t);
    return {
      ...stretch(keys([[0, 1], [0.4, 0.97, 'out'], [0.8, 1.02, 'out'], [2.1, 1.01], [2.2, 0.97, 'in'], [2.5, 1, 'out']])(t)),
      parts: {
        [part('greenhouse', 'front_roof')]: { rot: -lift * 0.8, y: -lift * 0.35 },
        [part('greenhouse', 'front_tray')]: { y: keys([[0, 0], [2.1, 0], [2.2, 1.5], [2.5, 0]])(t) },
      },
      marks: [fly('leaf', HEAD, t, 0.9, 1.1, 10, -30, 38, -30, { s0: 0.5, s1: 0.2, rot: -160, arc: 14 })],
    };
  }),

  /** Bouquet Kid: leans in to the flowers for a long sniff, eyes shut, and one petal comes loose. */
  bouquet: bake(2.8, (t) => {
    const sniff = keys([[0, 0], [0.6, 1, 'inOut'], [1.6, 1], [2.2, 0, 'inOut']])(t);
    return {
      rot: 3 * sniff,
      pivotY: MID,
      ...stretch(keys([[0, 1], [0.6, 1.02, 'inOut'], [1.0, 1.04, 'inOut'], [1.6, 1.01], [2.2, 1]])(t)),
      face: t > 0.7 && t < 1.7 ? 'asleep' : 'inherit',
      parts: {
        [part('bouquet', 'front_flowers')]: { y: -4 * sniff, rot: 3 * sniff },
        [part('bouquet', 'front_wrap')]: { rot: -1.5 * sniff },
      },
      marks: [fly('leaf', HAND, t, 1.2, 1.2, 14, -40, 20, 84, { s0: 0.5, s1: 0, rot: 240 })],
    };
  }),

  /** Bonsai Kid: stands perfectly still, then the little tree shivers and drops one leaf. */
  bonsai: bake(2.8, (t) => ({
    ...stretch(keys([[0, 1], [0.9, 1], [1.05, 0.98, 'out'], [1.3, 1.01], [1.6, 1]])(t)),
    parts: {
      [part('bonsai', 'front_tree')]: { rot: shake(t, 0.9, 0.7, 4, 5) },
      [part('bonsai', 'front_tray')]: { rot: shake(t, 0.9, 0.7, 4, -1) },
    },
    marks: [fly('leaf', HEAD, t, 1.2, 1.3, -60, -26, -42, 80, { s0: 0.5, s1: 0, rot: -260 })],
    face: t > 2.3 && t < 2.5 ? 'blink' : 'inherit',
  })),

  /** Terrarium Kid: rocks the jar gently and watches bubbles rise through it. */
  terrarium: bake(2.6, (t) => {
    const rock = 5 * sin(t / 1.3) * keys([[0, 0], [0.4, 1, 'out'], [2.0, 1], [2.6, 0, 'inOut']])(t);
    return {
      rot: rock * 0.3,
      pivotY: MID,
      parts: {
        [part('terrarium', 'front_jar')]: { rot: rock },
        [part('terrarium', 'front_mushroom')]: { y: hop(t, 0.9, 0.35, 4) + hop(t, 1.6, 0.35, 4) },
      },
      marks: [
        fly('bubble', HEAD, t, 0.5, 0.9, -10, -8, 4, -30, { s0: 0.3, s1: 0.25 }),
        fly('bubble', HEAD, t, 1.0, 0.9, 12, -6, -4, -32, { s0: 0.25, s1: 0.25 }),
        fly('bubble', HEAD, t, 1.5, 0.9, 0, -10, 6, -28, { s0: 0.3, s1: 0.2 }),
      ],
    };
  }),

  /** Teapot Kid: comes to the boil; the lid rattles, steam jets, and it tips itself to pour. */
  teapot: bake(2.8, (t) => {
    const boil = t > 0.3 && t < 1.2 ? flutter(t) : 0;
    const pour = keys([[0, 0], [1.2, 0], [1.6, -9, 'inOut'], [2.1, -9], [2.5, 0, 'inOut']])(t);
    return {
      rot: pour,
      pivotY: MID,
      ...stretch(keys([[0, 1], [0.3, 1.02, 'inOut'], [1.2, 1.03], [1.6, 1, 'inOut']])(t)),
      parts: {
        [part('teapot', 'front_lid')]: { y: -2.5 * Math.max(0, boil), rot: 3 * boil },
        [part('teapot', 'front_spout')]: { rot: pour * 0.3 },
        [part('teapot', 'back_handle')]: { rot: pour * 0.2 },
      },
      marks: [
        fly('steam', HEAD, t, 0.4, 0.7, -8, -30, -8, -36, { s0: 0.5, s1: 0.5 }),
        fly('steam', HEAD, t, 0.8, 0.7, 8, -30, 8, -36, { s0: 0.5, s1: 0.5 }),
        fly('drop', TORSO, t, 1.7, 0.45, -112, -2, -6, 40, { s0: 0.4, s1: 0.1 }),
        fly('drop', TORSO, t, 1.95, 0.45, -114, 0, -6, 38, { s0: 0.4, s1: 0.1 }),
      ],
    };
  }),

  /** Cookie Kid: three quick nibbles shake the cookie, and crumbs tumble. */
  cookie: bake(2.4, (t) => {
    const bite = (t0) => {
      const k = span(t, t0, 0.22);
      return k < 0 ? 0 : Math.sin(k * Math.PI);
    };
    const nib = bite(0.4) + bite(0.8) + bite(1.2);
    return {
      ...stretch(1 - 0.03 * nib),
      face: nib > 0.4 ? 'blink' : 'inherit',
      parts: { [part('cookie', 'front_cookie')]: { rot: -6 * nib, y: 2.5 * nib }, [part('cookie', 'front_pocket')]: { y: 1 * nib } },
      marks: [
        fly('dust', HEAD, t, 0.5, 0.6, -48, -6, -34, 44, { s0: 0.22, s1: 0.05, rot: 90, arc: 8 }),
        fly('dust', HEAD, t, 0.9, 0.6, 50, -8, 36, 46, { s0: 0.2, s1: 0.05, rot: -90, arc: 8 }),
        fly('dust', HEAD, t, 1.3, 0.6, -52, -4, -36, 42, { s0: 0.22, s1: 0.05, rot: 60, arc: 8 }),
      ],
    };
  }),

  /** Pretzel Kid: the pretzel gives itself an extra twist one way, then the other, and springs back. */
  pretzel: bake(2.4, (t) => {
    const twist = keys([[0, 0], [0.5, 22, 'inOut'], [1.0, -22, 'inOut'], [1.3, 6, 'out'], [1.6, 0, 'inOut']])(t);
    return {
      rot: twist * 0.12,
      pivotY: MID,
      parts: {
        [part('pretzel', 'front_pretzel')]: { rot: twist, sx: 1 - Math.abs(twist) * 0.006, about: 'centre' },
        [part('pretzel', 'front_ribbon')]: { rot: -twist * 0.3 },
      },
    };
  }),

  /** Soup Kid: stirs the pot, round and round, and has a taste. */
  soup: bake(2.8, (t) => {
    const stir = keys([[0, 0], [0.3, 1, 'out'], [1.6, 1], [1.9, 0, 'inOut']])(t);
    const taste = keys([[0, 0], [1.9, 0], [2.2, 1, 'out'], [2.5, 1], [2.8, 0, 'inOut']])(t);
    return {
      rot: 2 * stir * sin(t * 1.5),
      pivotY: MID,
      face: taste > 0.6 ? 'blink' : 'inherit',
      parts: {
        [part('soup', 'front_ladle')]: { rot: stir * 14 * sin(t * 1.5) - 22 * taste, x: stir * 4 * sin(t * 1.5 + 0.25), y: -8 * taste },
        [part('soup', 'front_pot')]: { rot: stir * -1.5 * sin(t * 1.5) },
      },
      marks: [
        fly('steam', TORSO, t, 0.5, 0.9, 86, -10, 6, -24, { s0: 0.5, s1: 0.4 }),
        fly('steam', TORSO, t, 1.1, 0.9, 100, -8, 8, -24, { s0: 0.5, s1: 0.4 }),
      ],
    };
  }),

  /** Snowglobe Kid: gives itself a good shake, and the snow swirls up and settles. */
  snowglobe: bake(2.8, (t) => {
    const jolt = t > 0.3 && t < 0.9 ? 2.6 * flutter(t) : 0;
    const swirl = (i) => {
      const k = span(t, 0.5 + i * 0.12, 1.7);
      if (k < 0) return null;
      const a = (i * 1.7 + k * 5) % (Math.PI * 2);
      return mark('snow', HEAD, 26 * Math.cos(a) * (1 - k * 0.3), -34 + 16 * Math.sin(a) + 26 * k * k, { s: 0.38, a: k > 0.75 ? (1 - k) / 0.25 : Math.min(1, k * 6), rot: 200 * k, behind: Math.sin(a) < 0 });
    };
    return {
      x: jolt,
      ...stretch(keys([[0, 1], [0.3, 0.97, 'out'], [0.9, 0.97], [1.2, 1.02, 'out'], [1.6, 1]])(t)),
      face: t > 0.9 && t < 1.15 ? 'blink' : 'inherit',
      parts: { [part('snowglobe', 'back_globe')]: { rot: -jolt * 1.2 }, [part('snowglobe', 'front_pedestal')]: { rot: jolt * 0.3 } },
      marks: [0, 1, 2, 3, 4].map(swirl),
    };
  }),

  /** Ice Sculptor Kid: three taps of the chisel, chips flying, and a look at the work. */
  ice_sculptor: bake(2.6, (t) => {
    const tap = (t0) => {
      const k = span(t, t0, 0.2);
      return k < 0 ? 0 : Math.sin(k * Math.PI);
    };
    const taps = tap(0.4) + tap(0.75) + tap(1.1);
    return {
      ...stretch(1 - 0.02 * taps),
      rot: keys([[0, 0], [1.5, 0], [1.9, -3, 'inOut'], [2.3, 0, 'inOut']])(t),
      pivotY: MID,
      parts: { [part('ice_sculptor', 'front_ice')]: { rot: -7 * taps, x: 2 * taps }, [part('ice_sculptor', 'front_holster')]: { rot: 2 * taps } },
      marks: [
        fly('snow', HAND, t, 0.45, 0.45, 30, -30, 22, -20, { s0: 0.3, s1: 0.1, arc: 6, rot: 140 }),
        fly('tick', HAND, t, 0.8, 0.3, 34, -24, 18, -4, { s0: 0.6, rot: -30 }),
        fly('snow', HAND, t, 1.15, 0.45, 28, -34, 24, -14, { s0: 0.3, s1: 0.1, arc: 6, rot: -140 }),
      ],
    };
  }),

  /** Weather Vane Kid: the wind changes: the arrow swings round to point the other way, and back, the compass quivering after it. */
  weather_vane: bake(2.6, (t) => {
    // Seen from the front, a vane turning on its post narrows to nothing and opens out the other way.
    const face = keys([[0, 1], [0.3, 1.06, 'out'], [0.9, -1, 'inOut'], [1.3, -1], [1.9, 1, 'inOut'], [2.1, 1.05, 'out'], [2.3, 1, 'inOut']])(t);
    return {
      rot: keys([[0, 0], [0.5, 2, 'inOut'], [1.2, -2, 'inOut'], [1.8, 0, 'inOut']])(t),
      pivotY: MID,
      parts: {
        [part('weather_vane', 'front_arrow')]: { sx: Math.abs(face) < 0.08 ? 0.08 * Math.sign(face || 1) : face, about: 'centre' },
        [part('weather_vane', 'front_compass')]: { rot: shake(t, 1.0, 1.0, 5, 14), about: 'centre' },
      },
      marks: [fly('tick', HEAD, t, 0.4, 0.4, -86, -30, 50, 0, { s0: 1, behind: true }), fly('tick', HEAD, t, 0.7, 0.4, -90, -8, 52, 0, { s0: 0.85, behind: true })],
    };
  }),

  /** Balloon Kid: the balloon tugs upward and the kid goes up on its toes after it, basket swaying. */
  balloon: bake(2.8, (t) => {
    const lift = keys([[0, 0], [0.5, 1, 'out'], [1.9, 1], [2.5, 0, 'inOut']])(t);
    const sway = lift * sin(t / 1.4);
    return {
      y: -3 * lift + 1 * sway,
      ...stretch(1 + 0.02 * lift),
      rot: 2 * sway,
      pivotY: MID,
      parts: {
        [part('balloon', 'back_balloon')]: { y: -1 * lift, rot: 5 * sway },
        [part('balloon', 'front_basket')]: { rot: -5 * sway },
      },
    };
  }),

  /** Steamboat Kid: rocks as if on a swell while the funnel sends up three puffs. */
  steamboat: bake(2.8, (t) => {
    const swell = 4 * sin(t / 1.4) * keys([[0, 0], [0.4, 1, 'out'], [2.2, 1], [2.8, 0, 'inOut']])(t);
    const puff = (t0) => {
      const k = span(t, t0, 0.25);
      return k < 0 ? 0 : Math.sin(k * Math.PI);
    };
    const chuff = puff(0.5) + puff(1.1) + puff(1.7);
    return {
      rot: swell,
      pivotY: MID,
      y: -1.5 * Math.abs(swell) * 0.4,
      parts: {
        [part('steamboat', 'front_funnel')]: { sy: 1 - 0.1 * chuff, sx: 1 + 0.06 * chuff },
        [part('steamboat', 'front_hull')]: { rot: -swell * 0.25 },
      },
      marks: [0.55, 1.15, 1.75].map((t0, i) => fly('dust', HEAD, t, t0, 0.8, 2 + i * 2, -42, -18, -30, { s0: 0.4, s1: 0.5 })),
    };
  }),

  /** Lifeguard Kid: on lookout. It leans to scan one way, then the other, the float held ready. */
  lifeguard: bake(3, (t) => {
    const side = keys([[0, 0], [0.5, -1, 'inOut'], [1.2, -1], [1.8, 1, 'inOut'], [2.4, 1], [2.9, 0, 'inOut']])(t);
    return {
      rot: 3 * side,
      pivotY: MID,
      faceX: 5 * side,
      ...stretch(1 + 0.02 * Math.abs(side)),
      parts: {
        [part('lifeguard', 'front_float')]: { rot: -8 * Math.abs(side), y: -4 * Math.abs(side) },
        [part('lifeguard', 'front_buoy')]: { rot: -3 * side },
      },
    };
  }),

  /** Kiln Kid: fans the fire with the tile; a flame leaps in the arch and settles. */
  kiln: bake(2.6, (t) => {
    const fan = t > 0.3 && t < 1.3 ? 10 * sin((t - 0.3) * 4) : 0;
    const fire = span(t, 0.6, 1.5);
    return {
      ...stretch(keys([[0, 1], [0.3, 0.98, 'out'], [1.3, 0.98], [1.6, 1.01, 'out'], [2, 1]])(t)),
      parts: { [part('kiln', 'front_tile')]: { rot: fan }, [part('kiln', 'front_arch')]: { sy: 1 + (fire < 0 ? 0 : 0.04 * Math.sin(fire * Math.PI)) } },
      marks: [fire < 0 ? null : mark('flame', HEAD, 0 + 2 * flutter(t), -30, { s: 0.3 + 0.55 * Math.sin(fire * Math.PI), a: fire > 0.8 ? (1 - fire) / 0.2 : 1 })],
    };
  }),

  /** Aurora Kid: the curtain of light ripples across the sky behind it, and the pendant swings. */
  aurora: bake(3, (t) => {
    const on = keys([[0, 0], [0.5, 1, 'inOut'], [2.3, 1], [3, 0, 'inOut']])(t);
    return {
      rot: 1.5 * on * sin(t / 1.5),
      pivotY: MID,
      parts: {
        [part('aurora', 'back_curtain')]: { sx: 1 + 0.07 * on * sin(t / 0.9), sy: 1 + 0.05 * on * sin(t / 0.9 + 0.25), rot: 3 * on * sin(t / 1.5) },
        [part('aurora', 'front_pendant')]: { rot: 12 * on * sin(t / 0.75) },
      },
      marks: [
        fly('spark', HEAD, t, 0.7, 0.7, -60, -28, 20, -6, { s0: 0.3, s1: 0.4, behind: true }),
        fly('spark', HEAD, t, 1.3, 0.7, 40, -36, 22, -4, { s0: 0.3, s1: 0.4, behind: true }),
      ],
    };
  }),
};
