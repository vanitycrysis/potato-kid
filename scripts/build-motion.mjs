// Bakes the motion scripts in art/motion into art/data/kid_motion_v1.json (docs/ART.md,
// "Animation"). The engine only plays the baked frames (D-041): nothing is animated in code.
//   npm run motion:build           write the sidecar
//   npm run motion:build -- --check   fail if the committed sidecar is out of date
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as core from '../art/motion/core.mjs';
import { habits } from '../art/motion/habits.mjs';
import { excursion, FPS } from '../art/motion/lib.mjs';

const ROOT = process.cwd();
const OUT = join(ROOT, 'art/data/kid_motion_v1.json');
const rig = JSON.parse(readFileSync(join(ROOT, 'art/data/kid_rig_v2.json'), 'utf8'));
const wild = JSON.parse(readFileSync(join(ROOT, 'art/data/kid_wild_v1.json'), 'utf8'));
const kids = JSON.parse(readFileSync(join(ROOT, 'src/content/kids.json'), 'utf8'));

const problems = [];
const clips = {};
for (const [name, clip] of Object.entries(core)) if (clip && typeof clip === 'object' && Array.isArray(clip.frames)) clips[name] = clip;

// One habit per kid (D-099), named habit_<type>.
const habitOf = {};
for (const k of kids) {
  const h = habits[k.id];
  if (!h) continue;
  clips[`habit_${k.id}`] = h;
  habitOf[k.id] = `habit_${k.id}`;
}
for (const id of Object.keys(habits)) if (!kids.some((k) => k.id === id)) problems.push(`habit for unknown kid "${id}"`);

// A part that turns about its own middle: the centre of its drawing, from the export's trim.
const trim = JSON.parse(readFileSync(join(ROOT, 'assets/data/trim.json'), 'utf8'));
for (const [name, clip] of Object.entries(clips)) {
  for (const f of clip.frames) {
    for (const [asset, t] of Object.entries(f.componentTransforms ?? {})) {
      if (t.pivotPx !== 'centre') continue;
      const box = trim[asset];
      if (!box) problems.push(`${name}: "${asset}" has no exported drawing to find the centre of (run npm run art:export)`);
      else t.pivotPx = [box[0] + box[2] / 2, box[1] + box[3] / 2];
    }
  }
}

// Every body frame, component and mark a clip names must exist.
const bodyFrames = new Set(Object.keys(rig.bodies.round.frames));
const activityPath = join(ROOT, 'art/data/kid_activity_v1.json');
if (existsSync(activityPath)) for (const f of Object.keys(JSON.parse(readFileSync(activityPath, 'utf8')).bodies.round.frames)) bodyFrames.add(f);
const faceStates = new Set(['inherit', ...Object.keys(rig.faces.classic.states)]);
for (const [name, clip] of Object.entries(clips)) {
  const type = name.startsWith('habit_') ? name.slice(6) : undefined;
  const parts = new Set(type ? (rig.costumes[type]?.components ?? []).map((c) => c.asset) : []);
  clip.frames.forEach((f, i) => {
    if (!bodyFrames.has(f.bodyFrame)) problems.push(`${name} frame ${i}: no body frame "${f.bodyFrame}"`);
    if (!faceStates.has(f.faceState)) problems.push(`${name} frame ${i}: no face state "${f.faceState}"`);
    for (const a of Object.keys(f.componentTransforms ?? {})) if (!parts.has(a)) problems.push(`${name} frame ${i}: "${a}" is not a part of ${type ?? 'a shared clip'}`);
    for (const m of f.marks ?? []) if (!existsSync(join(ROOT, 'art/src/fx', `${m.asset}.svg`))) problems.push(`${name} frame ${i}: no mark "${m.asset}"`);
  });
}

