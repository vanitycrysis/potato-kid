import 'pixi.js/events';
import { Container, EventBoundary, Texture, TextureSource, updateRenderGroupTransforms } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { kidRig, type EventEffect } from '../content/artData';
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
