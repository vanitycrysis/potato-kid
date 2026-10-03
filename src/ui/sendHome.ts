import { uiData } from '../content/artData';
import type { Game } from '../sim/game';
import type { SettingsStore } from '../save/settings';

// Send home's success copy (D-048, docs/GUI_MVP.md §13.3, Codex's words): the first success
// in this profile explains where the kid went; later ones are short. Shared by the world
// card and the Dex's inline status, so the explanation is given once, wherever it lands.

interface FeedbackTokens {
  heading: string;
  firstBuilt: [string, string];
  firstUnbuilt: [string, string];
  later: string;
  firstVisibleMs: number;
  laterVisibleMs: number;
}

const tokens = (): FeedbackTokens | undefined => (uiData?.mvp as { sendHome?: { feedback: FeedbackTokens } } | undefined)?.sendHome?.feedback;

export class SendHomeNotes {
  /** A first explanation is waiting to be shown; until then, no other success claims one. */
  private firstQueued = false;

  constructor(
    private readonly settings: SettingsStore,
    private readonly game: Game,
  ) {}

  heading(name: string): string {
    return (tokens()?.heading ?? '{full kid name} went home.').replace('{full kid name}', name);
  }

  /** At queue time: whether this success carries the first explanation. */
  claimFirst(): boolean {
    if (this.settings.value.sendHomeExplained || this.firstQueued) return false;
    this.firstQueued = true;
    return true;
  }

  /** The first explanation's lines, chosen by whether the Compendium is built *now*. */
  firstLines(): [string, string] {
    const t = tokens();
    const built = this.game.state.buildings.compendium > 0;
    return (built ? t?.firstBuilt : t?.firstUnbuilt) ?? ['', ''];
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
    this.settings.set({ sendHomeExplained: true });
  }

  later(): string {
    return tokens()?.later ?? '';
  }

  visibleMs(first: boolean): number {
    return (first ? tokens()?.firstVisibleMs : tokens()?.laterVisibleMs) ?? 2500;
  }
}
