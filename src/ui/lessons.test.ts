import { describe, expect, it } from 'vitest';
import { content } from '../content';
import type { Content } from '../content/types';
import { Game, type GameEvent } from '../sim/game';
import { createRng } from '../sim/rng';
import { addKid, defaultBox, type Kid } from '../sim/world';
import { adoptLegacy, enqueue, freshLessons, LESSON_IDS, noteEvents, relevantNow, usedBy } from './lessons';

const bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };

/** No starting kids, no starting Materials or Potatokens: each test sets what it needs. */
function testGame(): Game {
  const c: Content = structuredClone(content);
  c.balance.spawn = { ...c.balance.spawn, tutorialSpawns: 0, startingKids: 0, intervalSeconds: 1e9 };
  const game = new Game(c, { bounds, spawnAt: { x: 500, y: 200 } }, 1);
  game.state.materials = 0;
  game.state.potatokens = 0;
  return game;
}

function place(game: Game, type: string, n = 1): void {
  for (let i = 0; i < n; i++) addKid(game.state.world, type, 100 + i * 80, 500, createRng(i), 0, defaultBox(content.balance.body.radius));
}

const b = content.balance;

describe('lesson predicates (GUI_MVP §27.2)', () => {
  it('a new game with nothing: no lesson is relevant', () => {
    expect([...relevantNow(testGame(), b)]).toEqual([]);
  });

  it('planting: three kids on the map and an empty plot; a full growing plot is not one', () => {
    const game = testGame();
    place(game, 'plain', 2);
    expect(relevantNow(game, b).has('planting')).toBe(false);
    place(game, 'plain');
    expect(relevantNow(game, b).has('planting')).toBe(true);
    game.state.plots[0]!.seed = { planted: [], sprout: { type: 'plain' }, grown: 0 };
    expect(relevantNow(game, b).has('planting')).toBe(false);
  });

  it('building lessons use the authoritative cost, not the base: Garden at 58, Capacity at 73', () => {
    const game = testGame();
    game.state.materials = 57;
    expect(relevantNow(game, b).has('garden')).toBe(false);
    game.state.materials = 58;
    expect(relevantNow(game, b).has('garden')).toBe(true);
    expect(relevantNow(game, b).has('capacity')).toBe(false);
    game.state.materials = 73;
    expect(relevantNow(game, b).has('capacity')).toBe(true);
  });

  it('naming needs a live kid as well as the price; potatokens needs one Potatoken', () => {
    const game = testGame();
    game.state.materials = b.naming.price;
    expect(relevantNow(game, b).has('naming')).toBe(false);
    place(game, 'plain');
    expect(relevantNow(game, b).has('naming')).toBe(true);
    game.state.potatokens = b.economy.instantSpawnPotatokens;
    expect(relevantNow(game, b).has('potatokens')).toBe(true);
  });

  it('fields before the first field, field-space after it', () => {
    const game = testGame();
    game.state.materials = 1e9;
    expect(relevantNow(game, b).has('fields')).toBe(true);
    expect(relevantNow(game, b).has('field-space')).toBe(false);
    game.step([{ type: 'unlockField' }]);
    expect(relevantNow(game, b).has('fields')).toBe(false);
    expect(relevantNow(game, b).has('field-space')).toBe(true);
  });

  it('feeding: a bite some live kid does not hate', () => {
    const game = testGame();
    place(game, 'plain');
    const hated = game.likes('plain')!.hatedFood;
    game.state.pantry = { [hated]: 3 };
    expect(relevantNow(game, b).has('feeding')).toBe(false);
    game.state.pantry = { [game.likes('plain')!.favouriteFood]: 1 };
    expect(relevantNow(game, b).has('feeding')).toBe(true);
  });

  it('returns: only once the Compendium is built, for a discovered ordinary kind it can pay for', () => {
    const game = testGame();
    game.state.materials = 1e9;
    game.state.discoveredKids = ['plain'];
    expect(relevantNow(game, b).has('compendium')).toBe(true);
    expect(relevantNow(game, b).has('returns')).toBe(false);
    game.state.buildings.compendium = 1;
    expect(relevantNow(game, b).has('compendium')).toBe(false);
    expect(relevantNow(game, b).has('returns')).toBe(true);
    // A rare is never a return.
    game.state.materials = 0;
    game.state.potatokens = 99;
    game.state.discoveredKids = [content.kids.find((k) => k.rare)!.id];
    expect(relevantNow(game, b).has('returns')).toBe(false);
  });
});

