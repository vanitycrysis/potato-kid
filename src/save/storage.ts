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

/** Browser storage (the web build). The Android build may swap in a native backend. */
export class LocalStorage implements SaveStorage {
  constructor(private readonly prefix = 'potato-kid/') {}

  read(key: string): Promise<string | null> {
    return new Promise((resolve) => resolve(localStorage.getItem(this.prefix + key)));
  }

  write(key: string, value: string): Promise<void> {
    return new Promise((resolve) => {
      localStorage.setItem(this.prefix + key, value);
      resolve();
    });
  }
}
