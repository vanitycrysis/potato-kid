import { type Bounds, type Box, type Kid, type Obstacle, type World } from './world';

// No-overlap rules (D-039, D-043): every grounded kid occupies its lifetime silhouette
// box, and no two boxes ever intersect. Scenery (map v2) adds obstacles: an inflated
// silhouette box plus a ground-reserve circle. Held kids are lifted and take no part.

/** Boxes closer than this are treated as overlapping (absorbs float error). */
export const EPS = 1e-6;
const MAX_ITERATIONS = 12;

export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function rectAt(box: Box, x: number, y: number): Rect {
  return { minX: x + box.left, minY: y + box.top, maxX: x + box.right, maxY: y + box.bottom };
}

export function kidRect(k: Kid): Rect {
  return rectAt(k.box, k.x, k.y);
}

/**
 * Signed gaps between two rects on each axis: positive = separated by that much,
 * negative = overlapping by that much. They intersect iff both are negative.
 */
export function gaps(a: Rect, b: Rect): { dx: number; dy: number } {
  return { dx: Math.max(a.minX - b.maxX, b.minX - a.maxX), dy: Math.max(a.minY - b.maxY, b.minY - a.maxY) };
}

export function intersects(a: Rect, b: Rect): boolean {
  const { dx, dy } = gaps(a, b);
  return dx < -EPS && dy < -EPS;
}

/**
 * Touching (D-043): the gap is at most `slack` on one axis while the intervals overlap
 * on the other. Exact corner contact counts (deterministic tolerance EPS).
 */
export function touching(a: Rect, b: Rect, slack: number): boolean {
  const { dx, dy } = gaps(a, b);
  if (dx < -EPS && dy < -EPS) return true; // overlapping (e.g. a fresh drop) also touches
  return (dx <= slack + EPS && dy <= EPS) || (dy <= slack + EPS && dx <= EPS);
}

export function hitsObstacle(r: Rect, o: Obstacle): boolean {
  if (intersects(r, o.box)) return true;
  // Nearest point of the kid rect to the circle centre.
  const nx = Math.min(r.maxX, Math.max(r.minX, o.circle.x));
  const ny = Math.min(r.maxY, Math.max(r.minY, o.circle.y));
  return Math.hypot(nx - o.circle.x, ny - o.circle.y) < o.circle.r - EPS;
}

/** True if a box at (x, y) is inside the world and touches no grounded kid (except `ignore`) or scenery. */
export function isFree(world: World, box: Box, x: number, y: number, ignore?: number): boolean {
  const r = rectAt(box, x, y);
  const b = world.bounds;
  if (r.minX < b.minX - EPS || r.minY < b.minY - EPS || r.maxX > b.maxX + EPS || r.maxY > b.maxY + EPS) return false;
  for (const o of world.obstacles) if (hitsObstacle(r, o)) return false;
  for (const k of world.kids) {
    if (k.held || k.id === ignore) continue;
    if (intersects(r, kidRect(k))) return false;
  }
  return true;
}

export function blockedByScenery(world: World, box: Box, x: number, y: number): boolean {
  const r = rectAt(box, x, y);
  return world.obstacles.some((o) => hitsObstacle(r, o));
}

/** Ground-point bounds that keep the whole box inside the world. */
export function innerBounds(b: Bounds, box: Box): Bounds {
  return { minX: b.minX - box.left, minY: b.minY - box.top, maxX: b.maxX - box.right, maxY: b.maxY - box.bottom };
}

/**
 * Nearest free spot to (x, y) for `box`. Candidates are the start itself, the exact
 * flush positions against every nearby kid/scenery box (so a kid dropped onto another
 * lands touching it, which is what lets a drop onto a recipe partner fuse), and rings
 * at fixed angles. The nearest free candidate wins; ties keep the first, so the result
 * is deterministic. Null when there is no room nearby.
 */
export function findFreeSpot(
  world: World,
  box: Box,
  x: number,
  y: number,
  ignore?: number,
  /** Optional extra limit on the ground point, e.g. the visible play area for a held preview. */
  limit?: Bounds,
): { x: number; y: number } | null {
  let ib = innerBounds(world.bounds, box);
  if (limit) {
    const cut = { minX: Math.max(ib.minX, limit.minX), minY: Math.max(ib.minY, limit.minY), maxX: Math.min(ib.maxX, limit.maxX), maxY: Math.min(ib.maxY, limit.maxY) };
    if (cut.minX <= cut.maxX && cut.minY <= cut.maxY) ib = cut;
  }
  const clampX = (v: number) => Math.min(ib.maxX, Math.max(ib.minX, v));
  const clampY = (v: number) => Math.min(ib.maxY, Math.max(ib.minY, v));
  const sx = clampX(x);
  const sy = clampY(y);
  if (isFree(world, box, sx, sy, ignore)) return { x: sx, y: sy };

  const best = { x: 0, y: 0, d: Infinity };
  const consider = (px: number, py: number) => {
    const cx = clampX(px);
    const cy = clampY(py);
    const d = Math.hypot(cx - sx, cy - sy);
    if (d >= best.d - EPS) return;
    if (isFree(world, box, cx, cy, ignore)) {
      best.x = cx;
      best.y = cy;
      best.d = d;
    }
  };

  // Flush placements against every box within reach (pass 1, exact touching spots).
  const reach = 4 * Math.max(box.right - box.left, box.bottom - box.top);
  const rects: Rect[] = [];
  for (const k of world.kids) if (!k.held && k.id !== ignore) rects.push(kidRect(k));
  for (const o of world.obstacles) rects.push(o.box);
  for (const r of rects) {
    if (r.maxX < sx - reach || r.minX > sx + reach || r.maxY < sy - reach || r.minY > sy + reach) continue;
    const left = r.minX - box.right;
    const right = r.maxX - box.left;
    const up = r.minY - box.bottom;
    const down = r.maxY - box.top;
    consider(left, sy);
    consider(right, sy);
    consider(sx, up);
    consider(sx, down);
    consider(left, up);
    consider(right, up);
    consider(left, down);
    consider(right, down);
  }
  // Rings (pass 2), for crowds where every flush spot is blocked by a third kid.
  const step = Math.max(8, Math.min(box.right - box.left, box.bottom - box.top) / 4);
  for (let ring = 1; ring <= 120; ring++) {
    const dist = ring * step;
    if (dist > best.d + step) break;
    const n = Math.max(8, Math.ceil((2 * Math.PI * dist) / step));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      consider(sx + Math.cos(a) * dist, sy + Math.sin(a) * dist);
    }
  }
  return Number.isFinite(best.d) ? { x: best.x, y: best.y } : null;
}