describe('lesson queue (GUI_MVP §27.3)', () => {
  it('nothing queues before the first fusion discovery; then everything relevant, in table order', () => {
    const l = freshLessons();
    const relevant = new Set(['naming', 'garden', 'planting'] as const);
    expect(enqueue(l, relevant)).toEqual([]);
    expect(l.pending).toEqual([]);
    const fused = { type: 'fused', firstDiscovery: true } as GameEvent;
    expect(noteEvents(l, [fused])).toBe(true);
    expect(enqueue(l, relevant)).toEqual(['planting', 'garden', 'naming']);
    // Latched: spending later loses nothing, and nothing is queued twice.
    expect(enqueue(l, new Set())).toEqual([]);
    expect(enqueue(l, relevant)).toEqual([]);
    expect(l.pending).toEqual(['planting', 'garden', 'naming']);
  });

  it('later relevance joins the back of the queue (first-eligible order, not table order)', () => {
    const l = { ...freshLessons(), firstFusion: true };
    enqueue(l, new Set(['naming']));
    enqueue(l, new Set(['naming', 'planting']));
    expect(l.pending).toEqual(['naming', 'planting']);
  });

  it('a Garden discovery or a fusion of a known recipe never opens the gate', () => {
    const l = freshLessons();
    expect(noteEvents(l, [{ type: 'fused', firstDiscovery: false } as GameEvent, { type: 'spawned', source: 'garden' } as GameEvent])).toBe(false);
    expect(l.firstFusion).toBe(false);
  });

  it('a mechanic used is seen, before the gate too, and leaves the queue unshown', () => {
    const l = freshLessons();
    noteEvents(l, [{ type: 'upgraded', building: 'garden', level: 2 }]);
    expect(l.seen).toEqual(['garden']);
    l.firstFusion = true;
    enqueue(l, new Set(['garden', 'naming']));
    expect(l.pending).toEqual(['naming']);
    noteEvents(l, [{ type: 'named', kid: { id: 1, type: 'plain' }, name: 'Spud' }]);
    expect(l.pending).toEqual([]);
    expect(l.seen).toEqual(['garden', 'naming']);
  });

  it('clearing a name, a refusal or a Garden arrival is no evidence', () => {
    expect(usedBy({ type: 'named', kid: { id: 1, type: 'plain' }, name: null })).toBe(null);
    expect(usedBy({ type: 'rejected', command: 'upgrade', reason: 'cost' })).toBe(null);
    expect(usedBy({ type: 'spawned', kid: {} as Kid, source: 'garden' })).toBe(null);
    expect(usedBy({ type: 'spawned', kid: {} as Kid, source: 'instant' })).toBe('potatokens');
    expect(usedBy({ type: 'spawned', kid: {} as Kid, source: 'compendium' })).toBe('returns');
    expect(usedBy({ type: 'fieldUnlocked', fields: 1 })).toBe('fields');
    expect(usedBy({ type: 'fieldUnlocked', fields: 2 })).toBe('field-space');
  });

  it('every lesson has some evidence that marks it seen', () => {
    const events: GameEvent[] = [
      { type: 'growing', plot: 0 },
      { type: 'spawned', kid: {} as Kid, source: 'instant' },
      { type: 'upgraded', building: 'garden', level: 2 },
      { type: 'upgraded', building: 'capacity', level: 2 },
      { type: 'named', kid: { id: 1, type: 'plain' }, name: 'A' },
      { type: 'upgraded', building: 'bias', level: 1 },
      { type: 'fieldUnlocked', fields: 1 },
      { type: 'fed', kid: { id: 1, type: 'plain' }, food: 'x', favourite: false },
      { type: 'plotUnlocked', plots: 2 },
      { type: 'fieldUnlocked', fields: 2 },
      { type: 'upgraded', building: 'compendium', level: 1 },
      { type: 'spawned', kid: {} as Kid, source: 'compendium' },
    ];
    expect(events.map(usedBy)).toEqual([...LESSON_IDS]);
  });
});

describe('a save from before lessons (GUI_MVP §27.3 migration)', () => {
  it('a finished tutorial is a finished introduction; what is relevant or used is seen, the rest waits', () => {
    const game = testGame();
    place(game, 'plain', 3);
    game.state.materials = 60;
    game.state.buildings.bias = 1;
    game.state.discoveredRecipes = ['plain+water'];
    const l = adoptLegacy(game, b, 'completed');
    expect(l.intro).toBe('completed');
    expect(l.firstFusion).toBe(true);
    expect(l.seen).toEqual(['planting', 'garden', 'naming', 'bias']);
    expect(l.pending).toEqual([]);
  });

  it('skipped stays skipped; one in progress, or none at all, starts the short introduction at page 1', () => {
    const game = testGame();
    expect(adoptLegacy(game, b, 'skipped').intro).toBe('skipped');
    for (const v1 of ['inProgress', 'notStarted', null] as const) expect(adoptLegacy(game, b, v1)).toMatchObject({ intro: 'notStarted', introPage: 1 });
  });

  it('no recipe found: the gate stays closed, whatever the introduction or resources', () => {
    const game = testGame();
    game.state.materials = 1e9;
    game.state.discoveredKids = ['plain', 'water', 'firefighter'];
    expect(adoptLegacy(game, b, 'completed').firstFusion).toBe(false);
  });

  it("feeding counts as used from a farmer's happiness or a kid planted happy (Codex review round 2, #120)", () => {
    const farmer = testGame();
    farmer.state.fields = [{ food: null, workers: [{ id: 1, type: 'plain', look: { body: 'round', face: 'classic', scale: 1 }, happiness: { left: 100, favourite: false } }], progress: 0 }];
    expect(adoptLegacy(farmer, b, 'completed').seen).toContain('feeding');
    const planted = testGame();
    planted.state.plots[0]!.seed = { planted: [{ id: 2, type: 'plain', look: { body: 'round', face: 'classic', scale: 1 }, happy: true }], sprout: null, grown: 0 };
    expect(adoptLegacy(planted, b, 'completed').seen).toContain('feeding');
  });

  it('an old save is not marked all seen: an unaffordable, unused lesson stays unseen', () => {
    const game = testGame();
    game.state.discoveredRecipes = ['plain+water'];
    expect(adoptLegacy(game, b, 'completed').seen).toEqual([]);
  });
});
