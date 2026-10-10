import { describe, expect, it } from 'vitest';
import { content } from '../content';
import type { Content } from '../content/types';
import { Game, type GameEvent, type Seed } from './game';
import { createRng } from './rng';
import { addKid, DEFAULT_LOOK, defaultBox } from './world';

// Planting (D-061, GUI_MVP §15): 3 to 5 kids become a seed; started, it grows into one kid.
const bounds = { minX: 0, minY: 0, maxX: 2000, maxY: 2000 };
const garden = { x: 1000, y: 300 };
const T0 = 1_700_000_000_000;
const S = 1000;
const p = content.balance.planting;
const pool = new Set(Object.keys(content.balance.spawnWeights));
/** Kids as planted (snapshots), in the default look. */
/** Planted kids; their ids sit far above any test map's, as a real plot's never match a live kid's. */
let plantedId = 10_000;
const P = (...types: string[]) => types.map((type) => ({ id: plantedId++, type, look: DEFAULT_LOOK }));

/** Frozen wander, no starting kids, no Garden spawns unless asked, a 100 s grow. */
function testContent(edit: (c: Content) => void = () => {}): Content {
  const c = structuredClone(content);
  // The shipped specials and rares out: these tests stand their own in, by name.
  c.kids = c.kids.filter((k) => !k.special && !k.rare);
  c.balance.wander = { speed: 0, turnChancePerSecond: 0, idleChancePerSecond: 0, idleSeconds: [1, 1], ambientChance: 0 };
  c.balance.spawn = { ...c.balance.spawn, tutorialSpawns: 0, startingKids: 0, newbornGraceSeconds: 0, intervalSeconds: 1e9, capacity: 12 };
  c.balance.planting = { ...c.balance.planting, growSeconds: 100 };
  edit(c);
  return c;
}

function game(edit?: (c: Content) => void, seed = 7): Game {
  return new Game(testContent(edit), { bounds, spawnAt: garden, now: T0 }, seed);
}

function place(g: Game, type: string, x: number, y: number) {
  return addKid(g.state.world, type, x, y, createRng(0), 0, defaultBox(content.balance.body.radius));
}

/** Plants these types (placed far from the Garden) into the plot drags go to. */
function plantAll(g: Game, types: string[], plot?: number): GameEvent[] {
  const kids = types.map((t, i) => place(g, t, 200 + (i % 8) * 200, 1600 + Math.floor(i / 8) * 200));
  return g.step(kids.map((k) => ({ type: 'plant' as const, kidIds: [k.id], ...(plot === undefined ? {} : { plot }) })), 0);
}

/** A started seed that sprouts `type`, `grown` seconds in. */
const started = (type: string, grown: number): Seed => ({ planted: P('plain', 'plain', 'plain'), sprout: { type }, grown });

/** Steps `seconds` in 1 s steps, collecting events. */
function run(g: Game, seconds: number): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 0; i < seconds; i++) out.push(...g.step([], 1));
  return out;
}

const sprouts = (events: GameEvent[]) => events.filter((e) => e.type === 'spawned' && e.source === 'sprout');

