import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { intersects, rectAt, resolveDrawn } from './space';
import { addKid, createWorld, defaultBox } from './world';

describe('resolveDrawn (render-time separation, D-043)', () => {
  it('draws kids whose interpolated boxes would overlap at their non-overlapping sim positions', () => {
    const world = createWorld({ minX: 0, minY: 0, maxX: 2000, maxY: 2000 });
    const a = addKid(world, 'plain', 500, 500, createRng(1), 0, defaultBox(60));
    const b = addKid(world, 'fire', 620, 500, createRng(2), 0, defaultBox(60)); // touching, not overlapping
    // Mid-step, both were interpolated toward each other by 4 units.
    const interp = new Map([
      [a.id, { x: 504, y: 500 }],
      [b.id, { x: 616, y: 500 }],
    ]);
    const out = resolveDrawn(world.kids, interp, new Map());
    expect(out.get(a.id)).toEqual({ x: 500, y: 500 });
    expect(out.get(b.id)).toEqual({ x: 620, y: 500 });
    expect(intersects(rectAt(a.box, 500, 500), rectAt(b.box, 620, 500))).toBe(false);
  });

  it('keeps interpolated positions that do not overlap, and fixed (pending-drop) positions as given', () => {
    const world = createWorld({ minX: 0, minY: 0, maxX: 2000, maxY: 2000 });
    const a = addKid(world, 'plain', 300, 300, createRng(1), 0, defaultBox(60));
    const b = addKid(world, 'fire', 900, 900, createRng(2), 0, defaultBox(60));
    const interp = new Map([[a.id, { x: 302, y: 300 }]]);
    const fixed = new Map([[b.id, { x: 880, y: 900 }]]);
    const out = resolveDrawn(world.kids, interp, fixed);
    expect(out.get(a.id)).toEqual({ x: 302, y: 300 });
    expect(out.get(b.id)).toEqual({ x: 880, y: 900 });
  });

  it('draws a just-released kid (still held in the sim) at its pending drop position', () => {
    const world = createWorld({ minX: 0, minY: 0, maxX: 2000, maxY: 2000 });
    const k = addKid(world, 'plain', 300, 300, createRng(1), 0, defaultBox(60));
    k.held = true; // released, but the drop command hasn't been applied yet
    const out = resolveDrawn(world.kids, new Map(), new Map([[k.id, { x: 1200, y: 900 }]]));
    expect(out.get(k.id)).toEqual({ x: 1200, y: 900 });
  });

  it('never draws an interpolated kid inside a scenery reserve', () => {
    const obstacle = { box: { minX: 700, minY: 700, maxX: 800, maxY: 800 }, circle: { x: 750, y: 800, r: 40 } };
    const world = createWorld({ minX: 0, minY: 0, maxX: 2000, maxY: 2000 }, [obstacle]);
    const k = addKid(world, 'plain', 600, 640, createRng(1), 0, defaultBox(40));
    // Its interpolated midpoint would cut into the obstacle box.
    const out = resolveDrawn(world.kids, new Map([[k.id, { x: 670, y: 690 }]]), new Map(), [obstacle]);
    expect(out.get(k.id)).toEqual({ x: 600, y: 640 });
  });
});

describe('findFreeSpot cost', () => {
  it('gives up quickly when a small allowed area is full (no per-frame freeze)', async () => {
    const { findFreeSpot } = await import('./space');
    const world = createWorld({ minX: 0, minY: 0, maxX: 2160, maxY: 3840 });
    // A row of kids fills a 200-unit-tall band completely.
    for (let x = 60; x < 2160; x += 120) addKid(world, 'plain', x, 1000, createRng(x), 0, defaultBox(60));
    const limit = { minX: 0, minY: 990, maxX: 2160, maxY: 1010 };
    const t0 = performance.now();
    for (let i = 0; i < 60; i++) expect(findFreeSpot(world, defaultBox(60), 1000, 1000, undefined, limit)).toBeNull();
    // 60 calls (a second of frames) stay far below a frame budget each.
    expect((performance.now() - t0) / 60).toBeLessThan(8);
  });
});

