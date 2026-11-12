import 'pixi.js/events';
import { Texture, TextureSource } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { activityEffects, kidMotion, kidRig, kidWild, mapRig, mapWild, type EventEffect, type KidRig } from '../content/artData';
import { ambientFrom, bodyBox, withMotion } from '../content/artRules';
import { content } from '../content';
import type { Activity, Kid } from '../sim/world';
import { ClipPicker, EffectTracks, clipLength } from './presentation';
import { KidRigView } from './rigView';

// Claude's motion (kid_motion_v1, D-099..D-101) over Codex's rig: what the map plays. Against
// the shipped data, so these also check that the baked clips drive the engine as written.
const rig = mapRig!;
const wild = mapWild!;
const motion = kidMotion!;
const FRAME = 1 / 60;

function textures(): Map<string, Texture> {
  const size = new Map<string, [number, number]>();
  const kidCanvas = rig.canvas;
  for (const b of Object.values(rig.bodies)) for (const f of Object.values(b.frames)) size.set(f.asset, kidCanvas);
  for (const f of Object.values(rig.faces)) for (const a of Object.values(f.states)) size.set(a, kidCanvas);
  for (const c of Object.values(rig.costumes)) for (const p of c.components) size.set(p.asset, kidCanvas);
  for (const [name, e] of Object.entries(rig.effects)) {
    if (name === 'shadow') size.set(rig.effects.shadow.asset, rig.effects.shadow.canvas);
    else for (const f of (e as EventEffect).frames) size.set(f.asset, (e as EventEffect).canvas);
  }
  for (const t of Object.values(wild.types)) for (const f of Object.values(t.frames)) size.set(f.asset, kidCanvas);
  for (const fx of Object.values(activityEffects)) size.set(fx.asset, fx.canvas);
  for (const clip of Object.values(rig.clips)) for (const f of clip.frames) for (const m of f.marks ?? []) size.set(m.asset, kidCanvas);
  const out = new Map<string, Texture>();
  for (const [asset, [w, h]] of size) out.set(asset, new Texture({ source: new TextureSource({ width: w, height: h }) }));
  return out;
}

const kid: Kid = {
  id: 1,
  type: 'plain',
  x: 0,
  y: 0,
  heading: 0,
  activity: { kind: 'pause', left: 5 },
  grace: 0,
  held: false,
  box: { left: -80, top: -160, right: 80, bottom: 10 },
  look: { body: 'round', face: 'classic', scale: 1 },
};

