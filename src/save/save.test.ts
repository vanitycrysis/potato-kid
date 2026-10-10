import { describe, expect, it } from 'vitest';
import { content } from '../content';
import { Game, type PersistedState } from '../sim/game';
import { SaveManager } from './manager';
import { decode, encode, SAVE_SCHEMA, validateState } from './record';
import { MemoryStorage, type SaveStorage } from './storage';

const bounds = { minX: 0, minY: 0, maxX: 2160, maxY: 3840 };
const options = { bounds, spawnAt: { x: 1080, y: 600 }, now: 1_000_000 };

function newGame(seed = 5): Game {
  return new Game(structuredClone(content), options, seed);
}

/** Storage that records every write and can be told to fail. */
class TestStorage implements SaveStorage {
  readonly data = new Map<string, string>();
  readonly writes: string[] = [];
  failReads = false;
  failWrites: (key: string) => boolean = () => false;
  inFlight = 0;
  maxInFlight = 0;

  async read(key: string): Promise<string | null> {
    if (this.failReads) throw new Error('read failed');
    return this.data.get(key) ?? null;
  }

  async write(key: string, value: string): Promise<void> {
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    await new Promise((r) => setTimeout(r, 1));
    this.inFlight--;
    if (this.failWrites(key)) throw new Error('write failed');
    this.writes.push(key);
    this.data.set(key, value);
  }
}

const revisionOf = (s: SaveStorage & { data: Map<string, string> }, key: string) => decode(s.data.get(key)!)!.revision;


/** A pre-schema-8 state's kids where schema 8 puts them: beside the moved Garden (D-071). */
function v3<T extends { world: { kids: { x: number; y: number }[] } }>(old: T): T {
  return { ...old, world: { ...old.world, kids: old.world.kids.map((k) => ({ ...k, x: k.x + 1080, y: k.y + 2880 })) } };
}

describe('saving and loading', () => {
  it('a new player starts fresh; a saved game loads back exactly', async () => {
    const storage = new MemoryStorage();
    const first = new SaveManager(storage, content);
    expect(await first.load()).toEqual({ state: null, mode: 'normal', olderSaveLoaded: false });
    const game = newGame();
    for (let i = 0; i < 50; i++) game.step([]);
    await first.save(game.persisted());

    const again = await new SaveManager(storage, content).load();
    expect(again.mode).toBe('normal');
    expect(again.state).toEqual(game.persisted());
  });

  it('restoring keeps every random stream: the game continues exactly as if never saved', () => {
    const a = newGame(9);
    for (let i = 0; i < 30; i++) a.step([]);
    const b = new Game(structuredClone(content), options, 1234, a.persisted());
    for (let i = 0; i < 300; i++) {
      a.step([]);
      b.step([]);
    }
    expect(b.persisted()).toEqual(a.persisted());
  });

  it('alternates slots and keeps revisions increasing', async () => {
    const storage = new TestStorage();
    const m = new SaveManager(storage, content);
    await m.load();
    const g = newGame();
    await m.save(g.persisted());
    await m.save(g.persisted());
    await m.save(g.persisted());
    expect(storage.writes).toEqual(['slotA', 'slotB', 'slotA']);
    expect([revisionOf(storage, 'slotB'), revisionOf(storage, 'slotA')]).toEqual([2, 3]);
  });

  it('serializes writes: two saves never overlap', async () => {
    const storage = new TestStorage();
    const m = new SaveManager(storage, content);
    await m.load();
    const g = newGame();
    await Promise.all([m.save(g.persisted()), m.save(g.persisted()), m.save(g.persisted())]);
    expect(storage.maxInFlight).toBe(1);
  });

  it('writes nothing before loading has resolved', async () => {
    const storage = new TestStorage();
    const m = new SaveManager(storage, content);
    await m.save(newGame().persisted());
    expect(storage.writes).toEqual([]);
  });
});

