// Habits of the tier 3 kids (and Lantern, the first of tier 4), D-099. See habits.mjs for how
// habits are written.
import { flutter, fly, hop, mark, MID, part, shake, span, stretch, HAND, HEAD, TORSO } from './habit-kit.mjs';
import { bake, clamp01, ease, keys, sin } from './lib.mjs';

export const tier3 = {
  /** Hero Kid: chest out, cape streaming, and the medal catches the light. */
  hero: bake(2.4, (t) => {
    const proud = keys([[0, 0], [0.3, -0.5, 'out'], [0.6, 1, 'out'], [1.6, 1], [2.1, 0, 'inOut']])(t);
    return {
      ...stretch(1 + 0.04 * proud),
      rot: -1.5 * proud,
      pivotY: MID,
      parts: {
        [part('hero', 'back_cape')]: { sx: 1 + 0.1 * Math.max(0, proud), rot: Math.max(0, proud) * (4 + 3 * sin(t * 2.5)) },
        [part('hero', 'front_medal')]: { rot: shake(t, 0.6, 0.8, 2, 10) },
      },
      marks: [fly('spark', TORSO, t, 0.75, 0.6, 26, 22, 10, -6, { s0: 0.4, s1: 0.5 })],
    };
  }),

  /** Sundae Kid: the cherry jumps off the top, hangs, and lands back with a wobble through the whole bowl. */
  sundae: bake(2.4, (t) => {
    const up = hop(t, 0.4, 0.6, 16);
    const wob = shake(t, 1.0, 0.9, 3, 1);
    return {
      sx: 1 + 0.035 * wob,
      sy: keys([[0, 1], [0.3, 0.95, 'out'], [0.45, 1.03, 'out'], [0.98, 1.01], [1.06, 0.95, 'in'], [1.3, 1, 'out']])(t) - 0.035 * wob,
      faceY: up * 0.12,
      parts: {
        [part('sundae', 'front_cherry')]: { y: up, rot: up * -1.2, about: 'centre' },
        [part('sundae', 'front_rim')]: { rot: 1.5 * wob },
        [part('sundae', 'back_bowl')]: { rot: 1.5 * wob },
      },
    };
  }),

  /** Gardener Kid: two quick digs with the trowel, and a little earth flies. */
  gardener: bake(2.4, (t) => {
    const dig = keys([[0, 0], [0.3, -14, 'out'], [0.45, 26, 'in'], [0.7, 6, 'out'], [0.9, -12, 'out'], [1.05, 26, 'in'], [1.3, 6, 'out'], [1.7, 0, 'inOut']])(t);
    const dip = keys([[0, 0], [0.45, 1, 'in'], [0.7, 0.3, 'out'], [1.05, 1, 'in'], [1.3, 0.2, 'out'], [1.7, 0]])(t);
    return {
      rot: 3.5 * dip,
      pivotY: MID,
      ...stretch(1 - 0.04 * dip),
      parts: {
        [part('gardener', 'front_trowel')]: { rot: dig, y: 3 * dip },
        [part('gardener', 'front_hat')]: { rot: -4 * dip, y: 1.5 * dip },
        [part('gardener', 'front_apron')]: { y: 1 * dip },
      },
      marks: [
        fly('dust', HAND, t, 0.47, 0.5, 30, 22, 14, -22, { s0: 0.4, s1: 0.3, arc: 8 }),
        fly('dust', HAND, t, 1.07, 0.5, 26, 24, 18, -18, { s0: 0.4, s1: 0.3, arc: 8 }),
      ],
    };
  }),

  /** Raincloud Kid: the cloud rumbles, darkens its mood, and lets a shower go. */
  raincloud: bake(2.6, (t) => {
    const rumble = t > 0.3 && t < 0.9 ? 1.2 * flutter(t) : 0;
    const k = clamp01(span(t, 0.8, 1.2));
    return {
      ...stretch(keys([[0, 1], [0.8, 0.97, 'inOut'], [1.2, 1.01], [2.2, 1]])(t)),
      face: t > 0.9 && t < 1.1 ? 'blink' : 'inherit',
      parts: {
        [part('raincloud', 'back_cloud')]: { x: rumble, sx: keys([[0, 1], [0.8, 1.05, 'inOut'], [2.0, 1.02], [2.5, 1, 'inOut']])(t), sy: keys([[0, 1], [0.8, 0.9, 'inOut'], [2.0, 0.97], [2.5, 1]])(t), about: 'centre' },
        [part('raincloud', 'front_drop')]: { y: 8 * Math.sin(k * Math.PI * 3) ** 2 },
      },
      marks: [0, 1, 2, 3, 4].map((i) => fly('drop', HEAD, t, 0.85 + i * 0.22, 0.55, 72 + ((i * 13) % 24), -2, 0, 44, { s0: 0.42, s1: 0.1 })),
    };
  }),

  /** Glassblower Kid: puffs its cheeks at the pipe, and a bubble of glass swells and floats off. */
  glassblower: bake(2.8, (t) => {
    const blow = keys([[0, 0], [0.4, -0.4, 'out'], [0.6, 1, 'out'], [1.5, 1], [1.8, 0, 'inOut']])(t);
    const k = span(t, 0.6, 1.9);
    const grow = k < 0 ? 0 : clamp01(k / 0.5);
    return {
      sx: 1 + 0.05 * Math.max(0, blow),
      sy: 1 - 0.02 * Math.max(0, blow),
      parts: {
        [part('glassblower', 'front_pipe')]: { rot: -7 * blow },
        [part('glassblower', 'front_goggles')]: { y: -1.5 * Math.max(0, blow) },
      },
      marks: [k < 0 ? null : mark('bubble', HAND, 34 + (k > 0.5 ? 10 * (k - 0.5) : 0), -52 - (k > 0.5 ? 70 * (k - 0.5) : 0), { s: 0.4 + 1.1 * grow, a: k > 0.75 ? (1 - k) / 0.25 : 1 })],
    };
  }),

  /** Baker Kid: slides the paddle out, shows the loaf, and draws it back in; it is still steaming. */
  baker: bake(2.4, (t) => {
    const out = keys([[0, 0], [0.3, -0.25, 'out'], [0.6, 1, 'out'], [1.4, 1], [1.9, 0, 'inOut']])(t);
    return {
      rot: 2 * out,
      pivotY: MID,
      ...stretch(1 - 0.02 * Math.abs(out)),
      parts: {
        [part('baker', 'front_paddle')]: { x: 5 * out, rot: -7 * out },
        [part('baker', 'front_apron')]: { rot: -1.5 * out },
      },
      marks: [
        fly('steam', HAND, t, 0.8, 0.9, 30, -26, 4, -34, { s0: 0.6, s1: 0.5 }),
        fly('steam', HAND, t, 1.1, 0.9, 16, -22, -6, -32, { s0: 0.5, s1: 0.5 }),
      ],
    };
  }),

  /** Tea Kid: the tag swings on its string while the cup is raised for a sip; steam curls off it. */
  tea: bake(2.6, (t) => {
    const sip = keys([[0, 0], [0.5, 1, 'inOut'], [1.3, 1], [1.8, 0, 'inOut']])(t);
    return {
      rot: -2 * sip,
      pivotY: MID,
      face: t > 0.7 && t < 1.25 ? 'blink' : 'inherit',
      parts: {
        [part('tea', 'front_tag')]: { rot: 13 * sin(t * 1.4) * (1 - 0.3 * sip) },
        [part('tea', 'front_cup')]: { y: -5 * sip, rot: -9 * sip },
      },
      marks: [
        fly('steam', TORSO, t, 0.3, 1.0, 84, -10, 8, -26, { s0: 0.5, s1: 0.4 }),
        fly('steam', TORSO, t, 1.5, 0.9, 98, -8, 8, -24, { s0: 0.5, s1: 0.4 }),
      ],
    };
  }),

  /** Cocoa Kid: the marshmallow dunks itself, bobs back up, and the mug steams. */
  cocoa: bake(2.4, (t) => {
    const dunk = keys([[0, 0], [0.3, -6, 'out'], [0.55, 7, 'in'], [0.8, 7], [1.05, -9, 'out'], [1.4, 2], [1.7, 0, 'inOut']])(t);
    return {
      ...stretch(keys([[0, 1], [0.55, 0.96, 'in'], [0.8, 0.96], [1.05, 1.04, 'out'], [1.5, 1, 'inOut']])(t)),
      parts: {
        [part('cocoa', 'front_marshmallow')]: { y: dunk, rot: dunk * 1.2 },
        [part('cocoa', 'front_mug')]: { y: keys([[0, 0], [0.55, 1.5], [1.05, -1], [1.5, 0]])(t) },
      },
      marks: [
        fly('steam', TORSO, t, 0.9, 0.9, -86, -22, -8, -30, { s0: 0.5, s1: 0.4 }),
        fly('steam', TORSO, t, 1.2, 0.9, 92, -22, 8, -30, { s0: 0.45, s1: 0.4 }),
      ],
    };
  }),

  /** Flower Kid: closes up for a moment, then opens wide to the sun and turns after it. */
  flower: bake(2.6, (t) => {
    const open = keys([[0, 1], [0.4, 0.84, 'inOut'], [0.9, 1.14, 'out'], [1.8, 1.1], [2.3, 1, 'inOut']])(t);
    return {
      ...stretch(keys([[0, 1], [0.4, 0.97, 'inOut'], [0.9, 1.03, 'out'], [1.8, 1.02], [2.3, 1]])(t)),
      rot: keys([[0, 0], [0.9, 0], [1.4, 3, 'inOut'], [1.9, -2], [2.3, 0, 'inOut']])(t),
      pivotY: MID,
      parts: {
        [part('flower', 'front_blossom')]: { sx: open, sy: open, rot: keys([[0, 0], [0.4, -10, 'inOut'], [0.9, 24, 'out'], [1.8, 30], [2.3, 0, 'inOut']])(t), about: 'centre' },
        [part('flower', 'front_collar')]: { sx: 1 + (open - 1) * 0.4 },
      },
      marks: [fly('leaf', HEAD, t, 1.0, 1.1, 30, -34, 26, 78, { s0: 0.55, s1: 0, rot: 220 })],
    };
  }),

  /** Cactus Kid: the pads rock from side to side, and after a pause a single flower pops out on top. */
  cactus: bake(2.6, (t) => {
    const rock = shake(t, 0.2, 1.0, 2.5, 8);
    const bloom = span(t, 1.35, 1.0);
    return {
      rot: rock * 0.25,
      pivotY: MID,
      ...stretch(keys([[0, 1], [1.25, 1], [1.35, 0.96, 'out'], [1.5, 1.03, 'out'], [1.8, 1, 'inOut']])(t)),
      parts: { [part('cactus', 'front_pads')]: { rot: rock }, [part('cactus', 'front_pot')]: { rot: -rock * 0.2 } },
      marks: [bloom < 0 ? null : mark('spark', HEAD, 4, -44, { s: 0.2 + 0.7 * ease.back(clamp01(bloom / 0.3)), a: bloom > 0.7 ? (1 - bloom) / 0.3 : 1, rot: 45 * bloom })],
    };
  }),

  /** Mushroom Kid: the cap squashes down like a spring and pops up, letting go a puff of spores. */
  mushroom: bake(2.2, (t) => {
    const cap = keys([[0, 1], [0.35, 0.8, 'inOut'], [0.5, 1.14, 'out'], [0.75, 0.95, 'inOut'], [1.0, 1.03], [1.3, 1, 'inOut']])(t);
    return {
      ...stretch(keys([[0, 1], [0.35, 0.94, 'inOut'], [0.5, 1.04, 'out'], [0.8, 0.99], [1.2, 1]])(t)),
      parts: { [part('mushroom', 'front_cap')]: { sy: cap, sx: 2 - cap }, [part('mushroom', 'front_bib')]: { y: keys([[0, 0], [0.35, 2], [0.5, -1.5], [1.0, 0]])(t) } },
      marks: [
        fly('dust', HEAD, t, 0.5, 0.8, -52, 6, -26, -14, { s0: 0.35, s1: 0.35 }),
        fly('dust', HEAD, t, 0.55, 0.8, 54, 4, 26, -16, { s0: 0.35, s1: 0.35 }),
      ],
    };
  }),

  /** Potter Kid: tips the jug to pour, three drops, and rights it. */
  potter: bake(2.4, (t) => {
    const pour = keys([[0, 0], [0.3, -8, 'out'], [0.7, 30, 'inOut'], [1.5, 30], [1.9, 0, 'inOut']])(t);
    return {
      rot: pour * 0.08,
      pivotY: MID,
      parts: { [part('potter', 'front_jug')]: { rot: pour, y: -pour * 0.1 }, [part('potter', 'front_apron')]: { rot: pour * 0.04 } },
      marks: [0, 1, 2].map((i) => fly('drop', HAND, t, 0.85 + i * 0.25, 0.5, 44, -10, 4, 44, { s0: 0.42, s1: 0.08 })),
    };
  }),

  /** Crystal Kid: turns a little to the light, and three facets flash one after another. */
  crystal: bake(2.6, (t) => ({
    rot: keys([[0, 0], [0.5, -3, 'inOut'], [1.3, 3, 'inOut'], [2.1, 0, 'inOut']])(t),
    pivotY: MID,
    parts: { [part('crystal', 'front_cluster')]: { sx: 1 + 0.03 * sin(t * 1.5), sy: 1 + 0.03 * sin(t * 1.5), about: 'centre' } },
    marks: [
      fly('spark', HEAD, t, 0.4, 0.55, -22, -30, -2, -4, { s0: 0.3, s1: 0.6 }),
      fly('spark', HEAD, t, 0.9, 0.55, 4, -46, 0, -6, { s0: 0.3, s1: 0.7 }),
      fly('spark', HEAD, t, 1.4, 0.55, 26, -26, 2, -4, { s0: 0.3, s1: 0.6 }),
    ],
  })),

  /** Blacksmith Kid: hammer up, hammer down, twice, with sparks at each blow. (The hammer is tall and sits
   * beside the face, so it rises and falls; a swing would cross the eyes or leave the box.) */
  blacksmith: bake(2.4, (t) => {
    const swing = keys([[0, 0], [0.35, -12, 'out'], [0.5, 5, 'in'], [0.7, -2, 'out'], [1.0, -12, 'out'], [1.15, 5, 'in'], [1.4, -2, 'out'], [1.8, 0, 'inOut']])(t);
    const hit = (t0) => keys([[t0 - 0.01, 1], [t0 + 0.06, 0.94, 'out'], [t0 + 0.25, 1.01, 'out']])(t);
    return {
      ...stretch(t < 0.49 ? keys([[0, 1], [0.35, 1.03, 'out']])(t) : t < 1.0 ? hit(0.5) : t < 1.14 ? 1.03 : hit(1.15)),
      parts: { [part('blacksmith', 'front_hammer')]: { y: swing, rot: swing * 0.25 }, [part('blacksmith', 'front_apron')]: { y: swing > 2 ? 1.5 : 0 } },
      marks: [
        fly('spark', HAND, t, 0.5, 0.4, 28, -100, 10, -16, { s0: 0.35, s1: 0.4 }),
        fly('tick', HAND, t, 0.5, 0.25, 40, -78, 12, 4, { s0: 0.7, rot: 15 }),
        fly('spark', HAND, t, 1.15, 0.4, 30, -98, 8, -18, { s0: 0.35, s1: 0.4 }),
        fly('tick', HAND, t, 1.15, 0.25, 40, -84, 12, 6, { s0: 0.7, rot: 20 }),
      ],
    };
  }),

  /** Lighthouse Kid: the beacon swings its beam one way, then the other. */
  lighthouse: bake(2.8, (t) => {
    const side = keys([[0, 0], [0.5, -1, 'inOut'], [1.0, -1], [1.6, 1, 'inOut'], [2.1, 1], [2.6, 0, 'inOut']])(t);
    const beam = (dir, t0) => [0, 1, 2].map((i) => fly('tick', HEAD, t, t0 + i * 0.12, 0.35, dir * 40, -22 + (i - 1) * 14, dir * 34, (i - 1) * 8, { s0: 0.9, s1: 0.5, rot: dir * (i - 1) * 14 }));
    return {
      rot: 1.5 * side,
      pivotY: MID,
      faceX: 2.5 * side,
      parts: { [part('lighthouse', 'front_beacon')]: { rot: 9 * side }, [part('lighthouse', 'front_bib')]: { rot: -1 * side } },
      marks: [...beam(-1, 0.55), ...beam(1, 1.65)],
    };
  }),

  /** Captain Kid: gives the wheel a full turn to starboard, leaning with it, and steadies. */
  captain: bake(2.4, (t) => {
    const turn = keys([[0, 0], [0.3, -30, 'out'], [1.3, 380, 'inOut'], [1.6, 360, 'out']])(t);
    const lean = keys([[0, 0], [0.3, -2, 'out'], [0.9, 4, 'inOut'], [1.5, 1], [1.9, 0, 'inOut']])(t);
    return {
      rot: lean,
      pivotY: MID,
      parts: { [part('captain', 'front_wheel')]: { rot: t >= 1.6 ? 0 : turn, about: 'centre' }, [part('captain', 'front_cap')]: { rot: -lean * 1.5 } },
    };
  }),

  /** Whistle Kid: the pipes give three toots, each sending up a note, as the valve turns. */
  whistle: bake(2.6, (t) => {
    const toot = (t0) => {
      const k = span(t, t0, 0.3);
      return k < 0 ? 0 : Math.sin(k * Math.PI);
    };
    const blast = toot(0.4) + toot(0.9) + toot(1.4);
    return {
      ...stretch(1 - 0.03 * blast),
      parts: {
        [part('whistle', 'front_pipes')]: { sy: 1 + 0.12 * blast, sx: 1 - 0.04 * blast },
        [part('whistle', 'front_valve')]: { rot: keys([[0, 0], [0.4, 0], [1.6, 270, 'inOut'], [1.9, 360, 'out']])(t) % 360, about: 'centre' },
      },
      marks: [
        fly('note', HEAD, t, 0.45, 0.8, -26, -44, -16, -34, { s0: 0.6, s1: 0.2, rot: -15 }),
        fly('note', HEAD, t, 0.95, 0.8, 8, -50, 6, -36, { s0: 0.6, s1: 0.2, rot: 10 }),
        fly('note', HEAD, t, 1.45, 0.8, 34, -42, 18, -34, { s0: 0.6, s1: 0.2, rot: 20 }),
      ],
    };
  }),

  /** Pinwheel Kid: sweeps the pinwheel through the air, twice, to set it going. */
  pinwheel: bake(2.4, (t) => {
    const sweep = keys([[0, 0], [0.35, 10, 'out'], [0.7, -16, 'inOut'], [1.05, 10, 'inOut'], [1.4, -14, 'inOut'], [1.9, 0, 'inOut']])(t);
    return {
      rot: sweep * 0.12,
      pivotY: MID,
      ...stretch(1 + 0.012 * Math.abs(sweep) * 0.1),
      parts: {
        [part('pinwheel', 'front_pinwheel')]: { rot: sweep },
        [part('pinwheel', 'front_sash')]: { rot: -sweep * 0.15 },
      },
      marks: [
        fly('tick', HAND, t, 0.45, 0.3, 30, -52, -20, 6, { s0: 0.8, rot: -20 }),
        fly('tick', HAND, t, 1.15, 0.3, 30, -56, -20, 6, { s0: 0.8, rot: -20 }),
      ],
    };
  }),

  /** Lantern Kid: the glow swells and sinks twice, like a slow breath, and the star badge winks. */
  lantern: bake(3, (t) => {
    const glow = 0.5 - 0.5 * Math.cos(clamp01(span(t, 0.3, 2.2)) * Math.PI * 4);
    return {
      ...stretch(1 + 0.015 * glow),
      parts: {
        [part('lantern', 'back_glow')]: { sx: 1 + 0.08 * glow, sy: 1 + 0.08 * glow, about: 'centre' },
        [part('lantern', 'front_star')]: { rot: 18 * glow, sx: 1 + 0.1 * glow, sy: 1 + 0.1 * glow, about: 'centre' },
        [part('lantern', 'front_cap')]: { y: -1.5 * glow },
      },
      marks: [fly('spark', TORSO, t, 0.75, 0.5, 36, 14, 8, -6, { s0: 0.3, s1: 0.5 }), fly('spark', TORSO, t, 1.85, 0.5, -40, 16, -8, -6, { s0: 0.3, s1: 0.5 })],
    };
  }),
};
