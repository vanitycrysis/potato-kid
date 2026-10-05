import type { GameEvent } from '../sim/game';

// Which sound a sim step gets (ART_AUDIO_PLAN audio priorities, Codex's design): one cue
// per step, the most important event winning. Discovery replaces fusion for the same event.
// Planting has its own cue, once at acceptance; a sprout arrives with the spawn cue (GUI_MVP
// §15.3). Passive income never ticks.

export type Cue = 'sfx_discovery' | 'sfx_fusion' | 'sfx_upgrade' | 'sfx_plant' | 'sfx_spawn' | 'sfx_place' | 'sfx_pick_up' | 'sfx_ui_tap' | 'sfx_spend';

// A bite or a name accepted is a quiet UI tap, below everything else (GUI_MVP §17.2, §18.2).
const PRIORITY: Cue[] = ['sfx_discovery', 'sfx_fusion', 'sfx_upgrade', 'sfx_plant', 'sfx_spawn', 'sfx_place', 'sfx_pick_up', 'sfx_ui_tap'];

/** The one cue for a step's events, or null. Offline arrivals are silent. */
export function cueFor(events: GameEvent[]): Cue | null {
  let best = -1;
  const consider = (c: Cue) => {
    const i = PRIORITY.length - PRIORITY.indexOf(c);
    if (i > best) best = i;
  };
  for (const e of events) {
    if (e.type === 'fused') consider(e.firstDiscovery ? 'sfx_discovery' : 'sfx_fusion');
    else if (e.type === 'upgraded' || e.type === 'plotUnlocked') consider('sfx_upgrade');
    else if (e.type === 'planted') consider('sfx_plant');
    else if (e.type === 'spawned' && e.source !== 'offline') consider('sfx_spawn');
    else if (e.type === 'dropped') consider('sfx_place');
    // A pick-up sounds when the press becomes a drag (the scene's gesture), never at the
    // press: a tap on a kid opens its card with a UI tap instead (Codex review, FEED-NAME).
    else if (e.type === 'fed' || e.type === 'named') consider('sfx_ui_tap');
  }
  return best < 0 ? null : PRIORITY[PRIORITY.length - best]!;
}

/** Spawn cues: at most one per 300 ms (several kids arriving at once make one sound). */
export class SpawnLimiter {
  private last = -Infinity;
  allow(cue: Cue, now: number): boolean {
    if (cue !== 'sfx_spawn') return true;
    if (now - this.last < 300) return false;
    this.last = now;
    return true;
  }
}