describe('records', () => {
  it('a tampered or torn record fails its checksum', () => {
    const raw = encode(SAVE_SCHEMA, 1, 1, newGame().persisted());
    expect(decode(raw)).not.toBeNull();
    expect(decode(raw.replace('"materials":0', '"materials":9999'))).toBeNull();
    expect(decode(raw.slice(0, raw.length - 20))).toBeNull();
  });
});

describe('failure paths (plan §4)', () => {
  it('unreadable storage is never treated as empty: play unsaved, write nothing', async () => {
    const storage = new TestStorage();
    storage.data.set('slotA', 'precious');
    storage.failReads = true;
    const m = new SaveManager(storage, content);
    expect(await m.load()).toEqual({ state: null, mode: 'unsaved', olderSaveLoaded: false });
    await m.save(newGame().persisted());
    expect(storage.writes).toEqual([]);
    expect(storage.data.get('slotA')).toBe('precious');
  });

  it('one corrupt slot: loads the other, archives the corrupt bytes, then may reuse that slot', async () => {
    const storage = new TestStorage();
    const g = newGame();
    storage.data.set('slotA', encode(SAVE_SCHEMA, 7, 1, g.persisted()));
    storage.data.set('slotB', 'garbage{');
    const m = new SaveManager(storage, content);
    const r = await m.load();
    expect(r.state).toEqual(g.persisted());
    expect(r.olderSaveLoaded).toBe(true);
    const archived = [...storage.data].filter(([k]) => k.startsWith('archive/B-'));
    expect(archived.map(([, v]) => v)).toEqual(['garbage{']);
    await m.save(g.persisted());
    expect(storage.writes.at(-1)).toBe('slotB'); // archived, so writable; A (in play) untouched
    expect(revisionOf(storage, 'slotA')).toBe(7);
  });

  it('both slots corrupt: both archived, a fresh game, saving works', async () => {
    const storage = new TestStorage();
    storage.data.set('slotA', '{"schema":1}');
    storage.data.set('slotB', 'xx');
    const m = new SaveManager(storage, content);
    expect(await m.load()).toEqual({ state: null, mode: 'normal', olderSaveLoaded: false });
    expect([...storage.data.keys()].filter((k) => k.startsWith('archive/'))).toHaveLength(2);
  });

  it('a failed archive keeps the slot protected; with the other slot in play, nothing is written', async () => {
    const storage = new TestStorage();
    const g = newGame();
    storage.data.set('slotA', encode(SAVE_SCHEMA, 3, 1, g.persisted()));
    storage.data.set('slotB', 'corrupt');
    storage.failWrites = (key) => key.startsWith('archive/');
    const m = new SaveManager(storage, content);
    const r = await m.load();
    expect(r.mode).toBe('unsaved');
    await m.save(g.persisted());
    expect(storage.writes).toEqual([]);
    expect(storage.data.get('slotB')).toBe('corrupt');
  });

  it('an archive that reads back different bytes does not free the slot', async () => {
    const storage = new TestStorage();
    const g = newGame();
    storage.data.set('slotA', encode(SAVE_SCHEMA, 3, 1, g.persisted()));
    storage.data.set('slotB', 'corrupt');
    // The archive write "succeeds", but the stored copy is not the original.
    const read = storage.read.bind(storage);
    storage.read = async (key) => (key.startsWith('archive/') ? 'mangled' : read(key));
    const m = new SaveManager(storage, content);
    expect((await m.load()).mode).toBe('unsaved');
    await m.save(g.persisted());
    expect(storage.data.get('slotB')).toBe('corrupt');
  });

  it('a save from a newer app: read-only, never written', async () => {
    const storage = new TestStorage();
    const g = newGame();
    storage.data.set('slotA', encode(SAVE_SCHEMA, 4, 1, g.persisted()));
    storage.data.set('slotB', encode(99, 5, 2, g.persisted()));
    const m = new SaveManager(storage, content);
    const r = await m.load();
    expect(r.mode).toBe('readOnly');
    await m.save(g.persisted());
    expect(storage.writes).toEqual([]);
  });

  it('a newer app’s save is read-only even if its envelope or checksum differs', async () => {
    const storage = new TestStorage();
    storage.data.set('slotA', JSON.stringify({ schema: 99, revision: 5, savedAt: 1, state: {}, checksum: 'a-new-scheme' }));
    const m = new SaveManager(storage, content);
    expect((await m.load()).mode).toBe('readOnly');
    await m.save(newGame().persisted());
    expect(storage.writes).toEqual([]);
  });

  it('a state that parses but cannot be played is protected, not loaded', async () => {
    const storage = new TestStorage();
    const g = newGame();
    const bad = g.persisted();
    bad.world.nextKidId = 1; // every kid id is now >= nextKidId
    storage.data.set('slotA', encode(SAVE_SCHEMA, 2, 1, bad));
    const m = new SaveManager(storage, content);
    const r = await m.load();
    expect(validateState(bad, content)).not.toEqual([]);
    expect(r.state).toBeNull();
    expect(r.mode).toBe('unsaved');
    await m.save(g.persisted());
    // Its bytes are archived and never overwritten; no slot is written this session.
    expect(storage.data.get('slotA')).toBe(encode(SAVE_SCHEMA, 2, 1, bad));
    expect(storage.writes).toHaveLength(1);
    expect(storage.writes[0]).toMatch(/^archive\/A-r2-/);
  });

  it('a failed write is retried at the next trigger; three in a row raise the banner', async () => {
    const storage = new TestStorage();
    let fail = true;
    storage.failWrites = (key) => key.startsWith('slot') && fail;
    const m = new SaveManager(storage, content);
    await m.load();
    const g = newGame();
    await m.save(g.persisted());
    await m.save(g.persisted());
    expect(m.failing).toBe(false);
    await m.save(g.persisted());
    expect(m.failing).toBe(true);
    fail = false;
    await m.save(g.persisted());
    expect(m.failing).toBe(false);
    // The successful write carries a revision above every failed attempt: none repeat.
    expect(revisionOf(storage, 'slotA')).toBe(4);
  });
});

