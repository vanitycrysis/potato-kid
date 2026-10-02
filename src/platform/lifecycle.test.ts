import { describe, expect, it } from 'vitest';
import { Lifecycle } from './lifecycle';

describe('lifecycle coordinator (plan §3)', () => {
  it('dedupes signals: one suspend, one resume with the wall clock', () => {
    const calls: string[] = [];
    let now = 1000;
    const l = new Lifecycle({ suspend: () => calls.push('suspend'), resume: (t) => calls.push(`resume@${t}`) }, () => now);
    l.resume(); // already active: nothing
    l.suspend();
    l.suspend(); // pagehide after visibilitychange: nothing
    now = 5000;
    l.resume();
    l.resume(); // native resume after visibilitychange: nothing
    expect(calls).toEqual(['suspend', 'resume@5000']);
    expect(l.state).toBe('active');
  });

  it('adopts a hidden state at attach: an absence during boot is still credited (Codex review, PR #31)', () => {
    const calls: string[] = [];
    let now = 1000;
    const l = new Lifecycle({ suspend: () => calls.push('suspend'), resume: (t) => calls.push(`resume@${t}`) }, () => now);
    const listeners = new Map<string, () => void>();
    const doc = { hidden: true, addEventListener: (type: string, fn: () => void) => listeners.set(type, fn) };
    l.attach(doc as unknown as Document, { addEventListener: () => {} } as unknown as Window);
    expect(l.state).toBe('suspended');
    now = 9000;
    doc.hidden = false;
    listeners.get('visibilitychange')!();
    expect(calls).toEqual(['suspend', 'resume@9000']);
  });
});