describe('the motion sidecar over the rig (withMotion)', () => {
  it('replaces the clips the map plays and keeps the rest; the portraits keep Codex’s', () => {
    // The same name, a different clip: 12 fps with squash and stretch.
    expect(rig.clips.walk).toBe(motion.clips.walk);
    expect(rig.clips.walk!.fps).toBe(12);
    expect(kidRig!.clips.walk!.fps).toBe(8);
    // The farming stomp and the decoration clips are not motion's: unchanged.
    expect(rig.clips.farm_stomp).toBe(kidRig!.clips.farm_stomp);
    // Still frames for reduced motion: the rig's own win, motion's fill in for its new clips.
    expect(rig.reducedMotion.walk).toEqual(kidRig!.reducedMotion.walk);
    expect(rig.reducedMotion.fusion_child).toBeDefined();
  });

  it('grows every lifetime box by the margin, wild kids’ too, so moving kids still never overlap (D-043)', () => {
    const [l, t, r, b] = motion.marginPx;
    for (const [id, body] of Object.entries(rig.bodies)) {
      const was = kidRig!.bodies[id]!.boundsPx;
      expect(body.boundsPx).toEqual([was[0] - l, was[1] - t, was[2] + r, was[3] + b]);
    }
    const was = kidWild!.types.blimp!.lifetimeBoundsPx;
    expect(wild.types.blimp!.lifetimeBoundsPx).toEqual([was[0] - l, was[1] - t, was[2] + r, was[3] + b]);
    // And so the sim's box is wider than the art-only one.
    expect(bodyBox(rig, rig.bodies.round!.boundsPx).left).toBeLessThan(bodyBox(kidRig!, kidRig!.bodies.round!.boundsPx).left);
    // No sidecar, no change.
    expect(withMotion(kidRig, undefined)).toBe(kidRig);
  });

  it('every kid in the roster that has a habit has its clip, and the sim knows how long it lasts (D-099)', () => {
    const ambient = ambientFrom(rig, 0.5);
    expect(ambient.weights.habit).toBeGreaterThan(0);
    for (const [type, clip] of Object.entries(motion.habits)) {
      expect(content.kids.some((k) => k.id === type), type).toBe(true);
      expect(rig.clips[clip], clip).toBeDefined();
      expect(ambient.habitSeconds![type]).toBeCloseTo(clipLength(rig, clip), 6);
      expect(ambient.habitSeconds![type]).toBeGreaterThan(1);
    }
    // The greeting lasts as long as the clip the map plays, not the portrait's.
    expect(ambient.waveSeconds).toBeCloseTo(clipLength(rig, 'wave'), 6);
  });

  it('a clip only names art that exists: body frames, the kid’s own parts, marks', () => {
    for (const [name, clip] of Object.entries(motion.clips)) {
      const type = name.startsWith('habit_') ? name.slice(6) : undefined;
      const parts = new Set(type ? (rig.costumes[type]?.components ?? []).map((c) => c.asset) : []);
      for (const f of clip.frames) {
        if (f.bodyFrame) expect(rig.bodies.round!.frames[f.bodyFrame], `${name}: ${f.bodyFrame}`).toBeDefined();
        for (const a of Object.keys(f.componentTransforms ?? {})) expect(parts.has(a), `${name}: ${a}`).toBe(true);
      }
    }
  });
});

describe('which clip a kid shows, with motion', () => {
  it('a habit plays the kid’s own clip once through; a kid without one stands', () => {
    const p = new ClipPicker(rig, rig.habits!.wizard);
    const habit: Activity = { kind: 'habit', left: 2 };
    const first = p.advance(habit, false, FRAME);
    expect(first.name).toBe('habit');
    expect(first.clip).toBe(rig.clips.habit_wizard);
    expect(first.time).toBe(0);
    expect(p.advance(habit, false, 0.5).time).toBeCloseTo(0.5, 6);
    const none = new ClipPicker(rig, undefined).advance(habit, false, FRAME);
    expect(none.name).toBe('idle');
  });

  it('a fusion’s child plays fusion_child with a newborn’s priority: a pick-up interrupts it', () => {
    const p = new ClipPicker(rig);
    p.play('fusion_child');
    expect(p.advance({ kind: 'walk' }, false, FRAME)).toMatchObject({ name: 'fusion_child', time: 0 });
    p.pickUp();
    expect(p.advance({ kind: 'walk' }, true, FRAME).name).toBe('pick_up');
    // A drop outranks a birth, so a child born mid-drop finishes its drop first.
    const q = new ClipPicker(rig);
    q.play('drop');
    q.play('fusion_child');
    expect(q.advance({ kind: 'walk' }, false, FRAME).name).toBe('drop');
  });

  it('an effect started with a delay shows nothing until then, and then runs whole', () => {
    const fx = new EffectTracks(rig);
    fx.start('discovery', 0.3);
    expect(fx.active).toEqual(['discovery']);
    expect(fx.advance(0.2)).toEqual([]);
    expect(fx.advance(0.2)).toEqual([]); // t was -0.1 when this frame began
    const frames: number[] = [];
    for (let i = 0; i < 200 && fx.active.length; i++) frames.push(fx.advance(FRAME).length);
    // It then drew for the clip's whole length, not the length less the delay.
    const drawn = frames.filter((n) => n > 0).length * FRAME;
    expect(drawn).toBeGreaterThan(clipLength(rig, 'discovery') - 0.1);
  });
});