describe('Codex review, PR #30', () => {
  it('protects an unusable slot even when the other slot loads fine', async () => {
    const storage = new TestStorage();
    const g = newGame();
    const bad = g.persisted();
    bad.world.nextKidId = 1;
    const rawB = encode(SAVE_SCHEMA, 9, 1, bad);
    storage.data.set('slotA', encode(SAVE_SCHEMA, 10, 1, g.persisted()));
    storage.data.set('slotB', rawB);
    const m = new SaveManager(storage, content);
    const r = await m.load();
    expect(r.state).toEqual(g.persisted());
    expect(r.olderSaveLoaded).toBe(false); // the unusable one was the older save
    // B's bytes are archived (and verified) before anything may write to B.
    const archive = storage.writes.findIndex((k) => k.startsWith('archive/B-r9-'));
    expect(archive).toBe(0);
    await m.save(g.persisted());
    expect(storage.writes.indexOf('slotB')).toBeGreaterThan(archive);
    expect([...storage.data.values()]).toContain(rawB);
  });

  it('…and if that archive fails, B is never written', async () => {
    const storage = new TestStorage();
    const g = newGame();
    const bad = g.persisted();
    bad.world.nextKidId = 1;
    const rawB = encode(SAVE_SCHEMA, 9, 1, bad);
    storage.data.set('slotA', encode(SAVE_SCHEMA, 10, 1, g.persisted()));
    storage.data.set('slotB', rawB);
    storage.failWrites = (key) => key.startsWith('archive/');
    const m = new SaveManager(storage, content);
    expect((await m.load()).mode).toBe('unsaved');
    await m.save(g.persisted());
    expect(storage.data.get('slotB')).toBe(rawB);
  });

  it('every resting activity needs its timers', () => {
    const g = newGame();
    const state = g.persisted();
    const kid = state.world.kids[0]!;
    const check = (activity: unknown) => {
      (kid as { activity: unknown }).activity = activity;
      return validateState(state, content).filter((p) => p.includes('activity'));
    };
    expect(check({ kind: 'walk' })).toEqual([]);
    expect(check({ kind: 'pause', left: 1 })).toEqual([]);
    expect(check({ kind: 'pause' })).not.toEqual([]);
    expect(check({ kind: 'wave', left: Number.NaN })).not.toEqual([]);
    expect(check({ kind: 'sit', left: 3 })).not.toEqual([]);
    expect(check({ kind: 'sleep', left: 3, total: 9 })).toEqual([]);
  });

  it('a body or face the current art lacks maps to a valid one on restore; scale must be positive', () => {
    const g = newGame();
    const state = g.persisted();
    state.world.kids[0]!.look = { body: 'retired_body', face: 'retired_face', scale: 1 };
    expect(validateState(state, content)).toEqual([]);
    const restored = new Game(structuredClone(content), options, 1, state);
    const look = restored.state.world.kids[0]!.look;
    expect([look.body, look.face]).toEqual(['default', 'default']);
    state.world.kids[0]!.look = { body: 'default', face: 'default', scale: 0 };
    expect(validateState(state, content)).not.toEqual([]);
  });
});

