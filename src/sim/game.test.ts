import { describe, expect, it } from 'vitest';
import { content } from '../content';
import type { Content } from '../content/types';
import { Game, type GameEvent } from './game';
import { createRng } from './rng';
import { addKid, defaultBox } from './world';
import { gaps, kidRect } from './space';

const bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
const garden = { x: 500, y: 200 };

/** Content with frozen wander and no starting kids, so tests place kids exactly. */
function testContent(overrides: Partial<Content['balance']['spawn']> = {}): Content {
  const c = structuredClone(content);
  c.balance.wander = { speed: 0, turnChancePerSecond: 0, idleChancePerSecond: 0, idleSeconds: [1, 1], ambientChance: 0 };
  c.balance.spawn = { ...c.balance.spawn, startingKids: 0, newbornGraceSeconds: 0, ...overrides };
  return c;
}

function place(game: Game, type: string, x: number, y: number) {
  return addKid(game.state.world, type, x, y, createRng(0), 0, defaultBox(content.balance.body.radius));
}

function run(game: Game, seconds: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let t = 0; t < Math.round(seconds * 10); t++) events.push(...game.step([]));
  return events;
}

describe('fusion', () => {
  it('consumes both parents and produces the recipe result (R1)', () => {
    const game = new Game(testContent({ intervalSeconds: 1e9 }), { bounds: bounds, spawnAt: garden }, 1);
    place(game, 'plain', 300, 300);
    place(game, 'water', 340, 300);
    const events = game.step([]);
    expect(game.state.world.kids.map((k) => k.type)).toEqual(['firefighter']);
    const fused = events.find((e) => e.type === 'fused');
    expect(fused).toMatchObject({ type: 'fused', firstDiscovery: true });
  });

  it('fuses only when boxes touch: gap <= touchSlack on one axis (D-043)', () => {
    const { radius: r, touchSlack } = content.balance.body;
    // Bodies exactly touching (gap 0): contact.
    const at = new Game(testContent({ intervalSeconds: 1e9 }), { bounds: bounds, spawnAt: garden }, 1);
    place(at, 'plain', 300, 300);
    place(at, 'water', 300 + 2 * r, 300);
    at.step([]);
    expect(at.state.world.kids.map((k) => k.type)).toEqual(['firefighter']);
    // Gap exactly touchSlack: still contact.
    const slackGap = new Game(testContent({ intervalSeconds: 1e9 }), { bounds: bounds, spawnAt: garden }, 1);
    place(slackGap, 'plain', 300, 300);
    place(slackGap, 'water', 300 + 2 * r + touchSlack, 300);
    slackGap.step([]);
    expect(slackGap.state.world.kids.map((k) => k.type)).toEqual(['firefighter']);
    // Just beyond: no contact, both stay.
    const beyond = new Game(testContent({ intervalSeconds: 1e9 }), { bounds: bounds, spawnAt: garden }, 1);
    place(beyond, 'plain', 300, 300);
    place(beyond, 'water', 300 + 2 * r + touchSlack + 0.5, 300);
    beyond.step([]);
    expect(beyond.state.world.kids.map((k) => k.type).sort()).toEqual(['plain', 'water']);
  });

  it('does nothing for a pair with no recipe', () => {
    const game = new Game(testContent({ intervalSeconds: 1e9 }), { bounds: bounds, spawnAt: garden }, 1);
    place(game, 'fire', 300, 300);
    place(game, 'snow', 320, 300);
    game.step([]);
    expect(game.state.world.kids.map((k) => k.type).sort()).toEqual(['fire', 'snow']);
  });

  it('never lets one kid fuse twice in a step, and breaks ties by distance then id', () => {
    const game = new Game(testContent({ intervalSeconds: 1e9 }), { bounds: bounds, spawnAt: garden }, 1);
    // water touches both plain (R1) and fire (R4); plain is closer, so R1 wins.
    place(game, 'fire', 270, 300);
    place(game, 'water', 330, 300);
    place(game, 'plain', 360, 300);
    const events = game.step([]);
    expect(events.filter((e) => e.type === 'fused')).toHaveLength(1);
    expect(game.state.world.kids.map((k) => k.type).sort()).toEqual(['fire', 'firefighter']);
  });

  it('breaks exact distance ties by the lower kid id', () => {
    const game = new Game(testContent({ intervalSeconds: 1e9 }), { bounds: bounds, spawnAt: garden }, 1);
    const plainA = place(game, 'plain', 300, 300);
    place(game, 'water', 360, 300);
    place(game, 'plain', 420, 300); // same distance to water as plainA
    const events = game.step([]);
    const fused = events.find((e) => e.type === 'fused');
    expect(fused?.type === 'fused' && fused.parents.map((p) => p.id)).toContain(plainA.id);
  });

  it('excludes held kids until they are dropped', () => {
    const game = new Game(testContent({ intervalSeconds: 1e9 }), { bounds: bounds, spawnAt: garden }, 1);
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
    const game = new Game(testContent({ intervalSeconds: 1e9, newbornGraceSeconds: 2 }), { bounds: bounds, spawnAt: garden }, 1);
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
    const game = new Game(testContent({ intervalSeconds: 1e9 }), { bounds: bounds, spawnAt: garden }, 1);
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
    const game = new Game(testContent({ intervalSeconds: 1e9 }), { bounds: bounds, spawnAt: garden }, 1);
    const kid = place(game, 'fire', 200, 200);
    game.step([{ type: 'pickUp', kidId: kid.id }]);
    const events = game.step([{ type: 'cancelDrag', kidId: kid.id, x: 200, y: 200 }]);
    expect(kid.held).toBe(false);
    expect(events.some((e) => e.type === 'dropped')).toBe(false);
  });
});

