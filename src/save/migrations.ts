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
  };
}
