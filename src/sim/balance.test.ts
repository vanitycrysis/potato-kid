import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { drag, simulate, type Scenario } from './balance';
import { Game } from './game';
import { createRng } from './rng';
import { addKid, defaultBox } from './world';

const options = { bounds: { minX: 0, minY: 0, maxX: 2160, maxY: 3840 }, spawnAt: { x: 1080, y: 700 } };
const short: Scenario = { name: 'short', sessions: [{ play: 300, away: 600 }, { play: 120, away: 0 }], actionSeconds: 3 };

describe('balance simulator', () => {
  it('is deterministic for a seed', () => {
    expect(simulate(content, options, short, 5)).toEqual(simulate(content, options, short, 5));
  });

  it('plays the real sim: finds recipes, buys upgrades and reports in play time', () => {
    const r = simulate(content, options, short, 3);
    expect(r.end.playSeconds).toBeCloseTo(420, 5);
    expect(r.firstRecipe).not.toBeNull();
    expect(r.end.recipesFound).toBeGreaterThan(3);
    expect(r.end.levels.garden + r.end.levels.capacity).toBeGreaterThan(2);
    expect(r.starvation).toBeGreaterThanOrEqual(0);
    expect(r.starvation).toBeLessThanOrEqual(1);
  });
});

describe('the bot drags like a player (Codex review, PR #45)', () => {
  it('claims contact only with kids its landing spot really touches', () => {
    const c = structuredClone(content);
    c.balance.wander = { speed: 0, turnChancePerSecond: 0, idleChancePerSecond: 0, idleSeconds: [1, 1], ambientChance: 0 };
    c.balance.spawn = { ...c.balance.spawn, startingKids: 0, newbornGraceSeconds: 0, intervalSeconds: 1e9 };
    const g = new Game(c, { ...options, now: 0 }, 1);
    const water = addKid(g.state.world, 'water', 1000, 1500, createRng(0), 0, defaultBox(c.balance.body.radius));
    // A tight ring of kids that make no recipe with Potato: no free spot touches Water.
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 2 * Math.PI;
      addKid(g.state.world, 'aurora', 1000 + Math.cos(a) * 135, 1500 + Math.sin(a) * 175, createRng(i + 1), 0, defaultBox(c.balance.body.radius));
    }
    const mover = addKid(g.state.world, 'plain', 300, 3000, createRng(99), 0, defaultBox(c.balance.body.radius));
    const commands = drag(g, mover.id, water);
    const drop = commands.find((x) => x.type === 'drop');
    expect(drop && 'touching' in drop ? drop.touching : []).not.toContain(water.id);
    expect(g.step(commands).some((e) => e.type === 'fused')).toBe(false);
  });
});
