import { describe, expect, it } from 'vitest';
import { content } from '../content';
import type { Content } from '../content/types';
import { validateState } from '../save/record';
import { Game, type GameEvent } from './game';
import { createRng } from './rng';
import { addKid, defaultBox, type Obstacle } from './world';

// Farming (D-069, GUI_MVP §22): fields, farming kids, the pantry.
const bounds = { minX: 0, minY: 0, maxX: 3000, maxY: 3000 };
const T0 = 1_700_000_000_000;
const S = 1000;
const fm = content.balance.farming;
const likes = content.personality.plain!;
/** A food Potato Kid neither loves nor hates. */
const ordinary = content.balance.feeding.foods.find((x) => x.id !== likes.favouriteFood && x.id !== likes.hatedFood)!.id;
/** Field 1's bay, well away from the Garden's outlet. */
const bay: Obstacle = { box: { minX: 2000, minY: 2000, maxX: 2400, maxY: 2400 }, circle: { x: 2200, y: 2200, r: 0 } };

function game(edit: (c: Content) => void = () => {}): Game {
  const c = structuredClone(content);
  c.balance.wander = { speed: 0, turnChancePerSecond: 0, idleChancePerSecond: 0, idleSeconds: [1, 1], ambientChance: 0 };
  c.balance.spawn = { ...c.balance.spawn, tutorialSpawns: 0, startingKids: 0, intervalSeconds: 1e9 };
  edit(c);
  return new Game(c, { bounds, spawnAt: { x: 1000, y: 300 }, now: T0, fieldBays: [bay] }, 3);
}

const box = defaultBox(content.balance.body.radius);
const place = (g: Game, type: string, x: number, y: number) => addKid(g.state.world, type, x, y, createRng(x + y), 0, box);
const rejected = (events: GameEvent[]) => events.find((e) => e.type === 'rejected');

/** A game with field 1 bought, growing `food`. */
function withField(food: string = ordinary): Game {
  const g = game();
  g.state.materials = 1e6;
  g.step([{ type: 'unlockField' }, { type: 'setFieldFood', field: 0, food }], 0);
  return g;
}

describe('fields (D-069, GUI_MVP §22.1-22.3)', () => {
  it('a field is bought with Materials, at its own price, up to maxFields', () => {
    const g = game();
    g.state.materials = fm.unlockPrices[0]! - 1;
    expect(rejected(g.step([{ type: 'unlockField' }], 0))).toEqual({ type: 'rejected', command: 'unlockField', reason: 'cost' });
    g.state.materials = 1e9;
    for (let n = 1; n <= fm.maxFields; n++) {
      const before = g.state.materials;
      expect(g.step([{ type: 'unlockField' }], 0)).toContainEqual({ type: 'fieldUnlocked', fields: n });
      expect(before - g.state.materials).toBe(fm.unlockPrices[n - 1]);
    }
    expect(g.state.fields).toEqual(Array.from({ length: fm.maxFields }, () => ({ food: null, workers: [], progress: 0 })));
    expect(rejected(g.step([{ type: 'unlockField' }], 0))).toEqual({ type: 'rejected', command: 'unlockField', reason: 'maxLevel' });
  });

  it('buying a field moves kids out of its bay, clear of partners; it is scenery after', () => {
    const g = game();
    g.state.materials = 1e6;
    const plain = place(g, 'plain', 2200, 2200);
    g.step([{ type: 'unlockField' }], 0);
    // Out of the bay, and on a free spot.
    const r = { minX: plain.x + plain.box.left, maxX: plain.x + plain.box.right, minY: plain.y + plain.box.top, maxY: plain.y + plain.box.bottom };
    expect(r.maxX <= bay.box.minX || r.minX >= bay.box.maxX || r.maxY <= bay.box.minY || r.minY >= bay.box.maxY).toBe(true);
    expect(g.state.world.obstacles).toContain(bay);
  });

  it('a food is chosen, and choosing it again changes nothing; an unknown food is refused', () => {
    const g = withField();
    expect(g.state.fields[0]!.food).toBe(ordinary);
    expect(rejected(g.step([{ type: 'setFieldFood', field: 0, food: ordinary }], 0))).toEqual({ type: 'rejected', command: 'setFieldFood', reason: 'unchanged' });
    expect(rejected(g.step([{ type: 'setFieldFood', field: 0, food: 'cake' }], 0))).toEqual({ type: 'rejected', command: 'setFieldFood', reason: 'invalid' });
    expect(rejected(g.step([{ type: 'setFieldFood', field: 3, food: ordinary }], 0))).toEqual({ type: 'rejected', command: 'setFieldFood', reason: 'gone' });
  });
});