describe('planting 3 to 5 kids (D-061)', () => {
  it('a new game has its first plot, empty', () => {
    expect(game().state.plots).toEqual([{ seed: null }]);
  });

  it('a planted kid leaves the map into a filling plot, stays in the Dex, and nothing is charged', () => {
    const g = game();
    const hero = place(g, 'hero', 300, 1500);
    g.state.discoveredKids = ['hero'];
    const before = { materials: g.state.materials, potatokens: g.state.potatokens };
    const events = g.step([{ type: 'plant', kidIds: [hero.id] }], 0);
    expect(events).toContainEqual({ type: 'planted', kid: expect.objectContaining({ id: hero.id, type: 'hero' }), plot: 0, count: 1 });
    expect(g.state.world.kids).toEqual([]);
    expect(g.state.discoveredKids).toContain('hero');
    expect({ materials: g.state.materials, potatokens: g.state.potatokens }).toEqual(before);
    expect(g.state.plots[0]!.seed).toEqual({ planted: [{ id: hero.id, type: 'hero', look: hero.look }], sprout: null, grown: 0 });
  });

  it('a filling plot never grows on its own, not even when full', () => {
    const g = game();
    plantAll(g, ['plain', 'fire', 'water', 'snow', 'wind']);
    expect(g.state.plots[0]!.seed!.planted).toHaveLength(p.maxKids);
    expect(sprouts(run(g, 500))).toEqual([]);
    expect(g.state.plots[0]!.seed).toMatchObject({ sprout: null, grown: 0 });
  });

  it('a full plot refuses another kid, and keeps it on the map', () => {
    const g = game();
    plantAll(g, ['plain', 'fire', 'water', 'snow', 'wind']);
    const extra = place(g, 'stone', 300, 1200);
    g.step([{ type: 'pickUp', kidId: extra.id }], 0);
    // Only filled plots that wait to be started: "All plots are full" (GUI_MVP §15.1).
    expect(g.step([{ type: 'plant', kidIds: [extra.id] }], 0)).toContainEqual({ type: 'rejected', command: 'plant', reason: 'plotFull' });
    expect(g.step([{ type: 'plant', kidIds: [extra.id], plot: 0 }], 0)).toContainEqual({ type: 'rejected', command: 'plant', reason: 'plotFull' });
    expect(g.state.world.kids).toEqual([expect.objectContaining({ id: extra.id, held: false })]);
  });

  it('a refused kid is put down clear of partners: a refusal never fuses (Codex review, PR #72)', () => {
    const g = game();
    g.state.plots = [{ seed: started('snow', 5) }]; // the only plot is growing
    const plain = place(g, 'plain', 600, 1500);
    g.step([{ type: 'pickUp', kidId: plain.id }], 0);
    // While it's held, a partner (plain + water) walks onto the spot it was picked up from.
    const water = place(g, 'water', 600, 1500);
    const events = g.step([{ type: 'plant', kidIds: [plain.id] }], 0);
    expect(events).toContainEqual({ type: 'rejected', command: 'plant', reason: 'plotsBusy' });
    expect(events.some((e) => e.type === 'fused')).toBe(false);
    expect(run(g, 3).some((e) => e.type === 'fused')).toBe(false);
    expect(g.state.world.kids.map((k) => k.id).sort()).toEqual([plain.id, water.id].sort());
    const gap = Math.max(Math.abs(plain.x - water.x), Math.abs(plain.y - water.y));
    expect(gap).toBeGreaterThan(2 * content.balance.body.radius + content.balance.body.touchSlack);
  });

  it('a refused kid is safe for the rest of the step: a partner walking up never fuses it (Codex review, PR #72)', () => {
    // Kids walk 300 px/s straight on: the water kid reaches the plain kid within this step.
    const g = game((c) => {
      c.balance.wander = { ...c.balance.wander, speed: 300 };
      c.balance.spawn.newbornGraceSeconds = content.balance.spawn.newbornGraceSeconds;
    });
    g.state.plots = [{ seed: started('snow', 5) }]; // the only plot is growing
    const plain = place(g, 'plain', 600, 1500);
    g.step([{ type: 'pickUp', kidId: plain.id }], 0);
    // Just clear of touching, heading straight for it.
    const water = place(g, 'water', 600 + 2 * content.balance.body.radius + content.balance.body.touchSlack + 20, 1500);
    water.heading = Math.PI;
    water.activity = { kind: 'walk' };
    plain.activity = { kind: 'pause', left: 10 };
    const events = g.step([{ type: 'plant', kidIds: [plain.id] }], 0.5);
    expect(events).toContainEqual({ type: 'rejected', command: 'plant', reason: 'plotsBusy' });
    expect(events.some((e) => e.type === 'fused')).toBe(false);
    expect(g.state.world.kids.some((k) => k.id === plain.id)).toBe(true);
    // Protected for a newborn's grace, as the label promised: then ordinary rules again.
    expect(run(g, 1).some((e) => e.type === 'fused')).toBe(false);
  });

  it('a drag fills the plot already filling, then the lowest empty one; picking chooses the plot', () => {
    const g = game();
    g.state.plots = [{ seed: started('plain', 5) }, { seed: null }, { seed: { planted: P('fire'), sprout: null, grown: 0 } }];
    plantAll(g, ['water']);
    expect(g.state.plots[2]!.seed!.planted.map((k) => k.type)).toEqual(['fire', 'water']);
    plantAll(g, ['snow'], 1);
    expect(g.state.plots[1]!.seed!.planted.map((k) => k.type)).toEqual(['snow']);
    // A growing plot takes no more.
    const k = place(g, 'wind', 300, 1200);
    expect(g.step([{ type: 'plant', kidIds: [k.id], plot: 0 }], 0)).toContainEqual({ type: 'rejected', command: 'plant', reason: 'plotsBusy' });
  });

  it('the picker adds several kids at once, all or none (GUI_MVP §15.3)', () => {
    const g = game();
    const [a, b, c] = [place(g, 'plain', 300, 1500), place(g, 'fire', 600, 1500), place(g, 'water', 900, 1500)];
    // One gone: nothing is planted, the others stay.
    expect(g.step([{ type: 'plant', kidIds: [a.id, 999], plot: 0 }], 0)).toEqual([{ type: 'rejected', command: 'plant', reason: 'gone' }]);
    // The same kid twice is refused too.
    expect(g.step([{ type: 'plant', kidIds: [a.id, a.id], plot: 0 }], 0)).toEqual([{ type: 'rejected', command: 'plant', reason: 'gone' }]);
    expect(g.state.world.kids).toHaveLength(3);
    expect(g.state.plots[0]!.seed).toBeNull();
    // More than the free spaces: refused, nothing planted.
    g.state.plots[0]!.seed = { planted: P('snow', 'snow', 'snow'), sprout: null, grown: 0 };
    expect(g.step([{ type: 'plant', kidIds: [a.id, b.id, c.id], plot: 0 }], 0)).toEqual([{ type: 'rejected', command: 'plant', reason: 'plotFull' }]);
    expect(g.state.world.kids).toHaveLength(3);
    // Exactly the spaces: all planted, in order, one event each.
    const events = g.step([{ type: 'plant', kidIds: [b.id, c.id], plot: 0 }], 0);
    expect(events.filter((e) => e.type === 'planted').map((e) => e.type === 'planted' && e.kid.id)).toEqual([b.id, c.id]);
    expect(g.state.plots[0]!.seed!.planted.map((k) => k.type)).toEqual(['snow', 'snow', 'snow', 'fire', 'water']);
    expect(g.state.world.kids.map((k) => k.id)).toEqual([a.id]);
  });

  it('a plot keeps a snapshot of each kid planted: id, type and look', () => {
    const g = game();
    const k = place(g, 'hero', 300, 1500);
    k.look = { body: 'tall', face: 'sleepy', scale: 0.9 };
    g.step([{ type: 'plant', kidIds: [k.id] }], 0);
    expect(g.state.plots[0]!.seed!.planted).toEqual([{ id: k.id, type: 'hero', look: { body: 'tall', face: 'sleepy', scale: 0.9 } }]);
  });

  it('a kid already gone is answered with a refusal, changing nothing', () => {
    const g = game();
    expect(g.step([{ type: 'plant', kidIds: [999] }], 0)).toEqual([{ type: 'rejected', command: 'plant', reason: 'gone' }]);
    expect(g.state.plots).toEqual([{ seed: null }]);
  });

  it('Start growing needs minKids kids, starts that plot only, and decides its sprout', () => {
    const g = game();
    plantAll(g, ['plain', 'fire']);
    expect(g.step([{ type: 'startGrowing', plot: 0 }], 0)).toEqual([{ type: 'rejected', command: 'startGrowing', reason: 'tooFewKids' }]);
    expect(g.step([{ type: 'startGrowing', plot: 1 }], 0)).toEqual([{ type: 'rejected', command: 'startGrowing', reason: 'plotsBusy' }]);
    plantAll(g, ['water']);
    expect(g.step([{ type: 'startGrowing', plot: 0 }], 0)).toEqual([{ type: 'growing', plot: 0 }]);
    const sprout = g.state.plots[0]!.seed!.sprout!;
    expect(sprout).toEqual({ type: expect.any(String) }); // no specials or rares at seed 7 here
    // Started twice: the second is refused, and the sprout is unchanged.
    expect(g.step([{ type: 'startGrowing', plot: 0 }], 0)).toEqual([{ type: 'rejected', command: 'startGrowing', reason: 'plotsBusy' }]);
    expect(g.state.plots[0]!.seed!.sprout).toEqual(sprout);
  });

  it('grows for growSeconds once started, then sprouts its kid at the Garden and empties the plot', () => {
    const g = game();
    plantAll(g, ['hero', 'hero', 'hero']);
    g.step([{ type: 'startGrowing', plot: 0 }], 0);
    const type = g.state.plots[0]!.seed!.sprout!.type;
    expect(sprouts(run(g, 99))).toEqual([]);
    expect(g.state.plots[0]!.seed!.grown).toBe(99);
    expect(sprouts(run(g, 1))).toEqual([expect.objectContaining({ kid: expect.objectContaining({ type }) })]);
    expect(g.state.plots[0]!.seed).toBeNull();
    const kid = g.state.world.kids[0]!;
    expect(Math.hypot(kid.x - garden.x, kid.y - garden.y)).toBeLessThan(300);
  });

  it('a rare kid sprouts like any kid and earns by its tier (D-072)', () => {
    const g = game((c) => c.kids.push({ id: 'rare_a', tier: 6, name: 'Rare A', rare: true }));
    g.state.plots = [{ seed: started('rare_a', 99) }];
    const events = sprouts(run(g, 1));
    expect(events).toEqual([expect.objectContaining({ kid: expect.objectContaining({ type: 'rare_a' }) })]);
    expect(g.isRare('rare_a')).toBe(true);
    expect(g.isRare('hero')).toBe(false);
    expect(g.income).toBeCloseTo(g.incomeOf('rare_a'), 12);
    expect(g.incomeOf('rare_a')).toBeGreaterThan(g.incomeOf('hero'));
  });

  it('a ready seed waits while the map is full, then sprouts as soon as there is room', () => {
    const g = game((c) => (c.balance.spawn.capacity = 2));
    g.state.plots = [{ seed: started('water', 99) }];
    const [a] = [place(g, 'plain', 300, 1500), place(g, 'plain', 900, 1500)];
    expect(sprouts(run(g, 5))).toEqual([]);
    expect(g.plotWaiting(0)).toBe('full');
    g.state.world.kids.splice(g.state.world.kids.indexOf(a!), 1);
    expect(sprouts(run(g, 1))).toHaveLength(1);
    expect(g.plotWaiting(0)).toBeNull();
  });

  it('with room on the map but no clear spot by the Garden, it waits for one', () => {
    const c = testContent((x) => (x.balance.spawn.capacity = 40));
    const tiny = { minX: 0, minY: 0, maxX: 250, maxY: 250 };
    const g = new Game(c, { bounds: tiny, spawnAt: { x: 125, y: 125 } }, 7);
    for (const [x, y] of [[60, 60], [190, 60], [60, 190], [190, 190]]) place(g, 'plain', x!, y!);
    g.state.plots = [{ seed: started('water', 100) }];
    expect(sprouts(g.step([], 1))).toEqual([]);
    expect(g.plotWaiting(0)).toBe('noRoom');
    g.state.world.kids.pop();
    expect(sprouts(g.step([], 1))).toHaveLength(1);
  });

  it('a ready sprout comes before the Garden when there is room for only one', () => {
    const g = game((c) => {
      c.balance.spawn.capacity = 1;
      c.balance.spawn.intervalSeconds = 1;
    });
    g.state.spawnProgress = 1;
    g.state.plots = [{ seed: started('snow', 100) }];
    const events = g.step([], 0.1);
    expect(events.filter((e) => e.type === 'spawned').map((e) => e.type === 'spawned' && e.source)).toEqual(['sprout']);
  });

  it('a seed keeps its kids and its sprout through a save and a resume', () => {
    const g = game();
    plantAll(g, ['hero', 'fire', 'water', 'snow']);
    g.step([{ type: 'startGrowing', plot: 0 }], 0);
    run(g, 40);
    const saved = g.persisted();
    const back = new Game(testContent(), { bounds, spawnAt: garden }, 99, saved);
    expect(back.state.plots).toEqual(g.state.plots);
    expect(sprouts(run(back, 60)).map((e) => e.type === 'spawned' && e.kid.type)).toEqual([saved.plots[0]!.seed!.sprout!.type]);
  });
});

