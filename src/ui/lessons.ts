import type { Balance } from '../content/types';
import type { Game, GameEvent, LessonId, Lessons } from '../sim/game';

// The affordability lessons (D-086, docs/GUI_MVP.md §27.2-27.3, Codex's design and copy): one
// quiet note per mechanic, queued when it first becomes relevant, only after the player's first
// fusion discovery. These are the rules; the notes themselves are drawn by `lessonNotes.ts`.

/** The twelve lessons, in the table's order (§27.2): ties in the queue go by this. */
export const LESSON_IDS: readonly LessonId[] = ['planting', 'potatokens', 'garden', 'capacity', 'naming', 'bias', 'fields', 'feeding', 'plot-space', 'field-space', 'compendium', 'returns'];

/** A new save's lessons: no introduction yet, nothing seen or waiting, the gate closed. */
export function freshLessons(): Lessons {
  return { version: 2, intro: 'notStarted', introPage: 1, seen: [], pending: [], firstFusion: false };
}

/**
 * Which lessons' mechanics are relevant now (§27.2), by the authoritative costs and the actual
 * balances; the shared first-fusion gate and the seen/pending sets are not checked here.
 */
export function relevantNow(game: Game, b: Balance): Set<LessonId> {
  const s = game.state;
  const M = s.materials;
  const P = s.potatokens;
  const out = new Set<LessonId>();
  const mapKids = s.world.kids.filter((k) => !k.held).length;
  const live = s.world.kids.length + s.fields.reduce((n, f) => n + f.workers.length, 0) > 0;
  const affords = (cost: number | null) => cost !== null && M >= cost;

  // A plot empty or still filling that the kids on the map can bring to minKids.
  const minKids = b.planting.minKids;
  if (s.plots.some((p) => !p.seed?.sprout && (p.seed?.planted.length ?? 0) + mapKids >= minKids)) out.add('planting');
  if (P >= b.economy.instantSpawnPotatokens) out.add('potatokens');
  if (affords(game.upgradeCost('garden'))) out.add('garden');
  if (affords(game.upgradeCost('capacity'))) out.add('capacity');
  if (live && M >= b.naming.price) out.add('naming');
  if (affords(game.upgradeCost('bias'))) out.add('bias');
  if (s.fields.length === 0 && affords(game.fieldUnlockCost)) out.add('fields');
  // A bite in the pantry that some kid on the map or in a field doesn't hate.
  const kidTypes = new Set([...s.world.kids.map((k) => k.type), ...s.fields.flatMap((f) => f.workers.map((w) => w.type))]);
  const foods = Object.entries(s.pantry).filter(([, n]) => n >= 1).map(([f]) => f);
  if ([...kidTypes].some((t) => foods.some((f) => game.likes(t)?.hatedFood !== f))) out.add('feeding');
  if (affords(game.plotUnlockCost)) out.add('plot-space');
  if (s.fields.length >= 1 && affords(game.fieldUnlockCost)) out.add('field-space');
  if (s.buildings.compendium === 0 && affords(game.upgradeCost('compendium'))) out.add('compendium');
  if (s.buildings.compendium >= 1) {
    const ordinary = s.discoveredKids.filter((t) => !game.isSpecial(t) && !game.isRare(t));
    if (ordinary.some((t) => M >= game.respawnCost(t).materials || P >= game.respawnCost(t).potatokens)) out.add('returns');
  }
  return out;
}

/**
 * After a committed change (§27.3): once the gate is open, every lesson newly relevant joins
 * the queue in table order; one already seen or waiting is left as it is. Returns those added.
 */
export function enqueue(l: Lessons, relevant: Set<LessonId>): LessonId[] {
  if (!l.firstFusion) return [];
  const added = LESSON_IDS.filter((id) => relevant.has(id) && !l.seen.includes(id) && !l.pending.includes(id));
  l.pending.push(...added);
  return added;
}

/**
 * The lesson a successful event shows the player has used (§27.3), if any: it is seen, and
 * leaves the queue unshown. A refused command is not evidence.
 */
export function usedBy(e: GameEvent): LessonId | null {
  switch (e.type) {
    case 'growing':
      return 'planting';
    case 'spawned':
      return e.source === 'instant' ? 'potatokens' : e.source === 'compendium' ? 'returns' : null;
    case 'upgraded':
      return e.building === 'garden' || e.building === 'capacity' || e.building === 'bias' || e.building === 'compendium' ? e.building : null;
    case 'named':
      return e.name === null ? null : 'naming';
    case 'fieldUnlocked':
      return e.fields === 1 ? 'fields' : 'field-space';
    case 'fed':
      return 'feeding';
    case 'plotUnlocked':
      return 'plot-space';
    default:
      return null;
  }
}

/**
 * A step's events applied to the lessons: mechanics used become seen (before the gate too), and
 * the first fusion discovery opens the gate. Returns whether the gate opened in these events.
 */
export function noteEvents(l: Lessons, events: readonly GameEvent[]): boolean {
  let opened = false;
  for (const e of events) {
    const id = usedBy(e);
    if (id) markSeen(l, id);
    if (e.type === 'fused' && e.firstDiscovery && !l.firstFusion) {
      l.firstFusion = true;
      opened = true;
    }
  }
  return opened;
}

/** Seen for good: it leaves the queue and never comes back (§27.3). */
export function markSeen(l: Lessons, id: LessonId): void {
  if (!l.seen.includes(id)) l.seen.push(id);
  l.pending = l.pending.filter((p) => p !== id);
}

/**
 * The lessons a save made before lessons existed has evidently used (§27.3 veteran migration):
 * from what it owns and stores, never from guessed lifetime totals.
 */
export function usedInSave(game: Game, b: Balance): Set<LessonId> {
  const s = game.state;
  const out = new Set<LessonId>();
  if (s.plots.some((p) => p.seed)) out.add('planting');
  if (s.buildings.garden > b.buildings.garden.startLevel) out.add('garden');
  if (s.buildings.capacity > b.buildings.capacity.startLevel) out.add('capacity');
  if (s.buildings.bias > b.buildings.bias.startLevel || s.biasTarget !== null) out.add('bias');
  if (s.buildings.compendium >= 1) out.add('compendium');
  if (s.fields.length >= 1) out.add('fields');
  if (s.fields.length >= 2) out.add('field-space');
  if (s.plots.length > b.planting.startPlots) out.add('plot-space');
  const named = (k: { name?: string }) => !!k.name;
  if (s.world.kids.some(named) || s.plots.some((p) => p.seed?.planted.some(named)) || s.fields.some((f) => f.workers.some(named))) out.add('naming');
  if (s.world.kids.some((k) => k.happy) || s.plots.some((p) => p.seed?.planted.some((k) => k.happiness))) out.add('feeding');
  return out;
}

/**
 * A save from before lessons (§27.3 migration): a finished or skipped first-run tutorial counts
 * as a finished introduction; one in progress, or none at all, starts the short one at page 1.
 * Lessons already relevant or already used are seen, so an old save gets no flood; the rest wait
 * for their trigger. The gate is open if any recipe was ever found.
 */
export function adoptLegacy(game: Game, b: Balance, v1: 'notStarted' | 'inProgress' | 'skipped' | 'completed' | null): Lessons {
  const l = freshLessons();
  l.intro = v1 === 'completed' || v1 === 'skipped' ? v1 : 'notStarted';
  l.firstFusion = game.state.discoveredRecipes.length > 0;
  const seen = new Set([...relevantNow(game, b), ...usedInSave(game, b)]);
  l.seen = LESSON_IDS.filter((id) => seen.has(id));
  return l;
}
