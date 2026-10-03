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

  it('is silent for offline arrivals, send home, income and refusals', () => {
    expect(cueFor([{ type: 'spawned', kid, source: 'offline' }])).toBeNull();
    expect(cueFor([{ type: 'sentHome', kid }])).toBeNull();
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