describe('the odds (D-061)', () => {
  const g = game();
  it('are the floor for minKids kids all below tier 3, and the ceiling for maxKids of tier 5 or above', () => {
    expect(g.oddsFor(['plain', 'fire', 'water'])).toEqual({ special: p.specialOdds[0], rare: p.rareOdds[0] });
    const t5 = content.kids.filter((k) => k.tier >= 5).map((k) => k.id);
    expect(g.oddsFor(t5.slice(0, 5))).toEqual({ special: p.specialOdds[1], rare: p.rareOdds[1] });
  });

  it('rise halfway with count alone, and halfway with tier alone', () => {
    const half = (o: [number, number]) => (o[0] + o[1]) / 2;
    expect(g.oddsFor(['plain', 'plain', 'plain', 'plain', 'plain'])).toEqual({ special: half(p.specialOdds), rare: half(p.rareOdds) });
    const t5 = content.kids.filter((k) => k.tier === 5).map((k) => k.id);
    const odds = g.oddsFor(t5.slice(0, 3));
    expect(odds.special).toBeCloseTo(half(p.specialOdds), 12);
    expect(odds.rare).toBeCloseTo(half(p.rareOdds), 12);
  });

  it('over many plantings, specials and rares come at their chances, independently', () => {
    const c = testContent((x) => {
      x.kids.push({ id: 'special_a', tier: 5, name: 'Special A', special: true }, { id: 'special_b', tier: 6, name: 'Special B', special: true });
      x.kids.push({ id: 'rare_a', tier: 6, name: 'Rare A', rare: true }, { id: 'rare_b', tier: 6, name: 'Rare B', rare: true });
      x.balance.planting.specialOdds = [0.3, 0.3];
      x.balance.planting.rareOdds = [0.2, 0.2];
    });
    const h = new Game(c, { bounds, spawnAt: garden }, 3);
    const seen = { special: 0, rare: 0, garden: 0, other: 0 };
    const rareTypes = new Set<string>();
    const N = 4000;
    for (let i = 0; i < N; i++) {
      h.state.plots = [{ seed: { planted: P('hero', 'hero', 'chef'), sprout: null, grown: 0 } }];
      h.step([{ type: 'startGrowing', plot: 0 }], 0);
      const t = h.state.plots[0]!.seed!.sprout!.type;
      if (t.startsWith('rare_')) rareTypes.add(t);
      seen[t.startsWith('special_') ? 'special' : t.startsWith('rare_') ? 'rare' : pool.has(t) ? 'garden' : 'other']++;
    }
    // The rare roll wins when both hit (D-072): rare 0.2; special only when the rare missed,
    // 0.3 × 0.8; otherwise a Garden kid, never a planted one or anything else.
    expect(seen.rare / N).toBeCloseTo(0.2, 1);
    expect(seen.special / N).toBeCloseTo(0.24, 1);
    expect(seen.garden / N).toBeCloseTo(0.56, 1);
    expect(seen.other).toBe(0);
    // Each rare kind comes up.
    expect([...rareTypes].sort()).toEqual(['rare_a', 'rare_b']);
  });
});

