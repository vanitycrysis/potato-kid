import { describe, expect, it } from 'vitest';
import { content } from '../content';
import type { Content } from '../content/types';
import { Game } from './game';
import { createRng } from './rng';
import { addKid, defaultBox } from './world';

// Offline catch-up (plan §3, D-018). Times are wall-clock ms; the game starts accounted at T0.
const bounds = { minX: 0, minY: 0, maxX: 3000, maxY: 3000 };
const garden = { x: 1500, y: 300 };
const T0 = 1_700_000_000_000;
const S = 1000; // ms per second
const e = content.balance.economy;

function testContent(edit: (c: Content) => void = () => {}): Content {
  const c = structuredClone(content);
  c.balance.wander = { speed: 0, turnChancePerSecond: 0, idleChancePerSecond: 0, idleSeconds: [1, 1], ambientChance: 0 };
  c.balance.spawn = { ...c.balance.spawn, startingKids: 0, newbornGraceSeconds: 0, intervalSeconds: 12, capacity: 12 };
  edit(c);
  return c;
}

function game(edit?: (c: Content) => void): Game {
  return new Game(testContent(edit), { bounds, spawnAt: garden, now: T0 }, 11);
}

function place(g: Game, type: string, x: number, y: number) {
  return addKid(g.state.world, type, x, y, createRng(0), 0, defaultBox(content.balance.body.radius));
}

/** Fills the map with plain kids in a far row, up to `count`. */
function fill(g: Game, count: number) {
  for (let i = 0; i < count; i++) place(g, 'plain', 200 + (i % 10) * 250, 2200 + Math.floor(i / 10) * 250);
}

describe('offline spawns (plan §3)', () => {
  it('11 s of progress plus 1 s away gives one spawn, leaving progress at the overshoot', () => {
    const g = game();
    g.state.spawnProgress = 11;
    const r = g.reconcile(T0 + 1 * S);
    expect(r.spawned).toHaveLength(1);
    expect(r.spawned[0]!.grace).toBe(0);
    expect(g.state.spawnProgress).toBeCloseTo(0);
  });

  it('filling the last free slot leaves progress at the overshoot, so a fusion right after does not spawn at once', () => {
    const g = game();
    fill(g, 11);
    g.state.spawnProgress = 11;
    g.reconcile(T0 + 1 * S);
    expect(g.state.world.kids).toHaveLength(12);
    expect(g.state.spawnProgress).toBeCloseTo(0);
    // A recipe pair fuses (two kids leave, one arrives): room again, but no instant spawn.
    place(g, 'plain', 300, 1200);
    place(g, 'water', 340, 1200);
    g.state.world.kids.splice(0, 2); // keep the count at capacity before the fusion
    const events = g.step([]);
    expect(events.some((x) => x.type === 'fused')).toBe(true);
    expect(events.some((x) => x.type === 'spawned')).toBe(false);
  });

  it('a full map with no time away keeps its progress unchanged', () => {
    const g = game();
    fill(g, 12);
    g.state.spawnProgress = 0;
    g.reconcile(T0);
    expect(g.state.spawnProgress).toBe(0);
    g.state.spawnProgress = 12; // banked
    g.reconcile(T0 + 5 * S);
    expect(g.state.spawnProgress).toBe(12);
  });

  it('stops admitting at capacity partway through an absence, and banks one spawn', () => {
    const g = game();
    fill(g, 9);
    const r = g.reconcile(T0 + 3600 * S);
    expect(r.spawned).toHaveLength(3);
    expect(g.state.world.kids).toHaveLength(12);
    expect(g.state.spawnProgress).toBe(g.interval);
  });

  it('draws offline spawn types from the seeded spawn stream, in order', () => {
    const a = game();
    const b = game();
    const ra = a.reconcile(T0 + 60 * S).spawned.map((k) => k.type);
    const rb = b.reconcile(T0 + 60 * S).spawned.map((k) => k.type);
    expect(ra.length).toBe(5);
    expect(ra).toEqual(rb);
  });
});

