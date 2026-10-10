import type { Ambient, LookTable } from '../sim/game';
import type { Obstacle } from '../sim/world';
import type { BoundsPx, FarmData, KidRig, MapData, MapInstance, UiData } from './artData';
import type { KidDef } from './types';

// Pure derivations from ChatGPT/Codex's art data into what the simulation needs.
// No rendering here, so these are unit-tested directly against the shipped sidecars.

/** Source px → world units for a kid of appearance scale 1. */
export function kidScale(rig: KidRig): number {
  return rig.worldCanvasSize / rig.canvas[0];
}

/** A body's lifetime box (D-043) as world offsets from the ground point. */
export function bodyBox(rig: KidRig, bounds: BoundsPx): { left: number; top: number; right: number; bottom: number } {
  const k = kidScale(rig);
  const [gx, gy] = rig.groundAnchor;
  return { left: (bounds[0] - gx) * k, top: (bounds[1] - gy) * k, right: (bounds[2] - gx) * k, bottom: (bounds[3] - gy) * k };
}

export function lookTable(rig: KidRig): LookTable {
  const a = rig.appearance;
  return {
    bodies: Object.entries(a.bodyWeights).map(([id, weight]) => ({ id, weight, box: bodyBox(rig, rig.bodies[id]!.boundsPx) })),
    faces: Object.entries(a.faceWeights).map(([id, weight]) => ({ id, weight })),
    sizes: a.sizes.map((s) => ({ scale: s.scale, weight: s.weight })),
  };
}

/** Ambient rest timings from the rig's scheduler and its clips' real lengths. */
export function ambientFrom(rig: KidRig, chance: number): Ambient {
  const len = (n: string) => {
    const c = rig.clips[n];
    return c ? c.frames.length / c.fps : 0;
  };
  const w = rig.scheduler.ambientWeights;
  const down = len('sit_down');
  return {
    weights: { look: w.look_around ?? 0, wave: w.wave ?? 0, sit: w.sit_down ?? 0, sleep: w.sleep ?? 0 },
    chance,
    stationaryDelay: rig.scheduler.stationaryDelaySeconds,
    lookSeconds: len('look_around'),
    waveSeconds: len('wave'),
    sitSeconds: (hold) => down + hold + down,
    sleepSeconds: (hold) => down + hold + len('wake'),
    seatedHold: rig.scheduler.seatedHoldSeconds,
    sleepHold: rig.scheduler.sleepHoldSeconds,
  };
}

/**
 * Scenery exclusions (map v2): the instance's silhouette box transformed around its
 * pivot, inflated by the kid–scenery gap, plus its ground-reserve circle + gap.
 */
export function obstaclesFrom(map: MapData): Obstacle[] {
  const gap = map.exclusions.kidSceneryGapWorld;
  return map.instances.map((i) => {
    const r = worldBox(i);
    return {
      box: { minX: r.minX - gap, minY: r.minY - gap, maxX: r.maxX + gap, maxY: r.maxY + gap },
      circle: { x: i.worldGround[0], y: i.worldGround[1], r: i.exclusionRadiusWorld + gap },
    };
  });
}

/**
 * The map with Codex's farm relocations applied (GUI_MVP §22.1): scenery that stood on the
 * four field sites moves to free lawn, once, whether or not a field is bought.
 */
export function withFarmRelocations(map: MapData, farm: FarmData | undefined): MapData {
  if (!farm) return map;
  const moved = new Map(farm.sceneryRelocations.map((r) => [r.instanceId, r]));
  return {
    ...map,
    instances: map.instances.map((i) => {
      const r = moved.get(i.id);
      return r && i.worldGround[0] === r.from[0] && i.worldGround[1] === r.from[1] ? { ...i, worldGround: r.to } : i;
    }),
  };
}

/**
 * Each food field's bay, in field order (GUI_MVP §22.1): its reserve about its ground, plus the
 * map's kid-to-scenery gap. A bought field is scenery: kids don't wander, spawn or land in it.
 */
export function fieldBaysFrom(farm: FarmData, map: MapData): Obstacle[] {
  const gap = map.exclusions.kidSceneryGapWorld;
  return farm.fields.map((f) => {
    const [x, y] = f.worldGround;
    const [l, t, r, b] = f.reserveRelative;
    return { box: { minX: x + l - gap, minY: y + t - gap, maxX: x + r + gap, maxY: y + b + gap }, circle: { x, y, r: 0 } };
  });
}

/** World AABB of an instance's boundsPx (1 source px = 1 world unit × scale), rotation included. */
export function worldBox(i: MapInstance): { minX: number; minY: number; maxX: number; maxY: number } {
  const [l, t, r, b] = i.boundsPx;
  const [px, py] = i.sourcePivot;
  const a = (i.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [cx, cy] of [
    [l, t],
    [r, t],
    [l, b],
    [r, b],
  ] as const) {
    const dx = (cx - px) * i.scale;
    const dy = (cy - py) * i.scale;
    xs.push(i.worldGround[0] + dx * cos - dy * sin);
    ys.push(i.worldGround[1] + dx * sin + dy * cos);
  }
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/**
 * Art coverage (D-036): every roster type must resolve through delivered art. Missing
 * art is an error, never a reason for the engine to draw something itself.
 */
export function rigCoverage(rig: KidRig, kids: KidDef[], delivered: Set<string>): string[] {
  const problems: string[] = [];
  const need = (what: string, asset: string | undefined) => {
    if (!asset) problems.push(`${what}: no asset`);
    else if (!delivered.has(asset)) problems.push(`${what}: "${asset}" was not exported`);
  };
  for (const kid of kids) {
    const costume = rig.costumes[kid.id];
    if (!costume) {
      problems.push(`kid type "${kid.id}" has no costume entry in kid_rig_v2.json`);
      continue;
    }
    for (const c of costume.components) need(`costume "${kid.id}"`, c.asset);
  }
  for (const id of Object.keys(rig.appearance.bodyWeights)) {
    const body = rig.bodies[id];
    if (!body) {
      problems.push(`appearance body "${id}" has no body entry`);
      continue;
    }
    if (!body.frames.stand) problems.push(`body "${id}" has no "stand" frame`);
    for (const [name, f] of Object.entries(body.frames)) need(`body "${id}" frame "${name}"`, f.asset);
  }
  for (const id of Object.keys(rig.appearance.faceWeights)) {
    const face = rig.faces[id];
    if (!face) {
      problems.push(`appearance face "${id}" has no face entry`);
      continue;
    }
    if (!face.states.open) problems.push(`face "${id}" has no "open" state`);
    for (const [s, asset] of Object.entries(face.states)) need(`face "${id}" state "${s}"`, asset);
  }
  return problems;
}

/** Palette tokens the engine and `hud.css` read from ui_v2.json (typography is checked too). */
export const UI_PALETTE_KEYS = ['world', 'ink', 'sage', 'sceneryInk', 'disabled'] as const;

/**
 * GUI token coverage (D-036): every colour and the type on screen come from Codex's
 * ui_v2.json. A missing token is an error; the engine has no colours or fonts of its own.
 */
export function uiPaletteCoverage(ui: UiData | undefined): string[] {
  if (!ui) return ['ui_v2.json is missing'];
  const problems = UI_PALETTE_KEYS.filter((k) => typeof ui.palette?.[k] !== 'string').map((k) => `ui_v2.json palette has no "${k}"`);
  const type = ui.typography as { family?: unknown; fallback?: unknown } | undefined;
  if (typeof type?.family !== 'string' || typeof type.fallback !== 'string') problems.push('ui_v2.json typography needs "family" and "fallback"');
  return problems;
}
