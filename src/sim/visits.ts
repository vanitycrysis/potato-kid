import type { DecorationBalance } from '../content/types';
import type { Rng } from './rng';
import { EPS, intersects, kidRect, rectAt } from './space';
import type { Activity, Kid, Point, Site, SiteSlot, World } from './world';

// Decorations kids use (D-090; Codex's `decorations_v1.json` sets the places, Claude the rules).
// A visit is the kid's activity, so it is saved with the kid: walk to the slot's approach point
// (as any walker, scenery in the way), dock along the slot's path (only its own decoration may
// be crossed), stay a while, then leave the way it came. A slot is taken while any kid's visit
// names it. The player can drop a held kid straight into a free slot.

export type Visit = Extract<Activity, { kind: 'visit' }>;

/** The visit a kid is on, if any. */
export function visitOf(kid: Kid): Visit | null {
  return kid.activity.kind === 'visit' ? kid.activity : null;
}

/** Inside its decoration (docking, staying or leaving): held in place, never pushed or fused. */
export function docked(kid: Kid): boolean {
  const v = visitOf(kid);
  return v !== null && v.phase !== 'approach';
}

/** On any visit, approaching too: it never fuses meanwhile (D-090: no fusion while admitting). */
export function visiting(kid: Kid): boolean {
  return visitOf(kid) !== null;
}

export function slotOf(sites: readonly Site[], v: Visit): SiteSlot | undefined {
  return sites[v.site]?.slots.find((s) => s.id === v.slot);
}

/** Whether some kid's visit takes this slot (`except`: a kid that doesn't count). */
export function slotTaken(world: World, site: number, slot: string, except?: number): boolean {
  return world.kids.some((k) => k.id !== except && k.activity.kind === 'visit' && k.activity.site === site && k.activity.slot === slot);
}

/** The free slot of a decoration whose drop target holds `p`, nearest to it (ties: slot order). */
export function dropSlot(world: World, sites: readonly Site[], p: Point, except?: number): { site: number; slot: SiteSlot } | null {
  for (let i = 0; i < sites.length; i++) {
    const s = sites[i]!;
    const d = s.drop;
    if (p.x < d.minX || p.x > d.maxX || p.y < d.minY || p.y > d.maxY) continue;
    let best: SiteSlot | null = null;
    let bestD = Infinity;
    for (const slot of s.slots) {
      if (slotTaken(world, i, slot.id, except)) continue;
      const dist = Math.hypot(slot.x - p.x, slot.y - p.y);
      if (dist < bestD - EPS) [best, bestD] = [slot, dist];
    }
    return best ? { site: i, slot: best } : null;
  }
  return null;
}

/**
 * A walker that stops may set off for a decoration (D-090): sometimes, when one with a free
 * slot is near and it hasn't just visited one. The nearest free slot's approach wins.
 */
export function maybeVisit(world: World, sites: readonly Site[], kid: Kid, d: DecorationBalance, rng: Rng): Visit | null {
  if (!sites.length || (kid.visitCooldown ?? 0) > 0) return null;
  if (rng.next() >= d.visitChance) return null;
  let best: { site: number; slot: SiteSlot; dist: number } | null = null;
  sites.forEach((s, i) => {
    for (const slot of s.slots) {
      const dist = Math.hypot(slot.approach.x - kid.x, slot.approach.y - kid.y);
      if (dist > d.visitRadius || slotTaken(world, i, slot.id)) continue;
      if (!best || dist < best.dist - EPS) best = { site: i, slot, dist };
    }
  });
  const b = best as { site: number; slot: SiteSlot; dist: number } | null;
  return b ? { kind: 'visit', site: b.site, slot: b.slot.id, phase: 'approach', left: d.approachSeconds, leg: 0 } : null;
}

/** Whether a box at `p` would overlap another grounded kid. */
function crowded(world: World, kid: Kid, p: Point): boolean {
  const r = rectAt(kid.box, p.x, p.y);
  return world.kids.some((k) => k !== kid && !k.held && intersects(r, kidRect(k)));
}

