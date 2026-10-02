import { describe, expect, it } from 'vitest';
import { content } from './index';
import { kidRig, mapData, uiData } from './artData';
import { bodyBox, lookTable, obstaclesFrom, rigCoverage, uiPaletteCoverage, worldBox } from './artRules';

// Names of every exported runtime PNG, as the game loads them.
const exported = new Set(
  Object.keys(import.meta.glob('../../assets/{sprites,maps}/**/*.png')).map((p) => p.slice(p.lastIndexOf('/') + 1, -4)),
);

describe('shipped art (D-036 coverage)', () => {
  it('has the rig and map sidecars', () => {
    expect(kidRig).toBeDefined();
    expect(mapData).toBeDefined();
  });

  it('covers every roster type, body and face with exported art', () => {
    expect(rigCoverage(kidRig!, content.kids, exported)).toEqual([]);
  });

  it('reports a roster type with no costume, and an asset that was never exported', () => {
    const rig = structuredClone(kidRig!);
    delete rig.costumes.fire;
    rig.faces.classic!.states.open = 'kid_face_missing';
    const problems = rigCoverage(rig, content.kids, exported);
    expect(problems).toContain('kid type "fire" has no costume entry in kid_rig_v2.json');
    expect(problems).toContain('face "classic" state "open": "kid_face_missing" was not exported');
  });
});

describe('derived tables', () => {
  it('turns boundsPx into world box offsets around the ground anchor (D-043)', () => {
    const rig = kidRig!;
    const b = bodyBox(rig, [16, 12, 240, 236]);
    const k = 180 / 256;
    expect(b.left).toBeCloseTo((16 - 128) * k, 9);
    expect(b.top).toBeCloseTo((12 - 224) * k, 9);
    expect(b.right).toBeCloseTo((240 - 128) * k, 9);
    expect(b.bottom).toBeCloseTo((236 - 224) * k, 9);
  });

  it('builds a look table with every appearance body, face and size', () => {
    const t = lookTable(kidRig!);
    expect(t.bodies.map((b) => b.id).sort()).toEqual(Object.keys(kidRig!.appearance.bodyWeights).sort());
    expect(t.faces).toHaveLength(Object.keys(kidRig!.appearance.faceWeights).length);
    expect(t.sizes.map((s) => s.scale)).toEqual(kidRig!.appearance.sizes.map((s) => s.scale));
  });

  it('makes one obstacle per scenery instance, box inflated by the gap', () => {
    const map = mapData!;
    const obs = obstaclesFrom(map);
    expect(obs).toHaveLength(map.instances.length);
    const garden = map.instances.find((i) => i.id === 'garden')!;
    const wb = worldBox(garden);
    const o = obs[map.instances.indexOf(garden)]!;
    expect(o.box.minX).toBeCloseTo(wb.minX - map.exclusions.kidSceneryGapWorld, 9);
    expect(o.circle.r).toBe(garden.exclusionRadiusWorld + map.exclusions.kidSceneryGapWorld);
    // The Garden roof rises above its ground circle, which is why the box exists too.
    expect(wb.minY).toBeLessThan(garden.worldGround[1] - garden.exclusionRadiusWorld);
  });

  it('keeps the spawn outlet itself outside every obstacle box', () => {
    const map = mapData!;
    const [sx, sy] = map.garden.spawnOutlet;
    for (const o of obstaclesFrom(map)) {
      const inside = sx > o.box.minX && sx < o.box.maxX && sy > o.box.minY && sy < o.box.maxY;
      expect(inside).toBe(false);
    }
  });
});

describe('GUI colours come only from ui_v2.json (D-036)', () => {
  it('the shipped palette covers every token the engine reads', () => {
    expect(uiPaletteCoverage(uiData)).toEqual([]);
  });

  it('reports a missing token or file instead of falling back to an engine colour', () => {
    const palette = { ...uiData!.palette };
    delete palette.world;
    expect(uiPaletteCoverage({ ...uiData!, palette })).toEqual(['ui_v2.json palette has no "world"']);
    expect(uiPaletteCoverage(undefined)).toEqual(['ui_v2.json is missing']);
  });

  it('content data carries no colours of its own', () => {
    for (const kid of content.kids) expect(Object.keys(kid).sort()).toEqual(['id', 'name', 'tier']);
  });
});
