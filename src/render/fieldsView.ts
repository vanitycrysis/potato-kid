import { Container, Sprite, type Texture } from 'pixi.js';
import type { FarmData, FarmField, KidRig, WildData } from '../content/artData';
import type { Field } from '../sim/game';
import { defaultBox, type Box, type Kid, type Look } from '../sim/world';
import { KidRigView } from './rigView';

// The food fields on the map (D-069, GUI_MVP §22.1, Codex's farm_v1): a bought field's bed,
// its two crop stamps once it has a food, and its kids on their pads, working. Locked
// fields don't exist on the map. Workers are drawn by the same rig as every kid, with the
// farming step loop; their pads stay put while others come and go.

type Rect = { left: number; top: number; right: number; bottom: number };

/** A field's bed in world units: its drawn bounds about its ground, from its reserve (§22.1). */
export function fieldRect(f: FarmField): Rect {
  const [x, y] = f.worldGround;
  const [l, t, r, b] = f.reserveRelative;
  return { left: x + l, top: y + t, right: x + r, bottom: y + b };
}

/** A field's drop target for assigning by drag, in world units (§22.4). */
export function fieldDragRect(f: FarmField): Rect {
  const [x, y] = f.worldGround;
  const [l, t, r, b] = f.dragRelative;
  return { left: x + l, top: y + t, right: x + r, bottom: y + b };
}

/**
 * The bought field a tap at world point `p` hits, or null (§22.2): the bed first; only when
 * none is hit, each bed grown to at least `minCss` CSS px per axis at `zoom` (CSS px per world
 * unit), nearest centre winning, then the lower index.
 */
