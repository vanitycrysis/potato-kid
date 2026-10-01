import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { createRng } from './rng';
import { addKid, createWorld, stepWander as rawStep, STEP, type World } from './world';
import type { Rng } from './rng';
import type { WanderBalance } from '../content/types';

function stepWander(world: World, rng: Rng, w: WanderBalance) {
  rawStep(world, rng, w, STEP, () => ({ kind: 'pause', left: 1 }), () => false);
}

const bounds = { minX: 0, minY: 0, maxX: 1080, maxY: 1480 };
const wander = content.balance.wander;

function populated(seed: number) {
  const rng = createRng(seed);
  const world = createWorld(bounds);
  for (let i = 0; i < 40; i++) addKid(world, 'plain', rng.int(0, 1080), rng.int(0, 1480), rng);
  return { world, rng };
}

describe('stepWander', () => {
  it('keeps every kid inside the bounds', () => {
    const { world, rng } = populated(3);
    for (let s = 0; s < 3000; s++) stepWander(world, rng, wander);
    for (const k of world.kids) {
      expect(k.x).toBeGreaterThanOrEqual(bounds.minX);
      expect(k.x).toBeLessThanOrEqual(bounds.maxX);
      expect(k.y).toBeGreaterThanOrEqual(bounds.minY);
      expect(k.y).toBeLessThanOrEqual(bounds.maxY);
    }
  });

  it('is deterministic for a seed', () => {
    const a = populated(9);
    const b = populated(9);
    for (let s = 0; s < 500; s++) {
      stepWander(a.world, a.rng, wander);
      stepWander(b.world, b.rng, wander);
    }
    expect(a.world).toEqual(b.world);
  });

  it('assigns increasing ids', () => {
    const { world } = populated(1);
    const ids = world.kids.map((k) => k.id);
    expect(ids).toEqual([...ids].sort((x, y) => x - y));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('actually moves kids', () => {
    const { world, rng } = populated(5);
    const before = world.kids.map((k) => [k.x, k.y]);
    for (let s = 0; s < 50; s++) stepWander(world, rng, wander);
    const moved = world.kids.filter((k, i) => k.x !== before[i]![0] || k.y !== before[i]![1]);
    expect(moved.length).toBeGreaterThan(30);
  });
});
