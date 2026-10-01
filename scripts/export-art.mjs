// Rasterizes ChatGPT's SVG art sources into runtime PNGs, checks them against
// the asset contract (ASSETS.md / ENGINEERING_PLAN.md §5), and renders review
// previews. Uses Playwright's Chromium so SVG rendering matches the game's
// WebView. Usage: npm run art:export [-- --check-only]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'art/src');
const PREVIEWS = join(ROOT, 'art/previews');
const checkOnly = process.argv.includes('--check-only');

/** Where each asset family is exported, and its contract. */
const FAMILIES = [
  { prefix: 'kid_', dir: 'assets/sprites/kids', size: [256, 256], padding: 8, opaque: false },
  { prefix: 'building_', dir: 'assets/sprites/buildings', size: [512, 512], padding: 8, opaque: false },
  { prefix: 'fx_shadow', dir: 'assets/sprites/fx', size: [128, 64], padding: 0, opaque: false },
  { prefix: 'fx_', dir: 'assets/sprites/fx', size: [256, 256], padding: 8, opaque: false },
  { prefix: 'map_', dir: 'assets/maps', size: [1080, 2400], padding: 0, opaque: true },
  { prefix: 'icon_', dir: 'assets/ui', size: [128, 128], padding: 0, opaque: false },
  { prefix: 'badge_', dir: 'assets/ui', size: [64, 64], padding: 0, opaque: false },
  { prefix: 'ui_', dir: 'assets/ui', size: [256, 256], padding: 0, opaque: false },
  // Adaptive icon: transparent foreground over an opaque background (ASSETS.md).
  { prefix: 'android_launcher_foreground', dir: 'art/exports/android', size: [432, 432], padding: 0, opaque: false },
  { prefix: 'android_launcher_background', dir: 'art/exports/android', size: [432, 432], padding: 0, opaque: true },
  { prefix: 'android_splash', dir: 'art/exports/android', size: [1152, 1152], padding: 0, opaque: false },
];
const NAME = /^[a-z0-9]+(_[a-z0-9]+)*$/;
/** Generated files from the previous run, so removed or renamed sources don't leave stale PNGs. */
const MANIFEST = join(ROOT, 'art/.export-manifest.json');

/**
 * Kid layer order and names. Must match src/render/layers.ts (LAYER_ORDER and
 * layerAssetName): shared `kid_plain_body` / `kid_plain_face`, optional
 * `kid_<id>_overlay_back` / `_front` (ASSETS.md). layers.test.ts pins the engine side.
 */
const kidLayerNames = (id) => [`kid_${id}_overlay_back`, 'kid_plain_body', 'kid_plain_face', `kid_${id}_overlay_front`];

function familyOf(name) {
  return FAMILIES.find((f) => name.startsWith(f.prefix));
}

function listSvgs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listSvgs(join(dir, e.name)) : e.name.endsWith('.svg') ? [join(dir, e.name)] : [],
  );
}

const svgs = listSvgs(SRC);

// Outputs are named by basename only, so the same ID in two folders would silently
// overwrite one export with the other (Codex review, PR #6). Refuse before writing.
const byName = new Map();
for (const file of svgs) {
  const name = basename(file, '.svg');
  byName.set(name, [...(byName.get(name) ?? []), file.slice(ROOT.length + 1).replaceAll('\\', '/')]);
}
const duplicates = [...byName].filter(([, files]) => files.length > 1);
if (duplicates.length) {
  console.error('Duplicate asset IDs (one PNG per ID):');
  for (const [name, files] of duplicates) console.error(`  - ${name}: ${files.join(', ')}`);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage();
const problems = [];
/** Rendered PNGs waiting to be written: nothing touches disk until every source passes. */
const pending = [];
const exported = [];

// Kid layer names must be ones the engine composes: the shared body/face, or a roster
// type's optional back/front overlay (ASSETS.md). A typo would otherwise export fine
// but never be drawn (Codex review, PR #6).
const roster = JSON.parse(readFileSync(join(ROOT, 'src/content/kids.json'), 'utf8')).map((k) => k.id);
const KID_LAYER = /^kid_([a-z0-9]+)_(overlay_back|overlay_front)$/;
function kidNameProblem(name) {
  if (name === 'kid_plain_body' || name === 'kid_plain_face') return null;
  const m = KID_LAYER.exec(name);
  if (!m) return `${name}: kid layers must be kid_plain_body, kid_plain_face, or kid_<type>_overlay_back/front`;
  if (!roster.includes(m[1])) return `${name}: "${m[1]}" is not a kid type in src/content/kids.json`;
  return null;
}

for (const file of svgs) {
  const name = basename(file, '.svg');
  const fam = familyOf(name);
  if (!NAME.test(name)) problems.push(`${name}: name must be lowercase snake_case`);
  if (!fam) {
    problems.push(`${name}: unknown asset family (prefix)`);
    continue;
  }
  if (fam.prefix === 'kid_') {
    const p = kidNameProblem(name);
    if (p) problems.push(p);
  }
  const [w, h] = fam.size;
  const svg = readFileSync(file, 'utf8');
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  // Render at exactly the contract size on a transparent page, then inspect pixels.
  const result = await page.evaluate(
    async ({ dataUrl, w, h, padding }) => {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      let opaque = true;
      let empty = true;
      let paddingHit = false;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const a = data[(y * w + x) * 4 + 3];
          if (a < 255) opaque = false;
          if (a > 0) {
            empty = false;
            if (padding && (x < padding || y < padding || x >= w - padding || y >= h - padding)) paddingHit = true;
          }
        }
      }
      return { png: c.toDataURL('image/png'), opaque, empty, paddingHit, naturalW: img.naturalWidth, naturalH: img.naturalHeight };
    },
    { dataUrl, w, h, padding: fam.padding },
  );
  if (result.naturalW !== w || result.naturalH !== h) {
    problems.push(`${name}: SVG size is ${result.naturalW}x${result.naturalH}, contract is ${w}x${h}`);
  }
  if (result.empty) problems.push(`${name}: renders empty (omit unused optional layers instead)`);
  if (result.paddingHit) problems.push(`${name}: art inside the ${fam.padding}px clear padding`);
  if (fam.opaque === true && !result.opaque) problems.push(`${name}: must be fully opaque`);
  if (fam.opaque === false && result.opaque) problems.push(`${name}: must have transparency`);
  pending.push({ out: join(ROOT, fam.dir, `${name}.png`), png: result.png });
}

