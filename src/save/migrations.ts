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
    3: (state) => {
      const s = state as { world?: { kids?: { type: string; variant?: string }[] }; plots?: { seed: { planted: { type: string; variant?: string }[] } | null }[] };
      const found: Record<string, string[]> = {};
      const rares = [...(s.world?.kids ?? []), ...(s.plots ?? []).flatMap((p) => p.seed?.planted ?? [])];
      for (const k of rares) if (k.variant && !(found[k.type] ??= []).includes(k.variant)) found[k.type]!.push(k.variant);
      return { ...(state as object), discoveredVariants: found };
    },
  };
}
