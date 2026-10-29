import 'pixi.js/events';
import { Container, EventBoundary, Texture, TextureSource, updateRenderGroupTransforms } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { activityEffects, kidRig, kidWild, type EventEffect } from '../content/artData';
import type { Kid } from '../sim/world';
import { KidRigView } from './rigView';

// Hit testing only needs texture sizes, so each asset gets a blank texture of its real canvas.
const rig = kidRig!;
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
  for (const t of Object.values(kidWild!.types)) for (const f of Object.values(t.frames)) size.set(f.asset, kidCanvas);
  for (const fx of Object.values(activityEffects)) size.set(fx.asset, fx.canvas);
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

describe('kid hit area', () => {
  it('effects never make empty ground around a kid pickable (Codex review, PR #24)', () => {
    // Hit testing reads world transforms, which a real render updates each frame.
    const stage = new Container({ isRenderGroup: true });
    const settle = () => updateRenderGroupTransforms(stage.renderGroup!, true);
    const view = new KidRigView(kid, rig, textures(), false);
    view.root.eventMode = 'static';
    stage.addChild(view.root);
    view.root.position.set(500, 500);
    const boundary = new EventBoundary(stage);
    // Just outside the kid canvas's left edge at body height: only effect art reaches here.
    const k = rig.worldCanvasSize / rig.canvas[0];
    const outside = { x: 500 - (rig.groundAnchor[0] + 12) * k, y: 500 - 60 * k };

    view.update(500, 500, kid.activity, false, 0);
    settle();
    expect(boundary.hitTest(outside.x, outside.y)).toBeNull();

    view.startEffect('fusion');
    view.startEffect('discovery');
    view.update(500, 500, kid.activity, false, 1 / 60);
    settle();
    expect(view.presenting.effects.sort()).toEqual(['discovery', 'fusion']);
    expect(boundary.hitTest(outside.x, outside.y)).toBeNull();
    // The kid itself is still a press target.
    expect(boundary.hitTest(500, 500 - 60 * k)).not.toBeNull();
  });
});

describe('a wild kid (kid_wild_v1, D-072/D-073)', () => {
  const wild = kidWild!;
  const blimp: Kid = { ...kid, type: 'blimp' };

  it('draws its own stand body and the shared face at its anchor; no costume over it', () => {
    const view = new KidRigView(blimp, rig, textures(), false, wild);
    view.update(0, 0, { kind: 'pause', left: 5 }, false, 0);
    const d = view.drawn;
    expect(d.body).toBe(wild.types.blimp!.frames.stand!.asset);
    expect(d.face).toBe(rig.faces.classic!.states.open);
    expect(d.faceAt).toEqual(wild.types.blimp!.faceAnchorPx);
    expect(d.parts).toBe(0);
    // An ordinary kid keeps its costume and its body's frames.
    const plain = new KidRigView(kid, rig, textures(), false, wild);
    plain.update(0, 0, { kind: 'pause', left: 5 }, false, 0);
    expect(plain.drawn.body).not.toBe(d.body);
  });

  it('walks with the sidecar’s bob; reduced motion stands still', () => {
    const view = new KidRigView(blimp, rig, textures(), false, wild);
    const offsets = new Set<number>();
    for (let i = 0; i < 40; i++) {
      view.update(0, 0, { kind: 'walk' }, false, 0.025);
      offsets.add(view.drawn.offset[1]);
    }
    const bob = new Set(wild.clips.walk!.frames!.map((f) => f.offsetPx[1]));
    expect(offsets).toEqual(bob);
    const still = new KidRigView(blimp, rig, textures(), true, wild);
    for (let i = 0; i < 40; i++) {
      still.update(0, 0, { kind: 'walk' }, false, 0.025);
      expect(still.drawn.offset).toEqual(wild.reducedMotion.walk!.offsetPx);
    }
  });

  it('a clip with no frames of its own borrows its alias’s (seated → idle), standing', () => {
    expect(wild.clips.seated!.frames).toBeUndefined();
    const view = new KidRigView(blimp, rig, textures(), false, wild);
    // The sim counts the activity down; the picker times the clips from it.
    for (let i = 0; i < 200; i++) view.update(0, 0, { kind: 'sit', left: 30 - i * 0.05, total: 30 }, false, 0.05);
    expect(view.presenting.clip).toBe('seated');
    expect(view.drawn.body).toBe(wild.types.blimp!.frames.stand!.asset);
    expect(view.drawn.offset).toEqual(wild.clips.idle!.frames![0]!.offsetPx);
  });

  it('seated on a decoration, its drop one-shot and effects play out on time (Codex review round 3, #121)', () => {
    const view = new KidRigView(kid, rig, textures(), false);
    view.dropped();
    view.startEffect('fusion');
    for (let i = 0; i < 100; i++) view.updateVisiting(0, 0, 'decoration_sitting', 0, i * 50, 0.05);
    expect(view.presenting.effects).toEqual([]);
    // Up again: no drop left over from before.
    view.update(0, 0, { kind: 'walk' }, false, 0.05);
    expect(view.presenting.clip).toBe('walk');
  });

  it('sleeps with the shared face asleep; farms standing', () => {
    const view = new KidRigView(blimp, rig, textures(), false, wild);
    for (let i = 0; i < 200; i++) view.update(0, 0, { kind: 'sleep', left: 30 - i * 0.05, total: 30 }, false, 0.05);
    expect(view.presenting.clip).toBe('sleep');
    expect(view.drawn.face).toBe(rig.faces.classic!.states.asleep);
    const worker = new KidRigView(blimp, rig, textures(), false, wild);
    // Farming (D-089): its own body all along, tamping with its 3 px bob, and the stamp.
    const seen = new Set<string>();
    let stamped = false;
    for (let ms = 0; ms < 1500; ms += 25) {
      worker.updateFarming(10, 20, ms, 0.025);
      expect(worker.drawn.body).toBe(wild.types.blimp!.frames.stand!.asset);
      seen.add(worker.drawn.offset.join(','));
      stamped ||= worker.drawn.stamp;
    }
    expect([...seen].sort()).toEqual(['0,-3', '0,0']);
    expect(stamped).toBe(true);
  });
});

