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

/**
 * A kid's lifetime silhouette box, as offsets from its ground point in world units
 * (left/top negative). From the rig's `boundsPx` (D-043): it contains every pose,
 * costume and clip delta, so it never changes while the kid lives.
 */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Cosmetic appearance rolled once at birth and persisted (ART-V2 spec). */
export interface Look {
  body: string;
  face: string;
  scale: number;
}

/**
 * What a kid is doing. Rest activities come from the rig's ambient scheduler;
 * the renderer picks the matching clip. `left` counts down in seconds.
 */
export type Activity =
  | { kind: 'walk' }
  /** Standing still. With `thenAmbient`, it's the rig's stationary wait before an ambient pose. */
  | { kind: 'pause'; left: number; thenAmbient?: boolean }
  | { kind: 'look'; left: number }
  | { kind: 'wave'; left: number }
  | { kind: 'sit'; left: number; total: number }
  | { kind: 'sleep'; left: number; total: number };

export interface Kid {
  /** Stable, monotonically increasing; used for deterministic tie-breaks. */
  id: number;
  type: KidId;
  x: number;
  y: number;
  /** Heading in radians. */
  heading: number;
  activity: Activity;
  /** Seconds left before this newborn may fuse. */
  grace: number;
  /** Being dragged by the player: does not wander, fuse or collide. */
  held: boolean;
  box: Box;
  look: Look;
}

/** Static scenery a kid's box may not enter (map v2 exclusions, already inflated by the gap). */
export interface Obstacle {
  /** World-space silhouette box. */
  box: { minX: number; minY: number; maxX: number; maxY: number };
  /** Ground reserve: the kid box's nearest point must be at least `r` from (x, y). */
  circle: { x: number; y: number; r: number };
}

export interface World {
  kids: Kid[];
  nextKidId: number;
  bounds: Bounds;
  obstacles: Obstacle[];
}

/** Square default box/look for tests and content without a rig. */
export function defaultBox(halfExtent: number): Box {
  return { left: -halfExtent, top: -halfExtent, right: halfExtent, bottom: halfExtent };
}
export const DEFAULT_LOOK: Look = { body: 'default', face: 'default', scale: 1 };

export function createWorld(bounds: Bounds, obstacles: Obstacle[] = []): World {
  return { kids: [], nextKidId: 1, bounds, obstacles };
}

export function addKid(
  world: World,
  type: KidId,
  x: number,
  y: number,
  rng: Rng,
  grace = 0,
  box: Box = defaultBox(60),
  look: Look = DEFAULT_LOOK,
): Kid {
  const kid: Kid = {
    id: world.nextKidId++,
    type,
    x,
    y,
    heading: rng.next() * Math.PI * 2,
    activity: { kind: 'walk' },
    grace,
    held: false,
    box,
    look,
  };
  world.kids.push(kid);
  return kid;
}

export function isWalking(kid: Kid): boolean {
  return kid.activity.kind === 'walk';
}

/**
 * Advances every kid's wander by one fixed step. Mutates `world`.
 * `rest` chooses what a kid does when it stops walking ('stop'), and again once a
 * stationary wait ends ('stationary'); `blocked` says whether a
 * new position would hit scenery (the move is then cancelled and the kid turns).
 */
export function stepWander(
  world: World,
  rng: Rng,
  w: WanderBalance,
  dt: number,
  rest: (kid: Kid, phase: 'stop' | 'stationary') => Activity,
  blocked: (kid: Kid, x: number, y: number) => boolean,
): void {
  const { minX, minY, maxX, maxY } = world.bounds;
  for (const kid of world.kids) {
    if (kid.held) continue;
    const a = kid.activity;
    if (a.kind !== 'walk') {
      a.left = Math.max(0, a.left - dt);
      if (a.left === 0) kid.activity = a.kind === 'pause' && a.thenAmbient ? rest(kid, 'stationary') : { kind: 'walk' };
      continue;
    }
    if (rng.next() < w.idleChancePerSecond * dt) {
      kid.activity = rest(kid, 'stop');
      continue;
    }
    if (rng.next() < w.turnChancePerSecond * dt) {
      kid.heading += (rng.next() - 0.5) * Math.PI;
    }
    let nx = kid.x + Math.cos(kid.heading) * w.speed * dt;
    let ny = kid.y + Math.sin(kid.heading) * w.speed * dt;
    // Reflect off the world edges so the whole box stays inside.
    const b = kid.box;
    if (nx + b.left < minX || nx + b.right > maxX) {
      kid.heading = Math.PI - kid.heading;
      nx = Math.min(maxX - b.right, Math.max(minX - b.left, nx));
    }
    if (ny + b.top < minY || ny + b.bottom > maxY) {
      kid.heading = -kid.heading;
      ny = Math.min(maxY - b.bottom, Math.max(minY - b.top, ny));
    }
    if (blocked(kid, nx, ny)) {
      // Walked into scenery: stay put and turn around.
      kid.heading += Math.PI * (0.75 + rng.next() * 0.5);
      continue;
    }
    kid.x = nx;
    kid.y = ny;
  }
}

export function clampToBounds(b: Bounds, x: number, y: number): { x: number; y: number } {
  return { x: Math.min(b.maxX, Math.max(b.minX, x)), y: Math.min(b.maxY, Math.max(b.minY, y)) };
}