describe('special kids are never sold (D-063)', () => {
  it('the Compendium refuses to bring one back', () => {
    const c = testContent((x) => x.kids.push({ id: 'special_a', tier: 5, name: 'Special A', special: true }));
    const g = new Game(c, { bounds, spawnAt: garden }, 3);
    g.state.buildings.compendium = 1;
    g.state.discoveredKids = ['special_a'];
    g.state.materials = 1e9;
    g.state.potatokens = 1e6;
    for (const pay of ['materials', 'potatokens'] as const) {
      expect(g.step([{ type: 'respawn', kidType: 'special_a', pay }], 0)).toEqual([{ type: 'rejected', command: 'respawn', reason: 'notSpawnable' }]);
    }
  });
});

describe('more plots (GUI_MVP §15.4)', () => {
  it('unlocking costs unlockCostBase · growth^(n − startPlots − 1), up to maxPlots', () => {
    const g = game();
    g.state.materials = 1e9;
    const costs: number[] = [];
    while (g.plotUnlockCost !== null) {
      const cost = g.plotUnlockCost;
      costs.push(cost);
      const before = g.state.materials;
      expect(g.step([{ type: 'unlockPlot' }], 0)).toContainEqual({ type: 'plotUnlocked', plots: g.state.plots.length });
      expect(before - g.state.materials).toBe(cost);
    }
    expect(costs).toEqual(Array.from({ length: p.maxPlots - p.startPlots }, (_, i) => Math.ceil(p.unlockCostBase * p.unlockCostGrowth ** i)));
    expect(g.state.plots).toHaveLength(p.maxPlots);
    expect(g.step([{ type: 'unlockPlot' }], 0)).toEqual([{ type: 'rejected', command: 'unlockPlot', reason: 'maxLevel' }]);
  });

  it('refuses without enough Materials, changing nothing', () => {
    const g = game();
    g.state.materials = g.plotUnlockCost! - 1;
    expect(g.step([{ type: 'unlockPlot' }], 0)).toEqual([{ type: 'rejected', command: 'unlockPlot', reason: 'cost' }]);
    expect(g.state.plots).toHaveLength(p.startPlots);
  });
});

