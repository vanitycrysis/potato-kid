import { describe, expect, it } from 'vitest';
import { content } from '../content';
import type { DecorationData, MapData } from '../content/artData';
import { decorationData } from '../content/artData';
import { decorationObstacles, decorationSites } from '../content/artRules';
import type { Content } from '../content/types';
import { Game, type GameEvent } from './game';
import { createRng } from './rng';
import { isFree } from './space';
import { addKid, defaultBox, type Kid } from './world';

const bounds = { minX: 0, minY: 0, maxX: 2000, maxY: 2000 };
/** One bench (Codex's definition) at (1000, 1000), as map v5 would place it. */
const map = { activityDecorations: { sceneryOverrideIds: [], instances: [{ id: 'bench', definition: 'bench', worldGround: [1000, 1000] }] } } as unknown as MapData;
const data = decorationData as DecorationData;
const sites = decorationSites(map, data);
const [left, right] = sites[0]!.slots;

function testContent(over: Partial<Content['balance']['decorations']> = {}, wander: Partial<Content['balance']['wander']> = {}): Content {
  const c = structuredClone(content);
  c.balance.wander = { speed: 0, turnChancePerSecond: 0, idleChancePerSecond: 0, idleSeconds: [1, 1], ambientChance: 0, ...wander };
  c.balance.spawn = { ...c.balance.spawn, tutorialSpawns: 0, startingKids: 0, newbornGraceSeconds: 0, intervalSeconds: 1e9 };
  c.balance.decorations = { ...c.balance.decorations, ...over };
  return c;
}

function game(c = testContent()): Game {
  return new Game(c, { bounds, spawnAt: { x: 1000, y: 1900 }, obstacles: decorationObstacles(map, data), sites }, 1);
}

function place(g: Game, type: string, x: number, y: number): Kid {
  return addKid(g.state.world, type, x, y, createRng(0), 0, defaultBox(40));
}

/** Pick up, then drop with the finger at `p`. */
function dropAt(g: Game, kid: Kid, p: { x: number; y: number }): GameEvent[] {
  g.step([{ type: 'pickUp', kidId: kid.id }], 0);
  return g.step([{ type: 'drop', kidId: kid.id, x: p.x, y: p.y, pointer: p }], 0);
}

function run(g: Game, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 10); i++) g.step([]);
}

