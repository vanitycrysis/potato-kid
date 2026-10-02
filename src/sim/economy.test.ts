import { describe, expect, it } from 'vitest';
import { content } from '../content';
import type { Content } from '../content/types';
import { validateContent } from '../content/validate';
import { Game, type GameEvent } from './game';
import { createRng } from './rng';
import { addKid, defaultBox } from './world';

const bounds = { minX: 0, minY: 0, maxX: 2000, maxY: 2000 };
const garden = { x: 1000, y: 300 };

/** Frozen wander, no starting kids, no Garden spawns unless asked: purchases are exact. */
function testContent(edit: (c: Content) => void = () => {}): Content {
  const c = structuredClone(content);
  c.balance.wander = { speed: 0, turnChancePerSecond: 0, idleChancePerSecond: 0, idleSeconds: [1, 1], ambientChance: 0 };
  c.balance.spawn = { ...c.balance.spawn, startingKids: 0, newbornGraceSeconds: 0, intervalSeconds: 1e9 };
  edit(c);
  return c;
}

function game(edit?: (c: Content) => void): Game {
  return new Game(testContent(edit), { bounds, spawnAt: garden }, 7);
}

function place(g: Game, type: string, x: number, y: number) {
  return addKid(g.state.world, type, x, y, createRng(0), 0, defaultBox(content.balance.body.radius));
}

const e = content.balance.economy;

describe('Materials faucet (D-020)', () => {
  it('every kid earns base · 2^(tier−1) per second', () => {
    const g = game();
    place(g, 'plain', 300, 1500); // tier 1
    place(g, 'hero', 900, 1500); // tier 3
    g.step([], 1);
    expect(g.state.materials).toBeCloseTo(e.materialsPerSecond * (1 + 4));
    expect(g.income).toBeCloseTo(e.materialsPerSecond * 5);
  });

  it('an empty map earns nothing', () => {
    const g = game();
    g.step([], 10);
    expect(g.state.materials).toBe(e.startingMaterials);
  });
});

describe('building upgrades (plan §2, §3)', () => {
  it('refuses without enough Materials and changes nothing', () => {
    const g = game();
    const before = structuredClone(g.state.buildings);
    const events = g.step([{ type: 'upgrade', building: 'garden' }]);
    expect(events).toContainEqual({ type: 'rejected', command: 'upgrade', reason: 'cost' });
    expect(g.state.buildings).toEqual(before);
    expect(g.state.materials).toBe(e.startingMaterials);
  });

  it('charges ceil(costBase · growth^level) and applies the level', () => {
    const g = game();
    const b = content.balance.buildings;
    const gardenCost = Math.ceil(b.garden.costBase * b.garden.costGrowth ** 1);
    const capCost = Math.ceil(b.capacity.costBase * b.capacity.costGrowth ** 1);
    expect(g.upgradeCost('garden')).toBe(gardenCost);
    g.state.materials = gardenCost + capCost;
    const interval = g.interval;
    const capacity = g.capacity;
    const events = g.step([
      { type: 'upgrade', building: 'garden' },
      { type: 'upgrade', building: 'capacity' },
    ]);
    expect(events).toContainEqual({ type: 'upgraded', building: 'garden', level: 2 });
    expect(events).toContainEqual({ type: 'upgraded', building: 'capacity', level: 2 });
    expect(g.state.materials).toBeCloseTo(0);
    expect(g.interval).toBeCloseTo(interval * e.gardenIntervalFactor);
    expect(g.capacity).toBe(capacity + e.capacityPerLevel);
  });

  it('stops at max level', () => {
    const g = game();
    g.state.buildings.compendium = content.balance.buildings.compendium.maxLevel;
    g.state.materials = 1e9;
    expect(g.upgradeCost('compendium')).toBeNull();
    expect(g.step([{ type: 'upgrade', building: 'compendium' }])).toContainEqual({ type: 'rejected', command: 'upgrade', reason: 'maxLevel' });
  });

  it('a faster Garden keeps at most one banked spawn', () => {
    const g = game((c) => (c.balance.spawn.intervalSeconds = 12));
    g.state.spawnProgress = 12; // banked, map has room but we upgrade first
    g.state.materials = 1e6;
    g.step([{ type: 'upgrade', building: 'garden' }], 0);
    expect(g.state.spawnProgress).toBeLessThanOrEqual(g.interval);
  });
});

