import { describe, expect, it } from 'vitest';
import { kidRig, type EventEffect } from '../content/artData';
import type { Activity } from '../sim/world';
import { ClipPicker, EffectTracks, clipLength } from './presentation';

// Against Codex's shipped rig, so these also check that the art data drives the rules.
const rig = kidRig!;
const walk: Activity = { kind: 'walk' };
const FRAME = 1 / 60;

/** Runs `seconds` of frames and returns the clip name shown on each. */
function run(p: ClipPicker, seconds: number, held = false, activity: Activity = walk): string[] {
  const names: string[] = [];
  for (let t = 0; t < seconds; t += FRAME) names.push(p.advance(activity, held, FRAME).name);
  return names;
}

describe('which clip a kid shows (scheduler.priority)', () => {
  it('a newborn plays spawn from its first entry, then returns to its activity', () => {
    const p = new ClipPicker(rig);
    p.play('spawn');
    const first = p.advance(walk, false, FRAME);
    expect(first).toMatchObject({ name: 'spawn', time: 0 });
    const names = run(p, clipLength(rig, 'spawn') + 0.1);
    expect(names.at(-1)).toBe('walk');
  });

  it('picking up interrupts a spawn at once, holds, and releasing plays the drop', () => {
    const p = new ClipPicker(rig);
    p.play('spawn');
    p.advance(walk, false, FRAME);
    expect(p.advance(walk, true, FRAME).name).toBe('pick_up');
    const heldNames = run(p, clipLength(rig, 'pick_up') + 0.2, true);
    expect(heldNames.at(-1)).toBe('held');
    expect(p.advance(walk, false, FRAME).name).toBe('drop');
    expect(run(p, clipLength(rig, 'drop') + 0.1).at(-1)).toBe('walk');
  });

  it('a quick tap (release before the pick-up ends) still plays the drop', () => {
    const p = new ClipPicker(rig);
    p.advance(walk, true, FRAME);
    expect(p.advance(walk, false, FRAME).name).toBe('drop');
  });

  it('a lower-priority one-shot cannot replace a higher one', () => {
    const p = new ClipPicker(rig);
    p.advance(walk, true, FRAME);
    p.advance(walk, false, FRAME); // drop playing
    p.play('spawn');
    expect(p.playing).toBe('drop');
  });

  it('wave is an ambient activity with its own clip', () => {
    const p = new ClipPicker(rig);
    expect(p.advance({ kind: 'wave', left: 0.5 }, false, FRAME).name).toBe('wave');
  });
});

describe('event effects', () => {
  it('run their clip frames at the clip fps, then end', () => {
    const fx = new EffectTracks(rig);
    fx.start('fusion');
    const assets: string[] = [];
    for (let t = 0; t < clipLength(rig, 'fusion') + 0.1; t += FRAME) for (const f of fx.advance(FRAME)) assets.push(f.asset);
    expect([...new Set(assets)]).toEqual(rig.clips.fusion!.frames.map((f) => (rig.effects.fusion as EventEffect).frames[f.effectFrame!]!.asset));
    expect(fx.active).toEqual([]);
  });

  it('discovery draws above the kid and fusion behind it', () => {
    const fx = new EffectTracks(rig);
    fx.start('fusion');
    fx.start('discovery');
    const layers = Object.fromEntries(fx.advance(FRAME).map((f) => [f.effect, f.def.layer]));
    expect(layers).toEqual({ fusion: 'behind_kid', discovery: 'above_kid' });
  });

  it('ignores clips without an effect', () => {
    const fx = new EffectTracks(rig);
    fx.start('walk');
    expect(fx.active).toEqual([]);
  });
});