describe('spawning', () => {
  it('spawns one kid per interval', () => {
    const game = new Game(testContent({ intervalSeconds: 12, capacity: 50 }), { bounds: bounds, spawnAt: garden }, 3);
    const spawned = run(game, 60).filter((e) => e.type === 'spawned');
    expect(spawned).toHaveLength(5);
  });

  it('holds progress at the interval while full, then spawns as soon as a slot frees', () => {
    const game = new Game(testContent({ intervalSeconds: 5, capacity: 2 }), { bounds: bounds, spawnAt: garden }, 3);
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

  it('filling the last slot does not bank a spawn (plan rev. 3 phase rule)', () => {
    const game = new Game(testContent({ intervalSeconds: 12, capacity: 2 }), { bounds: bounds, spawnAt: garden }, 3);
    const a = place(game, 'fire', 100, 900);
    game.state.spawnProgress = 11;
    // One step past the interval fills the map (2/2); progress keeps only the overshoot.
    const events = run(game, 1.05);
    expect(events.filter((e) => e.type === 'spawned')).toHaveLength(1);
    expect(game.state.spawnProgress).toBeLessThan(0.2);
    // Freeing a slot right away must not spawn immediately.
    game.state.world.kids = game.state.world.kids.filter((k) => k.id !== a.id);
    expect(game.step([]).filter((e) => e.type === 'spawned')).toHaveLength(0);
  });

  it('carries partial progress (11 s accumulated + 1 s = one spawn)', () => {
    const game = new Game(testContent({ intervalSeconds: 12, capacity: 50 }), { bounds: bounds, spawnAt: garden }, 3);
    game.state.spawnProgress = 11;
    expect(run(game, 1).filter((e) => e.type === 'spawned')).toHaveLength(1);
  });

  it('only spawns types from the spawn pool', () => {
    const roomy = { minX: 0, minY: 0, maxX: 4000, maxY: 4000 };
    const game = new Game(testContent({ intervalSeconds: 1, capacity: 500 }), { bounds: roomy, spawnAt: garden }, 9);
    const types = new Set(run(game, 200).flatMap((e) => (e.type === 'spawned' ? [e.kid.type] : [])));
    expect([...types].sort()).toEqual(Object.keys(content.balance.spawnWeights).sort());
  });

  it('is deterministic for a seed', () => {
    const real = structuredClone(content);
    const a = new Game(real, { bounds: bounds, spawnAt: garden }, 42);
    const b = new Game(real, { bounds: bounds, spawnAt: garden }, 42);
    run(a, 120);
    run(b, 120);
    expect(a.state).toEqual(b.state);
  });
});

describe('no overlap (D-039, D-043 boxes)', () => {
  function minGap(game: Game): number {
    const ks = game.state.world.kids.filter((k) => !k.held);
    let min = Infinity;
    for (let i = 0; i < ks.length; i++) {
      for (let j = i + 1; j < ks.length; j++) {
        const a = ks[i]!;
        const b = ks[j]!;
        const g = gaps(kidRect(a), kidRect(b));
        min = Math.min(min, Math.max(g.dx, g.dy));
      }
    }
    return min;
  }

  it('never lets grounded kids overlap while a busy map runs', () => {
    const big = { minX: 0, minY: 0, maxX: 2160, maxY: 3840 };
    const c = structuredClone(content);
    c.balance.spawn = { ...c.balance.spawn, capacity: 40, startingKids: 12, intervalSeconds: 2 };
    const game = new Game(c, { bounds: big, spawnAt: { x: 1080, y: 300 } }, 21);
    for (let s = 0; s < 3000; s++) {
      game.step([]);
      expect(minGap(game)).toBeGreaterThanOrEqual(-1e-3);
    }
  });

  it('a kid dropped onto a non-partner slides to a free spot instead of overlapping', () => {
    const game = new Game(testContent({ intervalSeconds: 1e9 }), { bounds: bounds, spawnAt: garden }, 1);
    const fire = place(game, 'fire', 500, 500);
    const snow = place(game, 'snow', 200, 200); // fire + snow is not a recipe
    game.step([{ type: 'pickUp', kidId: snow.id }]);
    game.step([{ type: 'drop', kidId: snow.id, x: 505, y: 500 }]);
    expect(game.state.world.kids).toHaveLength(2);
    expect(minGap(game)).toBeGreaterThanOrEqual(-1e-3);
    // The kid that was already there didn't get shoved.
    expect(fire.x).toBe(500);
    expect(fire.y).toBe(500);
  });

  it('a kid dropped onto its recipe partner fuses', () => {
    const game = new Game(testContent({ intervalSeconds: 1e9 }), { bounds: bounds, spawnAt: garden }, 1);
    place(game, 'water', 500, 500);
    const plain = place(game, 'plain', 200, 200);
    game.step([{ type: 'pickUp', kidId: plain.id }]);
    game.step([{ type: 'drop', kidId: plain.id, x: 505, y: 500 }]);
    expect(game.state.world.kids.map((k) => k.type)).toEqual(['firefighter']);
  });

  it('spawns land on free spots even when the Garden area is crowded', () => {
    const game = new Game(testContent({ intervalSeconds: 1, capacity: 30 }), { bounds: bounds, spawnAt: garden }, 4);
    for (let s = 0; s < 400; s++) game.step([]);
    expect(game.state.world.kids.length).toBeGreaterThan(20);
    expect(minGap(game)).toBeGreaterThanOrEqual(-1e-3);
  });

  it('when there is no room left, spawning waits with the spawn banked', () => {
    const tiny = { minX: 0, minY: 0, maxX: 300, maxY: 300 };
    const game = new Game(testContent({ intervalSeconds: 1, capacity: 50 }), { bounds: tiny, spawnAt: { x: 150, y: 0 } }, 2);
    for (let s = 0; s < 200; s++) game.step([]);
    // Only a handful of 120-unit boxes fit in 300 x 300; the rest is waiting, not overlapping.
    expect(game.state.world.kids.length).toBeLessThan(10);
    expect(game.state.spawnProgress).toBe(1);
    expect(minGap(game)).toBeGreaterThanOrEqual(-1e-3);
  });

  it('a corner-only gap is not contact; an overlapping axis is required', () => {
    const r = content.balance.body.radius;
    const game = new Game(testContent({ intervalSeconds: 1e9 }), { bounds, spawnAt: garden }, 1);
    // Diagonal neighbours 5 units apart on both axes: no axis overlaps, so no contact.
    place(game, 'plain', 300, 300);
    place(game, 'water', 300 + 2 * r + 5, 300 + 2 * r + 5);
    game.step([]);
    expect(game.state.world.kids.map((k) => k.type).sort()).toEqual(['plain', 'water']);
  });

  it('dropping onto a partner lands flush against it and fuses', () => {
    const game = new Game(testContent({ intervalSeconds: 1e9 }), { bounds, spawnAt: garden }, 1);
    place(game, 'water', 500, 500);
    const plain = place(game, 'plain', 200, 200);
    game.step([{ type: 'pickUp', kidId: plain.id }]);
    // The landing spot for a point right on top of the partner is flush against it.
    const spot = game.landingSpot(plain.id, 520, 510)!;
    const g = gaps(kidRect({ ...plain, x: spot.x, y: spot.y }), { minX: 440, minY: 440, maxX: 560, maxY: 560 });
    expect(Math.max(g.dx, g.dy)).toBeCloseTo(0, 6);
    game.step([{ type: 'drop', kidId: plain.id, x: spot.x, y: spot.y }]);
    expect(game.state.world.kids.map((k) => k.type)).toEqual(['firefighter']);
  });
});

describe('scenery obstacles (map v2)', () => {
  const obstacle = { box: { minX: 400, minY: 400, maxX: 600, maxY: 600 }, circle: { x: 500, y: 600, r: 100 } };

  it('kids never spawn or land inside scenery', () => {
    const game = new Game(testContent({ intervalSeconds: 1, capacity: 20 }), { bounds, spawnAt: { x: 500, y: 520 }, obstacles: [obstacle] }, 3);
    for (let s = 0; s < 200; s++) game.step([]);
    expect(game.state.world.kids.length).toBeGreaterThan(5);
    for (const k of game.state.world.kids) {
      const r = kidRect(k);
      const g = gaps(r, obstacle.box);
      expect(Math.max(g.dx, g.dy)).toBeGreaterThanOrEqual(-1e-6);
      const nx = Math.min(r.maxX, Math.max(r.minX, 500));
      const ny = Math.min(r.maxY, Math.max(r.minY, 600));
      expect(Math.hypot(nx - 500, ny - 600)).toBeGreaterThanOrEqual(100 - 1e-6);
    }
  });

  it('wandering kids never walk into scenery', () => {
    const c = structuredClone(content);
    c.balance.spawn = { ...c.balance.spawn, startingKids: 0 };
    const game = new Game(c, { bounds, spawnAt: { x: 200, y: 200 }, obstacles: [obstacle] }, 8);
    for (let i = 0; i < 6; i++) game.debugAddKid('fire', 150 + i * 130, 850);
    for (let s = 0; s < 2000; s++) {
      game.step([]);
      for (const k of game.state.world.kids) {
        const g = gaps(kidRect(k), obstacle.box);
        expect(Math.max(g.dx, g.dy)).toBeGreaterThanOrEqual(-1e-6);
      }
    }
  });
});

describe('appearance and rests (ART-V2)', () => {
  const looks = {
    bodies: [
      { id: 'round', weight: 1, box: { left: -78, top: -149, right: 79, bottom: 8 } },
      { id: 'tall', weight: 1, box: { left: -73, top: -152, right: 73, bottom: 8 } },
    ],
    faces: [
      { id: 'classic', weight: 1 },
      { id: 'wide', weight: 1 },
    ],
    sizes: [
      { scale: 0.9, weight: 1 },
      { scale: 1.1, weight: 1 },
    ],
  };
  const world = { minX: 0, minY: 0, maxX: 2160, maxY: 3840 };

  it('rolls looks deterministically, scales boxes by size, and keeps gameplay rolls unchanged', () => {
    const c = structuredClone(content);
    const a = new Game(c, { bounds: world, spawnAt: { x: 1080, y: 1120 }, looks }, 5);
    const b = new Game(c, { bounds: world, spawnAt: { x: 1080, y: 1120 } }, 5);
    const spawnedA: string[] = [];
    const spawnedB: string[] = [];
    for (let s = 0; s < 600; s++) {
      for (const e of a.step([])) if (e.type === 'spawned') spawnedA.push(e.kid.type);
      for (const e of b.step([])) if (e.type === 'spawned') spawnedB.push(e.kid.type);
    }
    const seen = new Set(a.state.world.kids.map((k) => `${k.look.body}/${k.look.face}/${k.look.scale}`));
    expect(seen.size).toBeGreaterThan(2);
    for (const k of a.state.world.kids) {
      const base = looks.bodies.find((x) => x.id === k.look.body)!.box;
      expect(k.box.left).toBeCloseTo(base.left * k.look.scale, 9);
      expect(k.box.top).toBeCloseTo(base.top * k.look.scale, 9);
    }
    // Same seed, same spawn sequence: spawn types and cosmetics each have their own random
    // stream. (Where kids end up, and so which fusions happen, depends on box sizes.)
    expect(spawnedA.length).toBeGreaterThanOrEqual(4);
    expect(spawnedA).toEqual(spawnedB);
  });

  it('rest activities come from the ambient table and end back in walking', () => {
    const c = structuredClone(content);
    c.balance.wander = { ...c.balance.wander, idleChancePerSecond: 5 };
    const ambient = {
      weights: { look: 1, wave: 1, sit: 1, sleep: 1 },
      chance: 1,
      stationaryDelay: [0.5, 0.8] as [number, number],
      lookSeconds: 1,
      waveSeconds: 0.5,
      sitSeconds: (h: number) => h + 0.75,
      sleepSeconds: (h: number) => h + 0.75,
      seatedHold: [1, 2] as [number, number],
      sleepHold: [2, 3] as [number, number],
    };
    const game = new Game(c, { bounds: world, spawnAt: { x: 1080, y: 1120 }, ambient }, 2);
    const kinds = new Set<string>();
    for (let s = 0; s < 400; s++) {
      game.step([]);
      for (const k of game.state.world.kids) kinds.add(k.activity.kind);
    }
    expect([...kinds].sort()).toEqual(['look', 'pause', 'sit', 'sleep', 'walk', 'wave']);
  });

  it('waits the stationary delay before an ambient pose begins (rig scheduler)', () => {
    const c = structuredClone(content);
    c.balance.wander = { ...c.balance.wander, idleChancePerSecond: 5 };
    const ambient = {
      weights: { look: 1, wave: 1, sit: 1, sleep: 1 },
      chance: 1,
      stationaryDelay: [2, 3] as [number, number],
      lookSeconds: 1,
      waveSeconds: 0.5,
      sitSeconds: (h: number) => h + 0.75,
      sleepSeconds: (h: number) => h + 0.75,
      seatedHold: [1, 2] as [number, number],
      sleepHold: [2, 3] as [number, number],
    };
    const game = new Game(c, { bounds: world, spawnAt: { x: 1080, y: 1120 }, ambient }, 4);
    const stillFor = new Map<number, number>();
    let ambients = 0;
    for (let s = 0; s < 600; s++) {
      game.step([]);
      for (const k of game.state.world.kids) {
        const kind = k.activity.kind;
        if (kind === 'walk') stillFor.delete(k.id);
        else if (kind === 'pause') stillFor.set(k.id, (stillFor.get(k.id) ?? 0) + 0.1);
        else if (stillFor.has(k.id)) {
          // The ambient started: it was preceded by at least the minimum stationary wait.
          expect(stillFor.get(k.id)!).toBeGreaterThanOrEqual(2 - 1e-6);
          stillFor.delete(k.id);
          ambients++;
        }
      }
    }
    expect(ambients).toBeGreaterThan(0);
  });
});

describe('render-time separation (Codex review, PR #14)', () => {
  it('a held preview is free against both the sim and the drawn (interpolated) neighbours', () => {
    const game = new Game(testContent({ intervalSeconds: 1e9 }), { bounds, spawnAt: garden }, 1);
    const fire = place(game, 'fire', 500, 500);
    const held = place(game, 'snow', 200, 800);
    game.step([{ type: 'pickUp', kidId: held.id }]);
    // The fire kid is drawn 20 units left of where the sim has it (mid-interpolation).
    const drawn = new Map([[fire.id, { x: 480, y: 500 }]]);
    const spot = game.landingSpot(held.id, 380, 500, drawn)!;
    const box = kidRect({ ...held, x: spot.x, y: spot.y });
    for (const fx of [500, 480]) {
      const g = gaps(box, { minX: fx - 60, minY: 440, maxX: fx + 60, maxY: 560 });
      expect(Math.max(g.dx, g.dy)).toBeGreaterThanOrEqual(-1e-6);
    }
  });
});


describe('Codex review, PR #14 round 2', () => {
  it('a drop against a partner that is walking away still fuses (contact before wander)', () => {
    const c = structuredClone(content);
    c.balance.spawn = { ...c.balance.spawn, startingKids: 0, intervalSeconds: 1e9, newbornGraceSeconds: 0 };
    c.balance.wander = { speed: 40, turnChancePerSecond: 0, idleChancePerSecond: 0, idleSeconds: [1, 1], ambientChance: 0 };
    const game = new Game(c, { bounds, spawnAt: garden }, 1);
    const water = place(game, 'water', 500, 500);
    water.heading = 0; // walking east, away from where plain lands, 4 units per step
    const plain = place(game, 'plain', 200, 800);
    plain.heading = Math.PI; // and plain would walk west
    game.step([{ type: 'pickUp', kidId: plain.id }]);
    const gap = 6; // inside touchSlack (8) at release; outside it after one more step apart
    game.step([{ type: 'drop', kidId: plain.id, x: water.x - 120 - gap, y: water.y }]);
    expect(game.state.world.kids.map((k) => k.type)).toEqual(['firefighter']);
  });
});

describe('Codex review, PR #14 round 4', () => {
  it('a drop the player saw touching its partner fuses even if the sim gap exceeds the slack', () => {
    const game = new Game(testContent({ intervalSeconds: 1e9 }), { bounds, spawnAt: garden }, 1);
    const water = place(game, 'water', 500, 500);
    const plain = place(game, 'plain', 200, 800);
    game.step([{ type: 'pickUp', kidId: plain.id }]);
    // Water drawn at 480 (sim 500): the drop flush with the drawn box leaves a 20-unit sim gap.
    const spot = game.landingSpot(plain.id, 380, 500, new Map([[water.id, { x: 480, y: 500 }]]))!;
    expect(spot.x).toBeCloseTo(360, 6);
    game.step([{ type: 'drop', kidId: plain.id, x: spot.x, y: spot.y, touching: [water.id] }]);
    expect(game.state.world.kids.map((k) => k.type)).toEqual(['firefighter']);
  });

  it('without a seen touch, the same wide gap does not fuse', () => {
    const game = new Game(testContent({ intervalSeconds: 1e9 }), { bounds, spawnAt: garden }, 1);
    place(game, 'water', 500, 500);
    const plain = place(game, 'plain', 200, 800);
    game.step([{ type: 'pickUp', kidId: plain.id }]);
    game.step([{ type: 'drop', kidId: plain.id, x: 360, y: 500 }]);
    expect(game.state.world.kids.map((k) => k.type).sort()).toEqual(['plain', 'water']);
  });
});
