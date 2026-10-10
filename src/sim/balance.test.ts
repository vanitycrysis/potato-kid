import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { pairKey } from '../content/validate';
import { createBot, deadlocked, drag, learnFromDrop, simulate, type Scenario } from './balance';
import { Game } from './game';
import { createRng } from './rng';
import { addKid, defaultBox } from './world';

const options = { bounds: { minX: 0, minY: 0, maxX: 2160, maxY: 3840 }, spawnAt: { x: 1080, y: 700 } };
const short: Scenario = { name: 'short', sessions: [{ play: 300, away: 600 }, { play: 120, away: 0 }], actionSeconds: 3 };

describe('balance simulator', () => {
  it('is deterministic for a seed', () => {
    expect(simulate(content, options, short, 5)).toEqual(simulate(content, options, short, 5));
  });

  it('plays the real sim: finds recipes, buys upgrades and reports in play time', () => {
    const r = simulate(content, options, short, 3);
    expect(r.end.playSeconds).toBeCloseTo(420, 5);
    expect(r.firstRecipe).not.toBeNull();
    expect(r.end.recipesFound).toBeGreaterThan(3);
    expect(r.end.levels.garden + r.end.levels.capacity).toBeGreaterThan(2);
    expect(r.starvation).toBeGreaterThanOrEqual(0);
    expect(r.starvation).toBeLessThanOrEqual(1);
  });
});

describe('the report (Codex review, PR #68)', () => {
  it('a tutorial that ends while away is dated by its last spawn, not the return', () => {
    const c = structuredClone(content);
    c.balance.spawn.startingKids = 0;
    // 1 s of play, then an hour away: spawns at 60, 120, ... 600 s.
    const r = simulate(c, options, { name: 'away', sessions: [{ play: 1, away: 3600 }], actionSeconds: 3 }, 1);
    expect(r.tutorialDone).toBeCloseTo(c.balance.spawn.tutorialSpawns * c.balance.spawn.tutorialIntervalSeconds, 6);
  });

  it('income after an absence counts the kids that arrived while away', () => {
    const c = structuredClone(content);
    c.balance.spawn.startingKids = 0;
    const r = simulate(c, options, { name: 'away', sessions: [{ play: 1, away: 3600 }], actionSeconds: 3 }, 1);
    // On return, the tutorial's ten offline spawns are all earning, on top of what was there.
    expect(r.income[0]!.clock).toBeCloseTo(1, 6);
    expect(r.income.at(-1)!.clock).toBeCloseTo(3601, 6);
    expect(r.income.at(-1)!.perSecond - r.income[0]!.perSecond).toBeGreaterThanOrEqual(10 * c.balance.economy.materialsPerSecond - 1e-9);
  });

  it('session clocks land exactly on their boundaries, however many steps they took', () => {
    const day = 86_400;
    const r = simulate(content, options, { name: 'days', sessions: Array.from({ length: 3 }, () => ({ play: 1800, away: day - 1800 })), actionSeconds: 4 }, 1);
    // Each session's end and return, with no drift from summing 0.1 s steps.
    expect(r.income.map((x) => x.clock)).toEqual([1800, day, day + 1800, 2 * day, 2 * day + 1800, 3 * day]);
  });

  it('shows income only for days the scenario reaches', async () => {
    const { incomeDays } = await import('./balance-cli');
    const day = 86_400;
    expect(incomeDays({ name: 'hour', sessions: [{ play: 3600, away: 0 }], actionSeconds: 3 })).toEqual([]);
    expect(incomeDays({ name: 'week', sessions: [{ play: 600, away: 7 * day - 600 }], actionSeconds: 3 })).toEqual([1, 3, 7]);
  });
});