describe('bias building', () => {
  it('only targets spawn-pool types', () => {
    const g = game();
    expect(g.step([{ type: 'setBias', kidType: 'hero' }])).toContainEqual({ type: 'rejected', command: 'setBias', reason: 'notSpawnable' });
    expect(g.state.biasTarget).toBeNull();
    expect(g.step([{ type: 'setBias', kidType: 'fire' }])).toContainEqual({ type: 'biasSet', kidType: 'fire' });
    expect(g.state.biasTarget).toBe('fire');
  });

  it('multiplies the target weight by 1 + perLevel · level', () => {
    const g = game();
    g.step([{ type: 'setBias', kidType: 'fire' }]);
    const base = content.balance.spawnWeights.fire!;
    expect(g.spawnWeights.find((w) => w.id === 'fire')!.weight).toBe(base); // not built yet
    g.state.buildings.bias = 2;
    expect(g.spawnWeights.find((w) => w.id === 'fire')!.weight).toBeCloseTo(base * (1 + 2 * e.biasWeightPerLevel));
    expect(g.spawnWeights.find((w) => w.id === 'plain')!.weight).toBe(content.balance.spawnWeights.plain);
  });

  it('shifts what the Garden actually spawns', () => {
    const count = (biasLevel: number) => {
      const g = game((c) => {
        c.balance.spawn.intervalSeconds = 0.1;
        c.balance.spawn.capacity = 400;
      });
      g.state.biasTarget = 'snow';
      g.state.buildings.bias = biasLevel;
      const spawned = (evts: GameEvent[]) => evts.filter((x) => x.type === 'spawned' && x.kid.type === 'snow').length;
      let n = 0;
      for (let i = 0; i < 300; i++) {
        n += spawned(g.step([]));
        g.state.world.kids = []; // keep room so every interval spawns
      }
      return n;
    };
    expect(count(8)).toBeGreaterThan(count(0) * 2);
  });
});

describe('instant spawn (D-019)', () => {
  it('spends Potatokens, spawns at the Garden, and leaves its timer alone', () => {
    const g = game();
    g.state.potatokens = 2;
    g.state.spawnProgress = 3;
    const events = g.step([{ type: 'instantSpawn' }], 0);
    expect(events.find((x) => x.type === 'spawned')).toMatchObject({ source: 'instant' });
    expect(g.state.potatokens).toBe(2 - e.instantSpawnPotatokens);
    expect(g.state.spawnProgress).toBe(3);
  });

  it('refuses without Potatokens, or when the map is full, without charging', () => {
    const broke = game();
    broke.state.potatokens = 0;
    expect(broke.step([{ type: 'instantSpawn' }])).toContainEqual({ type: 'rejected', command: 'instantSpawn', reason: 'cost' });

    const full = game((c) => (c.balance.spawn.capacity = 2));
    full.state.potatokens = 5;
    place(full, 'plain', 300, 1500);
    place(full, 'plain', 900, 1500);
    expect(full.step([{ type: 'instantSpawn' }])).toContainEqual({ type: 'rejected', command: 'instantSpawn', reason: 'full' });
    expect(full.state.potatokens).toBe(5);
    expect(full.state.world.kids).toHaveLength(2);
  });
});

