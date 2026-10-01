import { describe, expect, it } from 'vitest';
import { content } from '../content';
import type { Content } from '../content/types';
import { Game, type GameEvent } from './game';
import { createRng } from './rng';
import { addKid } from './world';

const bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
const garden = { x: 500, y: 100 };

/** Content with frozen wander and no starting kids, so tests place kids exactly. */
function testContent(overrides: Partial<Content['balance']['spawn']> = {}): Content {
  const c = structuredClone(content);
  c.balance.wander = { speed: 0, turnChancePerSecond: 0, idleChancePerSecond: 0, idleSeconds: [1, 1] };
  c.balance.spawn = { ...c.balance.spawn, startingKids: 0, newbornGraceSeconds: 0, ...overrides };
  return c;
}

function place(game: Game, type: string, x: number, y: number) {
  return addKid(game.state.world, type, x, y, createRng(0));
}

function run(game: Game, seconds: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let t = 0; t < Math.round(seconds * 10); t++) events.push(...game.step([]));
  return events;
}

describe('fusion', () => {
  it('consumes both parents and produces the recipe result (R1)', () => {
    const game = new Game(testContent({ intervalSeconds: 1e9 }), bounds, garden, 1);
    place(game, 'plain', 300, 300);
    place(game, 'water', 340, 300);
    const events = game.step([]);
    expect(game.state.world.kids.map((k) => k.type)).toEqual(['firefighter']);
    const fused = events.find((e) => e.type === 'fused');
    expect(fused).toMatchObject({ type: 'fused', firstDiscovery: true });
  });

  it('does nothing for a pair with no recipe', () => {
    const game = new Game(testContent({ intervalSeconds: 1e9 }), bounds, garden, 1);
    place(game, 'fire', 300, 300);
    place(game, 'snow', 320, 300);
    game.step([]);
    expect(game.state.world.kids.map((k) => k.type).sort()).toEqual(['fire', 'snow']);
  });

  it('never lets one kid fuse twice in a step, and breaks ties by distance then id', () => {
    const game = new Game(testContent({ intervalSeconds: 1e9 }), bounds, garden, 1);
    // water touches both plain (R1) and fire (R4); plain is closer, so R1 wins.
    place(game, 'fire', 270, 300);
    place(game, 'water', 330, 300);
    place(game, 'plain', 360, 300);
    const events = game.step([]);
    expect(events.filter((e) => e.type === 'fused')).toHaveLength(1);
    expect(game.state.world.kids.map((k) => k.type).sort()).toEqual(['fire', 'firefighter']);
  });

  it('breaks exact distance ties by the lower kid id', () => {
    const game = new Game(testContent({ intervalSeconds: 1e9 }), bounds, garden, 1);
    const plainA = place(game, 'plain', 300, 300);
    place(game, 'water', 360, 300);
    place(game, 'plain', 420, 300); // same distance to water as plainA
    const events = game.step([]);
    const fused = events.find((e) => e.type === 'fused');
    expect(fused?.type === 'fused' && fused.parents.map((p) => p.id)).toContain(plainA.id);
  });

  it('excludes held kids until they are dropped', () => {
    const game = new Game(testContent({ intervalSeconds: 1e9 }), bounds, garden, 1);
    const plain = place(game, 'plain', 100, 100);
    place(game, 'water', 600, 600);
    game.step([{ type: 'pickUp', kidId: plain.id }]);
    // Dragged right on top of the water kid: still no fusion while held.
    plain.x = 600;
    plain.y = 600;
    game.step([]);
    expect(game.state.world.kids).toHaveLength(2);
    game.step([{ type: 'drop', kidId: plain.id, x: 610, y: 600 }]);
    expect(game.state.world.kids.map((k) => k.type)).toEqual(['firefighter']);
  });

  it('respects the newborn grace period', () => {
    const game = new Game(testContent({ intervalSeconds: 1e9, newbornGraceSeconds: 2 }), bounds, garden, 1);
    place(game, 'plain', 300, 300);
    place(game, 'water', 340, 300);
    game.step([]);
    const child = game.state.world.kids[0]!;
    expect(child.grace).toBeGreaterThan(0);
    place(game, 'fire', child.x + 10, child.y); // R5 fire + firefighter
    run(game, 1);
    expect(game.state.world.kids.map((k) => k.type).sort()).toEqual(['fire', 'firefighter']);
    run(game, 1.2);
    expect(game.state.world.kids.map((k) => k.type)).toEqual(['hero']);
  });

  it('reports first discovery only once per recipe', () => {
    const game = new Game(testContent({ intervalSeconds: 1e9 }), bounds, garden, 1);
    place(game, 'plain', 100, 100);
    place(game, 'water', 120, 100);
    place(game, 'plain', 700, 700);
    place(game, 'water', 720, 700);
    const fused = game.step([]).filter((e) => e.type === 'fused');
    expect(fused.map((e) => e.type === 'fused' && e.firstDiscovery)).toEqual([true, false]);
    expect(game.state.discoveredRecipes).toEqual(['plain|water']);
    expect(game.state.discoveredKids).toContain('firefighter');
  });

  it('cancelling a drag puts the kid back without a drop event', () => {
    const game = new Game(testContent({ intervalSeconds: 1e9 }), bounds, garden, 1);
    const kid = place(game, 'fire', 200, 200);
    game.step([{ type: 'pickUp', kidId: kid.id }]);
    const events = game.step([{ type: 'cancelDrag', kidId: kid.id, x: 200, y: 200 }]);
    expect(kid.held).toBe(false);
    expect(events.some((e) => e.type === 'dropped')).toBe(false);
  });
});

describe('spawning', () => {
  it('spawns one kid per interval', () => {
    const game = new Game(testContent({ intervalSeconds: 12, capacity: 50 }), bounds, garden, 3);
    const spawned = run(game, 60).filter((e) => e.type === 'spawned');
    expect(spawned).toHaveLength(5);
  });

  it('holds progress at the interval while full, then spawns as soon as a slot frees', () => {
    const game = new Game(testContent({ intervalSeconds: 5, capacity: 2 }), bounds, garden, 3);
    const a = place(game, 'fire', 100, 900);
    place(game, 'snow', 900, 900);
    run(game, 20);
    expect(game.state.world.kids).toHaveLength(2);
    expect(game.state.spawnProgress).toBe(5);
    // Free a slot: the banked spawn fires on the very next step.
    game.state.world.kids = game.state.world.kids.filter((k) => k.id !== a.id);
    const events = game.step([]);
    expect(events.filter((e) => e.type === 'spawned')).toHaveLength(1);
    expect(game.state.spawnProgress).toBeLessThan(0.2);
  });

  it('carries partial progress (11 s accumulated + 1 s = one spawn)', () => {
    const game = new Game(testContent({ intervalSeconds: 12, capacity: 50 }), bounds, garden, 3);
    game.state.spawnProgress = 11;
    expect(run(game, 1).filter((e) => e.type === 'spawned')).toHaveLength(1);
  });

  it('only spawns types from the spawn pool', () => {
    const game = new Game(testContent({ intervalSeconds: 1, capacity: 500 }), bounds, garden, 9);
    const types = new Set(run(game, 200).flatMap((e) => (e.type === 'spawned' ? [e.kid.type] : [])));
    expect([...types].sort()).toEqual(['fire', 'plain', 'snow', 'water']);
  });

  it('is deterministic for a seed', () => {
    const real = structuredClone(content);
    const a = new Game(real, bounds, garden, 42);
    const b = new Game(real, bounds, garden, 42);
    run(a, 120);
    run(b, 120);
    expect(a.state).toEqual(b.state);
  });
});