describe("Codex's round-3 trace (plan §4)", () => {
  // Schema 2 build. A holds revision 20 whose 1→2 migration fails; B holds revision 19, which migrates.
  const migrations = {
    1: (s: unknown) => {
      if ((s as PersistedState).materials === 666) throw new Error('cannot migrate');
      return s;
    },
  };

  function setup(failArchive: boolean) {
    const storage = new TestStorage();
    const g = newGame();
    const a = { ...g.persisted(), materials: 666 };
    const rawA = encode(1, 20, 1, a);
    storage.data.set('slotA', rawA);
    storage.data.set('slotB', encode(1, 19, 1, g.persisted()));
    if (failArchive) storage.failWrites = (key) => key.startsWith('archive/');
    return { storage, g, rawA };
  }

  it('initial save, periodic save, restart: A stays recoverable and revisions never repeat', async () => {
    const { storage, g, rawA } = setup(false);
    const m = new SaveManager(storage, content, { schema: 2, migrations });
    const r = await m.load();
    expect(r.olderSaveLoaded).toBe(true);
    expect(r.state!.materials).toBe(g.persisted().materials);
    // A's bytes were archived (verified) before anything could target A.
    const archive = [...storage.data].find(([k]) => k.startsWith('archive/A-r20-'));
    expect(archive?.[1]).toBe(rawA);
    expect(storage.writes.indexOf(archive![0])).toBe(0);

    await m.save(g.persisted()); // initial save after load
    await m.save(g.persisted()); // periodic save
    expect(storage.writes.slice(1)).toEqual(['slotA', 'slotB']);
    expect([revisionOf(storage, 'slotA'), revisionOf(storage, 'slotB')]).toEqual([21, 22]);

    const restarted = await new SaveManager(storage, content, { schema: 2, migrations }).load();
    expect(restarted.state).toEqual(g.persisted());
    expect(archive![1]).toBe(rawA);
  });

  it('if A cannot be archived, nothing ever targets A', async () => {
    const { storage, g, rawA } = setup(true);
    const m = new SaveManager(storage, content, { schema: 2, migrations });
    const r = await m.load();
    expect(r.mode).toBe('unsaved');
    await m.save(g.persisted());
    await m.save(g.persisted());
    expect(storage.data.get('slotA')).toBe(rawA);
    expect(storage.writes.filter((k) => k.startsWith('slot'))).toEqual([]);
  });
});

