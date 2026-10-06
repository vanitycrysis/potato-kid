import { describe, expect, it } from 'vitest';
import { content } from '../content';
import type { Content } from '../content/types';
import { Game, type GameEvent } from './game';
import { createRng } from './rng';
import { addKid, defaultBox } from './world';

// Feeding (D-056) and naming (D-057), GUI_MVP §17-18.
const bounds = { minX: 0, minY: 0, maxX: 2000, maxY: 2000 };
const T0 = 1_700_000_000_000;
const f = content.balance.feeding;
const n = content.balance.naming;
const food = (id: string) => f.foods.find((x) => x.id === id)!;
const likes = content.personality.plain!;
/** Some food Potato Kid neither loves nor hates. */
const ordinary = f.foods.find((x) => x.id !== likes.favouriteFood && x.id !== likes.hatedFood)!.id;

function game(edit: (c: Content) => void = () => {}): Game {
  const c = structuredClone(content);
  c.balance.wander = { speed: 0, turnChancePerSecond: 0, idleChancePerSecond: 0, idleSeconds: [1, 1], ambientChance: 0 };
  c.balance.spawn = { ...c.balance.spawn, tutorialSpawns: 0, startingKids: 0, intervalSeconds: 1e9 };
  edit(c);
  return new Game(c, { bounds, spawnAt: { x: 1000, y: 300 }, now: T0 }, 3);
}

function setup(materials = 10_000) {
  const g = game();
  g.state.materials = materials;
  const kid = addKid(g.state.world, 'plain', 600, 1500, createRng(0), 0, defaultBox(content.balance.body.radius));
  return { g, kid };
}

const rejected = (events: GameEvent[]) => events.find((e) => e.type === 'rejected');

describe('feeding (D-056, GUI_MVP §17)', () => {
  it('an ordinary bite costs its price and makes the kid happy: income × happyMultiplier, for happySeconds', () => {
    const { g, kid } = setup();
    const base = g.incomeOfKid(kid);
    const events = g.step([{ type: 'feed', kidId: kid.id, food: ordinary }], 0);
    expect(events).toContainEqual({ type: 'fed', kid, food: ordinary, favourite: false });
    expect(g.state.materials).toBe(10_000 - food(ordinary).price);
    expect(kid.happy).toEqual({ left: f.happySeconds, favourite: false });
    expect(g.incomeOfKid(kid)).toBeCloseTo(base * f.happyMultiplier, 12);
  });

  it('its favourite lasts longer and pays more', () => {
    const { g, kid } = setup();
    const base = g.incomeOfKid(kid);
    expect(g.step([{ type: 'feed', kidId: kid.id, food: likes.favouriteFood }], 0)).toContainEqual({ type: 'fed', kid, food: likes.favouriteFood, favourite: true });
    expect(kid.happy).toEqual({ left: f.favouriteSeconds, favourite: true });
    expect(g.incomeOfKid(kid)).toBeCloseTo(base * f.favouriteMultiplier, 12);
  });

  it('a hated food is refused and costs nothing; so is a food it cannot afford, or an unknown one', () => {
    const { g, kid } = setup();
    expect(rejected(g.step([{ type: 'feed', kidId: kid.id, food: likes.hatedFood }], 0))).toEqual({ type: 'rejected', command: 'feed', reason: 'hated' });
    expect(rejected(g.step([{ type: 'feed', kidId: kid.id, food: 'cake' }], 0))).toEqual({ type: 'rejected', command: 'feed', reason: 'invalid' });
    expect(g.state.materials).toBe(10_000);
    expect(kid.happy).toBeUndefined();
    const poor = setup(food(ordinary).price - 1);
    expect(rejected(poor.g.step([{ type: 'feed', kidId: poor.kid.id, food: ordinary }], 0))).toEqual({ type: 'rejected', command: 'feed', reason: 'cost' });
    expect(poor.g.state.materials).toBe(food(ordinary).price - 1);
    expect(rejected(poor.g.step([{ type: 'feed', kidId: 999, food: ordinary }], 0))).toEqual({ type: 'rejected', command: 'feed', reason: 'gone' });
  });

  it('a new bite replaces the happiness, never adds to it (GUI_MVP §17.2)', () => {
    const { g, kid } = setup();
    g.step([{ type: 'feed', kidId: kid.id, food: likes.favouriteFood }], 0);
    g.step([], 100);
    g.step([{ type: 'feed', kidId: kid.id, food: ordinary }], 0);
    expect(kid.happy).toEqual({ left: f.happySeconds, favourite: false });
  });

  it('wears off: the kid earns its base rate again', () => {
    const { g, kid } = setup();
    const base = g.incomeOfKid(kid);
    g.step([{ type: 'feed', kidId: kid.id, food: ordinary }], 0);
    const before = g.state.materials;
    g.step([], f.happySeconds - 1);
    expect(g.state.materials - before).toBeCloseTo(base * f.happyMultiplier * (f.happySeconds - 1), 6);
    expect(kid.happy?.left).toBeCloseTo(1, 9);
    g.step([], 1);
    expect(kid.happy).toBeUndefined();
    expect(g.incomeOfKid(kid)).toBe(base);
  });

  it('offline, the happy extra is paid only until it wears off', () => {
    const { g, kid } = setup();
    const base = g.incomeOfKid(kid);
    g.step([{ type: 'feed', kidId: kid.id, food: ordinary }], 0);
    const away = f.happySeconds * 2;
    const report = g.reconcile(T0 + away * 1000);
    expect(report.materials).toBeCloseTo(base * away + base * (f.happyMultiplier - 1) * f.happySeconds, 6);
    expect(kid.happy).toBeUndefined();
    // A short absence: still happy, for less time.
    const short = setup();
    short.g.step([{ type: 'feed', kidId: short.kid.id, food: ordinary }], 0);
    short.g.reconcile(T0 + 60_000);
    expect(short.kid.happy?.left).toBeCloseTo(f.happySeconds - 60, 9);
  });

  it('planted while happy, a kid counts one tier higher, for good (GUI_MVP §15.3)', () => {
    const { g, kid } = setup();
    g.step([{ type: 'feed', kidId: kid.id, food: ordinary }], 0);
    g.step([{ type: 'plant', kidIds: [kid.id], plot: 0 }], 0);
    expect(g.state.plots[0]!.seed!.planted[0]).toMatchObject({ type: 'plain', happy: true });
    // Its happiness can't wear off in the seed: still counted later.
    g.step([], f.happySeconds * 2);
    expect(g.state.plots[0]!.seed!.planted[0]!.happy).toBe(true);
    // §15.3's worked example: 3 × T2 and one happy T2 → mean tier 2.25 → 12.9166…% / 6.4583…%.
    const t2 = content.kids.find((k) => k.tier === 2)!.id;
    const odds = g.oddsFor([t2, t2, t2, { type: t2, happy: true }]);
    expect(odds.special).toBeCloseTo(0.129166666, 8);
    expect(odds.rare).toBeCloseTo(0.064583333, 8);
    // The caps hold: five happy T5s are still the ceiling.
    const t5 = content.kids.find((k) => k.tier === 5 && !k.special)!.id;
    expect(g.oddsFor(Array.from({ length: 5 }, () => ({ type: t5, happy: true })))).toEqual({ special: content.balance.planting.specialOdds[1], rare: content.balance.planting.rareOdds[1] });
  });
});

