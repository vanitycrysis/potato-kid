import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { Game, type GameEvent } from '../sim/game';
import { createRng } from '../sim/rng';
import { addKid, defaultBox } from '../sim/world';
import { feedbackFor, refusalText } from './feedback';

const kid = (type: string) => ({ type }) as never;

describe('feedback cards (GUI_MVP §9)', () => {
  it('a first discovery absorbs its own discovery and milestone awards', () => {
    const events = [
      { type: 'fused', parents: [kid('plain'), kid('water')], child: kid('firefighter'), firstDiscovery: true },
      { type: 'earned', potatokens: 1, reason: 'discovery' },
      { type: 'earned', potatokens: 2, reason: 'milestone' },
    ] as GameEvent[];
    expect(feedbackFor(events, new Set(['plain', 'water']), 5)).toEqual([
      { kind: 'discovery', childType: 'firefighter', newKid: true, potatokens: 1, milestone: 2 },
    ]);
  });

  it('two first discoveries in one step get one card each, never each other’s awards', () => {
    const events = [
      { type: 'fused', parents: [kid('a'), kid('b')], child: kid('chef'), firstDiscovery: true },
      { type: 'earned', potatokens: 1, reason: 'discovery' },
      { type: 'fused', parents: [kid('a'), kid('b')], child: kid('steam'), firstDiscovery: true },
      { type: 'earned', potatokens: 1, reason: 'discovery' },
      { type: 'earned', potatokens: 3, reason: 'milestone' },
    ] as GameEvent[];
    expect(feedbackFor(events, new Set(), 10)).toEqual([
      { kind: 'discovery', childType: 'chef', newKid: true, potatokens: 1, milestone: 0 },
      { kind: 'discovery', childType: 'steam', newKid: true, potatokens: 1, milestone: 3 },
    ]);
  });

  it('a repeat recipe gets no card; a known child says "new recipe"', () => {
    const repeat = [{ type: 'fused', parents: [kid('a'), kid('b')], child: kid('chef'), firstDiscovery: false }] as GameEvent[];
    expect(feedbackFor(repeat, new Set(['chef']), 5)).toEqual([]);
    const newRecipe = [{ type: 'fused', parents: [kid('a'), kid('b')], child: kid('chef'), firstDiscovery: true }] as GameEvent[];
    expect(feedbackFor(newRecipe, new Set(['chef']), 5)).toMatchObject([{ kind: 'discovery', newKid: false }]);
  });

  it('a new Garden type gets a card with no invented reward; milestone-only awards collapse', () => {
    const known = new Set(['plain']);
    const events = [
      { type: 'spawned', kid: kid('snow'), source: 'garden' },
      { type: 'spawned', kid: kid('plain'), source: 'garden' },
      { type: 'earned', potatokens: 2, reason: 'milestone' },
      { type: 'earned', potatokens: 3, reason: 'milestone' },
    ] as GameEvent[];
    expect(feedbackFor(events, known, 10)).toEqual([
      { kind: 'newKid', childType: 'snow', milestone: 0 },
      { kind: 'milestone', potatokens: 5, kids: 10 },
    ]);
    expect(known.has('snow')).toBe(true);
  });

  it('instant arrivals coalesce; refusals pass through', () => {
    const known = new Set(['plain']);
    const events = [
      { type: 'spawned', kid: kid('plain'), source: 'instant' },
      { type: 'spawned', kid: kid('plain'), source: 'instant' },
      { type: 'rejected', command: 'instantSpawn', reason: 'full' },
    ] as GameEvent[];
    expect(feedbackFor(events, known, 1)).toEqual([
      { kind: 'arrival', count: 2 },
      { kind: 'refusal', command: 'instantSpawn', reason: 'full' },
    ]);
    expect(refusalText('cost', 'potatokens')).toBe('Not enough Potatokens.');
    expect(refusalText('cost')).toBe('Not enough currency.');
  });

  it('matches what the real sim emits for a first fusion that reaches a milestone', () => {
    const c = structuredClone(content);
    c.balance.spawn = { ...c.balance.spawn, startingKids: 0, newbornGraceSeconds: 0, intervalSeconds: 1e9 };
    c.balance.wander = { speed: 0, turnChancePerSecond: 0, idleChancePerSecond: 0, idleSeconds: [1, 1], ambientChance: 0 };
    c.balance.economy.dexMilestones = [{ kids: 3, potatokens: 7 }];
    const g = new Game(c, { bounds: { minX: 0, minY: 0, maxX: 2000, maxY: 2000 }, spawnAt: { x: 1000, y: 300 } }, 1);
    g.state.discoveredKids = ['plain', 'water'];
    addKid(g.state.world, 'plain', 300, 1500, createRng(0), 0, defaultBox(60));
    addKid(g.state.world, 'water', 340, 1500, createRng(0), 0, defaultBox(60));
    const items = feedbackFor(g.step([]), new Set(['plain', 'water']), g.state.discoveredKids.length);
    expect(items).toEqual([
      { kind: 'discovery', childType: 'firefighter', newKid: true, potatokens: c.balance.economy.discoveryPotatokens, milestone: 7 },
    ]);
  });
});
