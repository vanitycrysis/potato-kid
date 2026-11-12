// Checks every kid costume against the drawing rules, in every pose, by rasterising the art
// sources the way the engine composes them (docs/ART.md):
//   bounds  nothing outside the body's lifetime box (D-043)
//   grip    a prop in the right hand overlaps the right arm (D-098)
//   join    parts of one object listed as `joined` in art/kid_checks.json overlap (D-098)
//   under   for a pair listed as `under`, the first part's tip is covered by the second
//           (an umbrella's shaft must not poke through its canopy, or stand beside it)
//   wild    a wild kid listed as `checkedWild` keeps inside its lifetime box, and every face
//           sits on its body's fill with room to spare (D-045, D-072)
//   face    nothing in front covers or crowds the eyes and smirk, on any face, with the face
//           where it rests and where a glance moves it (D-045)
// Usage: npm run art:kids [-- --types wizard,bee] [--all]
// Without --types it checks the kids listed as `checked` in art/kid_checks.json; --all checks
// the whole roster and only reports (older costumes predate the grip rule).
//
// What it cannot judge: whether a grip looks convincing, or how a costume reads. It is a
// floor under the review, not the review (Codex's art review, PR #127).
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
const wild = JSON.parse(readFileSync(join(ROOT, 'art/data/kid_wild_v1.json'), 'utf8'));
const named = arg('--types')?.split(',');
const types = (named ?? (all ? Object.keys(rig.costumes) : checks.checked)).filter((t) => !wild.types[t]);
const wildTypes = (named ?? (all ? Object.keys(wild.types) : (checks.checkedWild ?? []))).filter((t) => wild.types[t]);

const files = new Map();
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e.endsWith('.svg')) files.set(e.slice(0, -4), readFileSync(p, 'utf8'));
  }
})(join(ROOT, 'art/src'));

// The arms are the body frame's path drawn with relative strokes (`q` or `l`); feet use `Q`.
// The right arm is its second stroke. A frame may wrap its paths in a translate group.
const arms = {};
for (const [b, body] of Object.entries(rig.bodies)) {
  arms[b] = {};
  for (const [f, frame] of Object.entries(body.frames)) {
    const svg = files.get(frame.asset);
    const hit = [...svg.matchAll(/<path d="([^"]+)"/g)].find((m) => /^M[\d. ]+ [ql]/.test(m[1]));
    if (!hit) throw new Error(`${frame.asset}: no arm path found`);
    const before = svg.slice(0, hit.index);
    const open = before.lastIndexOf('<g transform="translate(');
    const shift = open > before.lastIndexOf('</g>') ? before.slice(open).match(/translate\(([-\d.]+)[ ,]+([-\d.]+)\)/).slice(1, 3).map(Number) : [0, 0];
    arms[b][f] = { d: hit[1].split(/(?=M)/)[1].trim(), shift };
  }
}

const needed = new Set();
for (const t of types) for (const c of rig.costumes[t]?.components ?? []) needed.add(c.asset);
for (const f of Object.values(rig.faces)) for (const a of Object.values(f.states)) needed.add(a);
for (const t of wildTypes) for (const f of Object.values(wild.types[t].frames)) needed.add(f.asset);
const sources = Object.fromEntries([...needed].map((n) => [n, `data:image/svg+xml;base64,${Buffer.from(files.get(n) ?? '').toString('base64')}`]));

