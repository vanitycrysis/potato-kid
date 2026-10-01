import { clampToBounds, type Bounds, type Kid, type World } from './world';

// No-overlap rules (D-039): every kid on the ground is a disc of radius `kid.radius`
// around its ground point, and no two discs ever overlap. Held kids are lifted off
// the ground and take no part until they're dropped.

/** Discs closer than this are treated as overlapping (absorbs float error). */
const EPS = 1e-6;
const MAX_ITERATIONS = 12;

export function overlapDepth(a: Kid, b: Kid): number {
  return a.radius + b.radius - Math.hypot(a.x - b.x, a.y - b.y);
}

/** True if a disc at (x, y) with radius r touches no grounded kid except `ignore`. */
export function isFree(world: World, x: number, y: number, r: number, ignore?: number): boolean {
  for (const k of world.kids) {
    if (k.held || k.id === ignore) continue;
    if (Math.hypot(k.x - x, k.y - y) < k.radius + r - EPS) return false;
  }
  return true;
}

/**
 * Nearest free spot to (x, y) for a disc of radius r, searched in rings of
 * increasing distance at fixed angles, so the result is deterministic.
 * Returns null when there is no room within the search radius.
 */
export function findFreeSpot(world: World, x: number, y: number, r: number, ignore?: number): { x: number; y: number } | null {
  const b = innerBounds(world.bounds, r);
  const start = clampToBounds(b, x, y);
  if (isFree(world, start.x, start.y, r, ignore)) return start;
  const step = r * 0.5;
  for (let ring = 1; ring <= 80; ring++) {
    const dist = ring * step;
    const n = Math.max(8, Math.ceil((2 * Math.PI * dist) / step));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const p = clampToBounds(b, start.x + Math.cos(a) * dist, start.y + Math.sin(a) * dist);
      if (isFree(world, p.x, p.y, r, ignore)) return p;
    }
  }
  return null;
}

/**
 * Pushes overlapping grounded kids apart (each moves half the overlap along the line
 * between them) until nothing overlaps. Pairs are visited in id order, so the result
 * is deterministic. A kid that gets pushed turns to walk away from the contact.
 */
export function separate(world: World): void {
  const b = world.bounds;
  const grounded = world.kids.filter((k) => !k.held).sort((p, q) => p.id - q.id);
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let moved = false;
    for (let i = 0; i < grounded.length; i++) {
      const a = grounded[i]!;
      for (let j = i + 1; j < grounded.length; j++) {
        const c = grounded[j]!;
        const depth = overlapDepth(a, c);
        if (depth <= EPS) continue;
        let dx = c.x - a.x;
        let dy = c.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d < EPS) {
          // Exactly coincident: separate along a direction derived from the ids.
          const ang = ((a.id * 7919 + c.id * 104729) % 360) * (Math.PI / 180);
          dx = Math.cos(ang);
          dy = Math.sin(ang);
          d = 1;
        }
        const nx = dx / d;
        const ny = dy / d;
        const push = depth / 2 + EPS;
        const pa = clampToBounds(innerBounds(b, a.radius), a.x - nx * push, a.y - ny * push);
        const pc = clampToBounds(innerBounds(b, c.radius), c.x + nx * push, c.y + ny * push);
        a.x = pa.x;
        a.y = pa.y;
        c.x = pc.x;
        c.y = pc.y;
        a.heading = Math.atan2(-ny, -nx);
        c.heading = Math.atan2(ny, nx);
        moved = true;
      }
    }
    if (!moved) return;
  }
  // Still overlapping after the iteration budget (only in pathological crowding near a
  // wall): relocate the later kid of each remaining pair to the nearest free spot.
  for (let i = 0; i < grounded.length; i++) {
    for (let j = i + 1; j < grounded.length; j++) {
      const c = grounded[j]!;
      if (overlapDepth(grounded[i]!, c) > EPS) {
        const p = findFreeSpot(world, c.x, c.y, c.radius, c.id);
        if (p) {
          c.x = p.x;
          c.y = p.y;
        }
      }
    }
  }
}

/** Bounds shrunk so a disc of radius r stays wholly inside. */
export function innerBounds(b: Bounds, r: number): Bounds {
  return { minX: b.minX + r, minY: b.minY + r, maxX: b.maxX - r, maxY: b.maxY - r };
}