describe('farming kids (D-069, GUI_MVP §22.4-22.5)', () => {
  it('kids start farming all at once: they leave the map, keep their name and happiness, and earn nothing', () => {
    const g = withField();
    const a = place(g, 'plain', 500, 1500);
    a.name = 'Spud';
    a.happy = { left: 900, favourite: false };
    const b = place(g, 'plain', 800, 1500);
    const materials = g.state.materials;
    const events = g.step([{ type: 'farm', field: 0, kidIds: [a.id, b.id] }], 0);
    expect(events.filter((e) => e.type === 'farming').map((e) => (e.type === 'farming' ? e.count : 0))).toEqual([1, 2]);
    expect(g.state.world.kids).toHaveLength(0);
    expect(g.state.fields[0]!.workers).toEqual([
      { id: a.id, type: 'plain', look: a.look, name: 'Spud', happiness: { left: 900, favourite: false } },
      { id: b.id, type: 'plain', look: b.look },
    ]);
    g.step([], 60);
    expect(g.state.materials).toBe(materials);
    // Off the map's count: capacity is the map's.
    expect(g.state.world.kids.length).toBe(0);
  });

  it('refused, all or none: no food chosen, a hated food, too few places, a kid gone', () => {
    const g = game();
    g.state.materials = 1e6;
    g.step([{ type: 'unlockField' }], 0);
    const k = place(g, 'plain', 500, 1500);
    expect(rejected(g.step([{ type: 'farm', field: 0, kidIds: [k.id] }], 0))).toEqual({ type: 'rejected', command: 'farm', reason: 'noCrop' });
    g.step([{ type: 'setFieldFood', field: 0, food: likes.hatedFood }], 0);
    expect(rejected(g.step([{ type: 'farm', field: 0, kidIds: [k.id] }], 0))).toEqual({ type: 'rejected', command: 'farm', reason: 'hated' });
    g.step([{ type: 'setFieldFood', field: 0, food: ordinary }], 0);
    const many = Array.from({ length: fm.kidsPerField + 1 }, (_, i) => place(g, 'plain', 300 + i * 250, 2000).id);
    expect(rejected(g.step([{ type: 'farm', field: 0, kidIds: many }], 0))).toEqual({ type: 'rejected', command: 'farm', reason: 'fieldFull' });
    expect(rejected(g.step([{ type: 'farm', field: 0, kidIds: [k.id, 999] }], 0))).toEqual({ type: 'rejected', command: 'farm', reason: 'gone' });
    expect(g.state.fields[0]!.workers).toEqual([]);
  });

  it('one kid grows a bite every biteSeconds; its favourite twice as fast; whole bites fill the pantry', () => {
    const g = withField();
    const k = place(g, 'plain', 500, 1500);
    g.step([{ type: 'farm', field: 0, kidIds: [k.id] }], 0);
    const events = g.step([], fm.biteSeconds * 2.5);
    expect(events).toContainEqual({ type: 'harvested', field: 0, food: ordinary, bites: 2 });
    expect(g.state.pantry[ordinary]).toBe(2);
    expect(g.state.fields[0]!.progress).toBeCloseTo(0.5, 9);
    const fav = withField(likes.favouriteFood);
    const f = place(fav, 'plain', 500, 1500);
    fav.step([{ type: 'farm', field: 0, kidIds: [f.id] }], 0);
    fav.step([], fm.biteSeconds);
    expect(fav.state.pantry[likes.favouriteFood]).toBe(fm.favouriteFactor);
  });

  it('taking a kid back keeps the progress; changing the food loses it, and sends haters home, all or none', () => {
    const g = withField();
    const k = place(g, 'plain', 500, 1500);
    k.name = 'Spud';
    g.step([{ type: 'farm', field: 0, kidIds: [k.id] }], 0);
    g.step([], fm.biteSeconds * 0.4);
    const events = g.step([{ type: 'unfarm', field: 0, kidId: k.id }], 0);
    const back = g.state.world.kids.find((x) => x.id === k.id)!;
    expect(events).toContainEqual({ type: 'unfarmed', kid: back, field: 0, count: 0 });
    expect(back.name).toBe('Spud');
    expect(g.state.fields[0]!.progress).toBeCloseTo(0.4, 9);
    // Back to farming, then the food changes to one it hates: it comes home, progress resets.
    g.step([{ type: 'farm', field: 0, kidIds: [k.id] }], 0);
    const change = g.step([{ type: 'setFieldFood', field: 0, food: likes.hatedFood }], 0);
    expect(change.some((e) => e.type === 'unfarmed' && e.kid.id === k.id)).toBe(true);
    expect(change).toContainEqual({ type: 'fieldFood', field: 0, food: likes.hatedFood });
    expect(g.state.fields[0]).toEqual({ food: likes.hatedFood, workers: [], progress: 0 });
  });

  it('a food change that would send a hater home to a full map changes nothing', () => {
    const g = withField();
    g.state.materials = 1e6;
    const k = place(g, 'plain', 500, 1500);
    g.step([{ type: 'farm', field: 0, kidIds: [k.id] }], 0);
    g.step([], fm.biteSeconds * 0.3);
    for (let i = g.state.world.kids.length; i < g.capacity; i++) place(g, 'snow', 300 + (i % 8) * 250, 600 + Math.floor(i / 8) * 250);
    expect(rejected(g.step([{ type: 'setFieldFood', field: 0, food: likes.hatedFood }], 0))).toEqual({ type: 'rejected', command: 'setFieldFood', reason: 'full' });
    expect(g.state.fields[0]!.food).toBe(ordinary);
    expect(g.state.fields[0]!.workers.map((w) => w.id)).toEqual([k.id]);
    expect(g.state.fields[0]!.progress).toBeCloseTo(0.3, 9);
    expect(rejected(g.step([{ type: 'emptyField', field: 0 }], 0))).toEqual({ type: 'rejected', command: 'emptyField', reason: 'full' });
  });

  it('fields grow while away, for the credited time, and the report counts the bites', () => {
    const g = withField();
    const k = place(g, 'plain', 500, 1500);
    g.step([{ type: 'farm', field: 0, kidIds: [k.id] }], 0);
    const r = g.reconcile(g.state.accountedUntil + fm.biteSeconds * 3 * S);
    expect(r.food).toEqual({ [ordinary]: 3 });
    expect(g.state.pantry[ordinary]).toBe(3);
  });

  it('a farming kid can be fed from the pantry and named; its happiness counts down in the field', () => {
    const g = withField();
    const k = place(g, 'plain', 500, 1500);
    g.step([{ type: 'farm', field: 0, kidIds: [k.id] }], 0);
    g.state.pantry[likes.favouriteFood] = 1;
    expect(g.step([{ type: 'feed', kidId: k.id, food: likes.favouriteFood }], 0).some((e) => e.type === 'fed')).toBe(true);
    expect(g.state.pantry[likes.favouriteFood]).toBe(0);
    g.step([], 100);
    expect(g.state.fields[0]!.workers[0]!.happiness).toEqual({ left: content.balance.feeding.favouriteSeconds - 100, favourite: true });
    g.step([{ type: 'name', kidId: k.id, name: 'Digger' }], 0);
    expect(g.state.fields[0]!.workers[0]!.name).toBe('Digger');
  });

  it('a farming kid’s card: its own rate, and its number among copies on the map and farming (§22.6)', () => {
    const g = withField();
    const a = place(g, 'plain', 500, 1500);
    const b = place(g, 'plain', 800, 1500);
    const c = place(g, 'plain', 1100, 1500);
    g.step([{ type: 'farm', field: 0, kidIds: [b.id] }], 0);
    // b is Kid 2: a is on the map, c farther on; a farming copy before c counts for c too.
    expect(g.ownedOrdinal('plain', b.id)).toBe(2);
    expect(g.ownedOrdinal('plain', c.id)).toBe(3);
    expect(g.ownedOrdinal('plain', a.id)).toBe(1);
    expect(g.farmRate('plain', ordinary)).toBe(1 / fm.biteSeconds);
    expect(g.farmRate('plain', likes.favouriteFood)).toBe(fm.favouriteFactor / fm.biteSeconds);
  });
});

