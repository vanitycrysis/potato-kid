import type { KidId } from '../content/types';
import type { GameEvent, RejectReason } from '../sim/game';

// Feedback cards from one sim step's events (docs/GUI_MVP.md §9). Pure: the HUD decides
// when and where to show them. Events arrive in the sim's order, so awards that follow a
// fusion belong to that fusion's card until the next birth.

export type FeedbackItem =
  /** A recipe's first discovery; `newKid` when the child type is new to the Dex too. */
  | { kind: 'discovery'; childType: KidId; kidId?: number; newKid: boolean; potatokens: number; milestone: number }
  /** A kid type first seen from the Garden or Compendium (no recipe, no invented reward). */
  | { kind: 'newKid'; childType: KidId; kidId?: number; milestone: number }
  /** A discovery award with no matching fusion in the batch. */
  | { kind: 'recipeReward'; potatokens: number }
  | { kind: 'milestone'; potatokens: number; kids: number }
  /** Instant spawns that landed (successive ones coalesce). */
  | { kind: 'arrival'; count: number }
  | { kind: 'refusal'; command: string; reason: RejectReason };

/**
 * Builds the cards for one step. `known` is the Dex before the step; it is updated so the
 * next batch sees this one's discoveries. `discovered` is the Dex size after the step.
 */
export function feedbackFor(events: GameEvent[], known: Set<KidId>, discovered: number): FeedbackItem[] {
  const out: FeedbackItem[] = [];
  let current: Extract<FeedbackItem, { kind: 'discovery' | 'newKid' }> | null = null;
  for (const e of events) {
    switch (e.type) {
      case 'fused': {
        const newKid = !known.has(e.child.type);
        known.add(e.child.type);
        if (e.firstDiscovery) {
          current = { kind: 'discovery', childType: e.child.type, kidId: e.child.id, newKid, potatokens: 0, milestone: 0 };
          out.push(current);
        } else {
          // A repeat recipe gets no card; its awards (none expected) attach to nothing.
          current = null;
        }
        break;
      }
      case 'spawned': {
        if (!known.has(e.kid.type)) {
          known.add(e.kid.type);
          current = { kind: 'newKid', childType: e.kid.type, kidId: e.kid.id, milestone: 0 };
          out.push(current);
        } else {
          current = null;
        }
        if (e.source === 'instant') {
          const last = out[out.length - 1];
          if (last?.kind === 'arrival') last.count++;
          else out.push({ kind: 'arrival', count: 1 });
        }
        break;
      }
      case 'earned':
        if (e.reason === 'discovery') {
          if (current?.kind === 'discovery') current.potatokens += e.potatokens;
          else out.push({ kind: 'recipeReward', potatokens: e.potatokens });
        } else if (current) {
          current.milestone += e.potatokens;
        } else {
          // Successive milestone-only awards collapse into one total.
          const last = out[out.length - 1];
          if (last?.kind === 'milestone') last.potatokens += e.potatokens;
          else out.push({ kind: 'milestone', potatokens: e.potatokens, kids: discovered });
        }
        break;
      case 'rejected':
        out.push({ kind: 'refusal', command: e.command, reason: e.reason });
        break;
      default:
        break;
    }
  }
  return out;
}

/**
 * Player-facing refusal copy (GUI_MVP §9). Rejected events carry no context, so the caller
 * passes what it sent: `command` picks the locked building, `currency` disambiguates cost.
 */
export function refusalText(reason: RejectReason, command?: string, currency?: 'materials' | 'potatokens'): string {
  switch (reason) {
    case 'cost':
      return currency === 'materials' ? 'Not enough Materials.' : currency === 'potatokens' ? 'Not enough Potatokens.' : 'Not enough currency.';
    case 'maxLevel':
      return 'This building is fully upgraded.';
    case 'full':
      return 'Garden is full. Make room for a kid.';
    case 'noRoom':
      return 'No clear spot by the Garden. Move a kid aside.';
    case 'locked':
      // Bias is locked until built (engine guard); the Compendium locks respawns.
      return command === 'setBias' ? 'Build Spawn bias first.' : 'Build the Compendium first.';
    case 'undiscovered':
      return 'Discover this kid first.';
    case 'notSpawnable':
      return 'This kid can’t be favoured by the Garden.';
  }
}
