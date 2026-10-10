import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import type { KidRig, MapData } from '../content/artData';
import { lookTable, obstaclesFrom } from '../content/artRules';
import type { Content } from '../content/types';
import { pairKey } from '../content/validate';
import { Game } from './game';
import { reflect, wanderSpread } from './offlineWander';
import { createRng } from './rng';
import { intersects, kidRect, touching } from './space';
import { addKid, defaultBox, type Kid } from './world';

// Offline wandering (D-053). Times are wall-clock ms; the game starts accounted at T0.
const bounds = { minX: 0, minY: 0, maxX: 3000, maxY: 3000 };
const garden = { x: 1500, y: 300 };
const T0 = 1_700_000_000_000;
const S = 1000;
const HOUR = 3600;
const w = content.balance.wander;
const recipes = new Set(content.recipes.map((r) => pairKey(r.a, r.b)));
const slack = content.balance.body.touchSlack;

/** The shipped wander (kids really walk), no Garden spawns unless asked, a roomy map. */
function testContent(edit: (c: Content) => void = () => {}): Content {
  const c = structuredClone(content);
  c.balance.spawn = { ...c.balance.spawn, tutorialSpawns: 0, startingKids: 0, newbornGraceSeconds: 0, intervalSeconds: 1e9, capacity: 40 };
  edit(c);
  return c;
}

function game(edit?: (c: Content) => void, seed = 11): Game {
  return new Game(testContent(edit), { bounds, spawnAt: garden, now: T0 }, seed);
}

function place(g: Game, type: string, x: number, y: number, grace = 0): Kid {
  return addKid(g.state.world, type, x, y, createRng(0), grace, defaultBox(content.balance.body.radius));
}

/** A crowded block of recipe partners (plain, water, fire, snow pair up many ways), 6 apart: touching. */
function crowd(g: Game, n: number): Kid[] {
  const types = ['plain', 'water', 'fire', 'snow'];
  return Array.from({ length: n }, (_, i) => place(g, types[i % 4]!, 700 + (i % 6) * 126, 1200 + Math.floor(i / 6) * 126));
}