describe('farming (D-089, kid_activity_v1 farm_stomp)', () => {
  const farmer = { ...kid, id: 0 } as Kid;

  it('the extension is merged into the rig: the stomp clip, its body frames, its still frame', () => {
    expect(rig.clips.farm_stomp!.frames).toHaveLength(12);
    expect(rig.clips.farm_stomp!.fps).toBe(8);
    for (const body of ['round', 'tall', 'squat', 'bean']) for (const f of ['farm_left', 'farm_right']) expect(rig.bodies[body]!.frames[f]!.asset).toBe(`kid_body_${body}_${f}`);
    // Offsets written as "0 0" arrive as vectors.
    expect(rig.clips.farm_stomp!.frames[0]!.rig!.offsetPx).toEqual([0, 0]);
    expect(rig.reducedMotion.farm_stomp).toMatchObject({ bodyFrame: 'stand' });
    // Nothing the rig had is replaced.
    expect(rig.bodies.round!.frames.stand!.asset).toBe('kid_body_round_stand');
  });

  it('stomps left, then right, in a 1.5 s loop, with the stamp on each landing only', () => {
    const view = new KidRigView(farmer, rig, textures(), false);
    const at = (ms: number) => {
      view.updateFarming(0, 0, ms, 0.001);
      return { body: view.drawn.body, stamp: view.drawn.stamp };
    };
    // Frame n shows for [125 n, 125 n + 125) ms (id 0: no phase).
    expect(at(10)).toEqual({ body: 'kid_body_round_stand', stamp: false });
    expect(at(200)).toEqual({ body: 'kid_body_round_farm_left', stamp: false });
    expect(at(400)).toEqual({ body: 'kid_body_round_stand', stamp: true });
    expect(at(700)).toEqual({ body: 'kid_body_round_farm_right', stamp: false });
    expect(at(900)).toEqual({ body: 'kid_body_round_stand', stamp: true });
    expect(at(1200)).toEqual({ body: 'kid_body_round_stand', stamp: false });
    expect(at(1500 + 200)).toEqual({ body: 'kid_body_round_farm_left', stamp: false });
  });

  it('two kids in a field stomp out of step', () => {
    const a = new KidRigView({ ...kid, id: 1 } as Kid, rig, textures(), false);
    const b = new KidRigView({ ...kid, id: 2 } as Kid, rig, textures(), false);
    let differ = 0;
    for (let ms = 0; ms < 1500; ms += 50) {
      a.updateFarming(0, 0, ms, 0.05);
      b.updateFarming(0, 0, ms, 0.05);
      if (a.drawn.body !== b.drawn.body) differ++;
    }
    expect(differ).toBeGreaterThan(0);
  });

  it('reduced motion: it stands, with no stamp', () => {
    const view = new KidRigView(farmer, rig, textures(), true);
    for (let ms = 0; ms < 1500; ms += 25) {
      view.updateFarming(0, 0, ms, 0.025);
      expect(view.drawn.body).toBe('kid_body_round_stand');
      expect(view.drawn.stamp).toBe(false);
    }
  });
});
