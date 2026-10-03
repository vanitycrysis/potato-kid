import type { Content } from '../content/types';
import type { PersistedState } from '../sim/game';
import { decode, encode, SAVE_SCHEMA, validateState } from './record';
import { migrations } from './migrations';
import type { SaveStorage } from './storage';

// The save system (ENGINEERING_PLAN.md §4): two slots, A and B; writes alternate between
// them and are serialized; revisions are monotonic across both slots. Bytes the game
// can't use (corrupt, or a valid save whose migration failed) are *protected*: never
// written over until archived and read back. Nothing is ever written while loading,
// and an unreadable store is never treated as empty.

export type Slot = 'A' | 'B';
const SLOTS: Slot[] = ['A', 'B'];
const slotKey = (s: Slot) => `slot${s}`;

/**
 * `normal`: saves are written. `unsaved`: playable, but no writes this session (unreadable
 * storage, or no safe slot to write). `readOnly`: a save from a newer app exists; never
 * write, ask the player to update.
 */
export type SaveMode = 'loading' | 'normal' | 'unsaved' | 'readOnly';

export interface LoadResult {
  /** The loaded game, or null to start a new one. */
  state: PersistedState | null;
  mode: SaveMode;
  /** Shown once: an older save was loaded while a newer one is kept safe. */
  olderSaveLoaded: boolean;
}

/** One migration step: state at schema n → schema n+1. Throw if it can't be migrated. */
export type Migration = (state: unknown) => unknown;

export interface SaveOptions {
  /** Schema this build writes (tests use a later one to exercise migrations). */
  schema?: number;
  /** `migrations[n]` upgrades schema n to n+1. */
  migrations?: Record<number, Migration>;
  now?: () => number;
}

interface SlotInfo {
  slot: Slot;
  raw: string | null;
  kind: 'empty' | 'valid' | 'corrupt' | 'future';
  revision: number;
  schema: number;
  state?: unknown;
}

export class SaveManager {
  private modeValue: SaveMode = 'loading';
  /** The slot holding the save currently in play; writes go to the other one. */
  private current: Slot | null = null;
  private readonly protectedSlots = new Set<Slot>();
  /** Highest revision ever seen in either slot (plan §4), so revisions never repeat. */
  private maxRevision = 0;
  private queue: Promise<void> = Promise.resolve();
  private failures = 0;
  private readonly schema: number;
  private readonly migrations: Record<number, Migration>;
  private readonly now: () => number;

  constructor(
    private readonly storage: SaveStorage,
    private readonly content: Content,
    options: SaveOptions = {},
  ) {
    this.schema = options.schema ?? SAVE_SCHEMA;
    this.migrations = options.migrations ?? migrations(content);
    this.now = options.now ?? (() => Date.now());
  }

  get mode(): SaveMode {
    return this.modeValue;
  }

  /** Three saves in a row failed: the player sees the "can't save" banner (plan §4). */
  get failing(): boolean {
    return this.failures >= 3;
  }

  /** Loads the best usable save (plan §4 steps 1–5). Reconciling and the first save are the caller's. */
  async load(): Promise<LoadResult> {
    let infos: SlotInfo[];
    try {
      infos = await Promise.all(SLOTS.map(async (slot) => this.classify(slot, await this.storage.read(slotKey(slot)))));
    } catch {
      // Unreadable storage is unknown, not empty: play, but never write over it.
      this.modeValue = 'unsaved';
      return { state: null, mode: this.modeValue, olderSaveLoaded: false };
    }
    for (const i of infos) this.maxRevision = Math.max(this.maxRevision, i.revision);

    const future = infos.some((i) => i.kind === 'future');
    for (const i of infos) if (i.kind === 'corrupt') this.protectedSlots.add(i.slot);

    // Migrate and validate *every* valid slot, not just until one works: an unusable one
    // must be protected even when the other slot is loaded (Codex review, PR #30).
    let loaded: { slot: Slot; revision: number; state: PersistedState } | null = null;
    const failed: SlotInfo[] = [];
    const valid = infos.filter((i) => i.kind === 'valid').sort((a, b) => b.revision - a.revision);
    for (const i of valid) {
      const state = this.migrate(i);
      if (!state) {
        this.protectedSlots.add(i.slot); // a save we can't use: keep it safe
        failed.push(i);
      } else if (!loaded) {
        loaded = { slot: i.slot, revision: i.revision, state };
      }
    }
    // A torn write is most likely the newest, so a corrupt slot counts as newer.
    const skippedNewer = !!loaded && (infos.some((i) => i.kind === 'corrupt') || failed.some((i) => i.revision > loaded.revision));

    if (future) {
      // A newer app wrote here: never write, but the player can still play this session.
      this.modeValue = 'readOnly';
      return { state: loaded?.state ?? null, mode: this.modeValue, olderSaveLoaded: false };
    }

    // Archive every protected slot's exact bytes; only a verified archive frees the slot.
    for (const i of infos) if (this.protectedSlots.has(i.slot) && i.raw !== null) await this.archive(i);

    this.current = loaded?.slot ?? null;
    if (valid.length > 0 && !loaded) {
      // Saves exist but none could be used: don't risk writing until a later version can read them.
      this.modeValue = 'unsaved';
    } else {
      this.modeValue = this.target() ? 'normal' : 'unsaved';
    }
    return { state: loaded?.state ?? null, mode: this.modeValue, olderSaveLoaded: skippedNewer };
  }

