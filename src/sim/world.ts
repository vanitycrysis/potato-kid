import type { KidId, WanderBalance } from '../content/types';
import type { Rng } from './rng';

/** Simulation step length in seconds (10 Hz, ENGINEERING_PLAN.md §2). */
export const STEP = 0.1;

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Kid {
  /** Stable, monotonically increasing; used for deterministic tie-breaks. */
  id: number;
  type: KidId;
  x: number;
  y: number;
  /** Heading in radians. */
  heading: number;
  /** Seconds left standing still; 0 means walking. */
  idle: number;
}

export interface World {
  kids: Kid[];
  nextKidId: number;
  bounds: Bounds;
}

export function createWorld(bounds: Bounds): World {
  return { kids: [], nextKidId: 1, bounds };
}

export function addKid(world: World, type: KidId, x: number, y: number, rng: Rng): Kid {
  const kid: Kid = { id: world.nextKidId++, type, x, y, heading: rng.next() * Math.PI * 2, idle: 0 };
  world.kids.push(kid);
  return kid;
}

/** Advances every kid's wander by one fixed step. Mutates `world`. */
export function stepWander(world: World, rng: Rng, w: WanderBalance, dt: number = STEP): void {
  const { minX, minY, maxX, maxY } = world.bounds;
  for (const kid of world.kids) {
    if (kid.idle > 0) {
      kid.idle = Math.max(0, kid.idle - dt);
      continue;
    }
    if (rng.next() < w.idleChancePerSecond * dt) {
      const [lo, hi] = w.idleSeconds;
      kid.idle = lo + rng.next() * (hi - lo);
      continue;
    }
    if (rng.next() < w.turnChancePerSecond * dt) {
      kid.heading += (rng.next() - 0.5) * Math.PI;
    }
    let nx = kid.x + Math.cos(kid.heading) * w.speed * dt;
    let ny = kid.y + Math.sin(kid.heading) * w.speed * dt;
    // Reflect off the bounds so kids stay inside the play area.
    if (nx < minX || nx > maxX) {
      kid.heading = Math.PI - kid.heading;
      nx = Math.min(maxX, Math.max(minX, nx));
    }
    if (ny < minY || ny > maxY) {
      kid.heading = -kid.heading;
      ny = Math.min(maxY, Math.max(minY, ny));
    }
    kid.x = nx;
    kid.y = ny;
  }
}