describe('planting while away (D-053, D-061)', () => {
  it('a started seed grows offline; one that ripens is found sprouted, earning from then', () => {
    const g = game();
    g.state.plots = [{ seed: started('water', 40) }];
    const r = g.reconcile(T0 + 100 * S);
    expect(r.sprouted).toEqual([expect.objectContaining({ type: 'water' })]);
    expect(r.spawned).toEqual([]);
    expect(r.plotsWaiting).toBe(0);
    expect(g.state.plots[0]!.seed).toBeNull();
    expect(r.materials).toBeCloseTo(g.incomeOf('water') * 40, 9);
  });

  it('a filling plot does not grow offline', () => {
    const g = game();
    const planted = P('plain', 'fire', 'water');
    g.state.plots = [{ seed: { planted: structuredClone(planted), sprout: null, grown: 0 } }];
    expect(g.reconcile(T0 + 3600 * S).sprouted).toEqual([]);
    expect(g.state.plots[0]!.seed).toEqual({ planted, sprout: null, grown: 0 });
  });

  it('with the map full, ripe seeds wait and the report counts them', () => {
    const g = game((c) => (c.balance.spawn.capacity = 1));
    place(g, 'plain', 300, 1500);
    g.state.plots = [{ seed: started('water', 0) }, { seed: started('fire', 50) }];
    const r = g.reconcile(T0 + 3600 * S);
    expect(r.sprouted).toEqual([]);
    expect(r.plotsWaiting).toBe(2);
    expect(g.state.plots.map((x) => x.seed?.grown)).toEqual([100, 100]);
  });

  it('Garden spawns and sprouts arrive in time order, a sprout first on a tie, until the map is full', () => {
    const g = game((c) => {
      c.balance.spawn.capacity = 3;
      c.balance.spawn.intervalSeconds = 60;
    });
    // Garden at 60, 120, ...; plot 0 ripens at 60 (a tie: the sprout goes first), plot 1 at 90.
    g.state.plots = [{ seed: started('water', 40) }, { seed: started('fire', 10) }];
    const r = g.reconcile(T0 + 3600 * S);
    expect(r.sprouted.map((k) => k.type)).toEqual(['water', 'fire']);
    expect(r.spawned).toHaveLength(1);
    expect(g.state.world.kids.map((k) => k.type)).toEqual(['water', r.spawned[0]!.type, 'fire']);
    const expected = g.incomeOf('water') * 3540 + g.incomeOf(r.spawned[0]!.type) * 3540 + g.incomeOf('fire') * 3510;
    expect(r.materials).toBeCloseTo(expected, 6);
  });
});

