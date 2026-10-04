import type { SettingsStore } from '../save/settings';

// Planting's success copy (D-061, docs/GUI_MVP.md §15.6): the first add in this profile
// explains what planting does; later ones are short. Shared by the world card and the Dex's
// inline status, so the explanation is given once, wherever it lands.

const MAX_KIDS = 5;

export class PlantingNotes {
  /** A first explanation is waiting to be shown; until then, no other success claims one. */
  private firstQueued = false;

  constructor(private readonly settings: SettingsStore) {}

  /** "{name} added to Plot {n}." or, for several at once, "{added} kids added to Plot {n}." */
  heading(name: string, plot: number, added = 1): string {
    return added > 1 ? `${added} kids added to Plot ${plot + 1}.` : `${name} added to Plot ${plot + 1}.`;
  }

  /** At queue time: whether this success carries the first explanation. */
  claimFirst(): boolean {
    if (this.settings.value.plantV2Explained || this.firstQueued) return false;
    this.firstQueued = true;
    return true;
  }

  /** The first explanation (§15.6). */
  firstLines(): string[] {
    return ['Added kids leave the map. No refund.', 'Their types stay in your Potato-Dex.', 'Add 3–5 kids, then press Start growing.'];
  }

  /** A claimed first explanation will never be shown (its view went away): free it. */
  release(): void {
    this.firstQueued = false;
  }

  /**
   * The first explanation is actually visible: record the preference (never earlier).
   * Without storage it lasts the session, which is all the store can do.
   */
  markShown(): void {
    this.firstQueued = false;
    this.settings.set({ plantV2Explained: true });
  }

  /** The short line: how full the plot is now. */
  later(count: number): string {
    return `${count} / ${MAX_KIDS} kids. Start growing at 3–5.`;
  }

  visibleMs(first: boolean): number {
    return first ? 6000 : 2500;
  }
}

/**
 * A chance as shown (GUI_MVP §15.3): at most two decimals, zeroes trimmed. It never claims
 * the `ceiling` unless it is exactly there: a near-ceiling chance rounds down instead.
 */
export function percent(p: number, ceiling = Infinity): string {
  let v = Math.round(p * 1e4) / 100;
  if (v >= ceiling * 100 && p < ceiling) v = Math.floor(p * 1e4) / 100;
  return `${v.toFixed(2).replace(/\.?0+$/, '')}%`;
}

/** One roll before a plot has its 3: how many more it needs (never 0%, §15.3). */
export function chance(count: number, odds: number, minKids: number, ceiling = Infinity): string {
  return count < minKids ? `Need ${minKids - count} more` : percent(odds, ceiling);
}

export interface Odds {
  count: number;
  special: number;
  rare: number;
}

/**
 * The footer lines for a plot going from its kids now to `next` (§15.3, §15.6): the
 * count, then each roll current → projected. `ceiling` holds each roll's top chance.
 */
export function oddsLines(plot: number, now: Odds, next: Odds, p: { minKids: number; maxKids: number; ceiling: { special: number; rare: number } }): [string, string, string] {
  const roll = (k: 'special' | 'rare') => `${chance(now.count, now[k], p.minKids, p.ceiling[k])} → ${chance(next.count, next[k], p.minKids, p.ceiling[k])}`;
  return [`Plot ${plot + 1}: ${now.count} → ${next.count} / ${p.maxKids}`, `Special roll: ${roll('special')}`, `Rare roll: ${roll('rare')}`];
}