const browser = await chromium.launch();
const page = await browser.newPage();
const report = await page.evaluate(
  async ({ rig, types, sources, arms, rules, wildKids }) => {
    // Twice the source size, so half a source pixel shows.
    const K = 2;
    const S = 256 * K;
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
      ctx.setTransform(K, 0, 0, K, 0, 0);
      ctx.clearRect(0, 0, 256, 256);
      draw();
      const { data } = ctx.getImageData(0, 0, S, S);
      const m = new Uint8Array(S * S);
      for (let i = 0; i < m.length; i++) m[i] = data[i * 4 + 3] > 16 ? 1 : 0;
      return m;
    };
    // As KidRigView composes a part: the attachment (position plus any clip offset, rotation,
    // scale), then the part's fit for this body about its pivot.
    const place = (asset, a, pivot, fit, offset = [0, 0]) => () => {
      ctx.translate(a.position[0] + offset[0], a.position[1] + offset[1]);
      ctx.rotate(((a.rotationDeg ?? 0) * Math.PI) / 180);
      ctx.scale(a.scale?.[0] ?? 1, a.scale?.[1] ?? 1);
      ctx.scale(fit[0], fit[1]);
      ctx.translate(-pivot[0], -pivot[1]);
      ctx.drawImage(images[asset], 0, 0, 256, 256);
    };
    /** Grows a mask by `r` source px (a square brush: slightly generous, which suits a clearance). */
    const grow = (m, r) => {
      const n = Math.round(r * K);
      const rows = new Uint8Array(m.length);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        if (!m[y * S + x]) continue;
        for (let dx = -n; dx <= n; dx++) if (x + dx >= 0 && x + dx < S) rows[y * S + x + dx] = 1;
      }
      const out = new Uint8Array(m.length);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        if (!rows[y * S + x]) continue;
        for (let dy = -n; dy <= n; dy++) if (y + dy >= 0 && y + dy < S) out[(y + dy) * S + x] = 1;
      }
      return out;
    };
    /** Shared area of two masks, in source px². */
    const shared = (a, b) => {
      let n = 0;
      for (let i = 0; i < a.length; i++) if (a[i] && b[i]) n++;
      return n / (K * K);
    };
    const out = [];
    for (const type of types) {
      const costume = rig.costumes[type];
      if (!costume) continue;
      for (const [bodyId, body] of Object.entries(rig.bodies)) {
        const [l, t, r, b] = body.boundsPx.map((v) => v * K);
        for (const [frameId, frame] of Object.entries(body.frames)) {
          const where = `${type} / ${bodyId} / ${frameId}`;
          const front = new Uint8Array(S * S);
          const armOf = arms[bodyId][frameId];
          const arm = mask(() => {
            ctx.translate(armOf.shift[0], armOf.shift[1]);
            ctx.lineWidth = 7.5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = '#000';
            ctx.stroke(new Path2D(armOf.d));
          });
          const masks = {};
          for (const c of costume.components) {
            const m = mask(place(c.asset, frame.attachments[c.attachTo], c.sourcePivot, c.fitByBody[bodyId] ?? [1, 1]));
            masks[c.asset] = m;
            let over = 0;
            for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
              if (!m[y * S + x]) continue;
              over = Math.max(over, l - x, t - y, x + 1 - r, y + 1 - b);
              if (c.layer === 'front') front[y * S + x] = 1;
            }
            if (over > 0) out.push({ rule: 'bounds', where, part: c.asset, by: over / K });
            if (c.attachTo === 'hand_right') {
              const area = shared(m, arm);
              if (area >= rules.gripArea) continue;
              // How far apart they are, in source px: 0 means they touch, but too little to hold.
              let gap = 0;
              while (area === 0 && gap < rules.gripReach && shared(m, grow(arm, gap + 1)) === 0) gap++;
              out.push({ rule: 'grip', where, part: c.asset, by: area > 0 ? 0 : gap + 1, note: area > 0 ? `only ${area.toFixed(1)} px² of contact` : '' });
            }
          }
          for (const [a, c] of rules.joined[type] ?? []) {
            const area = shared(masks[a], masks[c]);
            if (area < rules.joinArea) out.push({ rule: 'join', where, part: `${a} + ${c}`, by: 0, note: `${area.toFixed(1)} px² of contact` });
          }
          for (const [a, c] of rules.under[type] ?? []) {
            // The first part's tip (its top 12 px) must lie under the second: in each column of
            // the tip, the cover starts at or above it. A column with no cover at all fails too.
            let tip = S;
            for (let i = 0; i < S * S && tip === S; i++) if (masks[a][i]) tip = Math.floor(i / S);
            let above = 0;
            for (let x = 0; x < S; x++) {
              let ta = -1;
              for (let y = tip; y < Math.min(S, tip + 12 * K) && ta < 0; y++) if (masks[a][y * S + x]) ta = y;
              if (ta < 0) continue;
              let tc = -1;
              for (let y = 0; y < S && tc < 0; y++) if (masks[c][y * S + x]) tc = y;
              above = Math.max(above, tc < 0 ? 12 * K : tc - ta);
            }
            if (above > 0) out.push({ rule: 'under', where, part: `${a} above ${c}`, by: above / K });
          }
          for (const [faceId, face] of Object.entries(rig.faces)) {
            for (const [state, asset] of Object.entries(face.states)) {
              for (const dx of rules.faceShifts) {
                const f = grow(mask(place(asset, frame.attachments.face_centre, face.sourcePivot, [1, 1], [dx, 0])), rules.faceMargin);
                if (shared(front, f) > 0) out.push({ rule: 'face', where, part: `${faceId} ${state}${dx ? ` glancing ${dx > 0 ? 'right' : 'left'}` : ''}`, by: 0 });
              }
            }
          }
        }
      }
    }
    // Wild kids: one body of their own with the shared face on it.
    for (const [type, w] of wildKids) {
      const [l, t, r, b] = w.lifetimeBoundsPx.map((v) => v * K);
      for (const [frameId, frame] of Object.entries(w.frames)) {
        const where = `${type} / own body / ${frameId}`;
        const body = mask(() => ctx.drawImage(images[frame.asset], 0, 0, 256, 256));
        let over = 0;
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (body[y * S + x]) over = Math.max(over, l - x, t - y, x + 1 - r, y + 1 - b);
        if (over > 0) out.push({ rule: 'bounds', where, part: frame.asset, by: over / K });
        const anchor = { position: w.faceAnchorPx, rotationDeg: 0, scale: [w.faceScale, w.faceScale] };
        for (const [faceId, face] of Object.entries(rig.faces)) {
          for (const [state, asset] of Object.entries(face.states)) {
            for (const dx of rules.faceShifts) {
              const f = grow(mask(place(asset, anchor, face.sourcePivot, [1, 1], [dx * w.faceScale, 0])), rules.faceMargin);
              let off = 0;
              for (let i = 0; i < f.length; i++) if (f[i] && !body[i]) off++;
              if (off > 0) out.push({ rule: 'wild', where, part: `${faceId} ${state}${dx ? ` glancing ${dx > 0 ? 'right' : 'left'}` : ''}`, by: 0 });
            }
          }
        }
      }
    }
    return out;
  },
  {
    rig,
    wildKids: wildTypes.map((t) => [t, wild.types[t]]),
    types,
    sources,
    arms,
    rules: {
      // A hold is at least this much shared ink, in source px² (a touch at one pixel is not a
      // grip). Whether a hold convinces is still the review's call.
      gripArea: 12,
      gripReach: 30,
      joinArea: 12,
      // Clear source px around the face, with the face at rest and at the widest glance a clip
      // gives it (motion v1's look_around: 5 px).
      faceMargin: 3,
      faceShifts: [0, -5, 5],
      joined: checks.joined ?? {},
      under: checks.under ?? {},
    },
  },
);
await browser.close();

