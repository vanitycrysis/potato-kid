import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { createBot, drag, simulate, type Scenario } from './balance';
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
  /**
   * Water and Potato, each ringed by kids that make no recipe with either, so neither can
   * be dropped touching the other.
   */
  function ringed(capacity?: number) {
    const c = structuredClone(content);
    c.balance.wander = { speed: 0, turnChancePerSecond: 0, idleChancePerSecond: 0, idleSeconds: [1, 1], ambientChance: 0 };
    c.balance.spawn = { ...c.balance.spawn, startingKids: 0, newbornGraceSeconds: 0, intervalSeconds: 1e9, ...(capacity ? { capacity } : {}) };
    const g = new Game(c, { ...options, now: 0 }, 1);
    const box = defaultBox(c.balance.body.radius);
    const ring = (type: string, x: number, y: number) => {
      const centre = addKid(g.state.world, type, x, y, createRng(x), 0, box);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * 2 * Math.PI;
        addKid(g.state.world, 'aurora', x + Math.cos(a) * 135, y + Math.sin(a) * 175, createRng(x + i + 1), 0, box);
      }
      return centre;
    };
    const water = ring('water', 1000, 1200);
    const mover = ring('plain', 1000, 2600);
    g.state.materials = 0; // nothing to buy
    return { c, g, water, mover };
  }

  it('an unreachable pair is not marked tried, and the bot does something else', () => {
    const { c, g, water } = ringed();
    const bot = createBot(g, c);
    // Leave Potato + Water as the only untried pairing, so the bot must attempt it.
    for (const p of ['aurora|plain', 'aurora|aurora', 'aurora|water']) bot.tried.add(p);
    const act = bot.decide();
    // Whatever it does, it isn't a Potato-to-Water drag, and Potato + Water stays untried.
    const drop = act?.find((x) => x.type === 'drop');
    expect(drop && drop.type === 'drop' ? drop.touching : []).not.toContain(water.id);
    expect(bot.tried.has('plain|water')).toBe(false);
  });

  it('on a full map, an unreachable known recipe falls through to Send home', () => {
    const { c, g } = ringed(26);
    g.state.discoveredRecipes = ['plain|water'];
    const bot = createBot(g, c);
    // Every other pairing on the map has been tried already.
    for (const p of ['aurora|plain', 'aurora|aurora', 'aurora|water']) bot.tried.add(p);
    expect(bot.decide()).toEqual([{ type: 'sendHome', kidId: expect.any(Number) }]);
  });

  it('claims contact only with kids its landing spot really touches', () => {
    const { g, water, mover } = ringed();
    const commands = drag(g, mover.id, water);
    const drop = commands.find((x) => x.type === 'drop');
    expect(drop && 'touching' in drop ? drop.touching : []).not.toContain(water.id);
    expect(g.step(commands).some((e) => e.type === 'fused')).toBe(false);
  });
});