describe('decorations kids use (D-090)', () => {
  it('a kid dropped on a bench sits in the slot nearest the finger, a little happy', () => {
    const g = game();
    const kid = place(g, 'plain', 400, 1600);
    const events = dropAt(g, kid, { x: right!.x + 10, y: right!.y - 60 });
    expect(kid.activity).toMatchObject({ kind: 'visit', site: 0, slot: 'right', phase: 'stay' });
    expect([kid.x, kid.y]).toEqual([right!.x, right!.y]);
    expect(kid.happy).toMatchObject({ small: true, left: content.balance.decorations.happySeconds });
    expect(g.happyMultiplier(kid)).toBe(content.balance.decorations.happyMultiplier);
    expect(events.map((e) => e.type)).toEqual(['dropped', 'visited']);
  });

  it('a full bench is just ground: the next kid lands beside it, not in a slot', () => {
    const g = game();
    const [a, b, c] = [place(g, 'plain', 300, 1600), place(g, 'fire', 500, 1600), place(g, 'snow', 700, 1600)];
    dropAt(g, a, { x: left!.x, y: left!.y });
    dropAt(g, b, { x: left!.x, y: left!.y });
    expect(b.activity).toMatchObject({ kind: 'visit', slot: 'right' });
    dropAt(g, c, { x: left!.x, y: left!.y });
    expect(c.activity.kind).not.toBe('visit');
    expect(isFree(g.state.world, c.box, c.x, c.y, c.id)).toBe(true);
  });

  it('kids on a bench never fuse, even recipe partners side by side', () => {
    const g = game();
    const [a, b] = [place(g, 'plain', 300, 1600), place(g, 'water', 500, 1600)];
    dropAt(g, a, { x: left!.x, y: left!.y });
    const events = dropAt(g, b, { x: right!.x, y: right!.y });
    run(g, 1);
    expect(events.some((e) => e.type === 'fused')).toBe(false);
    expect(g.state.world.kids.map((k) => k.type).sort()).toEqual(['plain', 'water']);
  });

  it('picked up, its visit ends at once and the slot is free again', () => {
    const g = game();
    const kid = place(g, 'plain', 300, 1600);
    dropAt(g, kid, { x: left!.x, y: left!.y });
    g.step([{ type: 'pickUp', kidId: kid.id }], 0);
    expect(kid.activity.kind).toBe('walk');
    const other = place(g, 'fire', 600, 1600);
    dropAt(g, other, { x: left!.x, y: left!.y });
    expect(other.activity).toMatchObject({ kind: 'visit', slot: 'left' });
  });

  it('after its stay it leaves along the path to the approach, walking again, with a cooldown', () => {
    const c = testContent({ dwellSeconds: [2, 2] }, { speed: 200 });
    const g = game(c);
    const kid = place(g, 'plain', 300, 1600);
    dropAt(g, kid, { x: left!.x, y: left!.y });
    const phases = new Set<string>();
    for (let i = 0; i < 100 && kid.activity.kind === 'visit'; i++) {
      phases.add(kid.activity.phase);
      g.step([]);
    }
    expect([...phases]).toEqual(['stay', 'leave']);
    expect(kid.activity.kind).toBe('walk');
    // Walking from there in the same step: one step's walk at most.
    expect(Math.hypot(kid.x - left!.approach.x, kid.y - left!.approach.y)).toBeLessThanOrEqual(200 * 0.1 + 1e-6);
    expect(kid.visitCooldown).toBe(content.balance.decorations.cooldownSeconds);
  });

  it('a walker that stops near a free bench may go and sit on it by itself', () => {
    const c = testContent({ visitChance: 1, dwellSeconds: [60, 60] }, { speed: 120, idleChancePerSecond: 50 });
    const g = game(c);
    const kid = place(g, 'plain', left!.approach.x - 150, left!.approach.y + 120);
    let sat = false;
    for (let i = 0; i < 300 && !sat; i++) {
      g.step([]);
      sat = kid.activity.kind === 'visit' && kid.activity.phase === 'stay';
    }
    expect(sat).toBe(true);
    expect([kid.x, kid.y]).toEqual([left!.x, left!.y]);
    expect(kid.happy?.small).toBe(true);
  });

  it('a food happiness is stronger and stays; planting ignores the small one', () => {
    const g = game();
    const kid = place(g, 'plain', 300, 1600);
    kid.happy = { left: 100, favourite: true };
    dropAt(g, kid, { x: left!.x, y: left!.y });
    expect(kid.happy).toEqual({ left: 100, favourite: true });
    const small = place(g, 'fire', 600, 1600);
    dropAt(g, small, { x: right!.x, y: right!.y });
    g.step([{ type: 'pickUp', kidId: small.id }], 0);
    g.step([{ type: 'plant', kidIds: [small.id], plot: 0 }], 0);
    expect(g.state.plots[0]!.seed!.planted[0]).not.toHaveProperty('happy');
  });

  it('a kid sitting stays put: a walker pressed against it is the one that moves', () => {
    const g = game();
    const kid = place(g, 'plain', 300, 1600);
    dropAt(g, kid, { x: left!.x, y: left!.y });
    const pushy = place(g, 'fire', left!.x + 20, left!.y + 30);
    g.step([]);
    expect([kid.x, kid.y]).toEqual([left!.x, left!.y]);
    expect(Math.hypot(pushy.x - (left!.x + 20), pushy.y - (left!.y + 30))).toBeGreaterThan(0);
  });

  it('a return ends a visit the absence outlasted, at its approach; a short one (a reload) keeps the seat', () => {
    const g = game(testContent({ dwellSeconds: [40, 40] }));
    const kid = place(g, 'plain', 300, 1600);
    dropAt(g, kid, { x: left!.x, y: left!.y });
    g.reconcile(g.state.accountedUntil + 10_000);
    expect(kid.activity).toMatchObject({ kind: 'visit', phase: 'stay', left: 30 });
    expect([kid.x, kid.y]).toEqual([left!.x, left!.y]);
    g.reconcile(g.state.accountedUntil + 3600_000);
    expect(kid.activity.kind).toBe('walk');
    expect([kid.x, kid.y]).toEqual([left!.approach.x, left!.approach.y]);
  });

  it('saved and loaded, a kid on a bench is still on it, where it was', () => {
    const g = game();
    const kid = place(g, 'plain', 300, 1600);
    dropAt(g, kid, { x: left!.x, y: left!.y });
    const loaded = new Game(testContent(), { bounds, spawnAt: { x: 1000, y: 1900 }, obstacles: decorationObstacles(map, data), sites }, 1, g.persisted());
    const k = loaded.state.world.kids.find((x) => x.id === kid.id)!;
    expect(k.activity).toMatchObject({ kind: 'visit', slot: 'left', phase: 'stay' });
    expect([k.x, k.y]).toEqual([left!.x, left!.y]);
    // On a map without that decoration, the visit just ends and the kid is put somewhere free.
    const elsewhere = new Game(testContent(), { bounds, spawnAt: { x: 1000, y: 1900 } }, 1, g.persisted());
    expect(elsewhere.state.world.kids.find((x) => x.id === kid.id)!.activity.kind).toBe('walk');
  });

  it('the bench obstacle keeps walkers out, but not its own visitor', () => {
    const g = game();
    const walker = place(g, 'plain', 300, 1600);
    expect(isFree(g.state.world, walker.box, left!.x, left!.y, walker.id)).toBe(false);
  });
});
