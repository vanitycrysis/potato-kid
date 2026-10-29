import type { SaveStorage } from './storage';

// Player settings (GUI_MVP §11): kept apart from the game save, so they never touch its
// slots, checksums or schema. Audio itself arrives later; the choices are stored now.

export interface Settings {
  audio: boolean;
  /** 0-100. */
  music: number;
  /** 0-100. */
  sfx: number;
  /** The first Send home explanation has been shown (GUI_MVP §13.3). */
  plantV2Explained: boolean;
  /** The first-run tutorial's progress (D-078, GUI_MVP §24.1): offered until skipped or done. */
  guidedTutorial: TutorialRecord;
  /** Nicknames under named kids on the map (D-091, §27.7); on by default. */
  showNicknames: boolean;
  /** New-kid popups not yet acknowledged, oldest first (D-087, GUI_MVP §27.5). */
  arrivals: PendingArrival[];
}

/** One saved arrival (the popup's `Meeting`). */
export interface PendingArrival {
  source: 'garden' | 'plot' | 'fusion';
  type: string;
  look: { body: string; face: string };
  isNew: boolean;
  potatokens: number;
  line: number;
}

const SOURCES = ['garden', 'plot', 'fusion'];

/** Stored arrivals made valid: anything malformed is dropped (a popup is never worth a crash). */
function arrivals(v: unknown): PendingArrival[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((a): PendingArrival[] => {
    if (!a || typeof a !== 'object') return [];
    const r = a as Record<string, unknown>;
    const look = r.look as Record<string, unknown> | null;
    if (!SOURCES.includes(r.source as string) || typeof r.type !== 'string' || !look || typeof look.body !== 'string' || typeof look.face !== 'string') return [];
    const line = typeof r.line === 'number' && Number.isInteger(r.line) ? Math.min(9, Math.max(0, r.line)) : 0;
    const potatokens = typeof r.potatokens === 'number' && Number.isFinite(r.potatokens) ? Math.max(0, Math.round(r.potatokens)) : 0;
    return [{ source: r.source as PendingArrival['source'], type: r.type, look: { body: look.body, face: look.face }, isNew: r.isNew === true, potatokens, line }];
  });
}

/** The tutorial's saved progress (§24.1, `guidedTutorial`, version 1). */
export interface TutorialRecord {
  version: 1;
  status: 'notStarted' | 'inProgress' | 'skipped' | 'completed';
  /** The step to show next, 1-8. */
  nextStep: number;
}

const TUTORIAL_STEPS = 8;
const STATUSES: readonly TutorialRecord['status'][] = ['notStarted', 'inProgress', 'skipped', 'completed'];

/** A stored tutorial record made valid, or the fallback. */
function tutorialRecord(v: unknown, fallback: TutorialRecord): TutorialRecord {
  if (!v || typeof v !== 'object') return fallback;
  const r = v as Partial<Record<keyof TutorialRecord, unknown>>;
  if (r.version !== 1 || !STATUSES.includes(r.status as TutorialRecord['status'])) return fallback;
  const step = typeof r.nextStep === 'number' && Number.isInteger(r.nextStep) ? Math.min(TUTORIAL_STEPS, Math.max(1, r.nextStep)) : 1;
  return { version: 1, status: r.status as TutorialRecord['status'], nextStep: step };
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
    plantV2Explained: typeof raw.plantV2Explained === 'boolean' ? raw.plantV2Explained : defaults.plantV2Explained,
    guidedTutorial: tutorialRecord(raw.guidedTutorial, defaults.guidedTutorial),
    showNicknames: typeof raw.showNicknames === 'boolean' ? raw.showNicknames : defaults.showNicknames,
    arrivals: raw.arrivals === undefined ? defaults.arrivals : arrivals(raw.arrivals),
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
