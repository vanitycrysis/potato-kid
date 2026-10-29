import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { Game, type GameEvent } from '../sim/game';
import { createRng } from '../sim/rng';
import { addKid, defaultBox } from '../sim/world';
import { feedbackFor, refusalText } from './feedback';

const kid = (type: string, id = 0) => ({ id, type, look: { body: 'round', face: 'classic', scale: 1 } }) as never;
/** The popup item (D-087) for a new kind or a plot's kid, its look the default. */
const meet = (source: 'garden' | 'plot' | 'fusion', type: string, isNew: boolean, potatokens = 0, kidId = 0) => ({ kind: 'meet', source, type, kidId, look: { body: 'round', face: 'classic', scale: 1 }, isNew, potatokens });

describe('feedback cards (GUI_MVP §9)', () => {
  it('a new kind from a fusion is a popup that carries its own discovery and milestone awards (D-087)', () => {
    const events = [
      { type: 'fused', parents: [kid('plain'), kid('water')], child: kid('firefighter'), firstDiscovery: true },
      { type: 'earned', potatokens: 1, reason: 'discovery' },
      { type: 'earned', potatokens: 2, reason: 'milestone' },
    ] as GameEvent[];
    expect(feedbackFor(events, new Set(['plain', 'water']), 5)).toEqual([meet('fusion', 'firefighter', true, 3)]);
  });

  it('two new kinds in one step get one popup each, never each other’s awards', () => {
    const events = [
      { type: 'fused', parents: [kid('a'), kid('b')], child: kid('chef'), firstDiscovery: true },
      { type: 'earned', potatokens: 1, reason: 'discovery' },
      { type: 'fused', parents: [kid('a'), kid('b')], child: kid('steam'), firstDiscovery: true },
      { type: 'earned', potatokens: 1, reason: 'discovery' },
      { type: 'earned', potatokens: 3, reason: 'milestone' },
    ] as GameEvent[];
    expect(feedbackFor(events, new Set(), 10)).toEqual([meet('fusion', 'chef', true, 1), meet('fusion', 'steam', true, 4)]);
  });

  it('a repeat recipe gets no card; a known child says "new recipe"', () => {
    const repeat = [{ type: 'fused', parents: [kid('a'), kid('b')], child: kid('chef'), firstDiscovery: false }] as GameEvent[];
    expect(feedbackFor(repeat, new Set(['chef']), 5)).toEqual([]);
    const newRecipe = [{ type: 'fused', parents: [kid('a'), kid('b')], child: kid('chef'), firstDiscovery: true }] as GameEvent[];
    expect(feedbackFor(newRecipe, new Set(['chef']), 5)).toMatchObject([{ kind: 'discovery', newKid: false }]);
  });

  it('a new Garden kind is a popup with no invented reward; milestone-only awards collapse', () => {
    const known = new Set(['plain']);
    const events = [
      { type: 'spawned', kid: kid('snow'), source: 'garden' },
      { type: 'spawned', kid: kid('plain'), source: 'garden' },
      { type: 'earned', potatokens: 2, reason: 'milestone' },
      { type: 'earned', potatokens: 3, reason: 'milestone' },
    ] as GameEvent[];
    expect(feedbackFor(events, known, 10)).toEqual([meet('garden', 'snow', true), { kind: 'milestone', potatokens: 5, kids: 10 }]);
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
    expect(refusalText('cost', 'instantSpawn', 'potatokens')).toBe('Not enough Potatokens.');
    expect(refusalText('cost', 'upgrade')).toBe('Not enough currency.');
  });

  it('field results no page showed get cards; kids back from one field in one step make one (Codex review, #90)', () => {
    const events = [
      { type: 'fieldUnlocked', fields: 2 },
      { type: 'fieldFood', field: 1, food: 'apple' },
      { type: 'unfarmed', kid: { id: 3, type: 'plain' }, field: 1, count: 1 },
      { type: 'unfarmed', kid: { id: 4, type: 'fire' }, field: 1, count: 0 },
      { type: 'unfarmed', kid: { id: 5, type: 'fire', name: 'Ash' }, field: 0, count: 0 },
    ] as GameEvent[];
    expect(feedbackFor(events, new Set(['plain', 'fire']), 2)).toEqual([
      { kind: 'fieldUnlocked', field: 1 },
      { kind: 'fieldFood', field: 1, food: 'apple' },
      { kind: 'unfarmed', kidType: 'plain', name: undefined, field: 1, count: 2 },
      { kind: 'unfarmed', kidType: 'fire', name: 'Ash', field: 0, count: 1 },
    ]);
  });

  it('a kid that starts farming with no sheet to say so gets a card (a drag, GUI_MVP §22.4)', () => {
    const events = [{ type: 'farming', kid: { id: 7, type: 'plain', name: 'Spud' }, field: 1, count: 2 }] as GameEvent[];
    expect(feedbackFor(events, new Set(['plain']), 1)).toEqual([{ kind: 'farming', kidType: 'plain', kidId: 7, name: 'Spud', field: 1 }]);
  });

  it('a locked refusal names the right building (Codex review, PR #33)', () => {
    expect(refusalText('locked', 'setBias')).toBe('Build Spawn bias first.');
    expect(refusalText('locked', 'respawn')).toBe('Build the Compendium first.');
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
    expect(items).toEqual([{ ...meet('fusion', 'firefighter', true, c.balance.economy.discoveryPotatokens + 7), kidId: expect.any(Number), look: expect.any(Object) }]);
  });
});

describe('planting cards (GUI_MVP §15.5, §15.6)', () => {
  const k = (id: number, type: string) => kid(type, id);

  it('kids added to a plot in one step make one card, with the plot and its count', () => {
    const events: GameEvent[] = [
      { type: 'planted', kid: k(1, 'plain'), plot: 1, count: 1 },
      { type: 'planted', kid: k(2, 'fire'), plot: 1, count: 2 },
      { type: 'planted', kid: k(3, 'snow'), plot: 1, count: 3 },
    ];
    expect(feedbackFor(events, new Set(), 0)).toEqual([{ kind: 'planted', kidType: 'plain', kidId: 3, plot: 1, count: 3, added: 3 }]);
  });

  it('a plot starting to grow gets its card', () => {
    expect(feedbackFor([{ type: 'growing', plot: 2 }], new Set(), 0)).toEqual([{ kind: 'growing', plot: 2 }]);
  });

  it('every kid a plot brings up is a popup, new or not (D-088); a new kind says so', () => {
    const known = new Set(['fire']);
    expect(feedbackFor([{ type: 'spawned', kid: k(9, 'fire'), source: 'sprout', plot: 0 }], known, 1)).toEqual([meet('plot', 'fire', false, 0, 9)]);
    expect(feedbackFor([{ type: 'spawned', kid: k(10, 'hero'), source: 'sprout', plot: 0 }], known, 2)).toEqual([meet('plot', 'hero', true, 0, 10)]);
    // Garden spawns of known types stay silent, as before.
    expect(feedbackFor([{ type: 'spawned', kid: k(11, 'fire'), source: 'garden' }], known, 2)).toEqual([]);
  });
});
