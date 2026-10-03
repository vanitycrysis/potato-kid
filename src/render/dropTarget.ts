// The forgiving drop's target (D-051): the kid under the finger, so releasing there tries
// the pair. Pure, so its rules are unit-tested.

import type { Box } from '../sim/world';
import { rectAt } from '../sim/space';

/**
 * The kid whose drawn box contains `p` (world units, all edges inclusive), other than
 * `held`. The finger's own point, not the lifted body's (HOLD_LIFT), which can overlap a
 * neighbour (Codex review, PR #63). If boxes share the point, the frontmost wins as drawn
 * (zIndex is y), then the lower id.
 */
export function kidUnder(
  p: { x: number; y: number },
  drawn: ReadonlyMap<number, { x: number; y: number }>,
  boxes: ReadonlyMap<number, Box>,
  held: number,
): number | undefined {
  let best: { id: number; y: number } | undefined;
  for (const [id, at] of drawn) {
    const box = boxes.get(id);
    if (id === held || !box) continue;
    const r = rectAt(box, at.x, at.y);
    if (p.x < r.minX || p.x > r.maxX || p.y < r.minY || p.y > r.maxY) continue;
    if (!best || at.y > best.y || (at.y === best.y && id < best.id)) best = { id, y: at.y };
  }
  return best?.id;
}