// How far motion carries a kid beyond its lifetime box. The engine grows every box by this
// margin, so kids in motion still never overlap (D-043). It counts the clips a kid plays while
// it lives among the others. The short event clips (born, picked up, put down, fusing) may
// pass the box for a moment, as their effects already do; a held kid floats over the rest
// anyway (D-083). Marks are transient effects too.
const EVENTS = new Set(['spawn', 'pick_up', 'held', 'drop', 'fusion_parent', 'fusion_child']);
const boxes = [...Object.values(rig.bodies).map((b) => [b.boundsPx, rig.groundAnchor]), ...Object.values(wild.types).map((t) => [t.lifetimeBoundsPx, wild.groundAnchor])];
const reach = (clip) => {
  const m = [0, 0, 0, 0];
  for (const [box, ground] of boxes) excursion(clip, box, ground).forEach((v, i) => (m[i] = Math.max(m[i], v)));
  return m;
};
// The margin is a design constant (core.mjs MARGIN): motion is written to stay inside it, and
// `npm run art:kids` checks every kid's real drawings against it in every frame. The estimate
// here, from the box alone, is shown with --margins as a guide, and only caps the short event
// clips, which the costume check does not cover.
const LIMIT = { event: [32, 56, 32, 24] };
for (const [name, clip] of Object.entries(clips)) {
  const m = reach(clip);
  const kind = EVENTS.has(name) ? 'event' : 'lived';
  m.forEach((v, i) => {
    if (LIMIT[kind] && v > LIMIT[kind][i]) problems.push(`${name} leaves the lifetime box by ${v.toFixed(1)} px on the ${['left', 'top', 'right', 'bottom'][i]} (limit ${LIMIT[kind][i]})`);
  });
  if (process.argv.includes('--margins')) console.log(name.padEnd(28), kind.padEnd(6), m.map((v) => v.toFixed(1).padStart(6)).join(' '));
}
const marginPx = core.MARGIN;

const data = {
  schemaVersion: 1,
  revision: 'motion-1',
  status: 'review',
  generatedBy: 'scripts/build-motion.mjs from art/motion/*.mjs; do not edit by hand',
  extendsRig: 'kid_rig_v2.json',
  fps: FPS,
  /** Source px added to every lifetime box: [left, top, right, bottom]. */
  marginPx,
  /** Motion marks (z's, dust, sparks) show only at this zoom factor or closer (D-100): 1 is the map as it opens. */
  marksMinZoom: 0.99,
  /** Seconds the parents of a fusion stay on screen, coming together (D-101). */
  meetSeconds: core.MEET_SECONDS,
  ambientWeights: { habit: 45 },
  effects: {
    fusion: {
      status: 'review', canvas: [320, 320], sourcePivot: [160, 288], layer: 'above_kid', anchor: 'event_ground', offsetPx: [0, 0], allowOverlap: true,
      frames: ['fx_fusion_01', 'fx_fusion_02', 'fx_fusion_puff_01', 'fx_fusion_puff_02', 'fx_fusion_puff_03'].map((asset) => ({ asset, opacity: 1 })),
    },
  },
  clips: {
    ...clips,
    // The effect on the child of a fusion: Codex's arrows as the parents meet, then the puff.
    fusion: { fps: FPS, loop: false, effect: 'fusion', frames: [0, 0, 1, 1, 2, 3, 3, 4, 4].map((effectFrame) => ({ effectFrame })) },
  },
  habits: habitOf,
  reducedMotion: Object.fromEntries(Object.keys(clips).filter((n) => !(n in rig.reducedMotion)).map((n) => [n, { bodyFrame: 'stand', faceState: 'open', effect: 'none' }])),
};

if (problems.length) {
  console.error(`${problems.length} motion problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
const text = JSON.stringify(data) + '\n';
if (process.argv.includes('--check')) {
  if (!existsSync(OUT) || readFileSync(OUT, 'utf8') !== text) {
    console.error('art/data/kid_motion_v1.json is out of date: run `npm run motion:build` and commit the result.');
    process.exit(1);
  }
  console.log('kid_motion_v1.json is up to date.');
} else {
  writeFileSync(OUT, text);
  const withHabit = Object.keys(habitOf).length;
  console.log(`wrote kid_motion_v1.json: ${Object.keys(data.clips).length} clips, ${withHabit}/${kids.length} kids with a habit, margin ${marginPx.join(' ')} px, ${(text.length / 1024).toFixed(0)} KB`);
}