describe('rare kids (D-072)', () => {
  it('with no rare kids in the content, the rare roll gives nothing: a Garden kid sprouts', () => {
    const c = testContent((x) => {
      x.balance.planting.specialOdds = [0, 0];
      x.balance.planting.rareOdds = [1, 1];
    });
    const g = new Game(c, { bounds, spawnAt: garden }, 3);
    for (let i = 0; i < 50; i++) {
      g.state.plots = [{ seed: { planted: P('hero', 'hero', 'chef'), sprout: null, grown: 0 } }];
      g.step([{ type: 'startGrowing', plot: 0 }], 0);
      expect(pool.has(g.state.plots[0]!.seed!.sprout!.type)).toBe(true);
    }
  });

  it('a rare kid can be planted, and counts by its tier', () => {
    const g = game((c) => c.kids.push({ id: 'rare_a', tier: 6, name: 'Rare A', rare: true }));
    const tier6 = g.oddsFor(['rare_a', 'rare_a', 'rare_a']);
    const tier1 = g.oddsFor(['plain', 'plain', 'plain']);
    expect(tier6.rare).toBeGreaterThan(tier1.rare);
    const k = place(g, 'rare_a', 300, 1500);
    g.step([{ type: 'plant', kidIds: [k.id] }], 0);
    expect(g.state.plots[0]!.seed!.planted.map((x) => x.type)).toEqual(['rare_a']);
  });

  it('a rare kid is never in the Compendium: it cannot be bought', () => {
    const g = game((c) => c.kids.push({ id: 'rare_a', tier: 6, name: 'Rare A', rare: true }));
    g.state.discoveredKids.push('rare_a');
    g.state.buildings.compendium = 1;
    g.state.materials = 1e12;
    g.state.potatokens = 1e6;
    expect(g.step([{ type: 'respawn', kidType: 'rare_a', pay: 'materials' }], 0)).toEqual([{ type: 'rejected', command: 'respawn', reason: 'notSpawnable' }]);
  });
});

