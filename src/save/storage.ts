import { Preferences } from '@capacitor/preferences';

/**
 * Where save bytes live. Reads and writes may fail: the save manager treats a failed
 * read as "unknown", never as "empty" (plan §4).
 */
export interface SaveStorage {
  /** The stored text, or null if the key was never written. Throws on I/O failure. */
  read(key: string): Promise<string | null>;
  /** Durably stores the text. Throws on failure. */
  write(key: string, value: string): Promise<void>;
}

/** In-memory storage, for tests and for sessions that must not touch the device. */
export class MemoryStorage implements SaveStorage {
  readonly data = new Map<string, string>();

  read(key: string): Promise<string | null> {
    return Promise.resolve(this.data.get(key) ?? null);
  }

  write(key: string, value: string): Promise<void> {
    this.data.set(key, value);
    return Promise.resolve();
  }
}

/**
 * The game's storage: Capacitor Preferences. On Android that is the app's own
 * SharedPreferences, which survive WebView cache clears; on the web it falls back to
 * localStorage.
 */
export class PreferencesStorage implements SaveStorage {
  constructor(private readonly prefix = 'potato-kid/') {}

  async read(key: string): Promise<string | null> {
    const { value } = await Preferences.get({ key: this.prefix + key });
    return value;
  }

  async write(key: string, value: string): Promise<void> {
    await Preferences.set({ key: this.prefix + key, value });
  }
}
