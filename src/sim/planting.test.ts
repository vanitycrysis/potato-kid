import { describe, expect, it } from 'vitest';
import { content } from '../content';
import type { Content } from '../content/types';
import { Game, type GameEvent } from './game';
import { createRng } from './rng';
import { addKid, defaultBox } from './world';

// Planting (D-054, GUI_MVP §15): a kid becomes a seed, grows, and sprouts a Garden kid.
const bounds = { minX: 0, minY: 0, maxX: 2000, maxY: 2000 };
const garden = { x: 1000, y: 300 };
const T0 = 1_700_000_000_000;
const S = 1000;
const p = content.balance.planting;
const pool = new Set(Object.keys(content.balance.spawnWeights));

/** Frozen wander, no starting kids, no Garden spawns unless asked, a 100 s grow. */
function testContent(edit: (c: Content) => void = () => {}): Content {
  const c = structuredClone(content);
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

/** Steps `seconds` in 1 s steps, collecting events. */
function run(g: Game, seconds: number): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 0; i < seconds; i++) out.push(...g.step([], 1));
  return out;
}

const sprouts = (events: GameEvent[]) => events.filter((e) => e.type === 'spawned' && e.source === 'sprout');

describe('planting (D-054)', () => {
  it('a new game has its first plot, empty', () => {
    expect(game().state.plots).toEqual([{ seed: null }]);
  });

  it('plants a kid: it leaves the map, stays in the Dex, refunds nothing, and a Garden kid starts growing', () => {
    const g = game();
    const hero = place(g, 'hero', 300, 1500);
    g.state.discoveredKids = ['hero'];
    const before = { materials: g.state.materials, potatokens: g.state.potatokens };
    const events = g.step([{ type: 'plant', kidId: hero.id }], 0);
    expect(events).toContainEqual({ type: 'planted', kid: expect.objectContaining({ id: hero.id, type: 'hero' }), plot: 0 });
    expect(g.state.world.kids).toEqual([]);
    expect(g.state.discoveredKids).toContain('hero');
    expect({ materials: g.state.materials, potatokens: g.state.potatokens }).toEqual(before);
    const seed = g.state.plots[0]!.seed!;
    expect(seed.grown).toBe(0);
    expect(pool.has(seed.type)).toBe(true);
  });

  it('a kid that is already gone is answered with a refusal, changing nothing', () => {
    const g = game();
    expect(g.step([{ type: 'plant', kidId: 999 }], 0)).toEqual([{ type: 'rejected', command: 'plant', reason: 'gone' }]);
    expect(g.state.plots).toEqual([{ seed: null }]);
  });

  it('when every plot is busy the kid is kept, put down, and the refusal says why', () => {
    const g = game();
    const a = place(g, 'plain', 300, 1500);
    const b = place(g, 'fire', 900, 1500);
    g.step([{ type: 'plant', kidId: a.id }], 0);
    g.step([{ type: 'pickUp', kidId: b.id }], 0);
    expect(g.step([{ type: 'plant', kidId: b.id }], 0)).toContainEqual({ type: 'rejected', command: 'plant', reason: 'plotsBusy' });
    expect(g.state.world.kids).toEqual([expect.objectContaining({ id: b.id, held: false })]);
  });

  it('plants in the lowest empty plot', () => {
    const g = game();
    g.state.plots = [{ seed: { type: 'plain', grown: 5 } }, { seed: null }, { seed: null }];
    const k = place(g, 'fire', 300, 1500);
    expect(g.step([{ type: 'plant', kidId: k.id }], 0)).toContainEqual(expect.objectContaining({ type: 'planted', plot: 1 }));
  });

  it('grows for growSeconds, then sprouts the chosen kid at the Garden and empties the plot', () => {
    const g = game();
    const k = place(g, 'hero', 300, 1500);
    g.step([{ type: 'plant', kidId: k.id }], 0);
    const type = g.state.plots[0]!.seed!.type;
    expect(sprouts(run(g, 99))).toEqual([]);
    expect(g.state.plots[0]!.seed!.grown).toBe(99);
    const events = run(g, 1);
    expect(sprouts(events)).toEqual([expect.objectContaining({ kid: expect.objectContaining({ type }) })]);
    expect(g.state.plots[0]!.seed).toBeNull();
    const kid = g.state.world.kids[0]!;
    expect(Math.hypot(kid.x - garden.x, kid.y - garden.y)).toBeLessThan(300);
  });

  it('a ready seed waits while the map is full, then sprouts as soon as there is room', () => {
    const g = game((c) => (c.balance.spawn.capacity = 2));
    g.state.plots = [{ seed: { type: 'water', grown: 99 } }];
    const [a] = [place(g, 'plain', 300, 1500), place(g, 'plain', 900, 1500)];
    expect(sprouts(run(g, 5))).toEqual([]);
    expect(g.plotWaiting(0)).toBe('full');
    expect(g.state.plots[0]!.seed).toEqual({ type: 'water', grown: 100 });
    g.state.world.kids.splice(g.state.world.kids.indexOf(a!), 1);
    expect(sprouts(run(g, 1))).toHaveLength(1);
    expect(g.plotWaiting(0)).toBeNull();
  });

  it('with room on the map but no clear spot by the Garden, it waits for one', () => {
    const c = testContent((x) => (x.balance.spawn.capacity = 40));
    const tiny = { minX: 0, minY: 0, maxX: 250, maxY: 250 };
    const g = new Game(c, { bounds: tiny, spawnAt: { x: 125, y: 125 } }, 7);
    for (const [x, y] of [[60, 60], [190, 60], [60, 190], [190, 190]]) place(g, 'plain', x!, y!);
    g.state.plots = [{ seed: { type: 'water', grown: 100 } }];
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
    g.state.spawnProgress = 1; // a Garden spawn is due too
    g.state.plots = [{ seed: { type: 'snow', grown: 100 } }];
    const events = g.step([], 0.1);
    expect(events.filter((e) => e.type === 'spawned').map((e) => e.type === 'spawned' && e.source)).toEqual(['sprout']);
  });

  it('a seed keeps its chosen kid through a save and a resume', () => {
    const g = game();
    const k = place(g, 'hero', 300, 1500);
    g.step([{ type: 'plant', kidId: k.id }], 0);
    run(g, 40);
    const saved = g.persisted();
    const back = new Game(testContent(), { bounds, spawnAt: garden }, 99, saved);
    expect(back.state.plots).toEqual(g.state.plots);
    expect(sprouts(run(back, 60)).map((e) => e.type === 'spawned' && e.kid.type)).toEqual([saved.plots[0]!.seed!.type]);
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
    expect(g.state.plots.every((x) => x.seed === null)).toBe(true);
    expect(g.step([{ type: 'unlockPlot' }], 0)).toEqual([{ type: 'rejected', command: 'unlockPlot', reason: 'maxLevel' }]);
  });

  it('refuses without enough Materials, changing nothing', () => {
    const g = game();
    g.state.materials = g.plotUnlockCost! - 1;
    expect(g.step([{ type: 'unlockPlot' }], 0)).toEqual([{ type: 'rejected', command: 'unlockPlot', reason: 'cost' }]);
    expect(g.state.plots).toHaveLength(p.startPlots);
  });
});