describe('offline income (plan §3)', () => {
  it('existing kids earn for the whole absence; newborns from their spawn time', () => {
    const g = game();
    place(g, 'plain', 300, 2200); // tier 1
    place(g, 'hero', 900, 2200); // tier 3
    g.state.spawnProgress = 0;
    const away = 30;
    const r = g.reconcile(T0 + away * S);
    // Spawns at 12 s and 24 s; each earns from then until the return.
    const existing = e.materialsPerSecond * (1 + 4) * away;
    const newborn = r.spawned.reduce((sum, k, i) => sum + g.incomeOf(k.type) * (away - 12 * (i + 1)), 0);
    expect(r.spawned).toHaveLength(2);
    expect(r.materials).toBeCloseTo(existing + newborn);
    expect(g.state.materials).toBeCloseTo(e.startingMaterials + existing + newborn);
  });
});

describe('the accounting boundary (plan §3)', () => {
  it('online steps advance accountedUntil, so that time is never credited again', () => {
    const g = game((c) => (c.balance.spawn.intervalSeconds = 1e9));
    place(g, 'plain', 300, 2200);
    for (let i = 0; i < 10; i++) g.step([]);
    expect(g.state.accountedUntil).toBeCloseTo(T0 + 1 * S);
    const before = g.state.materials;
    const r = g.reconcile(T0 + 1 * S);
    expect(r.seconds).toBeCloseTo(0);
    expect(g.state.materials).toBeCloseTo(before);
  });

  it('duplicate resumes credit nothing twice, even with slightly different timestamps', () => {
    const g = game((c) => (c.balance.spawn.intervalSeconds = 1e9));
    place(g, 'plain', 300, 2200);
    const first = g.reconcile(T0 + 1000);
    const same = g.reconcile(T0 + 1000);
    const later = g.reconcile(T0 + 1001);
    expect(first.seconds).toBeCloseTo(1);
    expect(same.seconds).toBe(0);
    expect(later.seconds).toBeCloseTo(0.001);
    expect(g.state.materials).toBeCloseTo(e.materialsPerSecond * 1.001);
  });

  it('duplicate resumes on a full map neither spawn nor double-bank', () => {
    const g = game();
    fill(g, 11);
    g.state.spawnProgress = 11;
    g.reconcile(T0 + 1 * S);
    const again = g.reconcile(T0 + 1 * S);
    expect(again.spawned).toHaveLength(0);
    expect(g.state.world.kids).toHaveLength(12);
    expect(g.state.spawnProgress).toBeCloseTo(0);
  });

  it('a clock rewind credits nothing and never moves the boundary back', () => {
    const g = game((c) => (c.balance.spawn.intervalSeconds = 1e9));
    place(g, 'plain', 300, 2200);
    g.reconcile(T0 + 1000 * S);
    const materials = g.state.materials;
    const rewound = g.reconcile(T0 + 900 * S);
    expect(rewound.seconds).toBe(0);
    expect(g.state.accountedUntil).toBe(T0 + 1000 * S);
    const restored = g.reconcile(T0 + 1000 * S);
    expect(restored.seconds).toBe(0);
    expect(g.state.materials).toBeCloseTo(materials);
  });

  it('caps an absence at offlineCapHours and reports what was discarded', () => {
    const g = game((c) => (c.balance.spawn.intervalSeconds = 1e9));
    place(g, 'plain', 300, 2200);
    const cap = e.offlineCapHours * 3600;
    const r = g.reconcile(T0 + (cap + 600) * S);
    expect(r.seconds).toBe(cap);
    expect(r.discardedSeconds).toBeCloseTo(600);
    expect(g.state.materials).toBeCloseTo(e.materialsPerSecond * cap);
    expect(g.state.accountedUntil).toBe(T0 + (cap + 600) * S);
  });

  it('suspended time never fuses: a touching recipe pair stays apart offline', () => {
    const g = game((c) => (c.balance.spawn.intervalSeconds = 1e9));
    place(g, 'plain', 300, 1200);
    place(g, 'water', 340, 1200);
    g.reconcile(T0 + 4 * S);
    expect(g.state.world.kids.map((k) => k.type).sort()).toEqual(['plain', 'water']);
    expect(g.state.discoveredRecipes).toEqual([]);
  });
});