describe('taking kids back out of a plot (D-074)', () => {
  /** A kid planted into plot 0, with a name and a favourite bite. */
  function plantNamed(g: Game) {
    const k = place(g, 'hero', 300, 1500);
    k.look = { body: 'tall', face: 'sleepy', scale: 0.9 };
    k.name = 'Spud';
    k.happy = { left: 500, favourite: true };
    g.step([{ type: 'plant', kidIds: [k.id], plot: 0 }], 0);
    return k;
  }

  it('a kid comes out of a filling plot as it went in: id, type, look, name, and what is left of its happiness', () => {
    const r = content.balance.body.radius;
    const looks = {
      bodies: [{ id: 'default', weight: 1, box: defaultBox(r) }, { id: 'tall', weight: 1, box: { left: -r, top: -2 * r, right: r, bottom: r } }],
      faces: [{ id: 'default', weight: 1 }, { id: 'sleepy', weight: 1 }],
      sizes: [{ scale: 1, weight: 1 }],
    };
    const g = new Game(testContent((c) => (c.balance.spawn.newbornGraceSeconds = 5)), { bounds, spawnAt: garden, now: T0, looks }, 7);
    const k = plantNamed(g);
    plantAll(g, ['plain']);
    run(g, 30);
    const events = g.step([{ type: 'unplant', plot: 0, kidId: k.id }], 0);
    const back = g.state.world.kids.find((x) => x.id === k.id)!;
    expect(events).toEqual([{ type: 'unplanted', kid: back, plot: 0, count: 1 }]);
    expect(back).toMatchObject({ type: 'hero', look: { body: 'tall', face: 'sleepy', scale: 0.9 }, name: 'Spud', happy: { left: 470, favourite: true }, grace: 5 });
    // Its box follows its look, as a loaded kid's does.
    expect(back.box).toEqual({ left: -r * 0.9, top: -2 * r * 0.9, right: r * 0.9, bottom: r * 0.9 });
    // It comes up by the Garden, where sprouts do.
    expect(Math.hypot(back.x - garden.x, back.y - garden.y)).toBeLessThan(300);
    expect(g.state.plots[0]!.seed!.planted.map((x) => x.type)).toEqual(['plain']);
  });

  it('nothing is charged or refunded, and the last kid out empties the plot', () => {
    const g = game();
    const k = plantNamed(g);
    const before = { materials: g.state.materials, potatokens: g.state.potatokens };
    g.step([{ type: 'unplant', plot: 0, kidId: k.id }], 0);
    expect({ materials: g.state.materials, potatokens: g.state.potatokens }).toEqual(before);
    expect(g.state.plots[0]!.seed).toBeNull();
  });

  it('happiness keeps counting down in the plot, online and offline; whether it was happy when added stays', () => {
    const g = game();
    const k = plantNamed(g);
    run(g, 100);
    expect(g.state.plots[0]!.seed!.planted[0]).toMatchObject({ happy: true, happiness: { left: 400, favourite: true } });
    g.reconcile(T0 + 100 * S + 350 * S);
    expect(g.state.plots[0]!.seed!.planted[0]).toMatchObject({ happy: true, happiness: { left: 50, favourite: true } });
    g.reconcile(T0 + 100 * S + 500 * S);
    const snap = g.state.plots[0]!.seed!.planted[0]!;
    expect(snap.happy).toBe(true);
    expect(snap).not.toHaveProperty('happiness');
    g.step([{ type: 'unplant', plot: 0, kidId: k.id }], 0);
    expect(g.state.world.kids.find((x) => x.id === k.id)).not.toHaveProperty('happy');
  });

  it('a growing plot keeps its kids: one alone is refused, but cancelling brings them all back and loses the time', () => {
    const g = game();
    plantAll(g, ['plain', 'fire', 'water']);
    g.step([{ type: 'startGrowing', plot: 0 }], 0);
    run(g, 40);
    const ids = g.state.plots[0]!.seed!.planted.map((x) => x.id);
    const seed = structuredClone(g.state.plots[0]!.seed);
    expect(g.step([{ type: 'unplant', plot: 0, kidId: ids[0]! }], 0)).toEqual([{ type: 'rejected', command: 'unplant', reason: 'plotsBusy' }]);
    expect(g.state.plots[0]!.seed).toEqual(seed);
    const events = g.step([{ type: 'emptyPlot', plot: 0 }], 0);
    expect(events.map((e) => (e.type === 'unplanted' ? [e.kid.id, e.count] : e.type))).toEqual(ids.map((id) => [id, 0]));
    expect(g.state.plots[0]!.seed).toBeNull();
    expect(g.state.world.kids.map((x) => x.type).sort()).toEqual(['fire', 'plain', 'water']);
    // The next growing starts from nothing.
    g.step(g.state.world.kids.map((x) => ({ type: 'plant' as const, kidIds: [x.id], plot: 0 })), 0);
    g.step([{ type: 'startGrowing', plot: 0 }], 0);
    expect(g.state.plots[0]!.seed!.grown).toBe(0);
  });

  it('a filling plot can be emptied at once too', () => {
    const g = game();
    plantAll(g, ['plain', 'fire']);
    g.step([{ type: 'emptyPlot', plot: 0 }], 0);
    expect(g.state.plots[0]!.seed).toBeNull();
    expect(g.state.world.kids).toHaveLength(2);
  });

  it('a ready sprout can be neither cancelled nor emptied, even while it waits for room', () => {
    const g = game((c) => (c.balance.spawn.capacity = 1));
    place(g, 'plain', 300, 1500);
    g.state.plots = [{ seed: started('water', 100) }];
    run(g, 1);
    expect(g.plotWaiting(0)).toBe('full');
    const seed = structuredClone(g.state.plots[0]!.seed);
    expect(g.step([{ type: 'emptyPlot', plot: 0 }], 0)).toEqual([{ type: 'rejected', command: 'emptyPlot', reason: 'ready' }]);
    expect(g.step([{ type: 'unplant', plot: 0, kidId: seed!.planted[0]!.id }], 0)).toEqual([{ type: 'rejected', command: 'unplant', reason: 'ready' }]);
    expect(g.state.plots[0]!.seed).toEqual(seed);
  });

  it('a kid comes back only if the map has room: cancelling needs room for all of them', () => {
    const g = game((c) => (c.balance.spawn.capacity = 4));
    plantAll(g, ['plain', 'fire', 'water']);
    place(g, 'snow', 300, 1000);
    place(g, 'snow', 600, 1000);
    const seed = structuredClone(g.state.plots[0]!.seed);
    // Two live, three planted, room for four: one fits, three don't.
    expect(g.step([{ type: 'emptyPlot', plot: 0 }], 0)).toEqual([{ type: 'rejected', command: 'emptyPlot', reason: 'full' }]);
    expect(g.state.plots[0]!.seed).toEqual(seed);
    expect(g.state.world.kids).toHaveLength(2);
    expect(g.step([{ type: 'unplant', plot: 0, kidId: seed!.planted[0]!.id }], 0)[0]).toMatchObject({ type: 'unplanted' });
    place(g, 'snow', 900, 1000);
    expect(g.step([{ type: 'unplant', plot: 0, kidId: seed!.planted[1]!.id }], 0)).toEqual([{ type: 'rejected', command: 'unplant', reason: 'full' }]);
  });

  it('with no clear spot for every kid by the Garden, none comes back', () => {
    const c = testContent((x) => (x.balance.spawn.capacity = 40));
    const tiny = { minX: 0, minY: 0, maxX: 250, maxY: 250 };
    const g = new Game(c, { bounds: tiny, spawnAt: { x: 125, y: 125 } }, 7);
    g.state.plots = [{ seed: { planted: P('plain', 'fire', 'water'), sprout: null, grown: 0 } }];
    g.state.world.nextKidId = 20_000;
    for (const [x, y] of [[60, 60], [190, 60], [60, 190]]) place(g, 'plain', x!, y!);
    const seed = structuredClone(g.state.plots[0]!.seed);
    const kids = structuredClone(g.state.world.kids);
    expect(g.step([{ type: 'emptyPlot', plot: 0 }], 0)).toEqual([{ type: 'rejected', command: 'emptyPlot', reason: 'noRoom' }]);
    expect(g.state.plots[0]!.seed).toEqual(seed);
    expect(g.state.world.kids).toEqual(kids);
    // One alone fits.
    expect(g.step([{ type: 'unplant', plot: 0, kidId: seed!.planted[0]!.id }], 0)[0]).toMatchObject({ type: 'unplanted' });
  });

  it('a kid or plot already gone is refused, changing nothing', () => {
    const g = game();
    plantAll(g, ['plain']);
    const seed = structuredClone(g.state.plots[0]!.seed);
    expect(g.step([{ type: 'unplant', plot: 0, kidId: 999 }], 0)).toEqual([{ type: 'rejected', command: 'unplant', reason: 'gone' }]);
    expect(g.step([{ type: 'unplant', plot: 3, kidId: seed!.planted[0]!.id }], 0)).toEqual([{ type: 'rejected', command: 'unplant', reason: 'gone' }]);
    g.step([{ type: 'unplant', plot: 0, kidId: seed!.planted[0]!.id }], 0);
    expect(g.step([{ type: 'emptyPlot', plot: 0 }], 0)).toEqual([{ type: 'rejected', command: 'emptyPlot', reason: 'gone' }]);
  });

  it('a kid back from a plot keeps its id when planted again, and the save holds it', () => {
    const g = game();
    const k = plantNamed(g);
    g.step([{ type: 'unplant', plot: 0, kidId: k.id }], 0);
    g.step([{ type: 'plant', kidIds: [k.id], plot: 0 }], 0);
    expect(g.state.plots[0]!.seed!.planted[0]).toMatchObject({ id: k.id, name: 'Spud' });
    expect(g.persisted().plots[0]!.seed!.planted[0]!.id).toBe(k.id);
  });
});

