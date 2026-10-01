// Rasterizes ChatGPT's SVG art sources into runtime PNGs, checks them against
// the asset contract (ASSETS.md / ENGINEERING_PLAN.md §5), and renders review
// previews. Uses Playwright's Chromium so SVG rendering matches the game's
// WebView. Usage: npm run art:export [-- --check-only]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
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
  { prefix: 'android_launcher', dir: 'art/exports/android', size: [432, 432], padding: 0, opaque: null },
  { prefix: 'android_splash', dir: 'art/exports/android', size: [1152, 1152], padding: 0, opaque: false },
];
const NAME = /^[a-z0-9]+(_[a-z0-9]+)*$/;

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
if (svgs.length === 0) {
  console.log('No SVG sources in art/src; nothing to export.');
  process.exit(0);
}

const browser = await chromium.launch();
const page = await browser.newPage();
const problems = [];
const exported = [];

for (const file of svgs) {
  const name = basename(file, '.svg');
  const fam = familyOf(name);
  if (!NAME.test(name)) problems.push(`${name}: name must be lowercase snake_case`);
  if (!fam) {
    problems.push(`${name}: unknown asset family (prefix)`);
    continue;
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
  if (!checkOnly) {
    const out = join(ROOT, fam.dir, `${name}.png`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, Buffer.from(result.png.split(',')[1], 'base64'));
    exported.push(out.slice(ROOT.length + 1).replaceAll('\\', '/'));
  }
}

// Review previews: every kid composited back→body→face→front, at 48/64/96 CSS px on
// light and dark grounds, plus a crowded 40-kid portrait scene on the map if present.
if (!checkOnly) {
  const kidsJson = JSON.parse(readFileSync(join(ROOT, 'src/content/kids.json'), 'utf8'));
  const kidDir = join(ROOT, 'assets/sprites/kids');
  const layerUrl = (n) => {
    const f = join(kidDir, `${n}.png`);
    return existsSync(f) ? `data:image/png;base64,${readFileSync(f).toString('base64')}` : null;
  };
  const kids = kidsJson
    .map((k) => ({
      id: k.id,
      layers: [`kid_${k.id}_overlay_back`, 'kid_plain_body', 'kid_plain_face', `kid_${k.id}_overlay_front`].map(layerUrl).filter(Boolean),
      hasOwnArt: k.id === 'plain' || !!layerUrl(`kid_${k.id}_overlay_front`) || !!layerUrl(`kid_${k.id}_overlay_back`),
    }))
    .filter((k) => k.hasOwnArt && k.layers.length > 0);

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
if (problems.length) {
  console.error(`\n${problems.length} contract problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`\n${svgs.length} source(s) meet the asset contract.`);
