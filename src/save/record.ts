import { storedNameOk } from '../sim/names';
import { BUILDING_IDS, type Content } from '../content/types';
import type { PersistedState } from '../sim/game';

// Save records (ENGINEERING_PLAN.md §4): `{ schema, revision, savedAt, state, checksum }`,
// stored as JSON. The checksum catches torn or edited writes; state validation catches
// anything that parses but can't be played.

/** The save schema this build writes. Bump it with a migration for every format change. */
export const SAVE_SCHEMA = 9;

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
  if (!whole(s.gardenSpawns)) p.push('gardenSpawns is invalid');
  // Plots (D-061): one to maxPlots, each empty or a seed: the kids planted (known types, at
  // most maxKids) and, once started, its sprout and how long it has grown.
  const plan = content.balance.planting;
  /** Planted kids' ids (D-074), checked against the map's below. */
  const plantedIds: unknown[] = [];
  if (!Array.isArray(s.plots) || s.plots.length < 1 || s.plots.length > plan.maxPlots) p.push('plots is invalid');
  else {
    s.plots.forEach((raw: unknown, i) => {
      const plot = raw as Record<string, unknown> | null;
      if (typeof plot !== 'object' || plot === null || !('seed' in plot)) return void p.push(`plot ${i} is invalid`);
      const seed = plot.seed as Record<string, unknown> | null;
      if (seed === null) return;
      if (typeof seed !== 'object') return void p.push(`plot ${i} seed is invalid`);
      // Each kid as planted: its id, a known type, a look, and the name and happiness it takes
      // back to the map if it comes out (D-074). Rare variants are retired (D-072).
      const plantedOk = (k: unknown) => {
        const o = k as Record<string, unknown> | null;
        const look = o?.look as Record<string, unknown> | undefined;
        const h = o?.happiness as Record<string, unknown> | undefined;
        if (typeof o === 'object' && o !== null) plantedIds.push(o.id);
        return (
          typeof o === 'object' &&
          o !== null &&
          typeof o.type === 'string' &&
          kidIds.has(o.type) &&
          typeof look === 'object' &&
          look !== null &&
          typeof look.body === 'string' &&
          typeof look.face === 'string' &&
          finite(look.scale) &&
          (look.scale as number) > 0 &&
          !('variant' in o) &&
          (!('happy' in o) || o.happy === true) &&
          (!('name' in o) || (typeof o.name === 'string' && storedNameOk(o.name, content.balance.naming.maxLength))) &&
          (!('happiness' in o) ||
            (o.happy === true && typeof h === 'object' && h !== null && finite(h.left) && (h.left as number) > 0 && (h.left as number) <= content.balance.feeding.favouriteSeconds && typeof h.favourite === 'boolean'))
        );
      };
      const planted = seed.planted;
      if (!Array.isArray(planted) || planted.length < 1 || planted.length > plan.maxKids || !planted.every(plantedOk)) {
        p.push(`plot ${i} planted kids are invalid`);
      }
      if (!finite(seed.grown) || (seed.grown as number) < 0 || (seed.grown as number) > plan.growSeconds) p.push(`plot ${i} seed grown is invalid`);
      const sprout = seed.sprout as Record<string, unknown> | null;
      if (sprout === null) {
        if (seed.grown !== 0) p.push(`plot ${i} grew before it started`);
        return;
      }
      if (typeof sprout !== 'object' || typeof sprout.type !== 'string' || !kidIds.has(sprout.type) || 'variant' in sprout) p.push(`plot ${i} sprout is invalid`);
      else if (Array.isArray(planted) && planted.length < plan.minKids) p.push(`plot ${i} started with too few kids`);
    });
  }
  // Fields (D-069): up to maxFields, each a known food or none, its farming kids (as planted
  // kids are kept: id, known type, look, name, happiness), and progress below one bite.
  const fm = content.balance.farming;
  const foodIds = new Set(content.balance.feeding.foods.map((f) => f.id));
  if (!Array.isArray(s.fields) || s.fields.length > fm.maxFields) p.push('fields is invalid');
  else {
    s.fields.forEach((raw: unknown, i) => {
      const f = raw as Record<string, unknown> | null;
      if (typeof f !== 'object' || f === null) return void p.push(`field ${i} is invalid`);
      if (f.food !== null && !(typeof f.food === 'string' && foodIds.has(f.food))) p.push(`field ${i} food is invalid`);
      if (!finite(f.progress) || (f.progress as number) < 0 || (f.progress as number) >= 1) p.push(`field ${i} progress is invalid`);
      const workers = f.workers;
      const workerOk = (k: unknown) => {
        const o = k as Record<string, unknown> | null;
        const look = o?.look as Record<string, unknown> | undefined;
        const h = o?.happiness as Record<string, unknown> | undefined;
        if (typeof o === 'object' && o !== null) plantedIds.push(o.id);
        return (
          typeof o === 'object' &&
          o !== null &&
          typeof o.type === 'string' &&
          kidIds.has(o.type) &&
          typeof look === 'object' &&
          look !== null &&
          typeof look.body === 'string' &&
          typeof look.face === 'string' &&
          finite(look.scale) &&
          (look.scale as number) > 0 &&
          !('happy' in o) &&
          (!('name' in o) || (typeof o.name === 'string' && storedNameOk(o.name, content.balance.naming.maxLength))) &&
          (!('happiness' in o) || (typeof h === 'object' && h !== null && finite(h.left) && (h.left as number) > 0 && (h.left as number) <= content.balance.feeding.favouriteSeconds && typeof h.favourite === 'boolean'))
        );
      };
      if (!Array.isArray(workers) || workers.length > fm.kidsPerField || !workers.every(workerOk)) p.push(`field ${i} workers are invalid`);
      // Nobody farms a food it hates (D-069).
      else if (typeof f.food === 'string' && workers.some((k) => content.personality[(k as { type: string }).type]?.hatedFood === f.food)) p.push(`field ${i} has a kid farming a hated food`);
      else if (f.food === null && workers.length > 0) p.push(`field ${i} has kids but no food`);
    });
  }
  const pantry = s.pantry as Record<string, unknown> | undefined;
  if (typeof pantry !== 'object' || pantry === null || Array.isArray(pantry) || !Object.entries(pantry).every(([k, v]) => foodIds.has(k) && whole(v))) p.push('pantry is invalid');
  if (!finite(s.accountedUntil)) p.push('accountedUntil is invalid');
  if (s.biasTarget !== null && !(typeof s.biasTarget === 'string' && s.biasTarget in content.balance.spawnWeights)) p.push('biasTarget is invalid');
  if (!Array.isArray(s.discoveredKids) || !s.discoveredKids.every((k) => typeof k === 'string' && kidIds.has(k))) p.push('discoveredKids has unknown kids');
  if (!Array.isArray(s.discoveredRecipes) || !s.discoveredRecipes.every((k) => typeof k === 'string')) p.push('discoveredRecipes is invalid');
  // Rare variants are retired (D-072): a state still recording them wasn't migrated.
  if ('discoveredVariants' in s) p.push('discoveredVariants is retired');

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
    else {
      // Every rest needs its countdown, and sit/sleep their total, or the kid freezes or the
      // animation time is NaN (Codex review, PR #30).
      const needs = a.kind === 'walk' ? [] : a.kind === 'sit' || a.kind === 'sleep' ? ['left', 'total'] : ['left'];
      for (const f of needs) if (!finite(a[f]) || (a[f] as number) < 0) p.push(`kid ${String(id)} activity ${f} is missing or invalid`);
    }
    const look = k.look as Record<string, unknown> | undefined;
    if (typeof look !== 'object' || look === null || typeof look.body !== 'string' || typeof look.face !== 'string' || !finite(look.scale) || (look.scale as number) <= 0) {
      p.push(`kid ${String(id)} look is invalid`);
    }
    if ('variant' in k) p.push(`kid ${String(id)} variant is retired`);
    // A name exactly as the sim stores one: already normalized and allowed (D-057).
    if ('name' in k && !(typeof k.name === 'string' && storedNameOk(k.name, content.balance.naming.maxLength))) p.push(`kid ${String(id)} name is invalid`);
    // Happiness: time left, no more than a favourite lasts, and which kind (D-056).
    const h = k.happy as Record<string, unknown> | undefined;
    if ('happy' in k && !(typeof h === 'object' && h !== null && finite(h.left) && (h.left as number) > 0 && (h.left as number) <= content.balance.feeding.favouriteSeconds && typeof h.favourite === 'boolean')) {
      p.push(`kid ${String(id)} happy is invalid`);
    }
    const box = k.box as Record<string, unknown> | undefined;
    if (typeof box !== 'object' || box === null || !(['left', 'top', 'right', 'bottom'] as const).every((f) => finite(box[f]))) {
      p.push(`kid ${String(id)} box is invalid`);
    }
  }
  // A planted or farming kid keeps its id to come back with (D-069, D-074): one no other kid has.
  for (const id of plantedIds) {
    if (!whole(id) || (id as number) >= next || seen.has(id as number)) p.push(`planted kid id ${String(id)} is invalid or duplicated`);
    else seen.add(id as number);
  }
  return p;
}