describe('the bot drags like a player (Codex review, PR #45)', () => {
  /**
   * Water and Potato, each ringed by kids that make no recipe with either, so neither can
   * be dropped touching the other.
   */
  function ringed(capacity?: number) {
    const c = structuredClone(content);
    c.balance.wander = { speed: 0, turnChancePerSecond: 0, idleChancePerSecond: 0, idleSeconds: [1, 1], ambientChance: 0 };
    c.balance.spawn = { ...c.balance.spawn, tutorialSpawns: 0, startingKids: 0, newbornGraceSeconds: 0, intervalSeconds: 1e9, ...(capacity ? { capacity } : {}) };
    const g = new Game(c, { ...options, now: 0 }, 1);
    const box = defaultBox(c.balance.body.radius);
    const ring = (type: string, x: number, y: number) => {
      const centre = addKid(g.state.world, type, x, y, createRng(x), 0, box);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * 2 * Math.PI;
        addKid(g.state.world, 'aurora', x + Math.cos(a) * 135, y + Math.sin(a) * 175, createRng(x + i + 1), 0, box);
      }
      return centre;
    };
    const water = ring('water', 1000, 1200);
    const mover = ring('plain', 1000, 2600);
    g.state.materials = 0; // nothing to buy
    return { c, g, water, mover };
  }

  it('an unreachable pair is not marked tried, and the bot does something else', () => {
    const { c, g, water } = ringed();
    const bot = createBot(g, c);
    // Leave Potato + Water as the only untried pairing, so the bot must attempt it.
    for (const p of ['aurora|plain', 'aurora|aurora', 'aurora|water']) bot.tried.add(p);
    const act = bot.decide();
    // Whatever it does, it isn't a Potato-to-Water drag, and Potato + Water stays untried.
    const drop = act?.find((x) => x.type === 'drop');
    expect(drop && drop.type === 'drop' ? drop.touching : []).not.toContain(water.id);
    expect(bot.tried.has('plain|water')).toBe(false);
  });

  it('on a full map, an unreachable known recipe falls through to Send home', () => {
    const { c, g } = ringed(26);
    g.state.discoveredRecipes = ['plain|water'];
    const bot = createBot(g, c);
    // Every other pairing on the map has been tried already.
    for (const p of ['aurora|plain', 'aurora|aurora', 'aurora|water']) bot.tried.add(p);
    expect(bot.decide()).toEqual([{ type: 'plant', kidIds: [expect.any(Number)] }]);
  });

  it('drags the other way when only the second kid of a pair can reach the first', () => {
    const c = structuredClone(content);
    c.balance.wander = { speed: 0, turnChancePerSecond: 0, idleChancePerSecond: 0, idleSeconds: [1, 1], ambientChance: 0 };
    c.balance.spawn = { ...c.balance.spawn, tutorialSpawns: 0, startingKids: 0, newbornGraceSeconds: 0, intervalSeconds: 1e9 };
    const g = new Game(c, { ...options, now: 0 }, 1);
    const box = defaultBox(c.balance.body.radius);
    // Potato first (lower id) and in the open; Water ringed, so only Water can travel.
    const potato = addKid(g.state.world, 'plain', 1000, 2600, createRng(1), 0, box);
    const water = addKid(g.state.world, 'water', 1000, 1200, createRng(2), 0, box);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 2 * Math.PI;
      addKid(g.state.world, 'aurora', 1000 + Math.cos(a) * 135, 1200 + Math.sin(a) * 175, createRng(10 + i), 0, box);
    }
    g.state.materials = 0;
    const bot = createBot(g, c);
    for (const p of ['aurora|plain', 'aurora|aurora', 'aurora|water']) bot.tried.add(p);
    const act = bot.decide();
    expect(act?.[0]).toEqual({ type: 'pickUp', kidId: water.id });
    expect(g.step(act!).some((e) => e.type === 'fused' && e.parents.some((p) => p.id === potato.id))).toBe(true);
  });

  it('claims contact only with kids its landing spot really touches', () => {
    const { g, water, mover } = ringed();
    const commands = drag(g, mover.id, water);
    const drop = commands.find((x) => x.type === 'drop');
    expect(drop && 'touching' in drop ? drop.touching : []).not.toContain(water.id);
    expect(g.step(commands).some((e) => e.type === 'fused')).toBe(false);
  });
});

