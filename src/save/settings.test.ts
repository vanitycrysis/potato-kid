import { describe, expect, it } from 'vitest';
import { parseSettings, SettingsStore } from './settings';
import { MemoryStorage, type SaveStorage } from './storage';

const DEFAULTS = { audio: true, music: 70, sfx: 80, sendHomeExplained: false };

describe('settings', () => {
  it('fills missing or invalid fields from the defaults, and clamps volumes', () => {
    expect(parseSettings(null, DEFAULTS)).toEqual(DEFAULTS);
    expect(parseSettings('not json', DEFAULTS)).toEqual(DEFAULTS);
    expect(parseSettings('[1,2]', DEFAULTS)).toEqual(DEFAULTS);
    expect(parseSettings('{"audio":"no","music":140,"sfx":-3}', DEFAULTS)).toEqual({ audio: true, music: 100, sfx: 0, sendHomeExplained: false });
    expect(parseSettings('{"audio":false,"music":33.6,"sendHomeExplained":true}', DEFAULTS)).toEqual({ audio: false, music: 34, sfx: 80, sendHomeExplained: true });
  });

  it('round-trips through storage', async () => {
    const storage = new MemoryStorage();
    const a = new SettingsStore(storage, DEFAULTS);
    await a.load();
    a.set({ audio: false });
    a.set({ music: 12 });
    await a.flushed();
    const b = new SettingsStore(storage, DEFAULTS);
    await b.load();
    expect(b.value).toEqual({ audio: false, music: 12, sfx: 80, sendHomeExplained: false });
  });

  it('keeps the defaults when storage fails, and survives failed writes', async () => {
    const broken: SaveStorage = { read: () => Promise.reject(new Error('io')), write: () => Promise.reject(new Error('io')) };
    const s = new SettingsStore(broken, DEFAULTS);
    await s.load();
    expect(s.value).toEqual(DEFAULTS);
    s.set({ sfx: 5 });
    await s.flushed();
    expect(s.value.sfx).toBe(5);
  });

  it('writes nothing while not persisting (a read-only save)', async () => {
    const storage = new MemoryStorage();
    const s = new SettingsStore(storage, DEFAULTS, false);
    s.set({ music: 1 });
    await s.flushed();
    expect(s.value.music).toBe(1);
    expect(storage.data.size).toBe(0);
  });
});