describe('schema 2: the tutorial counter (D-052)', () => {
  /** A schema-1 state: today's state without the fields schemas 2 and 3 added. */
  function schema1(): Omit<PersistedState, 'gardenSpawns' | 'plots'> {
    const rest: Partial<PersistedState> = newGame().persisted();
    delete rest.gardenSpawns;
    delete rest.plots;
    return rest as Omit<PersistedState, 'gardenSpawns' | 'plots'>;
  }

  it('a new game starts at the beginning of the tutorial', () => {
    expect(newGame().persisted().gardenSpawns).toBe(0);
  });

  it('a schema-1 save loads past the tutorial: it was played on the old fast schedule', async () => {
    expect(SAVE_SCHEMA).toBeGreaterThanOrEqual(2);
    const storage = new TestStorage();
    const old = schema1();
    storage.data.set('slotA', encode(1, 4, 1, old as PersistedState));
    const r = await new SaveManager(storage, content).load();
    expect(r.state).toMatchObject({ ...v3(old), gardenSpawns: content.balance.spawn.tutorialSpawns });
    // It plays on the slow schedule at once.
    const game = new Game(structuredClone(content), options, 5, r.state!);
    expect(game.interval).toBe(content.balance.spawn.intervalSeconds * content.balance.economy.gardenIntervalFactor ** (game.state.buildings.garden - 1));
  });

  it('a schema-2 save must carry a whole, non-negative count', () => {
    const state = newGame().persisted() as unknown as Record<string, unknown>;
    for (const bad of [undefined, -1, 1.5, Number.NaN, '3']) {
      expect(validateState({ ...state, gardenSpawns: bad }, content)).toContain('gardenSpawns is invalid');
    }
    expect(validateState({ ...state, gardenSpawns: 7 }, content)).toEqual([]);
  });
});

describe('schema 3: plots (D-061)', () => {
  it('a schema-2 save loads with its first plots, empty', async () => {
    expect(SAVE_SCHEMA).toBeGreaterThanOrEqual(3);
    const storage = new TestStorage();
    const old: Partial<PersistedState> = newGame().persisted();
    delete old.plots;
    storage.data.set('slotA', encode(2, 4, 1, old as PersistedState));
    const r = await new SaveManager(storage, content).load();
    // Schema 4 added the variants found, and schema 7 retired them (D-072).
    expect(r.state).toEqual({ ...v3(old as PersistedState), plots: Array.from({ length: content.balance.planting.startPlots }, () => ({ seed: null })) });
  });

  it('a schema-3 save must carry valid plots (D-061)', () => {
    const fresh = newGame().persisted();
    // Planted kids carry ids no live kid has (D-074), below nextKidId.
    const state = { ...fresh, world: { ...fresh.world, nextKidId: 10_000 } } as unknown as Record<string, unknown>;
    const plan = content.balance.planting;
    let id = 5_000;
    const kid = (type: string, extra: Record<string, unknown> = {}) => ({ id: id++, type, look: { body: 'default', face: 'default', scale: 1 }, ...extra });
    const three = [kid('plain'), kid('fire'), kid('water')];
    const bad: unknown[] = [
      undefined,
      [],
      Array.from({ length: plan.maxPlots + 1 }, () => ({ seed: null })),
      [{}],
      [{ seed: { planted: [], sprout: null, grown: 0 } }],
      [{ seed: { planted: ['plain'], sprout: null, grown: 0 } }], // a bare type, not a snapshot
      [{ seed: { planted: [kid('nobody')], sprout: null, grown: 0 } }],
      [{ seed: { planted: [{ id: id++, type: 'plain' }], sprout: null, grown: 0 } }], // no look
      [{ seed: { planted: [kid('plain', { variant: 'rainbow' })], sprout: null, grown: 0 } }], // variants are retired (D-072)
      [{ seed: { planted: Array.from({ length: plan.maxKids + 1 }, () => kid('plain')), sprout: null, grown: 0 } }],
      [{ seed: { planted: three, sprout: null, grown: 5 } }], // grew before it started
      [{ seed: { planted: [kid('plain')], sprout: { type: 'plain' }, grown: 0 } }], // started with too few
      [{ seed: { planted: three, sprout: { type: 'nobody' }, grown: 0 } }],
      [{ seed: { planted: three, sprout: { type: 'plain', variant: 'rainbow' }, grown: 0 } }],
      [{ seed: { planted: three, sprout: { type: 'plain' }, grown: plan.growSeconds + 1 } }],
      [{ seed: { planted: three, sprout: { type: 'plain' }, grown: Number.NaN } }],
    ];
    for (const plots of bad) expect(validateState({ ...state, plots }, content), JSON.stringify(plots)).not.toEqual([]);
    const good = [
      { seed: null },
      { seed: { planted: [kid('plain')], sprout: null, grown: 0 } },
      { seed: { planted: three, sprout: { type: 'hero' }, grown: plan.growSeconds } },
    ];
    expect(validateState({ ...state, plots: good }, content)).toEqual([]);
  });

  it('a game with planted and growing plots saves and loads back exactly (D-061)', async () => {
    const g = newGame();
    const kids = g.state.world.kids.slice(0, 3);
    g.step([{ type: 'plant', kidIds: kids.map((k) => k.id) }], 0);
    g.step([{ type: 'startGrowing', plot: 0 }], 0);
    g.step([], 7);
    expect(g.state.plots[0]!.seed!.sprout).not.toBeNull();
    const storage = new TestStorage();
    const m = new SaveManager(storage, content);
    await m.load(); // a manager saves only after it has loaded
    await m.save(g.persisted());
    const r = await new SaveManager(storage, content).load();
    expect(r.state).toEqual(g.persisted());
  });

});