describe('planting while away (D-053, D-054)', () => {
  it('a seed grows offline; one that ripens is found sprouted, earning from then', () => {
    const g = game();
    g.state.plots = [{ seed: { type: 'water', grown: 40 } }];
    const r = g.reconcile(T0 + 100 * S);
    expect(r.sprouted).toEqual([expect.objectContaining({ type: 'water' })]);
    expect(r.spawned).toEqual([]);
    expect(r.plotsWaiting).toBe(0);
    expect(g.state.plots[0]!.seed).toBeNull();
    // It ripened 60 s in: it earned for the last 40 s.
    expect(r.materials).toBeCloseTo(g.incomeOf('water') * 40, 9);
  });

  it('a seed that has not ripened keeps growing', () => {
    const g = game();
    g.state.plots = [{ seed: { type: 'water', grown: 10 } }];
    const r = g.reconcile(T0 + 30 * S);
    expect(r.sprouted).toEqual([]);
    expect(g.state.plots[0]!.seed).toEqual({ type: 'water', grown: 40 });
  });

  it('with the map full, ripe seeds wait and the report counts them', () => {
    const g = game((c) => (c.balance.spawn.capacity = 1));
    place(g, 'plain', 300, 1500);
    g.state.plots = [{ seed: { type: 'water', grown: 0 } }, { seed: { type: 'fire', grown: 50 } }];
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
    g.state.plots = [{ seed: { type: 'water', grown: 40 } }, { seed: { type: 'fire', grown: 10 } }];
    const r = g.reconcile(T0 + 3600 * S);
    expect(r.sprouted.map((k) => k.type)).toEqual(['water', 'fire']);
    expect(r.spawned).toHaveLength(1); // at 60 s; the map is full after the 90 s sprout
    expect(g.state.world.kids.map((k) => k.type)).toEqual(['water', r.spawned[0]!.type, 'fire']);
    // Income: water and the Garden kid from 60 s, fire from 90 s.
    const expected = g.incomeOf('water') * 3540 + g.incomeOf(r.spawned[0]!.type) * 3540 + g.incomeOf('fire') * 3510;
    expect(r.materials).toBeCloseTo(expected, 6);
  });
});