/** Every recipe pair left touching, and every overlapping pair. */
function problems(g: Game): string[] {
  const kids = g.state.world.kids;
  const out: string[] = [];
  for (let i = 0; i < kids.length; i++) {
    for (let j = i + 1; j < kids.length; j++) {
      const [a, b] = [kids[i]!, kids[j]!];
      if (intersects(kidRect(a), kidRect(b))) out.push(`overlap ${a.id}/${b.id}`);
      if (recipes.has(pairKey(a.type, b.type)) && touching(kidRect(a), kidRect(b), slack)) out.push(`recipe pair touching ${a.id}/${b.id}`);
    }
  }
  return out;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('the offline walk (D-053)', () => {
  it("spreads with the square root of time, and not at all without time or speed", () => {
    expect(wanderSpread(w, 0)).toBe(0);
    expect(wanderSpread({ ...w, speed: 0 }, HOUR)).toBe(0);
    expect(wanderSpread(w, 4 * HOUR) / wanderSpread(w, HOUR)).toBeCloseTo(2, 9);
    // Idling slows it; a walker that never turns goes straight at full walking speed.
    expect(wanderSpread({ ...w, idleChancePerSecond: 0 }, HOUR)).toBeGreaterThan(wanderSpread(w, HOUR));
    expect(wanderSpread({ ...w, turnChancePerSecond: 0, idleChancePerSecond: 0 }, 10)).toBeCloseTo(w.speed * 10, 9);
  });

  it('reflects off the edges like a walker bouncing off a wall', () => {
    expect(reflect(50, 0, 100)).toBe(50);
    expect(reflect(130, 0, 100)).toBe(70);
    expect(reflect(-30, 0, 100)).toBe(30);
    expect(reflect(250, 0, 100)).toBe(50);
    expect(reflect(-230, 0, 100)).toBe(30);
    expect(reflect(7, 5, 5)).toBe(5);
  });
});

describe('a long absence (D-053)', () => {
  it('finds every kid somewhere new, inside the map, with no overlap and no recipe pair touching', () => {
    const g = game();
    const kids = crowd(g, 24);
    for (const k of kids) k.activity = { kind: 'sleep', left: 1e6, total: 1e6 }; // asleep when left
    const before = kids.map((k) => ({ id: k.id, x: k.x, y: k.y }));
    expect(problems(g)).not.toEqual([]); // the crowd starts with recipe partners touching
    g.reconcile(T0 + 3 * HOUR * S);
    expect(problems(g)).toEqual([]);
    for (const k of g.state.world.kids) {
      const r = kidRect(k);
      expect(r.minX >= bounds.minX && r.maxX <= bounds.maxX && r.minY >= bounds.minY && r.maxY <= bounds.maxY).toBe(true);
      expect(k.activity.kind).toBe('walk');
    }
    // Three hours of wandering scatters them: on average far from where they were left.
    const moved = before.map((b) => dist(b, g.state.world.kids.find((k) => k.id === b.id)!));
    expect(moved.reduce((s, d) => s + d, 0) / moved.length).toBeGreaterThan(500);
    expect(g.state.world.kids).toHaveLength(24); // no fusion, nobody lost
  });

  it('a short absence moves kids only a little', () => {
    const g = game();
    const before = crowd(g, 4).map((k) => ({ id: k.id, x: k.x + 0, y: k.y + 0 }));
    g.reconcile(T0 + 10 * S);
    const sigma = wanderSpread(w, 10);
    const moved = before.map((b) => dist(b, g.state.world.kids.find((k) => k.id === b.id)!));
    expect(moved.reduce((s, d) => s + d, 0) / moved.length).toBeLessThan(3 * sigma);
  });

  it('a brief app switch moves a kid no farther than it could walk (Codex review, PR #70)', () => {
    for (const seed of [1, 2, 3, 11, 42]) {
      const g = game(undefined, seed);
      const kid = place(g, 'plain', 1500, 2000);
      g.reconcile(T0 + 100);
      expect(dist(kid, { x: 1500, y: 2000 })).toBeLessThanOrEqual(w.speed * 0.1 + 1e-9);
    }
  });

  it('beside scenery too: making room never carries a kid farther than it could walk (Codex review, PR #70)', () => {
    const map = JSON.parse(readFileSync('art/data/map_garden_v3.json', 'utf8')) as MapData;
    const rig = JSON.parse(readFileSync('art/data/kid_rig_v2.json', 'utf8')) as KidRig;
    const [mw, mh] = map.worldSize;
    const options = { bounds: { minX: 0, minY: 0, maxX: mw, maxY: mh }, spawnAt: garden, now: T0, obstacles: obstaclesFrom(map), looks: lookTable(rig) };
    for (const seed of [1, 11, 42]) {
      for (const body of ['round', 'tall', 'squat', 'bean']) {
        const g = new Game(testContent(), options, seed);
        const kid = g.debugAddKid('plain', 1475.75, 620, { body, scale: 1 }); // against the Garden's reserve
        const start = { x: kid.x, y: kid.y };
        g.reconcile(T0 + 100);
        expect(dist(kid, start), `seed ${seed}, ${body}`).toBeLessThanOrEqual(w.speed * 0.1 + 1e-9);
      }
    }
  });

  it('parting a touching recipe pair walks within reach when it can (Codex review, PR #70)', () => {
    const g = game(undefined, 35);
    // Touching, kept from fusing by newborn grace; a one-second absence (reach 40 units).
    const a = place(g, 'plain', 500, 1000, 5);
    const b = place(g, 'water', 620, 1000, 5);
    g.reconcile(T0 + 1 * S);
    expect(problems(g)).toEqual([]);
    expect(dist(a, { x: 500, y: 1000 })).toBeLessThanOrEqual(w.speed * 1 + 1e-9);
    expect(dist(b, { x: 620, y: 1000 })).toBeLessThanOrEqual(w.speed * 1 + 1e-9);
  });

  it('offline spawns walk out from the Garden for the time since they arrived', () => {
    const g = game((c) => (c.balance.spawn.intervalSeconds = 600));
    const r = g.reconcile(T0 + 2 * HOUR * S);
    expect(r.spawned.length).toBeGreaterThanOrEqual(10);
    const far = r.spawned.filter((k) => dist(k, garden) > 400).length;
    expect(far).toBeGreaterThan(r.spawned.length / 2);
    expect(problems(g)).toEqual([]);
  });

  it('after the longest absence kids are spread over the map, not piled against its edges', () => {
    const g = game();
    crowd(g, 24);
    g.reconcile(T0 + 8 * HOUR * S);
    // A walk folded back at the walls spreads evenly; one cut off at the walls would pile up there.
    const nearEdge = g.state.world.kids.filter((k) => {
      const r = kidRect(k);
      return Math.min(r.minX - bounds.minX, bounds.maxX - r.maxX, r.minY - bounds.minY, bounds.maxY - r.maxY) < 50;
    });
    expect(nearEdge.length).toBeLessThanOrEqual(6);
  });

  it('a kid that arrived just before the return has barely left the Garden', () => {
    const g = game((c) => (c.balance.spawn.intervalSeconds = 600));
    const r = g.reconcile(T0 + 600.5 * S);
    expect(r.spawned).toHaveLength(1);
    expect(dist(r.spawned[0]!, garden)).toBeLessThan(250);
  });

  it('is deterministic for a seed', () => {
    const a = game(undefined, 5);
    const b = game(undefined, 5);
    crowd(a, 12);
    crowd(b, 12);
    a.reconcile(T0 + HOUR * S);
    b.reconcile(T0 + HOUR * S);
    expect(a.state.world.kids.map((k) => [k.x, k.y])).toEqual(b.state.world.kids.map((k) => [k.x, k.y]));
  });

  it('newborn grace runs out while away', () => {
    const g = game();
    const kid = place(g, 'plain', 500, 2500, 2);
    g.reconcile(T0 + 1 * S);
    expect(kid.grace).toBe(1);
    g.reconcile(T0 + 5 * S);
    expect(kid.grace).toBe(0);
  });
});

describe('when kids do not walk (calm, or speed 0)', () => {
  const still = (c: Content) => (c.balance.wander = { ...c.balance.wander, speed: 0 });

  it('nobody moves, except to part a recipe pair left touching', () => {
    const g = game(still);
    // Plain and water touching, kept apart from fusing by newborn grace; plain and plain touching.
    const a = place(g, 'plain', 500, 1000, 5);
    const b = place(g, 'water', 620, 1000, 5);
    const c = place(g, 'plain', 500, 2000);
    const d = place(g, 'plain', 620, 2000);
    const at = (k: Kid) => ({ x: k.x, y: k.y });
    const [ca, cd] = [at(c), at(d)];
    expect(problems(g)).not.toEqual([]);
    g.reconcile(T0 + HOUR * S);
    expect(problems(g)).toEqual([]);
    expect(dist(at(a), { x: 500, y: 1000 }) + dist(at(b), { x: 620, y: 1000 })).toBeGreaterThan(0);
    expect([at(c), at(d)]).toEqual([ca, cd]);
  });
});
