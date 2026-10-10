import { describe, expect, it } from 'vitest';
import type { FarmData } from '../content/artData';
import { assignPads, fieldAt, fieldRect } from './fieldsView';

const site = (x: number) => ({
  worldGround: [x, 1000] as [number, number],
  sourcePivot: [256, 400] as [number, number],
  scale: 1,
  reserveRelative: [-216, -464, 216, 104] as [number, number, number, number],
  workerFeetRelative: [
    [-108, -275],
    [108, -275],
    [-108, -60],
    [108, -60],
  ] as [number, number][],
  workerAdmissionPadOrder: [2, 3, 0, 1],
  cropGroundsRelative: [] as [number, number][],
  dragRelative: [-200, -304, 200, 80] as [number, number, number, number],
});
const farm = { fields: [site(1000), site(2000)] } as unknown as FarmData;

describe('working kids keep their pads (GUI_MVP §22.1)', () => {
  it('newcomers fill front left, front right, rear left, rear right', () => {
    expect([...assignPads(new Map(), [7, 8, 9, 10], [2, 3, 0, 1])]).toEqual([
      [7, 2],
      [8, 3],
      [9, 0],
      [10, 1],
    ]);
  });

  it('a kid keeps its pad when another leaves; the next newcomer takes the free one', () => {
    const before = assignPads(new Map(), [7, 8, 9], [2, 3, 0, 1]);
    const after = assignPads(before, [8, 9, 11], [2, 3, 0, 1]);
    expect(after.get(8)).toBe(3);
    expect(after.get(9)).toBe(0);
    expect(after.get(11)).toBe(2);
  });
});

describe('a tap on a field (GUI_MVP §22.2)', () => {
  it('hits a bought bed, never an unbought one; a near miss hits through the 44 px target', () => {
    const r = fieldRect(farm.fields[0]!);
    expect(fieldAt(farm, 1, { x: 1000, y: 900 }, 0.36)).toBe(0);
    expect(fieldAt(farm, 1, { x: 2000, y: 900 }, 0.36)).toBeNull();
    expect(fieldAt(farm, 2, { x: 2000, y: 900 }, 0.36)).toBe(1);
    // Far zoomed out (tiny), a tap just outside the bed still hits it.
    expect(fieldAt(farm, 1, { x: r.right + 10, y: 900 }, 0.05)).toBe(0);
    expect(fieldAt(farm, 1, { x: r.right + 10, y: 900 }, 0.36)).toBeNull();
  });
});