/**
 * Pushes intersecting grounded kids apart along the axis of least penetration (each
 * moves half), visiting pairs in id order so the result is deterministic. A pushed kid
 * turns away. Kids left inside scenery or still overlapping relocate to a free spot.
 */
export function separate(world: World): void {
  const grounded = world.kids.filter((k) => !k.held).sort((p, q) => p.id - q.id);
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let moved = false;
    for (let i = 0; i < grounded.length; i++) {
      const a = grounded[i]!;
      for (let j = i + 1; j < grounded.length; j++) {
        const c = grounded[j]!;
        const ra = kidRect(a);
        const rc = kidRect(c);
        const { dx, dy } = gaps(ra, rc);
        if (!(dx < -EPS && dy < -EPS)) continue;
        // Direction: from a's box centre towards c's; exact ties break on ids (a is lower).
        const cax = (ra.minX + ra.maxX) / 2;
        const ccx = (rc.minX + rc.maxX) / 2;
        const cay = (ra.minY + ra.maxY) / 2;
        const ccy = (rc.minY + rc.maxY) / 2;
        if (-dx <= -dy) {
          const s = ccx > cax || (ccx === cax && c.id > a.id) ? 1 : -1;
          const push = -dx / 2 + EPS;
          a.x -= s * push;
          c.x += s * push;
          a.heading = s > 0 ? Math.PI : 0;
          c.heading = s > 0 ? 0 : Math.PI;
        } else {
          const s = ccy > cay || (ccy === cay && c.id > a.id) ? 1 : -1;
          const push = -dy / 2 + EPS;
          a.y -= s * push;
          c.y += s * push;
          a.heading = s > 0 ? -Math.PI / 2 : Math.PI / 2;
          c.heading = s > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
        clampKid(world.bounds, a);
        clampKid(world.bounds, c);
        moved = true;
      }
    }
    if (!moved) break;
  }
  // Anyone still overlapping (crowded against a wall) or pushed into scenery moves to
  // the nearest free spot. If there is none, it stays (only possible in a full world).
  for (const k of grounded) {
    if (isFree(world, k.box, k.x, k.y, k.id)) continue;
    const p = findFreeSpot(world, k.box, k.x, k.y, k.id);
    if (p) {
      k.x = p.x;
      k.y = p.y;
    }
  }
}

function clampKid(b: Bounds, k: Kid): void {
  const ib = innerBounds(b, k.box);
  k.x = Math.min(ib.maxX, Math.max(ib.minX, k.x));
  k.y = Math.min(ib.maxY, Math.max(ib.minY, k.y));
}

/**
 * Render-time separation (D-043): positions to draw this frame. Interpolating two kids
 * independently can briefly overlap their boxes when collision changed the separating
 * axis (Codex review, PR #14). Any interpolated kid that would overlap another drawn kid
 * is drawn at its sim position instead; sim positions never overlap each other, so this
 * always settles. `fixed` kids (pending drops) keep their given position.
 */
export function resolveDrawn(
  kids: Kid[],
  interpolated: Map<number, { x: number; y: number }>,
  fixed: Map<number, { x: number; y: number }>,
  obstacles: Obstacle[] = [],
): Map<number, { x: number; y: number }> {
  const out = new Map<number, { x: number; y: number }>();
  const snapped = new Set<number>();
  // A just-released kid is still `held` in the sim until its drop is applied, but it has a
  // fixed pending position and must be drawn there (Codex review, PR #14: no snap-back).
  const grounded = kids.filter((k) => !k.held || fixed.has(k.id));
  for (const k of grounded) out.set(k.id, fixed.get(k.id) ?? interpolated.get(k.id) ?? { x: k.x, y: k.y });
  // Interpolating between two legal positions can cut through a scenery reserve
  // (Codex review, PR #14): such a kid is drawn at its (legal) sim position.
  for (const k of grounded) {
    if (fixed.has(k.id)) continue;
    const p = out.get(k.id)!;
    const r = rectAt(k.box, p.x, p.y);
    if (obstacles.some((o) => hitsObstacle(r, o))) {
      out.set(k.id, { x: k.x, y: k.y });
      snapped.add(k.id);
    }
  }
  for (let pass = 0; pass <= grounded.length; pass++) {
    let changed = false;
    for (let i = 0; i < grounded.length; i++) {
      for (let j = i + 1; j < grounded.length; j++) {
        const a = grounded[i]!;
        const b = grounded[j]!;
        const pa = out.get(a.id)!;
        const pb = out.get(b.id)!;
        if (!intersects(rectAt(a.box, pa.x, pa.y), rectAt(b.box, pb.x, pb.y))) continue;
        for (const k of [a, b]) {
          if (fixed.has(k.id) || snapped.has(k.id)) continue;
          out.set(k.id, { x: k.x, y: k.y });
          snapped.add(k.id);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return out;
}