describe('a kid drawn from a motion clip', () => {
  it('squashes and stretches about the ground point, as the clip’s frame says', () => {
    const view = new KidRigView(kid, rig, textures(), false, wild);
    const drop = rig.clips.drop!;
    // The landing frame is the widest and flattest of the clip.
    const landing = drop.frames.reduce((a, f) => ((f.rig?.scale?.[1] ?? 1) < (a.rig?.scale?.[1] ?? 1) ? f : a));
    const at = drop.frames.indexOf(landing) / drop.fps;
    view.updatePosed(0, 0, 'drop', at);
    expect(view.drawn.scale).toEqual(landing.rig!.scale);
    expect(view.drawn.scale[1]).toBeLessThan(0.9);
    expect(view.drawn.scale[0]).toBeGreaterThan(1.05);
    // A frame with no scale of its own draws at 1: nothing carries over from the last frame.
    view.update(0, 0, { kind: 'visit', site: 0, slot: 'a', phase: 'approach', left: 1, leg: 0 }, false, 0);
    view.updateFarming(0, 0, 0, 0);
    expect(view.drawn.scale).toEqual([1, 1]);
  });

  it('the walk rocks the body about its middle and bobs it up, on the step frames', () => {
    const view = new KidRigView(kid, rig, textures(), false, wild);
    const seen = new Set<string>();
    let lean = 0;
    let rise = 0;
    for (let i = 0; i < rig.clips.walk!.frames.length; i++) {
      view.updatePosed(0, 0, 'walk', i / rig.clips.walk!.fps);
      seen.add(view.drawn.body);
      lean = Math.max(lean, Math.abs(view.drawn.rotation));
      rise = Math.min(rise, view.drawn.offset[1]);
    }
    expect([...seen].sort()).toEqual(['kid_body_round_stand', 'kid_body_round_step_left', 'kid_body_round_step_right']);
    expect(lean).toBeGreaterThan(2);
    expect(rise).toBeLessThan(-2);
  });

  it('the greeting moves the arms through the wave frames; it never scales a part (D-059, D-098)', () => {
    const view = new KidRigView({ ...kid, type: 'wizard' }, rig, textures(), false, wild);
    const bodies = new Set<string>();
    for (const [i, f] of rig.clips.wave!.frames.entries()) {
      view.updatePosed(0, 0, 'wave', i / rig.clips.wave!.fps);
      bodies.add(view.drawn.body);
      expect(f.componentTransforms).toBeUndefined();
    }
    expect(bodies.has('kid_body_round_wave_high')).toBe(true);
    expect(bodies.has('kid_body_round_wave_low')).toBe(true);
  });

  it('a kid greeting another glances its way; alone, or under reduced motion, it looks ahead (D-101)', () => {
    const tex = textures();
    const view = new KidRigView(kid, rig, tex, false, wild);
    view.update(0, 0, { kind: 'wave', left: 1 }, false, 0);
    const ahead = view.drawn.faceAt[0];
    const toward = new KidRigView(kid, rig, tex, false, wild);
    toward.update(0, 0, { kind: 'wave', left: 1, toward: 1 }, false, 0);
    expect(toward.drawn.faceAt[0]).toBe(ahead + 4);
    const away = new KidRigView(kid, rig, tex, false, wild);
    away.update(0, 0, { kind: 'wave', left: 1, toward: -1 }, false, 0);
    expect(away.drawn.faceAt[0]).toBe(ahead - 4);
    const still = new KidRigView(kid, rig, tex, true, wild);
    still.update(0, 0, { kind: 'wave', left: 1, toward: 1 }, false, 0);
    expect(still.drawn.faceAt[0]).toBe(ahead);
  });

  it('motion marks are drawn only while the scene has them on, and never under reduced motion (D-100)', () => {
    const tex = textures();
    const sleep: Activity = { kind: 'sleep', left: 20, total: 30 };
    const view = new KidRigView(kid, rig, tex, false, wild);
    for (let t = 0; t < 3; t += 0.1) view.update(0, 0, sleep, false, 0.1);
    expect(view.presenting.clip).toBe('sleep');
    expect(view.drawn.marks).toBeGreaterThan(0);
    view.marksShown = false;
    view.update(0, 0, sleep, false, 0.1);
    expect(view.drawn.marks).toBe(0);
    view.marksShown = true;
    view.update(0, 0, sleep, false, 0.1);
    expect(view.drawn.marks).toBeGreaterThan(0);
    // Walking has none: the marks of the last frame are put away.
    view.update(0, 0, { kind: 'walk' }, false, 0.1);
    expect(view.drawn.marks).toBe(0);
    const still = new KidRigView(kid, rig, tex, true, wild);
    for (let t = 0; t < 3; t += 0.1) still.update(0, 0, sleep, false, 0.1);
    expect(still.drawn.marks).toBe(0);
  });

  it('a wild kid plays motion clips on its own body: the walk rocks it, a rest keeps its face rules', () => {
    const star: Kid = { ...kid, type: 'star' };
    const view = new KidRigView(star, rig, textures(), false, wild);
    let lean = 0;
    for (let t = 0; t < 1; t += FRAME) {
      view.update(0, 0, { kind: 'walk' }, false, FRAME);
      expect(view.drawn.body).toBe('kid_body_wildstar_stand');
      expect(view.drawn.parts).toBe(0);
      lean = Math.max(lean, Math.abs(view.drawn.rotation));
    }
    expect(lean).toBeGreaterThan(2);
    // Its face stays at its own anchor, whatever body frame the clip names.
    view.updatePosed(0, 0, 'sit_down', 0.4);
    expect(view.drawn.faceAt).toEqual(wild.types.star!.faceAnchorPx);
    // Its habit is its own clip.
    const habit: Activity = { kind: 'habit', left: 2 };
    view.update(0, 0, habit, false, FRAME);
    expect(view.presenting.clip).toBe('habit');
    // The farming stomp is not a motion clip: it keeps the wild sidecar's bob, unscaled.
    view.updateFarming(0, 0, 400, FRAME);
    expect(view.drawn.scale).toEqual([1, 1]);
  });

  it('a fusion’s parent, as a ghost, hops and sinks away over the moment the rig gives it (D-101)', () => {
    const view = new KidRigView(kid, rig, textures(), false, wild);
    const meet = rig.meetSeconds!;
    expect(meet).toBeGreaterThan(0.3);
    expect(clipLength(rig, 'fusion_parent')).toBeCloseTo(meet, 6);
    view.updateGhost(10, 20, 0);
    expect(view.presenting.clip).toBe('fusion_parent');
    expect([view.root.position.x, view.root.position.y]).toEqual([10, 20]);
    let top = 0;
    for (let t = 0; t < meet; t += FRAME) {
      view.updateGhost(10, 20, t);
      top = Math.min(top, view.drawn.offset[1]);
    }
    expect(top).toBeLessThan(-8); // the hop
    view.updateGhost(10, 20, meet - 0.01);
    expect(view.drawn.scale[1]).toBeLessThan(0.6); // sunk into the puff
    // The child is unseen for exactly that long, then shows.
    const child = rig.clips.fusion_child!;
    const hidden = child.frames.findIndex((f) => (f.rig?.opacity ?? 1) > 0);
    expect(hidden / child.fps).toBeCloseTo(meet, 6);
  });
});

describe('the legacy rig still draws as before (the Dex and popup portraits use it)', () => {
  it('a rig without motion has no habits, no meeting and unscaled clips', () => {
    const legacy: KidRig = kidRig!;
    expect(legacy.habits).toBeUndefined();
    expect(legacy.meetSeconds).toBeUndefined();
    for (const clip of Object.values(legacy.clips)) for (const f of clip.frames) expect(f.rig?.scale).toBeUndefined();
  });
});