// All-or-nothing (Codex review, PR #6): a rejected delivery must not replace or delete
// previously accepted exports. Only when every source passes are PNGs written, stale
// outputs from the previous run removed (only files listed in our own manifest), and
// the manifest updated.
const writeOutputs = !checkOnly && problems.length === 0;
if (writeOutputs) {
  for (const { out, png } of pending) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
    exported.push(out.slice(ROOT.length + 1).replaceAll('\\', '/'));
  }
}
if (writeOutputs) {
  const previous = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : [];
  const current = new Set(exported);
  for (const rel of previous) {
    if (!current.has(rel) && existsSync(join(ROOT, rel))) {
      rmSync(join(ROOT, rel));
      console.log(`removed stale ${rel}`);
    }
  }
  mkdirSync(dirname(MANIFEST), { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify([...current].sort(), null, 2) + '\n');
}

// Review previews: every kid composited back→body→face→front, at 48/64/96 CSS px on
// light and dark grounds, plus a crowded 40-kid portrait scene on the map if present.
if (writeOutputs) {
  const kidsJson = JSON.parse(readFileSync(join(ROOT, 'src/content/kids.json'), 'utf8'));
  const kidDir = join(ROOT, 'assets/sprites/kids');
  const layerUrl = (n) => {
    const f = join(kidDir, `${n}.png`);
    return existsSync(f) ? `data:image/png;base64,${readFileSync(f).toString('base64')}` : null;
  };
  const kids = kidsJson
    .map((k) => ({
      id: k.id,
      layers: kidLayerNames(k.id).map(layerUrl).filter(Boolean),
      hasOwnArt: k.id === 'plain' || !!layerUrl(`kid_${k.id}_overlay_front`) || !!layerUrl(`kid_${k.id}_overlay_back`),
    }))
    .filter((k) => k.hasOwnArt && k.layers.length > 0);

  if (kids.length === 0) {
    // No kid art left: remove generated previews so they never show art that no longer exists.
    for (const f of ['kids_sizes.png', 'crowd_40.png']) {
      if (existsSync(join(PREVIEWS, f))) rmSync(join(PREVIEWS, f));
    }
  }
  if (kids.length > 0) {
    mkdirSync(PREVIEWS, { recursive: true });
    const kidHtml = (k, px) =>
      `<div class="kid" style="width:${px}px;height:${px}px">${k.layers.map((u) => `<img src="${u}">`).join('')}</div>`;
    const sizes = [48, 64, 96, 256];
    const sheet = `<!doctype html><style>
      body{margin:0;font:14px sans-serif}
      .row{display:flex;align-items:flex-end;gap:16px;padding:12px}
      .light{background:#f4efe2}.dark{background:#2b2b2b;color:#eee}
      .kid{position:relative}.kid img{position:absolute;inset:0;width:100%;height:100%}
      .label{width:110px}</style>
      ${['light', 'dark']
        .map((bg) =>
          kids
            .map((k) => `<div class="row ${bg}"><div class="label">${k.id}</div>${sizes.map((px) => kidHtml(k, px)).join('')}</div>`)
            .join(''),
        )
        .join('')}`;
    const sheetPage = await browser.newPage({ viewport: { width: 760, height: 200 }, deviceScaleFactor: 3 });
    await sheetPage.setContent(sheet);
    await sheetPage.screenshot({ path: join(PREVIEWS, 'kids_sizes.png'), fullPage: true });
    await sheetPage.close();

    // Crowded scene: a 390 x 844 phone at 3x, the map fitted to width, 40 kids at 64 CSS px.
    const map = existsSync(join(ROOT, 'assets/maps/map_garden.png'))
      ? `data:image/png;base64,${readFileSync(join(ROOT, 'assets/maps/map_garden.png')).toString('base64')}`
      : null;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const crowd = Array.from({ length: 40 }, (_, i) => {
      const k = kids[i % kids.length];
      return `<div class="kid" style="position:absolute;left:${20 + rnd() * 300}px;top:${180 + rnd() * 540}px;width:64px;height:64px">${k.layers.map((u) => `<img src="${u}">`).join('')}</div>`;
    }).join('');
    // Render at 3x like a modern phone, so line weight reads as it will on device.
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    await phone.setContent(`<!doctype html><style>
      body{margin:0;width:390px;height:844px;overflow:hidden;background:#f4efe2 ${map ? `url(${map}) center/390px auto no-repeat` : ''}}
      .kid img{position:absolute;inset:0;width:100%;height:100%}</style>${crowd}`);
    await phone.screenshot({ path: join(PREVIEWS, 'crowd_40.png') });
    await phone.close();
  }
}

await browser.close();
for (const p of exported) console.log(`exported ${p}`);
if (svgs.length === 0) console.log('No SVG sources in art/src.');
if (problems.length) {
  if (!checkOnly) console.error('\nNothing was written: existing exports are unchanged.');
  console.error(`\n${problems.length} contract problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`\n${svgs.length} source(s) meet the asset contract.`);
