import type { Content } from '../content/types';
import type { Migration } from './manager';

/** Mini's size when schema 4 shipped (D-062); the balance no longer has it (D-072). */
const MINI_SCALE_V4 = 0.72;

/** Where the Garden moved from map v2 to v3 (D-071): (1080, 620) to (2160, 3500). */
const V3_GARDEN_SHIFT = { x: 1080, y: 2880 };

/**
 * `migrations(content)[n]` upgrades a schema-n state to n+1 (plan §4). A shipped step is
 * never edited: a new format adds the next one and bumps SAVE_SCHEMA.
 */
export function migrations(content: Content): Record<number, Migration> {
  return {
    // Schema 2 (D-052): the Garden counts its spawns for the tutorial. A schema-1 save was
    // played on the old fast schedule, so it starts past the tutorial.
    1: (state) => ({ ...(state as object), gardenSpawns: content.balance.spawn.tutorialSpawns }),
    // Schema 3 (D-054): planting replaces Send home; the game starts with its first plots, empty.
    2: (state) => ({ ...(state as object), plots: Array.from({ length: content.balance.planting.startPlots }, () => ({ seed: null })) }),
    // Schema 4 (D-062): the Dex records rare variants found. A schema-3 save may already hold
    // rares, on the map or planted: they count as found. A seed's hidden result does not.
    // A Mini from before shrinks now, once, like a new one: its look (the box follows it on
    // load), on the map or planted (Codex review, PR #77).
    3: (state) => {
      type Rare = { type: string; variant?: string; look?: { scale: number } };
      const s = structuredClone(state) as { world?: { kids?: Rare[] }; plots?: { seed: { planted: Rare[] } | null }[] };
      const found: Record<string, string[]> = {};
      const rares = [...(s.world?.kids ?? []), ...(s.plots ?? []).flatMap((p) => p.seed?.planted ?? [])];
      for (const k of rares) {
        if (k.variant && !(found[k.type] ??= []).includes(k.variant)) found[k.type]!.push(k.variant);
        if (k.variant === 'mini' && k.look) k.look.scale *= MINI_SCALE_V4;
      }
      return { ...(s as object), discoveredVariants: found };
    },
    // Schema 5 (D-056, D-057): kids may carry a name and happiness, and a planted kid whether
    // it was happy. Nothing to add: a schema-4 save has none. The bump keeps an older build
    // from loading a save it can't read.
    4: (state) => state,
    // Schema 6 (D-074): a planted kid can come back to the map, so it keeps an id. Kids
    // planted before had theirs dropped: they get new ones, past every id in use.
    5: (state) => {
      const s = structuredClone(state) as { world?: { nextKidId?: number }; plots?: { seed: { planted: { id?: number }[] } | null }[] };
      for (const plot of s.plots ?? []) for (const k of plot.seed?.planted ?? []) if (s.world && typeof s.world.nextKidId === 'number') k.id = s.world.nextKidId++;
      return s;
    },
    // Schema 7 (D-072): ten rare kid types replace the rare variants. A variant kid becomes an
    // ordinary kid of its type, on the map or planted, at its normal size (a Mini grows back),
    // and a seed decided as a variant sprouts its type, ordinary. The record of variants found
    // goes; what the Dex knows of the types themselves stays.
    6: (state) => {
      type Variant = { variant?: unknown; look?: { scale: number } };
      const s = structuredClone(state) as {
        discoveredVariants?: unknown;
        world?: { kids?: Variant[] };
        plots?: { seed: { planted: Variant[]; sprout: Variant | null } | null }[];
      };
      const strip = (k: Variant) => {
        if (k.variant === 'mini' && k.look) k.look.scale /= MINI_SCALE_V4;
        delete k.variant;
      };
      for (const k of s.world?.kids ?? []) strip(k);
      for (const plot of s.plots ?? []) {
        for (const k of plot.seed?.planted ?? []) strip(k);
        if (plot.seed?.sprout) delete plot.seed.sprout.variant;
      }
      delete s.discoveredVariants;
      return s;
    },
    // Schema 8 (D-071): the world grows from about 2 × 2 screens to 4 × 4 (map v3), with the
    // Garden in its middle. Kids on the map move with the Garden, so they stay where they
    // were relative to it: (1080, 620) in v2, (2160, 3500) in v3. Planted kids have no
    // position. The current map's scenery may now stand where a kid is: loading moves it.
    7: (state) => {
      const s = structuredClone(state) as { world?: { kids?: { x: number; y: number }[] } };
      for (const k of s.world?.kids ?? []) {
        k.x += V3_GARDEN_SHIFT.x;
        k.y += V3_GARDEN_SHIFT.y;
      }
      return s;
    },
  };
}