describe('naming (D-057, GUI_MVP §18.2)', () => {
  it('a name costs its price and is stored normalized', () => {
    const { g, kid } = setup();
    expect(g.step([{ type: 'name', kidId: kid.id, name: '  Sir   Spud ' }], 0)).toContainEqual({ type: 'named', kid, name: 'Sir Spud' });
    expect(kid.name).toBe('Sir Spud');
    expect(g.state.materials).toBe(10_000 - n.price);
  });

  it('the same name, an invalid one or an unaffordable one is refused, free', () => {
    const { g, kid } = setup();
    g.step([{ type: 'name', kidId: kid.id, name: 'Spud' }], 0);
    const after = g.state.materials;
    expect(rejected(g.step([{ type: 'name', kidId: kid.id, name: ' Spud ' }], 0))).toEqual({ type: 'rejected', command: 'name', reason: 'unchanged' });
    expect(rejected(g.step([{ type: 'name', kidId: kid.id, name: 'Spud 🥔' }], 0))).toEqual({ type: 'rejected', command: 'name', reason: 'invalid' });
    expect(rejected(g.step([{ type: 'name', kidId: kid.id, name: 'x'.repeat(n.maxLength + 1) }], 0))).toEqual({ type: 'rejected', command: 'name', reason: 'invalid' });
    expect(g.state.materials).toBe(after);
    const poor = setup(n.price - 1);
    expect(rejected(poor.g.step([{ type: 'name', kidId: poor.kid.id, name: 'Spud' }], 0))).toEqual({ type: 'rejected', command: 'name', reason: 'cost' });
  });

  it('clearing a name is free; clearing none is refused', () => {
    const { g, kid } = setup();
    expect(rejected(g.step([{ type: 'name', kidId: kid.id, name: null }], 0))).toEqual({ type: 'rejected', command: 'name', reason: 'unchanged' });
    g.step([{ type: 'name', kidId: kid.id, name: 'Spud' }], 0);
    const after = g.state.materials;
    expect(g.step([{ type: 'name', kidId: kid.id, name: null }], 0)).toContainEqual({ type: 'named', kid, name: null });
    expect(kid.name).toBeUndefined();
    expect(g.state.materials).toBe(after);
  });

  it('a name waits in the plot with its kid (D-074), and ends when it fuses: no child carries it', () => {
    const { g, kid } = setup();
    g.step([{ type: 'name', kidId: kid.id, name: 'Spud' }], 0);
    g.step([{ type: 'plant', kidIds: [kid.id], plot: 0 }], 0);
    expect(g.state.plots[0]!.seed!.planted[0]).toHaveProperty('name', 'Spud');
    const a = addKid(g.state.world, 'plain', 200, 1000, createRng(0), 0, defaultBox(content.balance.body.radius));
    const b = addKid(g.state.world, 'fire', 900, 1000, createRng(0), 0, defaultBox(content.balance.body.radius));
    g.step([{ type: 'name', kidId: a.id, name: 'Spud' }], 0);
    const events = g.step([{ type: 'drop', kidId: a.id, x: b.x, y: b.y, touching: [b.id] }], 0);
    const fused = events.find((e) => e.type === 'fused');
    if (fused?.type !== 'fused') throw new Error('no fusion');
    expect(fused.child.name).toBeUndefined();
  });
});
