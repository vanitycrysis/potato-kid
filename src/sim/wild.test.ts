import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { kidRig, kidWild } from '../content/artData';
import { lookTable, rigCoverage, wildBox } from '../content/artRules';
import { validateContent } from '../content/validate';
import { Game } from './game';

// The ten rares and twenty specials (D-072, D-073; Codex's kid_wild_v1): content, and each
// wild kid's own collision box.
const looks = lookTable(kidRig!, kidWild);
const bounds = { minX: 0, minY: 0, maxX: 4000, maxY: 4000 };
const options = { bounds, spawnAt: { x: 2000, y: 2000 }, now: 0, looks };

describe('the shipped wild kids (D-063, D-066, D-072)', () => {
  it('twenty specials (12 at tier 5, 8 at tier 6) and ten rares, all valid content', () => {
    const specials = content.kids.filter((k) => k.special);
    const rares = content.kids.filter((k) => k.rare);
    expect(specials).toHaveLength(20);
    expect(rares).toHaveLength(10);
    expect(specials.filter((k) => k.tier === 5)).toHaveLength(12);
    expect(specials.filter((k) => k.tier === 6)).toHaveLength(8);
    for (const k of [...specials, ...rares]) {
      expect(kidWild!.types[k.id]?.name).toBe(k.name);
      expect(kidWild!.types[k.id]?.collection).toBe(k.special ? 'special' : 'rare');
      expect(content.personality[k.id]).toBeDefined();
    }
    expect(validateContent(content)).toEqual([]);
  });

  it('every special and rare is drawn wild, from exported art', () => {
    // Names of every exported runtime PNG, as the game loads them.
    const exported = new Set(Object.keys(import.meta.glob('../../assets/sprites/**/*.png')).map((p) => p.slice(p.lastIndexOf('/') + 1, -4)));
    const wildKids = content.kids.filter((k) => k.special || k.rare);
    expect(rigCoverage(kidRig!, wildKids, exported, kidWild)).toEqual([]);
    // Without the wild sidecar, a special or rare is an error: no legacy costume stands in.
    const first = wildKids[0]!;
    expect(rigCoverage(kidRig!, [first], exported)).toEqual([`${first.special ? 'special' : 'rare'} kid "${first.id}" has no entry in kid_wild_v1.json`]);
  });
});

describe('a wild kid is its own box (kid_wild_v1 renderer.collision)', () => {
  it('its box is its type’s lifetime bounds at its saved scale, whatever its body', () => {
    const g = new Game(content, options, 3);
    const blimp = g.debugAddKid('blimp', 1000, 1000, { scale: 1.1 });
    const plain = g.debugAddKid('plain', 1500, 1000, { scale: 1.1, body: blimp.look.body });
    const own = wildBox(kidWild!, kidWild!.types.blimp!.lifetimeBoundsPx);
    expect(blimp.box.left).toBeCloseTo(own.left * 1.1, 9);
    expect(blimp.box.right).toBeCloseTo(own.right * 1.1, 9);
    expect(blimp.box.top).toBeCloseTo(own.top * 1.1, 9);
    expect(blimp.box.bottom).toBeCloseTo(own.bottom * 1.1, 9);
    // An ordinary kid with the same body keeps its body's box.
    expect(plain.box).not.toEqual(blimp.box);
    expect(g.boxOf(blimp.look, 'blimp')).toEqual(blimp.box);
  });

  it('a wild kid keeps its saved face through a plot and back; only newborns are Classic', () => {
    const c = structuredClone(content);
    c.balance.spawn = { ...c.balance.spawn, tutorialSpawns: 0, startingKids: 0, intervalSeconds: 1e9 };
    const g = new Game(c, options, 3);
    const k = g.debugAddKid('rainbow', 1000, 1000, { face: 'wide' });
    expect(k.look.face).toBe('wide');
    g.step([{ type: 'plant', kidIds: [k.id] }], 0);
    g.step([{ type: 'unplant', plot: 0, kidId: k.id }], 0);
    expect(g.state.world.kids.find((x) => x.id === k.id)!.look.face).toBe('wide');
    expect(g.debugAddKid('rainbow', 1500, 1000).look.face).toBe('classic');
  });

  it('a saved wild kid gets its own box back on load', () => {
    const g = new Game(content, options, 3);
    const k = g.debugAddKid('toy_castle', 1000, 1000);
    const saved = g.persisted();
    const loaded = new Game(content, options, 3, saved);
    expect(loaded.state.world.kids.find((x) => x.id === k.id)!.box).toEqual(k.box);
  });

  it('a wild sprout finds room for its own box', () => {
    const c = structuredClone(content);
    c.balance.planting.specialOdds = [1, 1];
    c.balance.planting.rareOdds = [0, 0];
    c.balance.spawn = { ...c.balance.spawn, tutorialSpawns: 0, startingKids: 0, intervalSeconds: 1e9 };
    const g = new Game(c, options, 3);
    g.state.plots = [{ seed: { planted: [1, 2, 3].map((id) => ({ id: 900 + id, type: 'plain', look: { body: 'round', face: 'classic', scale: 1 } })), sprout: null, grown: 0 } }];
    g.state.world.nextKidId = 1000;
    g.step([{ type: 'startGrowing', plot: 0 }], 0);
    const sprout = g.state.plots[0]!.seed!.sprout!;
    expect(c.kids.find((k) => k.id === sprout.type)?.special).toBe(true);
    g.step([], c.balance.planting.growSeconds + 1);
    const kid = g.state.world.kids.find((k) => k.type === sprout.type)!;
    // Born Classic, whatever face the roll gave (kid_wild_v1 renderer.appearance).
    expect(kid.look.face).toBe('classic');
    const own = wildBox(kidWild!, kidWild!.types[sprout.type]!.lifetimeBoundsPx);
    expect(kid.box.left).toBeCloseTo(own.left * kid.look.scale, 9);
    expect(kid.box.bottom).toBeCloseTo(own.bottom * kid.look.scale, 9);
  });
});
