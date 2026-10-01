import { test, type Browser } from '@playwright/test';
import { readFileSync } from 'node:fs';

const OUT = 'art/previews/ingame';
const types = (JSON.parse(readFileSync('src/content/kids.json', 'utf8')) as { id: string }[]).map((k) => k.id);

async function open(browser: Browser, w: number, h: number, query: string) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 3 });
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__PK__?.ready === true);
  return page;
}

for (const [name, w, h] of [['20x9', 412, 915], ['16x9', 360, 640]] as const) {
  test(`every type, ${name}, colour and grayscale`, async ({ browser }) => {
    const page = await open(browser, w, h, '?seed=31&debug=1&calm=1');
    await page.evaluate((ids) => {
      window.__PK__!.centerOn(1080, 1500);
      ids.forEach((t, i) => window.__PK__!.debugAdd!(t, 690 + (i % 4) * 260, 980 + Math.floor(i / 4) * 280));
    }, types);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/types-${name}.png` });
    await page.addStyleTag({ content: 'html{filter:grayscale(1)}' });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${OUT}/types-${name}-gray.png` });
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
