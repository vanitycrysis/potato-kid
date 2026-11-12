// Checks every kid costume against the drawing rules, in every pose, by rasterising the art
// sources the way the engine composes them (docs/ART.md):
//   bounds  nothing outside the body's lifetime box (D-043)
//   grip    a prop in the right hand touches the right arm (D-098)
//   face    nothing in front covers or crowds the eyes and smirk, on any face (D-045)
//   join    parts of one object listed as `joined` in kid_checks.json overlap (D-098)
// Usage: npm run art:kids [-- --types wizard,bee] [--all]
// Without --types it checks the kids listed as `checked` in art/kid_checks.json; --all
// checks the whole roster and only reports (older costumes predate the grip rule).
import { chromium } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const rig = JSON.parse(readFileSync(join(ROOT, 'art/data/kid_rig_v2.json'), 'utf8'));
const activity = JSON.parse(readFileSync(join(ROOT, 'art/data/kid_activity_v1.json'), 'utf8'));
for (const [b, extra] of Object.entries(activity.bodies)) rig.bodies[b].frames = { ...extra.frames, ...rig.bodies[b].frames };
const checks = JSON.parse(readFileSync(join(ROOT, 'art/kid_checks.json'), 'utf8'));
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};
const all = process.argv.includes('--all');
const types = arg('--types')?.split(',') ?? (all ? Object.keys(rig.costumes) : checks.checked);

const files = new Map();
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e.endsWith('.svg')) files.set(e.slice(0, -4), readFileSync(p, 'utf8'));
  }
})(join(ROOT, 'art/src'));