describe('what a drop tested (Codex review, PR #45)', () => {
  const kid = (id: number, type: string) => ({ id, type }) as never;
  const drop = {
    mover: { id: 1, type: 'plain' },
    contacts: [
      { id: 2, type: 'water', grace: 0 },
      { id: 3, type: 'fire', grace: 0 },
    ],
  };

  it('a drop touching two recipe partners tests only the pair that fused', () => {
    const tried = new Set<string>();
    learnFromDrop(tried, drop, [{ type: 'fused', parents: [kid(1, 'plain'), kid(2, 'water')], child: kid(9, 'firefighter'), firstDiscovery: true }]);
    expect([...tried]).toEqual(['plain|water']);
  });

  it('a drop that fused nothing tested every pair it touched', () => {
    const tried = new Set<string>();
    learnFromDrop(tried, drop, []);
    expect([...tried].sort()).toEqual(['fire|plain', 'plain|water']);
  });

  it('a partner still in newborn grace, or consumed by another fusion, was not tested', () => {
    const tried = new Set<string>();
    const graced = { ...drop, contacts: [{ id: 2, type: 'water', grace: 1.5 }, drop.contacts[1]!] };
    learnFromDrop(tried, graced, [{ type: 'fused', parents: [kid(3, 'fire'), kid(7, 'water')], child: kid(9, 'steam'), firstDiscovery: false }]);
    expect([...tried]).toEqual([]);
  });
});

describe('the bot never buys what the Compendium refuses (Codex review, PR #84)', () => {
  it('a discovered rare is no Compendium choice, so the bot does something else', () => {
    const c = structuredClone(content);
    c.kids.push({ id: 'rare_a', tier: 6, name: 'Rare A', rare: true });
    c.balance.spawn = { ...c.balance.spawn, tutorialSpawns: 0, startingKids: 0, intervalSeconds: 1e9 };
    const g = new Game(c, { ...options, now: 0 }, 1);
    addKid(g.state.world, 'plain', 1000, 1500, createRng(1), 0, defaultBox(c.balance.body.radius));
    g.state.discoveredKids = ['rare_a', 'plain'];
    g.state.buildings.compendium = 1;
    g.state.materials = 0;
    g.state.potatokens = 1e6;
    const act = createBot(g, c).decide();
    expect(act).not.toBeNull();
    expect(act!.some((x) => x.type === 'respawn' && x.kidType === 'rare_a')).toBe(false);
  });
});