describe('schema 7: rare variants retired (D-072)', () => {
  /** A schema-6 state: today's, plus the variant fields D-072 retired. */
  function schema6(): { old: PersistedState & Record<string, unknown>; mini: number; comet: number } {
    const g = newGame();
    const old = g.persisted() as PersistedState & Record<string, unknown>;
    const [mini, comet] = old.world.kids as (PersistedState['world']['kids'][number] & { variant?: string })[];
    mini!.variant = 'mini';
    comet!.variant = 'comet';
    old.discoveredVariants = { [mini!.type]: ['mini'], [comet!.type]: ['comet'] };
    const look = { body: 'default', face: 'default', scale: 1 };
    const next = old.world.nextKidId;
    old.world.nextKidId += 5;
    old.plots = [
      { seed: { planted: [{ id: next, type: 'fire', look: { ...look, scale: 0.72 }, variant: 'mini' }, { id: next + 1, type: 'fire', look, variant: 'prism' }], sprout: null, grown: 0 } },
      { seed: { planted: [0, 1, 2].map((i) => ({ id: next + 2 + i, type: 'plain', look })), sprout: { type: 'hero', variant: 'rainbow' }, grown: 3 } },
    ] as unknown as PersistedState['plots'];
    return { old, mini: mini!.look.scale, comet: comet!.look.scale };
  }

  it('a schema-6 save loads with every variant kid ordinary, a Mini back at its normal size, and no variants found', async () => {
    expect(SAVE_SCHEMA).toBeGreaterThanOrEqual(7);
    const { old, mini, comet } = schema6();
    const storage = new TestStorage();
    storage.data.set('slotA', encode(6, 4, 1, old));
    const r = await new SaveManager(storage, content).load();
    const state = r.state! as PersistedState & Record<string, unknown>;
    expect(state).not.toHaveProperty('discoveredVariants');
    expect(state.world.kids.every((k) => !('variant' in k))).toBe(true);
    expect(state.world.kids[0]!.look.scale).toBeCloseTo(mini / 0.72, 12);
    expect(state.world.kids[1]!.look.scale).toBe(comet);
    expect(state.plots[0]!.seed!.planted).toEqual([
      { id: old.world.nextKidId - 5, type: 'fire', look: { body: 'default', face: 'default', scale: 1 } },
      { id: old.world.nextKidId - 4, type: 'fire', look: { body: 'default', face: 'default', scale: 1 } },
    ]);
    // A seed decided as a variant sprouts its type, ordinary.
    expect(state.plots[1]!.seed!.sprout).toEqual({ type: 'hero' });
    // What the Dex knows of the types themselves stays.
    expect(state.discoveredKids).toEqual(old.discoveredKids);
  });

  it('a schema-7 save keeps its kids where they were beside the Garden, which moved with map v3 (D-071)', async () => {
    expect(SAVE_SCHEMA).toBe(8);
    const g = newGame();
    const old = g.persisted();
    old.plots[0]!.seed = { planted: [{ id: old.world.nextKidId, type: 'fire', look: { body: 'default', face: 'default', scale: 1 } }], sprout: null, grown: 0 };
    old.world.nextKidId++;
    const storage = new TestStorage();
    storage.data.set('slotA', encode(7, 4, 1, old));
    const r = await new SaveManager(storage, content).load();
    // The Garden went from (1080, 620) to (2160, 3500).
    expect(r.state!.world.kids.map((k) => [k.id, k.x, k.y])).toEqual(old.world.kids.map((k) => [k.id, k.x + 1080, k.y + 2880]));
    // Planted kids have no position; everything else is as it was.
    expect(r.state!.plots).toEqual(old.plots);
    expect({ ...r.state!, world: null }).toEqual({ ...old, world: null });
  });

  it('a schema-3 Mini comes through every step at its normal size', async () => {
    const g = newGame();
    const old = g.persisted() as PersistedState & Record<string, unknown>;
    const kid = old.world.kids[0]! as PersistedState['world']['kids'][number] & { variant?: string };
    kid.variant = 'mini';
    const scale = kid.look.scale;
    const storage = new TestStorage();
    storage.data.set('slotA', encode(3, 4, 1, old));
    const r = await new SaveManager(storage, content).load();
    expect(r.state!.world.kids[0]!.look.scale).toBeCloseTo(scale, 12);
    expect(r.state!.world.kids[0]).not.toHaveProperty('variant');
  });

  it('a schema-7 save may not carry variants, on a kid, a planted kid, a sprout, or as found', () => {
    const state = newGame().persisted() as unknown as { world: { kids: Record<string, unknown>[] } } & Record<string, unknown>;
    expect(validateState(state, content)).toEqual([]);
    const kid = state.world.kids[0]!;
    expect(validateState({ ...state, world: { ...state.world, kids: [{ ...kid, variant: 'rainbow' }, ...state.world.kids.slice(1)] } }, content)).toContain(`kid ${String(kid.id)} variant is retired`);
    expect(validateState({ ...state, discoveredVariants: {} }, content)).toContain('discoveredVariants is retired');
  });
});