// The arms are the body frame's path drawn with relative strokes (`q` or `l`); feet use `Q`.
// The right arm is its second stroke.
const arms = {};
for (const [b, body] of Object.entries(rig.bodies)) {
  arms[b] = {};
  for (const [f, frame] of Object.entries(body.frames)) {
    const paths = [...files.get(frame.asset).matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
    const arm = paths.find((d) => /^M[\d. ]+ [ql]/.test(d));
    if (!arm) throw new Error(`${frame.asset}: no arm path found`);
    const subs = arm.split(/(?=M)/).map((s) => s.trim());
    arms[b][f] = subs[1];
  }
}

const needed = new Set();
for (const t of types) for (const c of rig.costumes[t]?.components ?? []) needed.add(c.asset);
for (const f of Object.values(rig.faces)) for (const a of Object.values(f.states)) needed.add(a);
const sources = Object.fromEntries([...needed].map((n) => [n, `data:image/svg+xml;base64,${Buffer.from(files.get(n) ?? '').toString('base64')}`]));

const browser = await chromium.launch();
const page = await browser.newPage();
const report = await page.evaluate(
  async ({ rig, types, sources, arms, faceMargin, gripReach, joined }) => {
    const S = 256;
    const images = {};
    await Promise.all(
      Object.entries(sources).map(async ([name, url]) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        images[name] = img;
      }),
    );
    const canvas = new OffscreenCanvas(S, S);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const mask = (draw) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, S, S);
      draw();
      const { data } = ctx.getImageData(0, 0, S, S);
      const m = new Uint8Array(S * S);
      for (let i = 0; i < m.length; i++) m[i] = data[i * 4 + 3] > 40 ? 1 : 0;
      return m;
    };
    // As KidRigView composes a part: the attachment (position, rotation, scale), then the
    // part's fit for this body about its pivot.
    const place = (asset, a, pivot, fit) => () => {
      ctx.translate(a.position[0], a.position[1]);
      ctx.rotate(((a.rotationDeg ?? 0) * Math.PI) / 180);
      ctx.scale(a.scale?.[0] ?? 1, a.scale?.[1] ?? 1);
      ctx.scale(fit[0], fit[1]);
      ctx.translate(-pivot[0], -pivot[1]);
      ctx.drawImage(images[asset], 0, 0);
    };
    /** Grows a mask by `r` px (a square brush: slightly generous, which suits a clearance). */
    const grow = (m, r) => {
      const out = new Uint8Array(m.length);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        if (!m[y * S + x]) continue;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const [u, v] = [x + dx, y + dy];
          if (u >= 0 && v >= 0 && u < S && v < S) out[v * S + u] = 1;
        }
      }
      return out;
    };
    const touches = (a, b) => {
      for (let i = 0; i < a.length; i++) if (a[i] && b[i]) return true;
      return false;
    };
    const out = [];
    for (const type of types) {
      const costume = rig.costumes[type];
      if (!costume) continue;
      for (const [bodyId, body] of Object.entries(rig.bodies)) {
        const [l, t, r, b] = body.boundsPx;
        for (const [frameId, frame] of Object.entries(body.frames)) {
          const where = `${type} / ${bodyId} / ${frameId}`;
          const front = new Uint8Array(S * S);
          const arm = mask(() => {
            ctx.lineWidth = 7.5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = '#000';
            ctx.stroke(new Path2D(arms[bodyId][frameId]));
          });
          const masks = {};
          for (const c of costume.components) {
            const a = frame.attachments[c.attachTo];
            const m = mask(place(c.asset, a, c.sourcePivot, c.fitByBody[bodyId] ?? [1, 1]));
            masks[c.asset] = m;
            let over = 0;
            for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
              if (!m[y * S + x]) continue;
              over = Math.max(over, l - x, t - y, x + 1 - r, y + 1 - b);
              if (c.layer === 'front') front[y * S + x] = 1;
            }
            if (over > 0) out.push({ rule: 'bounds', where, part: c.asset, by: over });
            if (c.attachTo === 'hand_right') {
              // The gap between prop and arm, in px: 0 means they touch.
              let gap = 0;
              let grown = arm;
              while (!touches(m, grown) && gap < gripReach) {
                gap++;
                grown = grow(arm, gap);
              }
              if (gap > 0) out.push({ rule: 'grip', where, part: c.asset, by: gap });
            }
          }
          for (const [a, b] of joined[type] ?? []) if (!touches(masks[a], masks[b])) out.push({ rule: 'join', where, part: `${a} + ${b}`, by: 0 });
          for (const [faceId, face] of Object.entries(rig.faces)) {
            for (const [state, asset] of Object.entries(face.states)) {
              const f = grow(mask(place(asset, frame.attachments.face_centre, face.sourcePivot, [1, 1])), faceMargin);
              if (touches(front, f)) out.push({ rule: 'face', where, part: `${faceId} ${state}`, by: 0 });
            }
          }
        }
      }
    }
    return out;
  },
  { rig, types, sources, arms, faceMargin: 3, gripReach: 30, joined: checks.joined ?? {} },
);
await browser.close();

// One line per rule and part: the worst case, and how many poses share it.
const groups = new Map();
for (const p of report) {
  const key = `${p.rule}|${p.where.split(' / ')[0]}|${p.part}`;
  const g = groups.get(key) ?? { ...p, count: 0, wheres: [] };
  g.count++;
  g.wheres.push(`${p.where.split(' / ').slice(1).join('/')}${p.by ? ` ${p.by}px` : ''}`);
  if (p.by >= g.by) Object.assign(g, { by: p.by, where: p.where });
  groups.set(key, g);
}
const said = { bounds: 'outside the lifetime box', grip: 'does not touch the right arm', face: 'crowds the face', join: 'do not touch each other' };
for (const g of groups.values()) {
  console.log(`${g.rule.padEnd(6)} ${g.where.split(' / ')[0]}: ${g.part} ${said[g.rule]} in ${g.count} pose(s)${g.by ? `, worst ${g.by} px` : ''}: ${g.wheres.slice(0, 8).join(', ')}${g.wheres.length > 8 ? ', …' : ''}`);
}
const failing = [...groups.values()].filter((g) => !all || checks.checked.includes(g.where.split(' / ')[0]));
console.log(`\n${types.length} kid(s) checked in every body and pose: ${groups.size === 0 ? 'no problems' : `${groups.size} problem(s)`}.`);
if (failing.length && !all) process.exit(1);