describe('compendium respawn', () => {
  it('is locked until the compendium is built, and only for discovered kids', () => {
    const g = game();
    g.state.materials = 1e6;
    g.state.discoveredKids = ['hero'];
    expect(g.step([{ type: 'respawn', kidType: 'hero', pay: 'materials' }])).toContainEqual({ type: 'rejected', command: 'respawn', reason: 'locked' });
    g.state.buildings.compendium = 1;
    expect(g.step([{ type: 'respawn', kidType: 'sundae', pay: 'materials' }])).toContainEqual({
      type: 'rejected',
      command: 'respawn',
      reason: 'undiscovered',
    });
  });

  it('charges respawnMaterials · 2^(tier−1) Materials, or perTier · tier Potatokens', () => {
    const g = game();
    g.state.buildings.compendium = 1;
    g.state.discoveredKids = ['hero'];
    const cost = g.respawnCost('hero'); // tier 3
    expect(cost).toEqual({ materials: Math.ceil(e.respawnMaterials * 4), potatokens: e.respawnPotatokensPerTier * 3 });

    g.state.materials = cost.materials;
    const events = g.step([{ type: 'respawn', kidType: 'hero', pay: 'materials' }], 0);
    expect(events.find((x) => x.type === 'spawned')).toMatchObject({ source: 'compendium', kid: { type: 'hero' } });
    expect(g.state.materials).toBeCloseTo(0);

    g.state.potatokens = cost.potatokens;
    g.step([{ type: 'respawn', kidType: 'hero', pay: 'potatokens' }], 0);
    expect(g.state.potatokens).toBe(0);
    expect(g.state.world.kids.filter((k) => k.type === 'hero')).toHaveLength(2);
  });

  it('refuses a full map without charging', () => {
    const g = game((c) => (c.balance.spawn.capacity = 2));
    g.state.buildings.compendium = 1;
    g.state.discoveredKids = ['plain'];
    g.state.materials = 1e6;
    place(g, 'fire', 300, 1500);
    place(g, 'fire', 900, 1500);
    expect(g.step([{ type: 'respawn', kidType: 'plain', pay: 'materials' }], 0)).toContainEqual({
      type: 'rejected',
      command: 'respawn',
      reason: 'full',
    });
    expect(g.state.materials).toBe(1e6);
  });
});

describe('Potatoken rewards', () => {
  it('pay for a recipe’s first discovery only', () => {
    const g = game();
    g.state.potatokens = 0;
    place(g, 'plain', 300, 1500);
    place(g, 'water', 340, 1500);
    const first = g.step([]);
    expect(first).toContainEqual({ type: 'earned', potatokens: e.discoveryPotatokens, reason: 'discovery' });
    place(g, 'plain', 1300, 1500);
    place(g, 'water', 1340, 1500);
    const again = g.step([]);
    expect(again.filter((x) => x.type === 'fused')).toHaveLength(1);
    expect(again.some((x) => x.type === 'earned' && x.reason === 'discovery')).toBe(false);
  });

  it('pay each Dex milestone once, and not for a new save’s starting kids', () => {
    // A milestone low enough that a new save's starting kids already reach it.
    const low = structuredClone(content);
    low.balance.spawn.startingKids = 8;
    low.balance.economy.dexMilestones = [{ kids: 2, potatokens: 9 }];
    const fresh = new Game(low, { bounds, spawnAt: garden }, 3);
    expect(fresh.state.discoveredKids.length).toBeGreaterThanOrEqual(2);
    expect(fresh.state.potatokens).toBe(e.startingPotatokens);
    expect(fresh.state.milestonesPaid).toBe(1);

    const g = game();
    g.state.potatokens = 0;
    const first = e.dexMilestones[0]!;
    for (const [i, t] of ['plain', 'fire', 'water', 'snow'].slice(0, first.kids - 1).entries()) g.debugAddKid(t, 200 + i * 250, 1500);
    expect(g.state.potatokens).toBe(0);
    // The fusion's result is the discovery that reaches the milestone, reported as an event.
    place(g, 'chef', 300, 900);
    place(g, 'snowman', 340, 900);
    const events = g.step([]);
    expect(events).toContainEqual({ type: 'earned', potatokens: first.potatokens, reason: 'milestone' });
    const paid = g.state.potatokens;
    g.step([]);
    expect(g.state.potatokens).toBe(paid);
  });
});

describe('balance validation', () => {
  it('accepts the shipped economy', () => {
    expect(validateContent(content)).toEqual([]);
  });

  it('reports malformed economy and building values', () => {
    const c = structuredClone(content);
    c.balance.economy.gardenIntervalFactor = 1.5;
    c.balance.economy.dexMilestones = [{ kids: 5, potatokens: 1 }, { kids: 5, potatokens: 1 }];
    c.balance.buildings.garden.startLevel = 0;
    c.balance.buildings.bias.costGrowth = Number.NaN;
    const problems = validateContent(c);
    expect(problems).toContain('balance.economy.gardenIntervalFactor must be in (0, 1]');
    expect(problems).toContain('balance.economy.dexMilestones must have strictly increasing whole kid counts');
    expect(problems).toContain('balance.buildings.garden.startLevel must be 1');
    expect(problems).toContain('balance.buildings.bias.costGrowth must be a finite number >= 1');
  });
});