describe('kids back from a plot never fuse on the way (D-074)', () => {
  it('recipe partners come back clear of each other and of partners on the map, even with no grace', () => {
    const g = game();
    // plain + water is a recipe (R1); a water waits by the Garden.
    place(g, 'water', garden.x, garden.y);
    plantAll(g, ['plain', 'water', 'plain', 'water']);
    const events = g.step([{ type: 'emptyPlot', plot: 0 }], 0);
    expect(events.filter((e) => e.type === 'unplanted')).toHaveLength(4);
    expect(run(g, 5).filter((e) => e.type === 'fused')).toEqual([]);
    expect(g.state.world.kids).toHaveLength(5);
  });

  it('with room by the Garden but none clear of a partner, nothing comes back (Codex review, PR #82)', () => {
    // A map two kids wide: a water fills one half; plain + water is a recipe (R1).
    const g = new Game(testContent(), { bounds: { minX: 0, minY: 0, maxX: 240, maxY: 120 }, spawnAt: { x: 180, y: 60 } }, 7);
    g.state.plots = [{ seed: { planted: P('plain'), sprout: null, grown: 0 } }];
    g.state.world.nextKidId = 20_000;
    place(g, 'water', 60, 60);
    const seed = structuredClone(g.state.plots[0]!.seed);
    const kids = structuredClone(g.state.world.kids);
    expect(g.step([{ type: 'unplant', plot: 0, kidId: seed!.planted[0]!.id }], 0)).toEqual([{ type: 'rejected', command: 'unplant', reason: 'noRoom' }]);
    expect(g.step([{ type: 'emptyPlot', plot: 0 }], 0)).toEqual([{ type: 'rejected', command: 'emptyPlot', reason: 'noRoom' }]);
    expect(g.state.plots[0]!.seed).toEqual(seed);
    expect(g.state.world.kids).toEqual(kids);
  });
});
