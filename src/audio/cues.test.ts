import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../sim/game';
import { cueFor, SpawnLimiter } from './cues';

const kid = { id: 1, type: 'plain' } as never;
const fused = (firstDiscovery: boolean): GameEvent => ({ type: 'fused', parents: [kid, kid], child: kid, firstDiscovery });

describe('audio cues (ART_AUDIO_PLAN priorities)', () => {
  it('one cue per step: discovery > fusion > upgrade > spawn > place > pick-up', () => {
    expect(cueFor([{ type: 'pickedUp', kidId: 1 }, { type: 'dropped', kidId: 1 }])).toBe('sfx_place');
    expect(cueFor([{ type: 'dropped', kidId: 1 }, { type: 'spawned', kid, source: 'garden' }])).toBe('sfx_spawn');
    expect(cueFor([{ type: 'spawned', kid, source: 'garden' }, { type: 'upgraded', building: 'garden', level: 2 }])).toBe('sfx_upgrade');
    expect(cueFor([{ type: 'upgraded', building: 'garden', level: 2 }, fused(false)])).toBe('sfx_fusion');
    // Discovery replaces fusion for the same event.
    expect(cueFor([fused(true)])).toBe('sfx_discovery');
  });

  it('planting plays its own cue; a sprout arrives with the spawn cue; a plot unlock is an upgrade (GUI_MVP §15.3)', () => {
    expect(cueFor([{ type: 'planted', kid, plot: 0, count: 1 }])).toBe('sfx_plant');
    expect(cueFor([{ type: 'spawned', kid, source: 'sprout' }])).toBe('sfx_spawn');
    expect(cueFor([{ type: 'plotUnlocked', plots: 2 }])).toBe('sfx_upgrade');
    // Planting frees a slot; a Garden kid arriving in the same step doesn't drown it out.
    expect(cueFor([{ type: 'planted', kid, plot: 0, count: 1 }, { type: 'spawned', kid, source: 'garden' }])).toBe('sfx_plant');
  });

  it('is silent for offline arrivals, income and refusals', () => {
    expect(cueFor([{ type: 'spawned', kid, source: 'offline' }])).toBeNull();
    expect(cueFor([{ type: 'rejected', command: 'upgrade', reason: 'cost' }])).toBeNull();
    expect(cueFor([])).toBeNull();
  });

  it('spawn cues at most once per 300 ms; other cues always', () => {
    const l = new SpawnLimiter();
    expect(l.allow('sfx_spawn', 0)).toBe(true);
    expect(l.allow('sfx_spawn', 299)).toBe(false);
    expect(l.allow('sfx_fusion', 299)).toBe(true);
    expect(l.allow('sfx_spawn', 300)).toBe(true);
  });
});