describe('farming in saves (D-069)', () => {
  it('a farming game saves and loads valid; farming kids keep their ids, unique against the map', () => {
    const g = withField();
    const k = place(g, 'plain', 500, 1500);
    g.step([{ type: 'farm', field: 0, kidIds: [k.id] }], 0);
    g.step([], fm.biteSeconds * 1.5);
    const saved = g.persisted();
    expect(validateState(saved, content)).toEqual([]);
    const loaded = new Game(content, { bounds, spawnAt: { x: 1000, y: 300 }, fieldBays: [bay] }, 3, saved);
    expect(loaded.state.fields).toEqual(saved.fields);
    expect(loaded.state.world.obstacles).toContain(bay);
  });

  it('broken farming states are refused: a hater farming, kids with no food, progress of a whole bite, a duplicated id', () => {
    const g = withField();
    const k = place(g, 'plain', 500, 1500);
    g.step([{ type: 'farm', field: 0, kidIds: [k.id] }], 0);
    const good = g.persisted();
    const bad = (edit: (s: typeof good) => void) => {
      const s = structuredClone(good);
      edit(s);
      return validateState(s, content);
    };
    expect(bad((s) => (s.fields[0]!.food = likes.hatedFood))).toContain('field 0 has a kid farming a hated food');
    expect(bad((s) => (s.fields[0]!.food = null))).toContain('field 0 has kids but no food');
    expect(bad((s) => (s.fields[0]!.progress = 1))).toContain('field 0 progress is invalid');
    expect(bad((s) => (s.pantry = { cake: 1 }))).toContain('pantry is invalid');
    expect(bad((s) => s.world.kids.push({ ...structuredClone(s.world.kids[0] ?? k), id: k.id }))).not.toEqual([]);
  });
});