/** One step toward `to` at `speed`: whether it got there. */
function toward(kid: Kid, to: Point, step: number): Point & { there: boolean } {
  const dx = to.x - kid.x;
  const dy = to.y - kid.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= step + EPS) return { ...to, there: true };
  return { x: kid.x + (dx / dist) * step, y: kid.y + (dy / dist) * step, there: false };
}

/**
 * Every visit, one step (D-090). `blocked`: whether a walker's box at a point hits scenery
 * (approaching kids walk as any walker does). `seated`: a kid just took its place (its small
 * happiness). Returns nothing; kids that give up or leave walk again, with a cooldown.
 */
export function stepVisits(world: World, sites: readonly Site[], speed: number, d: DecorationBalance, dt: number, rng: Rng, blocked: (kid: Kid, x: number, y: number) => boolean, seated: (kid: Kid) => void): void {
  const step = speed * dt;
  for (const kid of world.kids) {
    if (kid.held) continue;
    if (kid.visitCooldown) kid.visitCooldown = Math.max(0, kid.visitCooldown - dt);
    const v = visitOf(kid);
    if (!v) continue;
    const slot = slotOf(sites, v);
    // A decoration gone from the map (another map version): the visit just ends.
    if (!slot) {
      kid.activity = { kind: 'walk' };
      continue;
    }
    const done = () => {
      kid.activity = { kind: 'walk' };
      kid.heading = Math.PI / 2 + (rng.next() - 0.5) * Math.PI * 0.5;
      kid.visitCooldown = d.cooldownSeconds;
    };
    if (v.phase === 'approach') {
      v.left -= dt;
      if (v.left <= 0) {
        done();
        continue;
      }
      const next = toward(kid, slot.approach, step);
      if (blocked(kid, next.x, next.y)) {
        // Something in the way: it gives up when its time runs out.
        continue;
      }
      [kid.x, kid.y] = [next.x, next.y];
      kid.heading = Math.atan2(slot.approach.y - kid.y, slot.approach.x - kid.x);
      if (next.there) Object.assign(v, { phase: 'dock', leg: 1 });
      continue;
    }
    if (v.phase === 'stay') {
      v.left -= dt;
      if (v.left <= 0) Object.assign(v, { phase: 'leave', leg: slot.path.length - 2, left: 0 });
      continue;
    }
    // Docking in or leaving along the path, one leg at a time; another kid in the way: wait.
    const to = slot.path[v.leg];
    if (!to) {
      if (v.phase === 'dock') {
        Object.assign(v, { phase: 'stay', left: d.dwellSeconds[0] + rng.next() * (d.dwellSeconds[1] - d.dwellSeconds[0]) });
        [kid.x, kid.y] = [slot.x, slot.y];
        seated(kid);
      } else done();
      continue;
    }
    const next = toward(kid, to, step);
    if (crowded(world, kid, next)) continue;
    [kid.x, kid.y] = [next.x, next.y];
    if (next.there) v.leg += v.phase === 'dock' ? 1 : -1;
  }
}

/** The player dropped a held kid into a free slot (D-090): it is seated there at once. */
export function seatAt(kid: Kid, site: number, slot: SiteSlot, d: DecorationBalance, rng: Rng): void {
  kid.activity = { kind: 'visit', site, slot: slot.id, phase: 'stay', left: d.dwellSeconds[0] + rng.next() * (d.dwellSeconds[1] - d.dwellSeconds[0]), leg: slot.path.length };
  [kid.x, kid.y] = [slot.x, slot.y];
}

/** Where a kid ends up when its visit ends at once (pickup, a return): its approach point. */
export function approachOf(sites: readonly Site[], kid: Kid): Point | null {
  const v = visitOf(kid);
  return v ? (slotOf(sites, v)?.approach ?? null) : null;
}