describe('the bot farms (D-069)', () => {
  const likes = content.personality;
  /** A quiet game with these kids on the map and nothing to buy. */
  function quiet(types: string[], edit: (c: typeof content) => void = () => {}): Game {
    const c = structuredClone(content);
    c.balance.spawn = { ...c.balance.spawn, tutorialSpawns: 0, startingKids: 0, intervalSeconds: 1e9 };
    edit(c);
    const g = new Game(c, { ...options, now: 0 }, 1);
    types.forEach((t, i) => addKid(g.state.world, t, 300 + 300 * i, 1500, createRng(i + 1), 0, defaultBox(c.balance.body.radius)));
    g.state.materials = 0;
    return g;
  }

  it('buys a field when it is the cheapest thing it can afford; never with farming off', () => {
    const g = quiet(['plain']);
    g.state.materials = content.balance.farming.unlockPrices[0]!;
    // Garden, Capacity and plots all cost more than the first field (a few levels in).
    g.state.buildings.garden = 4;
    g.state.buildings.capacity = 4;
    while ((g.plotUnlockCost ?? Infinity) <= g.state.materials) g.state.plots.push({ seed: null });
    const dearer = (g.upgradeCost('garden') ?? Infinity) > g.state.materials && (g.upgradeCost('capacity') ?? Infinity) > g.state.materials && (g.plotUnlockCost ?? Infinity) > g.state.materials;
    expect(dearer).toBe(true);
    expect(createBot(g, content).decide()).toEqual([{ type: 'unlockField' }]);
    expect(createBot(g, content, true, false).decide()?.some((x) => x.type === 'unlockField') ?? false).toBe(false);
  });

  /** The first food in the pantry's order, and a type whose favourite is a later one (not first by luck). */
  const first = content.balance.feeding.foods[0]!.id;
  const later = Object.keys(likes).find((t) => content.kids.some((k) => k.id === t && !k.special && !k.rare) && likes[t]!.favouriteFood !== first && likes[t]!.hatedFood !== first)!;

  it('gives a bare field the food the most kids on the map love', () => {
    const g = quiet([later, later, 'plain']);
    g.state.fields.push({ food: null, workers: [], progress: 0 });
    expect(createBot(g, content).decide()).toEqual([{ type: 'setFieldFood', field: 0, food: likes[later]!.favouriteFood }]);
  });

  it('feeds an unhappy kid from the pantry: its favourite if stored, never a food it hates', () => {
    const g = quiet([later]);
    const id = g.state.world.kids[0]!.id;
    const fav = likes[later]!.favouriteFood;
    g.state.pantry = { [likes[later]!.hatedFood]: 5 };
    expect(createBot(g, content).decide()?.some((x) => x.type === 'feed') ?? false).toBe(false);
    // An earlier food is stored too: the favourite still comes first.
    g.state.pantry = { [likes[later]!.hatedFood]: 5, [first]: 1, [fav]: 1 };
    expect(createBot(g, content).decide()).toEqual([{ type: 'feed', kidId: id, food: fav }]);
    // No favourite: the first stored food it doesn't hate.
    g.state.pantry = { [likes[later]!.hatedFood]: 5, [first]: 1 };
    expect(createBot(g, content).decide()).toEqual([{ type: 'feed', kidId: id, food: first }]);
    g.state.world.kids[0]!.happy = { left: 100, favourite: true };
    expect(createBot(g, content).decide()?.some((x) => x.type === 'feed') ?? false).toBe(false);
  });

  it('a full map with no recipe and only a field to buy is a deadlock when the bot may not farm (Codex review, #90)', () => {
    // Two copies of a type with no recipe with itself.
    const loner = content.kids.find((k) => !k.special && !k.rare && !content.recipes.some((r) => r.a === k.id && r.b === k.id))!.id;
    const g = quiet([loner, loner], (c) => {
      c.balance.spawn.capacity = 2;
      // Upgrades below keep the map full: Capacity's levels add no room here.
      c.balance.economy.capacityPerLevel = 0;
    });
    g.state.materials = content.balance.farming.unlockPrices[0]!;
    g.state.buildings.garden = 4;
    g.state.buildings.capacity = 4;
    g.state.buildings.compendium = 1;
    while ((g.plotUnlockCost ?? Infinity) <= g.state.materials) g.state.plots.push({ seed: null });
    const recipes = new Map(content.recipes.map((r) => [pairKey(r.a, r.b), r.result]));
    expect(deadlocked(g, recipes, true)).toBe(false);
    expect(deadlocked(g, recipes, false)).toBe(true);
  });

  it('on a full map, a spare kid (every pairing tried) goes to a field that grows a food it doesn’t hate', () => {
    const g = quiet(['plain', 'plain'], (c) => {
      c.balance.spawn.capacity = 2;
    });
    expect(g.state.world.kids.length).toBeGreaterThanOrEqual(g.capacity);
    g.state.fields.push({ food: likes.plain!.hatedFood, workers: [], progress: 0 }, { food: 'apple', workers: [], progress: 0 });
    const bot = createBot(g, content);
    bot.tried.add(pairKey('plain', 'plain'));
    const act = bot.decide();
    expect(act?.[0]).toMatchObject({ type: 'farm', field: 1 });
    // One copy of each type: a kid's pairing with itself needs another copy, so it never
    // holds farming back (Codex review, #90).
    const solo = quiet(['plain', 'fire'], (c) => {
      c.balance.spawn.capacity = 2;
    });
    solo.state.fields.push({ food: 'apple', workers: [], progress: 0 });
    const soloBot = createBot(solo, content, false);
    soloBot.tried.add(pairKey('plain', 'fire'));
    expect(soloBot.decide()?.[0]).toMatchObject({ type: 'farm', field: 0 });
    // Farming off: never.
    const off = createBot(g, content, true, false);
    for (const k of bot.tried) off.tried.add(k);
    expect(off.decide()?.some((x) => x.type === 'farm') ?? false).toBe(false);
  });
});