// One line per rule and part: the worst case, and how many poses share it.
const groups = new Map();
for (const p of report) {
  const key = `${p.rule}|${p.where.split(' / ')[0]}|${p.part}`;
  const g = groups.get(key) ?? { ...p, count: 0, wheres: [] };
  g.count++;
  g.wheres.push(`${p.where.split(' / ').slice(1).join('/')}${p.by ? ` ${p.by}px` : ''}${p.note ? ` (${p.note})` : ''}`);
  if (p.by >= g.by) Object.assign(g, { by: p.by, where: p.where });
  groups.set(key, g);
}
const said = { bounds: 'outside the lifetime box', grip: 'is not held by the right arm', face: 'crowds the face', join: 'do not join', under: 'shows', wild: 'is not wholly on the body' };
for (const g of groups.values()) {
  console.log(`${g.rule.padEnd(6)} ${g.where.split(' / ')[0]}: ${g.part} ${said[g.rule]} in ${g.count} pose(s)${g.by ? `, worst ${g.by} px` : ''}: ${g.wheres.slice(0, 8).join(', ')}${g.wheres.length > 8 ? ', …' : ''}`);
}
const failing = [...groups.values()].filter((g) => !all || checks.checked.includes(g.where.split(' / ')[0]));
console.log(`\n${types.length + wildTypes.length} kid(s) checked in every body and pose: ${groups.size === 0 ? 'no problems' : `${groups.size} problem(s)`}.`);
if (failing.length && !all) process.exit(1);
