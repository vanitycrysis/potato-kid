import type { SaveStorage } from './storage';

// Player settings (GUI_MVP §11): kept apart from the game save, so they never touch its
// slots, checksums or schema. Audio itself arrives later; the choices are stored now.

export interface Settings {
  audio: boolean;
  /** 0-100. */
  music: number;
  /** 0-100. */
  sfx: number;
}

const KEY = 'settings';

/** A volume as a whole percentage, or the fallback if it isn't a number. */
function volume(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : fallback;
}

/** Whatever was stored, made valid field by field over the defaults. */
export function parseSettings(text: string | null, defaults: Settings): Settings {
  let raw: Partial<Record<keyof Settings, unknown>> = {};
  try {
    const v: unknown = text === null ? {} : JSON.parse(text);
    if (v && typeof v === 'object') raw = v;
  } catch {
    // Unreadable: the defaults.
  }
  return {
    audio: typeof raw.audio === 'boolean' ? raw.audio : defaults.audio,
    music: volume(raw.music, defaults.music),
    sfx: volume(raw.sfx, defaults.sfx),
  };
}

export class SettingsStore {
  private current: Settings;
  private writes: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly storage: SaveStorage,
    private readonly defaults: Settings,
    /** False while the save is read-only: changes last only for this session. */
    public persist = true,
  ) {
    this.current = { ...defaults };
  }

  get value(): Settings {
    return { ...this.current };
  }

  /** Loads stored settings; a failed read keeps the defaults (settings never block play). */
  async load(): Promise<void> {
    try {
      this.current = parseSettings(await this.storage.read(KEY), this.defaults);
    } catch {
      this.current = { ...this.defaults };
    }
  }

  /** Calls `fn` after every change (the audio runtime follows the volumes). */
  onChange(fn: () => void): void {
    this.listeners.add(fn);
  }

  /** Changes take effect at once and are written in order; a failed write is not retried. */
  set(change: Partial<Settings>): void {
    this.current = parseSettings(JSON.stringify({ ...this.current, ...change }), this.current);
    for (const fn of this.listeners) fn();
    if (!this.persist) return;
    const text = JSON.stringify(this.current);
    this.writes = this.writes.then(() => this.storage.write(KEY, text)).catch(() => {});
  }

  /** Resolves once every write so far has finished (tests). */
  flushed(): Promise<void> {
    return this.writes;
  }
}
