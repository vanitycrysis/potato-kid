import { describe, expect, it } from 'vitest';
import { HomeTarget } from './homeTarget';

const spec = { rectRelativeWorld: [-128, -320, 128, -64] as [number, number, number, number], dwellMs: 400, minimumProjectedSidePx: 44 };
const garden = { x: 1080, y: 620 };

describe('Send home target (GUI_MVP §13.1)', () => {
  it('is the rectangle over the Garden, all four edges inclusive', () => {
    const t = new HomeTarget(garden, spec);
    expect(t.rect).toEqual({ minX: 952, minY: 300, maxX: 1208, maxY: 556 });
    for (const p of [
      { x: 952, y: 300 },
      { x: 1208, y: 556 },
      { x: 952, y: 556 },
      { x: 1208, y: 300 },
    ])
      expect(t.contains(p)).toBe(true);
    for (const p of [
      { x: 951.99, y: 400 },
      { x: 1208.01, y: 400 },
      { x: 1000, y: 299.99 },
      { x: 1000, y: 556.01 },
    ])
      expect(t.contains(p)).toBe(false);
    // The Garden's ground point and its spawn outlet are outside.
    expect(t.contains({ x: 1080, y: 620 })).toBe(false);
    expect(t.contains({ x: 1080, y: 1120 })).toBe(false);
  });

  it('arms after a continuous 400 ms dwell, not at 399', () => {
    const t = new HomeTarget(garden, spec);
    const inside = { x: 1080, y: 428 };
    expect(t.update(0, true, inside, false)).toBe('waiting');
    expect(t.update(399, true, inside, false)).toBe('waiting');
    expect(t.releases(399, true, inside)).toBe(false);
    expect(t.update(400, true, inside, false)).toBe('ready');
    expect(t.releases(400, true, inside)).toBe(true);
  });

  it('leaving, camera motion or losing eligibility starts the dwell over', () => {
    const t = new HomeTarget(garden, spec);
    const inside = { x: 1080, y: 428 };
    t.update(0, true, inside, false);
    expect(t.update(300, true, { x: 951, y: 428 }, false)).toBe('shown');
    expect(t.update(350, true, inside, false)).toBe('waiting');
    expect(t.update(700, true, inside, false)).toBe('waiting'); // only 350 ms since re-entry
    expect(t.update(750, true, inside, false)).toBe('ready');
    // The map scrolls under a still finger: not armed, the dwell restarts.
    expect(t.update(760, true, inside, true)).toBe('waiting');
    expect(t.update(1159, true, inside, false)).toBe('waiting');
    expect(t.update(1160, true, inside, false)).toBe('ready');
    expect(t.update(1170, false, inside, false)).toBe('hidden');
    expect(t.update(1180, true, inside, false)).toBe('waiting');
  });

  it('a release only counts inside, armed and eligible', () => {
    const t = new HomeTarget(garden, spec);
    const inside = { x: 1080, y: 428 };
    t.update(0, true, inside, false);
    t.update(500, true, inside, false);
    expect(t.releases(500, true, { x: 1080, y: 600 })).toBe(false);
    expect(t.releases(500, false, inside)).toBe(false);
    t.reset();
    expect(t.state).toBe('hidden');
    expect(t.releases(900, true, inside)).toBe(false);
  });
});
