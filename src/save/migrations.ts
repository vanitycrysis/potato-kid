import type { Content } from '../content/types';
import type { Migration } from './manager';

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
        if (k.variant === 'mini' && k.look) k.look.scale *= content.balance.planting.miniScale;
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
  };
}
