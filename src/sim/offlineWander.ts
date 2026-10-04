import type { WanderBalance } from '../content/types';
import type { Rng } from './rng';
import { findFreeSpot, innerBounds, isFree, kidRect, rectAt, touching } from './space';
import type { Kid, World } from './world';

// Offline wandering (D-053): while the app is closed, kids keep walking about, so on return
// each is found where it wandered to, and offline spawns have walked out from the Garden.
// Simulating hours of steps is too slow for a resume, so each kid takes one jump with a
// random walk's spread for its own time away. There are still no fusions offline (D-018):
// no recipe pair is ever left touching.

/** Fresh random targets tried per kid before it falls back to a search. */
const TRIES = 8;
/** Grid step of the last-resort search for a spot, in world units. */
const GRID = 100;

/**
 * The per-axis spread (standard deviation, world units) of a kid's random walk over
 * `seconds`. A walker of speed v that turns on average every τ seconds spreads as
 * v·√(τ·t/2) per axis; t counts only walking, not idling. With no turning, it walks straight.
 */
export function wanderSpread(w: WanderBalance, seconds: number): number {
  if (seconds <= 0 || w.speed <= 0) return 0;
  const meanIdle = (w.idleSeconds[0] + w.idleSeconds[1]) / 2;
  const walking = seconds / (1 + w.idleChancePerSecond * meanIdle);
  if (w.turnChancePerSecond <= 0) return w.speed * walking;
  return w.speed * Math.sqrt(walking / w.turnChancePerSecond / 2);
}

/** Folds `v` into [min, max] by reflecting off the ends, as a walker bounces off a wall. */
export function reflect(v: number, min: number, max: number): number {
  const span = max - min;
  if (span <= 0) return min;
  const m = (((v - min) % (2 * span)) + 2 * span) % (2 * span);
  return min + (m <= span ? m : 2 * span - m);
}

/**
 * Moves every kid to where it wandered in its time away: `away(kid)` seconds (0 leaves it
 * where it is). Kids are placed in order, each on the nearest free spot to its target that
 * touches no recipe partner as the others stand then; every pair is checked when the later
 * of the two is placed, so none is left touching. `partners(a, b)`: the pair is a recipe.
 */
export function wanderOffline(
  world: World,
  w: WanderBalance,
  touchSlack: number,
  rng: Rng,
  away: (kid: Kid) => number,
  partners: (a: Kid, b: Kid) => boolean,
): void {
  const clear = (kid: Kid, x: number, y: number) =>
    !world.kids.some((o) => o !== kid && partners(kid, o) && touching(rectAt(kid.box, x, y), kidRect(o), touchSlack));
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng.next())) * Math.cos(2 * Math.PI * rng.next());

  for (const kid of world.kids) {
    const t = away(kid);
    const spread = wanderSpread(w, t);
    // Never farther than it could walk in the time: the spread formula holds for long
    // absences, not a brief app switch (Codex review, PR #70).
    const reach = Math.max(0, w.speed * t);
    const ib = innerBounds(world.bounds, kid.box);
    let spot: { x: number; y: number } | null = null;
    if (spread > 0) {
      for (let i = 0; i < TRIES && !spot; i++) {
        let dx: number;
        let dy: number;
        if (w.turnChancePerSecond <= 0) {
          const a = rng.next() * Math.PI * 2;
          [dx, dy] = [Math.cos(a) * spread, Math.sin(a) * spread];
        } else [dx, dy] = [gauss() * spread, gauss() * spread];
        const len = Math.hypot(dx, dy);
        if (len > reach) [dx, dy] = [(dx / len) * reach, (dy / len) * reach];
        const p = findFreeSpot(world, kid.box, reflect(kid.x + dx, ib.minX, ib.maxX), reflect(kid.y + dy, ib.minY, ib.maxY), kid.id);
        // Making room can push the spot past the reach (beside scenery): then it's no walk.
        if (p && Math.hypot(p.x - kid.x, p.y - kid.y) <= reach + 1e-9 && clear(kid, p.x, p.y)) spot = p;
      }
    }
    // Staying put is fine unless a partner now stands touching it.
    if (!spot && isFree(world, kid.box, kid.x, kid.y, kid.id) && clear(kid, kid.x, kid.y)) spot = { x: kid.x, y: kid.y };
    // Parting from a partner (no fusions offline) walks if it can: the nearest clear spot
    // within reach first, and only then the nearest anywhere (Codex review, PR #70).
    if (!spot) spot = nearestReachable(world, kid, ib, reach, clear) ?? nearestClear(world, kid, ib, clear);
    if (!spot) continue; // nowhere at all: leave it (a map this full can't happen within capacity)
    if (spot.x !== kid.x || spot.y !== kid.y) {
      kid.x = spot.x;
      kid.y = spot.y;
      kid.heading = rng.next() * Math.PI * 2;
      kid.activity = { kind: 'walk' };
    }
  }
}

/**
 * Where to put a kid down so it touches no recipe partner (it must not fuse): its own spot
 * if that's free and clear, else the nearest clear spot (Codex review, PR #72). Null if none.
 */
export function clearSpotFor(world: World, kid: Kid, touchSlack: number, partners: (a: Kid, b: Kid) => boolean): { x: number; y: number } | null {
  const clear = (k: Kid, x: number, y: number) =>
    !world.kids.some((o) => o !== k && !o.held && partners(k, o) && touching(rectAt(k.box, x, y), kidRect(o), touchSlack));
  if (isFree(world, kid.box, kid.x, kid.y, kid.id) && clear(kid, kid.x, kid.y)) return { x: kid.x, y: kid.y };
  const ib = innerBounds(world.bounds, kid.box);
  return nearestReachable(world, kid, ib, 600, clear) ?? nearestClear(world, kid, ib, clear);
}

/** Rings tried within reach, and spots per ring. */
const RINGS = 6;
const ANGLES = 24;

/** The free spot touching no partner nearest the kid within `reach`, on rings around it. */
function nearestReachable(
  world: World,
  kid: Kid,
  ib: { minX: number; minY: number; maxX: number; maxY: number },
  reach: number,
  clear: (kid: Kid, x: number, y: number) => boolean,
): { x: number; y: number } | null {
  if (reach <= 0) return null;
  for (let ring = 1; ring <= RINGS; ring++) {
    const r = (reach * ring) / RINGS;
    for (let i = 0; i < ANGLES; i++) {
      const a = (i / ANGLES) * Math.PI * 2;
      const x = kid.x + Math.cos(a) * r;
      const y = kid.y + Math.sin(a) * r;
      if (x < ib.minX || x > ib.maxX || y < ib.minY || y > ib.maxY) continue;
      if (isFree(world, kid.box, x, y, kid.id) && clear(kid, x, y)) return { x, y };
    }
  }
  return null;
}

/** The free spot touching no partner nearest the kid, on a grid over the whole map. */
function nearestClear(
  world: World,
  kid: Kid,
  ib: { minX: number; minY: number; maxX: number; maxY: number },
  clear: (kid: Kid, x: number, y: number) => boolean,
): { x: number; y: number } | null {
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = ib.minY; y <= ib.maxY; y += GRID) {
    for (let x = ib.minX; x <= ib.maxX; x += GRID) {
      const d = Math.hypot(x - kid.x, y - kid.y);
      if (best && d >= best.d) continue;
      if (isFree(world, kid.box, x, y, kid.id) && clear(kid, x, y)) best = { x, y, d };
    }
  }
  return best && { x: best.x, y: best.y };
}
