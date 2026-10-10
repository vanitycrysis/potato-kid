import type { KidId } from '../content/types';
import type { GameEvent, RejectReason } from '../sim/game';

// Feedback cards from one sim step's events (docs/GUI_MVP.md §9). Pure: the HUD decides
// when and where to show them. Events arrive in the sim's order, so awards that follow a
// fusion belong to that fusion's card until the next birth.

export type FeedbackItem =
  /** A recipe's first discovery; `newKid` when the child type is new to the Dex too. */
  | { kind: 'discovery'; childType: KidId; kidId?: number; newKid: boolean; potatokens: number; milestone: number }
  /** A kid type first seen from the Garden, Compendium or a plot (no recipe, no invented reward). */
  | { kind: 'newKid'; childType: KidId; kidId?: number; milestone: number }
  /** A discovery award with no matching fusion in the batch. */
  | { kind: 'recipeReward'; potatokens: number }
  | { kind: 'milestone'; potatokens: number; kids: number }
  /** Instant spawns that landed (successive ones coalesce). */
  | { kind: 'arrival'; count: number }
  | { kind: 'refusal'; command: string; reason: RejectReason }
  /** Kids added to a plot (D-061, GUI_MVP §15.6): one card per plot per step; `count` in it now. */
  | { kind: 'planted'; kidType: KidId; kidId: number; plot: number; count: number; added: number }
  /** A plot started growing (§15.6). */
  | { kind: 'growing'; plot: number }
  /** A bite accepted where no kid card showed it (§17.2): its card had closed. */
  | { kind: 'fed'; kidType: KidId; kidId: number; name: string | undefined; food: string; favourite: boolean }
  /** A name given or cleared where no kid card showed it (§18.2). */
  | { kind: 'named'; kidType: KidId; kidId: number; name: string | null }
  /** A kid started farming where no sheet said so (a drag, §22.4). */
  | { kind: 'farming'; kidType: KidId; kidId: number; name: string | undefined; field: number }
  /** Field results whose page had closed (§22): bought, a food chosen, kids back by the Garden. */
  | { kind: 'fieldUnlocked'; field: number }
  | { kind: 'fieldFood'; field: number; food: string }
  | { kind: 'unfarmed'; kidType: KidId; name: string | undefined; field: number; count: number }
  /** A known type sprouted from a plot (§15.5); a new type gets the discovery card instead. */
  | { kind: 'sprouted'; kidType: KidId; kidId: number; plot: number };

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
        if (e.source === 'sprout' && current === null && e.plot !== undefined) {
          out.push({ kind: 'sprouted', kidType: e.kid.type, kidId: e.kid.id, plot: e.plot });
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
      case 'planted': {
        // Several added at once (the picker) make one card (§15.6).
        const last = out[out.length - 1];
        if (last?.kind === 'planted' && last.plot === e.plot) {
          last.added++;
          last.count = e.count;
          last.kidId = e.kid.id;
        } else out.push({ kind: 'planted', kidType: e.kid.type, kidId: e.kid.id, plot: e.plot, count: e.count, added: 1 });
        break;
      }
      case 'growing':
        out.push({ kind: 'growing', plot: e.plot });
        break;
      case 'fed':
        out.push({ kind: 'fed', kidType: e.kid.type, kidId: e.kid.id, name: e.kid.name, food: e.food, favourite: e.favourite });
        break;
      case 'named':
        out.push({ kind: 'named', kidType: e.kid.type, kidId: e.kid.id, name: e.name });
        break;
      case 'farming':
        out.push({ kind: 'farming', kidType: e.kid.type, kidId: e.kid.id, name: e.kid.name, field: e.field });
        break;
      case 'fieldUnlocked':
        out.push({ kind: 'fieldUnlocked', field: e.fields - 1 });
        break;
      case 'fieldFood':
        out.push({ kind: 'fieldFood', field: e.field, food: e.food });
        break;
      case 'unfarmed': {
        // Kids back from one field in one step make one card.
        const last = out[out.length - 1];
        if (last?.kind === 'unfarmed' && last.field === e.field) last.count++;
        else out.push({ kind: 'unfarmed', kidType: e.kid.type, name: e.kid.name, field: e.field, count: 1 });
        break;
      }
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
    case 'gone':
      return 'This kid has already left the map.';
    case 'plotsBusy':
      return command === 'unplant' ? 'This plot is growing. Cancel it to take its kids out.' : 'All plots are growing. Try again when one is empty.';
    // GUI_MVP §15.1 and §15.4.
    case 'plotFull':
      return 'All plots are full. Start growing a filled plot first.';
    case 'changed':
      return 'This field changed. Review it again.';
    case 'tooFewKids':
      return 'Add at least 3 kids to Start growing.';
    // D-074: interim copy until LAYOUT-DESIGN settles taking kids out of plots.
    case 'ready':
      return 'This plot’s kid is ready to sprout. It can’t be cancelled now.';
    // GUI_MVP §17.2, §18.2: the sheets say these with the kid's name and the food.
    case 'hated':
      return 'This kid won’t eat that. Nothing was spent.';
    case 'invalid':
      return 'Use letters, numbers, spaces, apostrophes or hyphens.';
    case 'unchanged':
      return 'Name unchanged.';
    // Farming (GUI_MVP §22.7): the sheets name the food and field.
    case 'noFood':
      return 'There are no bites of that food left. Grow more in a field.';
    case 'noCrop':
      return 'Choose a food for this field before assigning kids.';
    case 'fieldFull':
      return 'This field is full. Take a farming kid back, then try again.';
  }
}