  /**
   * Queues a save of `state`. Ignored until loading has resolved and in unsaved/read-only
   * modes. A failure is retried at the next trigger; three in a row raise `failing`.
   */
  save(state: PersistedState): Promise<void> {
    if (this.modeValue !== 'normal') return this.queue;
    const revision = ++this.maxRevision;
    const savedAt = this.now();
    const text = encode(this.schema, revision, savedAt, state);
    // Out-of-order writes (plan §4) can't happen: writes run one at a time in revision
    // order, and a failed write is never retried; the next save carries a new revision.
    this.queue = this.queue.then(async () => {
      const target = this.target();
      if (!target) {
        this.modeValue = 'unsaved';
        return;
      }
      try {
        await this.storage.write(slotKey(target), text);
        this.current = target;
        this.failures = 0;
      } catch {
        this.failures++;
      }
    });
    return this.queue;
  }

  /** The slot the next write goes to: not the one in play, and never a protected one. */
  private target(): Slot | null {
    const other = SLOTS.find((s) => s !== this.current) ?? null;
    if (this.current === null) return SLOTS.find((s) => !this.protectedSlots.has(s)) ?? null;
    return other && !this.protectedSlots.has(other) ? other : null;
  }

  private classify(slot: Slot, raw: string | null): SlotInfo {
    const info: SlotInfo = { slot, raw, kind: 'empty', revision: 0, schema: 0 };
    if (raw === null) return info;
    // A newer app's record is recognised by its schema alone: a future version may change
    // the checksum or envelope, and such a save must never be treated as corrupt (and
    // archived, then overwritten).
    const schema = peekSchema(raw);
    if (schema !== null && schema > this.schema) return { ...info, kind: 'future', schema };
    const rec = decode(raw);
    if (!rec) return { ...info, kind: 'corrupt' };
    const base = { ...info, revision: rec.revision, schema: rec.schema, state: rec.state };
    if (rec.schema > this.schema) return { ...base, kind: 'future' };
    return { ...base, kind: 'valid' };
  }

  /** Migrates in schema order, then validates; null if either fails. */
  private migrate(i: SlotInfo): PersistedState | null {
    let state = i.state;
    try {
      for (let v = i.schema; v < this.schema; v++) {
        const step = this.migrations[v];
        if (!step) return null;
        state = step(state);
      }
    } catch {
      return null;
    }
    return validateState(state, this.content).length === 0 ? (state as PersistedState) : null;
  }

  /** Stores the slot's exact bytes under an archive key and reads them back (plan §4). */
  private async archive(i: SlotInfo): Promise<void> {
    const key = `archive/${i.slot}-r${i.revision}-${this.now()}`;
    try {
      await this.storage.write(key, i.raw!);
      if ((await this.storage.read(key)) === i.raw) this.protectedSlots.delete(i.slot);
    } catch {
      // Stays protected: the slot is never written this session.
    }
  }
}

/** The record's schema number, if the text parses as an object with one. */
function peekSchema(raw: string): number | null {
  try {
    const o = JSON.parse(raw) as { schema?: unknown };
    return typeof o?.schema === 'number' && Number.isInteger(o.schema) ? o.schema : null;
  } catch {
    return null;
  }
}