describe('schema 5: names and happiness (D-056, D-057)', () => {
  it('a schema-4 save loads as it was', async () => {
    expect(SAVE_SCHEMA).toBeGreaterThanOrEqual(5);
    const old = newGame().persisted();
    const storage = new TestStorage();
    storage.data.set('slotA', encode(4, 4, 1, old));
    const r = await new SaveManager(storage, content).load();
    expect(r.state).toEqual(v3(old));
  });

  it('a kid may carry a normalized, allowed name and some happiness; a planted kid whether it was happy', () => {
    const state = newGame().persisted() as unknown as { world: { kids: Record<string, unknown>[] }; plots: unknown[] };
    const kid = state.world.kids[0]!;
    const check = (patch: Record<string, unknown>) => {
      const s = structuredClone(state);
      Object.assign(s.world.kids[0]!, patch);
      return validateState(s, content);
    };
    expect(check({ name: 'Sir Spud', happy: { left: 60, favourite: true } })).toEqual([]);
    // A save checks a name's shape, and only a generous length cap: how a platform counts
    // clusters must never make a good save unreadable (Codex review, FEED-NAME).
    const cap = content.balance.naming.maxLength * 8;
    for (const bad of [{ name: '' }, { name: ' Spud' }, { name: 'Spud🥔' }, { name: 'aㅤb' }, { name: 'x'.repeat(cap + 1) }, { name: 7 }]) expect(check(bad), JSON.stringify(bad)).toContain(`kid ${String(kid.id)} name is invalid`);
    expect(check({ name: 'ൎന'.repeat(13) })).toEqual([]);
    const most = content.balance.feeding.favouriteSeconds;
    for (const bad of [{ left: 0, favourite: true }, { left: most + 1, favourite: false }, { left: 60 }, { left: Number.NaN, favourite: true }]) {
      expect(check({ happy: bad }), JSON.stringify(bad)).toContain(`kid ${String(kid.id)} happy is invalid`);
    }
    const look = { body: 'default', face: 'default', scale: 1 };
    const world = state.world as unknown as { nextKidId: number };
    const id = world.nextKidId++;
    const plots = (happy: unknown) => [{ seed: { planted: [{ id, type: 'plain', look, happy }], sprout: null, grown: 0 } }];
    expect(validateState({ ...state, plots: plots(true) }, content)).toEqual([]);
    expect(validateState({ ...state, plots: plots('yes') }, content)).not.toEqual([]);
  });
});