export function fieldAt(farm: FarmData, bought: number, p: { x: number; y: number }, zoom: number, minCss = 44): number | null {
  const rects = farm.fields.slice(0, bought).map(fieldRect);
  const inside = (r: Rect) => p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
  const hit = rects.findIndex(inside);
  if (hit >= 0) return hit;
  const min = minCss / zoom;
  let best: number | null = null;
  let bestD = Infinity;
  rects.forEach((r, i) => {
    const cx = (r.left + r.right) / 2;
    const cy = (r.top + r.bottom) / 2;
    const hw = Math.max(r.right - r.left, min) / 2;
    const hh = Math.max(r.bottom - r.top, min) / 2;
    if (!inside({ left: cx - hw, top: cy - hh, right: cx + hw, bottom: cy + hh })) return;
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/**
 * Pads for a field's kids (§22.1): a kid keeps its pad while it farms; a newcomer takes the
 * first free pad in Codex's admission order (front left, front right, rear left, rear right).
 */
export function assignPads(previous: ReadonlyMap<number, number>, workerIds: readonly number[], order: readonly number[]): Map<number, number> {
  const pads = new Map<number, number>();
  for (const id of workerIds) {
    const pad = previous.get(id);
    if (pad !== undefined) pads.set(id, pad);
  }
  const taken = new Set(pads.values());
  for (const id of workerIds) {
    if (pads.has(id)) continue;
    const pad = order.find((p) => !taken.has(p));
    if (pad === undefined) continue;
    pads.set(id, pad);
    taken.add(pad);
  }
  return pads;
}

interface FieldNode {
  root: Container;
  bed: Container;
  crops: Container;
  kids: Container;
  food: string | null | undefined;
  pads: Map<number, number>;
  views: Map<number, KidRigView>;
}

export class FieldsView {
  /** Beds and crops: under the rare marks and the map's kids. */
  readonly root = new Container({ label: 'fieldBeds' });
  /** Farming kids: above the rare marks, as kids on the map are (Codex review, #90). */
  readonly workers = new Container({ label: 'fieldWorkers' });
  private readonly nodes: FieldNode[] = [];
  private clock = 0;

  constructor(
    private readonly farm: FarmData,
    private readonly rig: KidRig,
    private readonly textures: Map<string, Texture>,
    private readonly reducedMotion: boolean,
    /** Whether a kid type's costume is loaded (and asks for it if not). */
    private readonly ready: (type: string) => boolean,
    /** A kid's box in the current art, by look and type: a farming kid's hit area (its body, not its shadow). */
    private readonly boxOf: (look: Look, type: string) => Box = () => defaultBox(60),
    /** Wild kids' own bodies (kid_wild_v1). */
    private readonly wild?: WildData,
  ) {}

  /** Farming kid `id`'s box on screen (global coordinates), from its look's box at its feet. */
  private screenBox(n: FieldNode, id: number, view: KidRigView): { minX: number; minY: number; maxX: number; maxY: number } {
    const w = this.looks.get(id);
    const b = this.boxOf(w?.look ?? { body: '', face: '', scale: 1 }, w?.type ?? '');
    const a = n.kids.toGlobal({ x: view.root.x + b.left, y: view.root.y + b.top });
    const c = n.kids.toGlobal({ x: view.root.x + b.right, y: view.root.y + b.bottom });
    return { minX: Math.min(a.x, c.x), minY: Math.min(a.y, c.y), maxX: Math.max(a.x, c.x), maxY: Math.max(a.y, c.y) };
  }

  /** Each farming kid's look and type, for its hit box. */
  private readonly looks = new Map<number, { look: Look; type: string }>();

  update(fields: readonly Field[], dt: number): void {
    this.clock += dt * 1000;
    fields.forEach((field, i) => {
      const site = this.farm.fields[i];
      if (!site) return;
      const node = this.nodes[i] ?? this.create(i, site);
      if (node.food !== field.food) {
        node.food = field.food;
        for (const c of node.crops.removeChildren()) c.destroy();
        const asset = field.food ? this.farm.render.cropAssets[field.food] : undefined;
        const t = asset ? this.textures.get(asset) : undefined;
        if (t) {
          for (const [dx, dy] of site.cropGroundsRelative) {
            const s = new Sprite(t);
            const [px, py] = this.farm.render.cropSourcePivot;
            s.anchor.set(px / t.width, py / t.height);
            s.scale.set(this.farm.render.cropScale);
            s.position.set(dx, dy);
            node.crops.addChild(s);
          }
        }
      }
      // Kids on their pads; a kid whose costume is still loading is drawn once it is ready.
      const ids = field.workers.map((w) => w.id);
      node.pads = assignPads(node.pads, ids, site.workerAdmissionPadOrder);
      for (const [id, view] of node.views) {
        if (ids.includes(id)) continue;
        view.destroy();
        node.views.delete(id);
      }
      for (const w of field.workers) {
        this.looks.set(w.id, { look: w.look, type: w.type });
        const pad = node.pads.get(w.id);
        if (pad === undefined) continue;
        let view = node.views.get(w.id);
        if (!view) {
          if (!this.ready(w.type)) continue;
          const kid = { ...w, x: 0, y: 0, heading: 0, activity: { kind: 'pause', left: 1e9 }, grace: 0, held: false, box: defaultBox(60) } as Kid;
          view = new KidRigView(kid, this.rig, this.textures, this.reducedMotion, this.wild);
          view.root.eventMode = 'none';
          node.views.set(w.id, view);
          node.kids.addChild(view.root);
        }
        const [fx, fy] = site.workerFeetRelative[pad]!;
        view.updateFarming(fx, fy, this.clock, dt);
      }
    });
  }

  private create(i: number, site: FarmField): FieldNode {
    const root = new Container();
    root.position.set(site.worldGround[0], site.worldGround[1]);
    const bed = new Container();
    const t = this.textures.get(this.farm.render.fieldAsset);
    if (t) {
      const s = new Sprite(t);
      s.anchor.set(site.sourcePivot[0] / t.width, site.sourcePivot[1] / t.height);
      s.scale.set(site.scale);
      bed.addChild(s);
    }
    const crops = new Container();
    // Workers by foot y, above the bed and crops (§22.1), in the worker layer, at the field.
    const kids = new Container();
    kids.sortableChildren = true;
    kids.position.set(site.worldGround[0], site.worldGround[1]);
    root.addChild(bed, crops);
    this.root.addChild(root);
    this.workers.addChild(kids);
    const node: FieldNode = { root, bed, crops, kids, food: undefined, pads: new Map(), views: new Map() };
    this.nodes[i] = node;
    return node;
  }

  /**
   * The farming kid drawn under global point `p`, the frontmost (lowest feet) first, or null:
   * an actual working kid's tap opens its card (GUI_MVP §22.2).
   */
  workerAt(p: { x: number; y: number }): number | null {
    let hit: { id: number; front: number } | null = null;
    for (const n of this.nodes) {
      for (const [id, view] of n.views) {
        const b = this.screenBox(n, id, view);
        if (p.x < b.minX || p.x > b.maxX || p.y < b.minY || p.y > b.maxY) continue;
        const front = n.root.y + view.root.y;
        if (!hit || front > hit.front || (front === hit.front && id < hit.id)) hit = { id, front };
      }
    }
    return hit?.id ?? null;
  }

  /**
   * Farming kids whose tap targets hold global point `p`: each drawn box grown to at least
   * `minPx` per axis about its centre, nearest centre first, then the lower id (§20.1, §22.2).
   * Only for taps: a farming kid is never dragged.
   */
  workersNear(p: { x: number; y: number }, minPx: number): number[] {
    const hits: { id: number; d: number }[] = [];
    for (const n of this.nodes) {
      for (const [id, view] of n.views) {
        const b = this.screenBox(n, id, view);
        const cx = (b.minX + b.maxX) / 2;
        const cy = (b.minY + b.maxY) / 2;
        const hw = Math.max(b.maxX - b.minX, minPx) / 2;
        const hh = Math.max(b.maxY - b.minY, minPx) / 2;
        if (Math.abs(p.x - cx) > hw || Math.abs(p.y - cy) > hh) continue;
        hits.push({ id, d: Math.hypot(p.x - cx, p.y - cy) });
      }
    }
    return hits.sort((a, b) => a.d - b.d || a.id - b.id).map((h) => h.id);
  }

  /** A farming kid's feet in world units, or undefined (test hook). */
  feetOf(id: number): { x: number; y: number } | undefined {
    for (const n of this.nodes) {
      const view = n.views.get(id);
      if (view) return { x: n.root.x + view.root.x, y: n.root.y + view.root.y };
    }
    return undefined;
  }

  /** Test hook: what each bought field shows. */
  shown(): { food: string | null; crops: number; kids: { id: number; pad: number }[] }[] {
    return this.nodes.map((n) => ({ food: n.food ?? null, crops: n.crops.children.length, kids: [...n.views.keys()].map((id) => ({ id, pad: n.pads.get(id)! })) }));
  }
}
