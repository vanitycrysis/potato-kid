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
  function schema1(): Omit<PersistedState, 'gardenSpawns' | 'plots' | 'discoveredVariants'> {
    const rest: Partial<PersistedState> = newGame().persisted();
    delete rest.gardenSpawns;
    delete rest.plots;
    delete rest.discoveredVariants;
    return rest as Omit<PersistedState, 'gardenSpawns' | 'plots' | 'discoveredVariants'>;
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
    expect(r.state).toMatchObject({ ...old, gardenSpawns: content.balance.spawn.tutorialSpawns });
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
    delete old.discoveredVariants;
    storage.data.set('slotA', encode(2, 4, 1, old as PersistedState));
    const r = await new SaveManager(storage, content).load();
    expect(r.state).toEqual({ ...old, plots: Array.from({ length: content.balance.planting.startPlots }, () => ({ seed: null })), discoveredVariants: {} });
  });

  it('a schema-3 save must carry valid plots (D-061)', () => {
    const state = newGame().persisted() as unknown as Record<string, unknown>;
    const plan = content.balance.planting;
    const kid = (type: string, extra: Record<string, unknown> = {}) => ({ type, look: { body: 'default', face: 'default', scale: 1 }, ...extra });
    const three = [kid('plain'), kid('fire'), kid('water')];
    const bad: unknown[] = [
      undefined,
      [],
      Array.from({ length: plan.maxPlots + 1 }, () => ({ seed: null })),
      [{}],
      [{ seed: { planted: [], sprout: null, grown: 0 } }],
      [{ seed: { planted: ['plain'], sprout: null, grown: 0 } }], // a bare type, not a snapshot
      [{ seed: { planted: [kid('nobody')], sprout: null, grown: 0 } }],
      [{ seed: { planted: [{ type: 'plain' }], sprout: null, grown: 0 } }], // no look
      [{ seed: { planted: [kid('plain', { variant: 'sparkly' })], sprout: null, grown: 0 } }],
      [{ seed: { planted: Array.from({ length: plan.maxKids + 1 }, () => kid('plain')), sprout: null, grown: 0 } }],
      [{ seed: { planted: three, sprout: null, grown: 5 } }], // grew before it started
      [{ seed: { planted: [kid('plain')], sprout: { type: 'plain', variant: null }, grown: 0 } }], // started with too few
      [{ seed: { planted: three, sprout: { type: 'nobody', variant: null }, grown: 0 } }],
      [{ seed: { planted: three, sprout: { type: 'plain', variant: 'sparkly' }, grown: 0 } }],
      [{ seed: { planted: three, sprout: { type: 'plain', variant: null }, grown: plan.growSeconds + 1 } }],
      [{ seed: { planted: three, sprout: { type: 'plain', variant: null }, grown: Number.NaN } }],
    ];
    for (const plots of bad) expect(validateState({ ...state, plots }, content), JSON.stringify(plots)).not.toEqual([]);
    const good = [
      { seed: null },
      { seed: { planted: [kid('plain', { variant: plan.rareVariants[0] })], sprout: null, grown: 0 } },
      { seed: { planted: three, sprout: { type: 'hero', variant: plan.rareVariants[0] }, grown: plan.growSeconds } },
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

  it('a kid may carry a known rare variant, nothing else (D-062)', () => {
    const state = newGame().persisted() as unknown as { world: { kids: Record<string, unknown>[] } };
    const kid = state.world.kids[0]!;
    const withVariant = (variant: unknown) => ({ ...state, world: { ...state.world, kids: [{ ...kid, variant }, ...state.world.kids.slice(1)] } });
    expect(validateState(withVariant(content.balance.planting.rareVariants[0]), content)).toEqual([]);
    for (const v of ['sparkly', '', 3, null]) expect(validateState(withVariant(v), content)).not.toEqual([]);
  });

});

describe('schema 4: rare variants found (D-062)', () => {
  it('a schema-3 save counts the rares it already holds, on the map or planted, as found', async () => {
    expect(SAVE_SCHEMA).toBe(4);
    const g = newGame();
    const old = g.persisted() as PersistedState & Record<string, unknown>;
    delete (old as Partial<PersistedState>).discoveredVariants;
    const kid = old.world.kids[0]!;
    kid.variant = 'rainbow';
    const look = { body: 'default', face: 'default', scale: 1 };
    old.plots = [{ seed: { planted: [{ type: kid.type, look, variant: 'rainbow' }, { type: 'fire', look, variant: 'mini' }], sprout: null, grown: 0 } }];
    const storage = new TestStorage();
    storage.data.set('slotA', encode(3, 4, 1, old));
    const r = await new SaveManager(storage, content).load();
    expect(r.state!.discoveredVariants).toEqual({ [kid.type]: ['rainbow'], fire: ['mini'] });
  });

  it("a schema-3 Mini shrinks once, like a new one, on the map and planted (Codex review, PR #77)", async () => {
    const g = newGame();
    const old = g.persisted() as PersistedState & Record<string, unknown>;
    delete (old as Partial<PersistedState>).discoveredVariants;
    const [mini, other] = old.world.kids;
    mini!.variant = 'mini';
    other!.variant = 'comet';
    const scale = mini!.look.scale;
    const look = { body: 'default', face: 'default', scale: 1 };
    old.plots = [{ seed: { planted: [{ type: 'fire', look, variant: 'mini' }, { type: 'fire', look }], sprout: null, grown: 0 }, }];
    const storage = new TestStorage();
    storage.data.set('slotA', encode(3, 4, 1, old));
    const r = await new SaveManager(storage, content).load();
    const m = content.balance.planting.miniScale;
    expect(r.state!.world.kids[0]!.look.scale).toBeCloseTo(scale * m, 12);
    expect(r.state!.world.kids[1]!.look.scale).toBe(other!.look.scale);
    expect(r.state!.plots[0]!.seed!.planted.map((k) => k.look.scale)).toEqual([m, 1]);
    // Loaded, its box follows the smaller look.
    const game = new Game(structuredClone(content), options, 5, r.state!);
    const box = game.state.world.kids[0]!.box;
    const full = new Game(structuredClone(content), options, 5, old as PersistedState).state.world.kids[0]!.box;
    expect(box.right - box.left).toBeCloseTo((full.right - full.left) * m, 9);
  });

  it('a schema-4 save must name known types and variants, each once', () => {
    const state = newGame().persisted() as unknown as Record<string, unknown>;
    for (const bad of [undefined, null, [], { nobody: ['rainbow'] }, { fire: ['sparkly'] }, { fire: 'rainbow' }, { fire: ['rainbow', 'rainbow'] }]) {
      expect(validateState({ ...state, discoveredVariants: bad }, content), JSON.stringify(bad)).not.toEqual([]);
    }
    expect(validateState({ ...state, discoveredVariants: { fire: ['rainbow', 'mini'] } }, content)).toEqual([]);
  });
});
