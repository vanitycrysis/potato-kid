import type { Clip, EventEffect, KidRig } from '../content/artData';
import type { Activity } from '../sim/world';

// Which authored clip and effect frames a kid shows, from sim state plus presentation
// events (pick-up, drop, birth). Pure and Pixi-free so the rules are unit-tested; the
// rig view only draws what this decides. Every clip, timing and priority is Codex's
// art data (D-041); nothing here invents motion.

/** Event clips that play once over whatever the kid is doing. */
export type OneShot = 'pick_up' | 'drop' | 'spawn';

export interface ClipPick {
  name: string;
  clip: Clip | undefined;
  /** Seconds into the clip. */
  time: number;
  /** Play backwards (stand-up uses the sit-down drawing reversed). */
  reverse: boolean;
}

export interface EffectFrame {
  effect: string;
  def: EventEffect;
  asset: string;
  opacity: number;
}

export function clipLength(rig: KidRig, name: string): number {
  const c = rig.clips[name];
  return c ? c.frames.length / c.fps : 0;
}

export class ClipPicker {
  /** `fresh`: started since the last frame, so it shows its first entry before time advances. */
  private oneShot: { name: OneShot; t: number; fresh: boolean } | undefined;
  private wasHeld = false;
  private heldT = 0;
  private activityKind = '';
  private activityT = 0;

  constructor(private readonly rig: KidRig) {}

  /** Plays a one-shot unless something of higher priority (scheduler.priority) is playing. */
  play(name: OneShot): void {
    if (this.oneShot && this.rank(this.oneShot.name) < this.rank(name)) return;
    this.oneShot = { name, t: 0, fresh: true };
  }

  /** The clip to show this frame. `dt` is real seconds since the last call. */
  advance(activity: Activity, held: boolean, dt: number): ClipPick {
    if (held !== this.wasHeld) {
      this.wasHeld = held;
      this.heldT = 0;
      if (held) {
        // Pick-up interrupts any pose by the next presentation frame (scheduler note).
        this.oneShot = { name: 'pick_up', t: 0, fresh: true };
      } else {
        // Releasing ends the pick-up even if it hadn't finished, then the drop plays.
        if (this.oneShot?.name === 'pick_up') this.oneShot = undefined;
        this.play('drop');
      }
    } else if (held) {
      this.heldT += dt;
    }
    if (this.oneShot) {
      if (this.oneShot.fresh) this.oneShot.fresh = false;
      else this.oneShot.t += dt;
      if (this.oneShot.t >= clipLength(this.rig, this.oneShot.name)) this.oneShot = undefined;
    }

    if (activity.kind !== this.activityKind) {
      this.activityKind = activity.kind;
      this.activityT = 0;
    } else {
      this.activityT += dt;
    }

    const clips = this.rig.clips;
    if (this.oneShot && (!held || this.oneShot.name === 'pick_up')) {
      const { name, t } = this.oneShot;
      return { name, clip: clips[name], time: t, reverse: false };
    }
    if (held) return { name: 'held', clip: clips.held, time: this.heldT, reverse: false };
    return this.activityClip(activity);
  }

  /** Name of the one-shot playing now, if any (for tests and debugging). */
  get playing(): OneShot | undefined {
    return this.oneShot?.name;
  }

  private activityClip(a: Activity): ClipPick {
    const clips = this.rig.clips;
    const t = this.activityT;
    switch (a.kind) {
      case 'walk':
        return { name: 'walk', clip: clips.walk, time: t, reverse: false };
      case 'pause':
        return { name: 'idle', clip: clips.idle, time: t, reverse: false };
      case 'look':
        return { name: 'look_around', clip: clips.look_around, time: t, reverse: false };
      case 'wave':
        return { name: 'wave', clip: clips.wave, time: t, reverse: false };
      case 'sit': {
        const down = clipLength(this.rig, 'sit_down');
        const elapsed = a.total - a.left;
        if (elapsed < down) return { name: 'sit_down', clip: clips.sit_down, time: elapsed, reverse: false };
        // No stand-up drawing exists: the authored sit-down plays backwards (spec fallback).
        if (a.left < down) return { name: 'sit_down', clip: clips.sit_down, time: down - a.left, reverse: true };
        return { name: 'seated', clip: clips.seated, time: elapsed - down, reverse: false };
      }
      case 'sleep': {
        const down = clipLength(this.rig, 'sit_down');
        const wake = clipLength(this.rig, 'wake');
        const elapsed = a.total - a.left;
        if (elapsed < down) return { name: 'sit_down', clip: clips.sit_down, time: elapsed, reverse: false };
        if (a.left < wake) return { name: 'wake', clip: clips.wake, time: wake - a.left, reverse: false };
        return { name: 'sleep', clip: clips.sleep, time: elapsed - down, reverse: false };
      }
    }
  }

  private rank(name: string): number {
    const i = this.rig.scheduler.priority.indexOf(name);
    return i < 0 ? Infinity : i;
  }
}

/**
 * Transient effects on one kid (spawn puff, fusion, discovery spark). Each runs its
 * clip's `effectFrame` entries at the clip's fps, independently of the kid's own clip,
 * and ends with it. Starting an effect that is already running restarts it.
 */
export class EffectTracks {
  private readonly tracks = new Map<string, number>();

  constructor(private readonly rig: KidRig) {}

  /** Starts the effect driven by `clipName` (e.g. "fusion"); a clip without one is ignored. */
  start(clipName: string): void {
    if (this.rig.clips[clipName]?.effect) this.tracks.set(clipName, 0);
  }

  /** Advances by `dt` seconds and returns the frames to draw now. */
  advance(dt: number): EffectFrame[] {
    const out: EffectFrame[] = [];
    for (const [name, t] of this.tracks) {
      const clip = this.rig.clips[name]!;
      const i = Math.floor(t * clip.fps);
      if (i >= clip.frames.length) {
        this.tracks.delete(name);
        continue;
      }
      this.tracks.set(name, t + dt);
      const def = this.rig.effects[clip.effect!] as EventEffect | undefined;
      const ef = clip.frames[i]!.effectFrame;
      const frame = ef === undefined ? undefined : def?.frames[ef];
      if (def && frame) out.push({ effect: clip.effect!, def, asset: frame.asset, opacity: frame.opacity });
    }
    return out;
  }

  get active(): string[] {
    return [...this.tracks.keys()];
  }
}
