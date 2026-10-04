import { describe, expect, it, vi } from 'vitest';
import { content } from '../content';
import type { GameEvent } from '../sim/game';
import { HomeFeed } from './homeFeed';
import type { PlantingNotes } from './plantingNotes';

function setup() {
  const commands: unknown[] = [];
  const scene = { command: (c: unknown) => void commands.push(c) };
  let explained = false;
  let queued = false;
  const notes = {
    heading: (n: string) => `${n} went home.`,
    claimFirst: () => (explained || queued ? false : (queued = true)),
    firstLines: () => ['Still in your Potato-Dex.', 'Build Compendium to bring one back for a fee.'],
    markShown: vi.fn(() => {
      explained = true;
      queued = false;
    }),
    release: vi.fn(() => (queued = false)),
    later: () => 'Kept in your Potato-Dex. No refund.',
    visibleMs: (first: boolean) => (first ? 6000 : 2500),
  } as unknown as PlantingNotes & { markShown: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
  const feed = new HomeFeed(scene, content, notes);
  feed.active = true;
  const sent = (id: number): GameEvent => ({ type: 'planted', kid: { id, type: 'fire' } as never, plot: 0, count: 1 });
  return { feed, notes, commands, sent };
}

describe('the Dex Send home feed (GUI_MVP §13.3-13.4)', () => {
  it('one send at a time until its result', () => {
    const { feed, commands, sent } = setup();
    feed.send(1, 'fire', 0);
    feed.send(2, 'fire', 0);
    expect(commands).toEqual([{ type: 'plant', kidIds: [1], plot: 0 }]);
    expect(feed.onStep([sent(1)])).toHaveLength(1);
    feed.send(2, 'fire', 0);
    expect(commands).toHaveLength(2);
  });

  it('a success shows at once, with no farewell to wait for (GUI_MVP §15.1)', () => {
    const { feed, sent } = setup();
    feed.send(1, 'fire', 0);
    feed.onStep([sent(1)]);
    expect(feed.tick('fire', performance.now(), true, false)?.first).toBe(true);
  });

  it('successes keep their order', () => {
    const { feed, sent } = setup();
    feed.send(1, 'fire', 0);
    feed.onStep([sent(1)]);
    feed.send(2, 'fire', 0);
    feed.onStep([sent(2)]);
    // The tick counts at most 250 ms a frame: run frames until the first gives way.
    let now = performance.now();
    const a = feed.tick('fire', now, true, false)!;
    expect(a.first).toBe(true);
    let m = a;
    while (m === a) m = feed.tick('fire', (now += 100), true, false)!;
    expect(m.first).toBe(false);
  });

  it('an explanation seen while paused (hovered) is recorded, and its time holds (Codex review, PR #54)', () => {
    const { feed, notes, sent } = setup();
    feed.send(1, 'fire', 0);
    feed.onStep([sent(1)]);
    const now = performance.now() + 10;
    // Picked, then drawn by the section; measured on screen from the next frame.
    expect(feed.tick('fire', now, false, false)?.ms).toBe(6000);
    expect(notes.markShown).not.toHaveBeenCalled();
    // On screen but paused (hovered) from its first visible frame: seen, so recorded, and no time spent.
    expect(feed.tick('fire', now + 200, true, true)?.ms).toBe(6000);
    expect(notes.markShown).toHaveBeenCalledTimes(1);
    // Unpaused, its time counts; recorded only once.
    expect(feed.tick('fire', now + 400, true, false)?.ms).toBe(5800);
    expect(notes.markShown).toHaveBeenCalledTimes(1);
    feed.clear();
  });

  it('off screen, a first explanation is not recorded, and closing frees it', () => {
    const { feed, notes, sent } = setup();
    feed.send(1, 'fire', 0);
    feed.onStep([sent(1)]);
    feed.tick('fire', performance.now() + 10, false, false);
    expect(notes.markShown).not.toHaveBeenCalled();
    feed.clear();
    expect(notes.release).toHaveBeenCalledTimes(1);
  });

  it('a refusal names the chosen plot, not every plot, and the gone kid stays the default (GUI_MVP §15.3)', () => {
    const { feed } = setup();
    const refuse = (reason: 'plotsBusy' | 'plotFull'): GameEvent => ({ type: 'rejected', command: 'plant', reason });
    const now = performance.now() + 10;
    feed.send(1, 'fire', 0);
    feed.onStep([refuse('plotsBusy')]);
    expect(feed.tick('fire', now, true, false)?.lines()).toEqual(['This plot is already growing. Choose another plot.']);
    feed.clear();
    feed.send(1, 'fire', 0);
    feed.onStep([refuse('plotFull')]);
    expect(feed.tick('fire', now, true, false)?.lines()).toEqual(['This plot is full. Review it to Start growing.']);
    feed.clear();
    feed.warn('fire');
    expect(feed.tick('fire', now, true, false)?.lines()).toEqual(['This kid has already left the map.']);
  });

  it('a result after the Dex closed is answered but queues nothing', () => {
    const { feed, notes, sent } = setup();
    feed.send(1, 'fire', 0);
    feed.active = false;
    expect(feed.onStep([sent(1)])).toHaveLength(1);
    feed.active = true;
    expect(feed.tick('fire', performance.now() + 10, true, false)).toBeNull();
    expect(notes.markShown).not.toHaveBeenCalled();
  });
});
