import { describe, expect, it } from 'vitest';
import { kidUnder } from './dropTarget';
import { defaultBox } from '../sim/world';

const box = defaultBox(60);
const boxes = (...ids: number[]) => new Map(ids.map((id) => [id, box]));

describe('forgiving drop target (D-051)', () => {
  it('is the kid whose drawn box contains the finger, all four edges inclusive', () => {
    const drawn = new Map([[2, { x: 500, y: 500 }]]);
    const r = { minX: 500 + box.left, minY: 500 + box.top, maxX: 500 + box.right, maxY: 500 + box.bottom };
    for (const p of [
      { x: r.minX, y: r.minY },
      { x: r.maxX, y: r.maxY },
      { x: 500, y: (r.minY + r.maxY) / 2 },
    ])
      expect(kidUnder(p, drawn, boxes(2), 1)).toBe(2);
    for (const p of [
      { x: r.minX - 0.01, y: 500 },
      { x: r.maxX + 0.01, y: 500 },
      { x: 500, y: r.minY - 0.01 },
      { x: 500, y: r.maxY + 0.01 },
    ])
      expect(kidUnder(p, drawn, boxes(2), 1)).toBeUndefined();
  });

  it('uses where kids are drawn, not where the sim has them', () => {
    // Only the drawn map is consulted: the box sits at the drawn point.
    const drawn = new Map([[2, { x: 800, y: 500 }]]);
    expect(kidUnder({ x: 800, y: 500 + box.top / 2 }, drawn, boxes(2), 1)).toBe(2);
    expect(kidUnder({ x: 500, y: 500 + box.top / 2 }, drawn, boxes(2), 1)).toBeUndefined();
  });

  it('never targets the held kid itself', () => {
    const drawn = new Map([[1, { x: 500, y: 500 }]]);
    expect(kidUnder({ x: 500, y: 480 }, drawn, boxes(1), 1)).toBeUndefined();
  });

  it('skips kids with no box (no longer in the sim)', () => {
    const drawn = new Map([[2, { x: 500, y: 500 }]]);
    expect(kidUnder({ x: 500, y: 480 }, drawn, new Map(), 1)).toBeUndefined();
  });

  it('where boxes share the point, the frontmost (lower on screen) wins, then the lower id', () => {
    // Kid 3 stands lower (drawn in front); their boxes meet at the finger.
    const p = { x: 500, y: 500 };
    const drawn = new Map([
      [3, { x: 500, y: 500 - box.top }],
      [2, { x: 500, y: 500 - box.bottom }],
    ]);
    expect(kidUnder(p, drawn, boxes(2, 3), 1)).toBe(3);
    // Same y: the lower id, whichever order they come in.
    const side = new Map([
      [5, { x: 500 - box.right, y: 520 }],
      [4, { x: 500 - box.left, y: 520 }],
    ]);
    expect(kidUnder(p, side, boxes(4, 5), 1)).toBe(4);
  });
});
