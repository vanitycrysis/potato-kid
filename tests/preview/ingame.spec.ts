import { expect, test, type Browser } from '@playwright/test';
import { readFileSync } from 'node:fs';

const OUT = 'art/previews/ingame';
const types = (JSON.parse(readFileSync('src/content/kids.json', 'utf8')) as { id: string }[]).map((k) => k.id);

async function open(browser: Browser, w: number, h: number, query: string) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 3 });
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__PK__?.ready === true);
  return page;
}

// Kids are placed 216 apart (wider than any silhouette box + touch slack) so recipe pairs
// never touch and fuse; 20 per page in a 5 x 4 grid below the HUD; more pages as the roster
// grows. The grid sits where no scenery displaces a kid: a displaced kid can be pushed into
// a recipe partner and fuse, so the test checks every kid stays where it was put.
const PAGE = 20;
const pages = Array.from({ length: Math.ceil(types.length / PAGE) }, (_, p) => types.slice(p * PAGE, (p + 1) * PAGE));
for (const [name, w, h] of [['20x9', 412, 915], ['16x9', 360, 640]] as const) {
  pages.forEach((ids, p) => {
    const suffix = p === 0 ? '' : `-${p + 1}`;
    test(`every type, ${name}, page ${p + 1}, colour and grayscale`, async ({ browser }) => {
      const page = await open(browser, w, h, '?seed=31&debug=1&calm=1');
      await page.evaluate((list) => {
        window.__PK__!.centerOn(1280, 1872);
        list.forEach((t, i) => window.__PK__!.debugAdd!(t, 848 + (i % 5) * 216, 1572 + Math.floor(i / 5) * 260));
      }, ids);
      await page.waitForTimeout(1200);
      const placed = await page.evaluate(() => window.__PK__!.kids().map((k) => ({ type: k.type, x: Math.round(k.x), y: Math.round(k.y) })));
      expect(placed).toEqual(ids.map((type, i) => ({ type, x: 848 + (i % 5) * 216, y: 1572 + Math.floor(i / 5) * 260 })));
      await page.screenshot({ path: `${OUT}/types-${name}${suffix}.png` });
      await page.addStyleTag({ content: 'html{filter:grayscale(1)}' });
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${OUT}/types-${name}${suffix}-gray.png` });
    });
  });
}

test('a crowded, living map (40 kids, wandering)', async ({ browser }) => {
  const page = await open(browser, 412, 915, '?seed=32&debug=1');
  await page.evaluate((ids) => {
    for (let i = 0; i < 40; i++) window.__PK__!.debugAdd!(ids[i % ids.length]!, 700 + (i % 5) * 180, 1050 + Math.floor(i / 5) * 160);
    window.__PK__!.centerOn(1080, 1600);
  }, types);
  await page.waitForTimeout(6000); // let them wander, sit and sleep
  await page.screenshot({ path: `${OUT}/crowd-40.png` });
});

test('all four map quadrants', async ({ browser }) => {
  const page = await open(browser, 412, 915, '?seed=33&debug=1&calm=1');
  for (const [q, x, y] of [['nw', 540, 1000], ['ne', 1620, 1000], ['sw', 540, 2900], ['se', 1620, 2900]] as const) {
    await page.evaluate(([cx, cy]) => window.__PK__!.centerOn(cx, cy), [x, y] as const);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/map-${q}.png` });
  }
});

for (const type of ['plain', 'water']) {
  test(`faces: every face on every body (${type}) at game size`, async ({ browser }) => {
    const page = await open(browser, 412, 915, '?seed=34&debug=1&calm=1');
    const rig = JSON.parse(readFileSync('assets/data/kid_rig_v2.json', 'utf8')) as {
      appearance: { bodyWeights: Record<string, number>; faceWeights: Record<string, number> };
    };
    const bodies = Object.keys(rig.appearance.bodyWeights);
    const faces = Object.keys(rig.appearance.faceWeights);
    // One type per capture: neighbouring different types could be a recipe and fuse.
    await page.evaluate(
      ([t, b, f]) => {
        window.__PK__!.centerOn(1080, 1600);
        f.forEach((face, row) => b.forEach((body, col) => window.__PK__!.debugAdd!(t, 760 + col * 210, 1150 + row * 260, { body, face, scale: 1 })));
      },
      [type, bodies, faces] as const,
    );
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/faces-${type}.png` });
  });
}
