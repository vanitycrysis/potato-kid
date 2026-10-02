import { BUILDING_IDS, type Content } from '../content/types';
import type { PersistedState } from '../sim/game';

// Save records (ENGINEERING_PLAN.md §4): `{ schema, revision, savedAt, state, checksum }`,
// stored as JSON. The checksum catches torn or edited writes; state validation catches
// anything that parses but can't be played.

/** The save schema this build writes. Bump it with a migration for every format change. */
export const SAVE_SCHEMA = 1;

export interface SaveRecord {
  schema: number;
  /** Monotonic across both slots, including protected ones (plan §4). */
  revision: number;
  /** Wall-clock ms when written. */
  savedAt: number;
  state: unknown;
  checksum: string;
}

/** FNV-1a, 32-bit: enough to detect corruption (this is not a security boundary). */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function body(r: Omit<SaveRecord, 'checksum'>): string {
  return JSON.stringify([r.schema, r.revision, r.savedAt, r.state]);
}

export function encode(schema: number, revision: number, savedAt: number, state: PersistedState): string {
  const r = { schema, revision, savedAt, state };
  return JSON.stringify({ ...r, checksum: checksum(body(r)) });
}

/** Parses and checks the envelope and checksum; the state is checked separately (after migration). */
export function decode(raw: string): SaveRecord | null {
  let r: unknown;
  try {
    r = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof r !== 'object' || r === null) return null;
  const o = r as Record<string, unknown>;
  const int = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0;
  if (!int(o.schema) || !int(o.revision) || typeof o.savedAt !== 'number' || !Number.isFinite(o.savedAt)) return null;
  if (typeof o.checksum !== 'string' || !('state' in o)) return null;
  const rec = o as unknown as SaveRecord;
  return checksum(body(rec)) === rec.checksum ? rec : null;
}

/**
 * State validation (plan §4): types, finite numbers, known kid IDs, kid IDs below
 * `nextKidId`. Returns problems; empty means the state can be played.
 */
export function validateState(state: unknown, content: Content): string[] {
  const p: string[] = [];
  if (typeof state !== 'object' || state === null) return ['state is not an object'];
  const s = state as Record<string, unknown>;
  const kidIds = new Set(content.kids.map((k) => k.id));
  const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const uint32 = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
  const whole = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0;

  for (const k of ['rngState', 'cosmeticRngState', 'spawnRngState'] as const) if (!uint32(s[k])) p.push(`${k} is not a uint32`);
  if (!finite(s.spawnProgress) || (s.spawnProgress as number) < 0) p.push('spawnProgress is invalid');
  if (!finite(s.materials) || (s.materials as number) < 0) p.push('materials is invalid');
  if (!whole(s.potatokens)) p.push('potatokens is invalid');
  if (!whole(s.milestonesPaid)) p.push('milestonesPaid is invalid');
  if (!finite(s.accountedUntil)) p.push('accountedUntil is invalid');
  if (s.biasTarget !== null && !(typeof s.biasTarget === 'string' && s.biasTarget in content.balance.spawnWeights)) p.push('biasTarget is invalid');
  if (!Array.isArray(s.discoveredKids) || !s.discoveredKids.every((k) => typeof k === 'string' && kidIds.has(k))) p.push('discoveredKids has unknown kids');
  if (!Array.isArray(s.discoveredRecipes) || !s.discoveredRecipes.every((k) => typeof k === 'string')) p.push('discoveredRecipes is invalid');

  const b = s.buildings as Record<string, unknown> | undefined;
  if (typeof b !== 'object' || b === null) p.push('buildings is missing');
  else {
    for (const id of BUILDING_IDS) {
      const lv = b[id];
      if (!whole(lv) || (lv as number) > content.balance.buildings[id].maxLevel) p.push(`building ${id} level is invalid`);
    }
  }

  const w = s.world as Record<string, unknown> | undefined;
  if (typeof w !== 'object' || w === null || !Array.isArray(w.kids) || !whole(w.nextKidId)) return [...p, 'world is invalid'];
  const next = w.nextKidId as number;
  const seen = new Set<number>();
  const kinds = new Set(['walk', 'pause', 'look', 'wave', 'sit', 'sleep']);
  for (const raw of w.kids as unknown[]) {
    const k = raw as Record<string, unknown>;
    if (typeof k !== 'object' || k === null) {
      p.push('a kid is not an object');
      continue;
    }
    const id = k.id;
    if (!whole(id) || (id as number) >= next || seen.has(id as number)) p.push(`kid id ${String(id)} is invalid or duplicated`);
    else seen.add(id as number);
    if (typeof k.type !== 'string' || !kidIds.has(k.type)) p.push(`kid ${String(id)} has unknown type ${String(k.type)}`);
    for (const f of ['x', 'y', 'heading', 'grace'] as const) if (!finite(k[f])) p.push(`kid ${String(id)} ${f} is not finite`);
    const a = k.activity as Record<string, unknown> | undefined;
    if (typeof a !== 'object' || a === null || typeof a.kind !== 'string' || !kinds.has(a.kind)) p.push(`kid ${String(id)} activity is invalid`);
    else for (const f of ['left', 'total'] as const) if (f in a && !finite(a[f])) p.push(`kid ${String(id)} activity ${f} is not finite`);
    const look = k.look as Record<string, unknown> | undefined;
    if (typeof look !== 'object' || look === null || typeof look.body !== 'string' || typeof look.face !== 'string' || !finite(look.scale)) {
      p.push(`kid ${String(id)} look is invalid`);
    }
    const box = k.box as Record<string, unknown> | undefined;
    if (typeof box !== 'object' || box === null || !(['left', 'top', 'right', 'bottom'] as const).every((f) => finite(box[f]))) {
      p.push(`kid ${String(id)} box is invalid`);
    }
  }
  return p;
}
