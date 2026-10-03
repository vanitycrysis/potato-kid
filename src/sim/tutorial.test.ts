import { describe, expect, it } from 'vitest';
import { content } from '../content';
import type { Content } from '../content/types';
import { Game } from './game';

// The tutorial (D-052): the first Garden spawns come quickly, then the slow schedule.
const bounds = { minX: 0, minY: 0, maxX: 3000, maxY: 3000 };
const garden = { x: 1500, y: 300 };
const T0 = 1_700_000_000_000;

/** 3 tutorial spawns every 5 s, then 100 s at Garden level 1; frozen wander, a roomy map. */
function testContent(edit: (c: Content) => void = () => {}): Content {
  const c = structuredClone(content);
  c.balance.wander = { speed: 0, turnChancePerSecond: 0, idleChancePerSecond: 0, idleSeconds: [1, 1], ambientChance: 0 };
  c.balance.spawn = { ...c.balance.spawn, startingKids: 0, newbornGraceSeconds: 1e9, capacity: 40, tutorialSpawns: 3, tutorialIntervalSeconds: 5, intervalSeconds: 100 };
  edit(c);
  return c;
}

/** Sim seconds (from the start) at which the Garden spawned, over `seconds`. */
function spawnTimes(game: Game, seconds: number): number[] {
  const times: number[] = [];
  for (let i = 1; i <= Math.round(seconds * 10); i++) {
    for (const e of game.step([])) if (e.type === 'spawned' && e.source === 'garden') times.push(Math.round(i) / 10);
  }
  return times;
}

describe('tutorial (D-052)', () => {
  it('a new game spawns its first kids at the tutorial interval, then on the slow schedule', () => {
    const game = new Game(testContent(), { bounds, spawnAt: garden }, 1);
    expect(game.state.gardenSpawns).toBe(0);
    expect(game.interval).toBe(5);
    expect(spawnTimes(game, 320)).toEqual([5, 10, 15, 115, 215, 315]);
    expect(game.state.gardenSpawns).toBe(6);
    expect(game.interval).toBe(100);
  });

  it('the tutorial ignores the Garden level; after it, the level speeds the schedule', () => {
    const game = new Game(testContent(), { bounds, spawnAt: garden }, 1);
    game.state.buildings.garden = 3;
    expect(game.interval).toBe(5);
    game.state.gardenSpawns = 3;
    expect(game.interval).toBeCloseTo(100 * content.balance.economy.gardenIntervalFactor ** 2, 9);
  });

  it('spawns bought with Potatokens are extra: they do not use up the tutorial', () => {
    const game = new Game(testContent(), { bounds, spawnAt: garden }, 1);
    game.state.potatokens = 5;
    const events = game.step([{ type: 'instantSpawn' }]);
    expect(events.some((e) => e.type === 'spawned' && e.source === 'instant')).toBe(true);
    expect(game.state.gardenSpawns).toBe(0);
    expect(game.interval).toBe(5);
  });

  it('offline catch-up crosses the end of the tutorial at the right times', () => {
    const game = new Game(testContent(), { bounds, spawnAt: garden, now: T0 }, 1);
    // 3 tutorial spawns at 5, 10, 15 s, then 115 and 215 s; 250 s away leaves 35 s of progress.
    const r = game.reconcile(T0 + 250_000);
    expect(r.spawned).toHaveLength(5);
    expect(game.state.gardenSpawns).toBe(5);
    expect(game.state.spawnProgress).toBeCloseTo(35, 6);
    // Every offline kid earned from its own arrival: the last two arrived at 115 and 215 s.
    const each = game.incomeOf(r.spawned[0]!.type);
    expect(r.spawned.every((k) => game.incomeOf(k.type) === each)).toBe(true);
    expect(r.materials).toBeCloseTo(each * (245 + 240 + 235 + 135 + 35), 6);
  });

  it('a map that is full keeps the tutorial for later', () => {
    const game = new Game(testContent((c) => (c.balance.spawn.capacity = 2)), { bounds, spawnAt: garden, now: T0 }, 1);
    const r = game.reconcile(T0 + 3_600_000);
    expect(r.spawned).toHaveLength(2);
    expect(game.state.gardenSpawns).toBe(2);
    // One tutorial spawn is left, banked at the tutorial interval.
    expect(game.interval).toBe(5);
    expect(game.state.spawnProgress).toBe(5);
  });
});