describe('schema 6: planted kids keep their ids (D-074)', () => {
  it('a schema-5 save gives its planted kids new ids, past every id in use', async () => {
    const g = newGame();
    const old = g.persisted() as PersistedState & Record<string, unknown>;
    const look = { body: 'default', face: 'default', scale: 1 };
    const next = old.world.nextKidId;
    const plain = { type: 'plain', look };
    old.plots = [{ seed: { planted: [plain, { ...plain, happy: true }], sprout: null, grown: 0 } }, { seed: { planted: [plain, plain, plain], sprout: { type: 'fire', variant: null }, grown: 3 } }] as unknown as PersistedState['plots'];
    const storage = new TestStorage();
    storage.data.set('slotA', encode(5, 4, 1, old));
    const r = await new SaveManager(storage, content).load();
    expect(r.state!.plots.flatMap((p) => p.seed?.planted.map((k) => k.id) ?? [])).toEqual([next, next + 1, next + 2, next + 3, next + 4]);
    expect(r.state!.world.nextKidId).toBe(next + 5);
    expect(r.state!.plots[0]!.seed!.planted[1]).toEqual({ id: next + 1, type: 'plain', look, happy: true });
  });

  it('a planted kid needs an id no live or planted kid has, and may carry a name and happiness', () => {
    const fresh = newGame().persisted();
    const live = fresh.world.kids[0]!.id;
    const state = { ...fresh, world: { ...fresh.world, nextKidId: 10_000 } };
    const look = { body: 'default', face: 'default', scale: 1 };
    const plot = (...planted: Record<string, unknown>[]) => [{ seed: { planted: planted.map((k) => ({ type: 'plain', look, ...k })), sprout: null, grown: 0 } }];
    const ok = (plots: unknown) => validateState({ ...state, plots }, content);
    expect(ok(plot({ id: 500 }, { id: 501, name: 'Sir Spud', happy: true, happiness: { left: 60, favourite: false } }))).toEqual([]);
    for (const bad of [
      plot({}), // no id
      plot({ id: -1 }),
      plot({ id: 1.5 }),
      plot({ id: 10_000 }), // not below nextKidId
      plot({ id: live }), // a live kid's
      plot({ id: 500 }, { id: 500 }), // twice
      plot({ id: 500, name: ' Spud' }),
      plot({ id: 500, happy: true, happiness: { left: 0, favourite: true } }),
      plot({ id: 500, happy: true, happiness: { left: content.balance.feeding.favouriteSeconds + 1, favourite: true } }),
      plot({ id: 500, happiness: { left: 60, favourite: true } }), // happiness without having been happy when added
    ]) {
      expect(ok(bad), JSON.stringify(bad)).not.toEqual([]);
    }
    // Two plots can't share an id either.
    expect(ok([...plot({ id: 500 }), ...plot({ id: 500 })])).not.toEqual([]);
  });
});
