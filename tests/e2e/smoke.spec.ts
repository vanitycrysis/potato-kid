import { expect, test, type Page } from '@playwright/test';

async function boot(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__PK__?.ready === true);
  return errors;
}

test('boots, renders and spawns from the Garden', async ({ page }) => {
  const errors = await boot(page, '?seed=1');
  await expect(page.locator('canvas')).toBeVisible();
  const start = await page.evaluate(() => window.__PK__!.kids().length);
  expect(start).toBeGreaterThan(0);
  await expect(page.locator('.hud-count')).toContainText(`${start} / 12 kids`);
  await page.screenshot({ path: 'test-results/boot.png' });
  expect(errors).toEqual([]);
});

test('dragging a plain kid onto a water kid makes a firefighter (R1)', async ({ page }) => {
  const errors = await boot(page, '?seed=3&debug=1');
  // Place the pair far apart so they can't touch by wandering first.
  const { plain, water } = await page.evaluate(() => ({
    plain: window.__PK__!.debugAdd!('plain', 250, 1500),
    water: window.__PK__!.debugAdd!('water', 830, 700),
  }));
  await page.waitForTimeout(200);

  const from = await page.evaluate((id) => window.__PK__!.screenPointOf(id)!, plain);
  // Grab a little above the ground point (on the body), like a finger would.
  await page.mouse.move(from.x, from.y - 20);
  await page.mouse.down();
  const to = await page.evaluate((id) => window.__PK__!.screenPointOf(id)!, water);
  // Held kids float above the finger, so aim the finger below the target's feet.
  const lift = await page.evaluate(() => {
    const a = window.__PK__!.worldToScreen(0, 0);
    const b = window.__PK__!.worldToScreen(0, 70);
    return b.y - a.y;
  });
  await page.mouse.move(to.x, to.y - lift, { steps: 12 });
  await page.mouse.up();

  await expect
    .poll(() => page.evaluate(() => window.__PK__!.kids().map((k) => k.type)), { timeout: 3000 })
    .toContain('firefighter');
  const ids = await page.evaluate(() => window.__PK__!.kids().map((k) => k.id));
  expect(ids).not.toContain(plain);
  expect(ids).not.toContain(water);
  expect(await page.evaluate(() => window.__PK__!.discoveredRecipes())).toContain('plain|water');
  await expect(page.locator('.toast')).toContainText('New discovery');
  await page.screenshot({ path: 'test-results/fusion.png' });
  expect(errors).toEqual([]);
});

test('40+ kids render without errors', async ({ page }) => {
  const errors = await boot(page, '?seed=7&debug=1');
  await page.evaluate(() => {
    for (let i = 0; i < 40; i++) window.__PK__!.debugAdd!(['plain', 'fire', 'water', 'snow'][i % 4]!, 100 + (i % 8) * 120, 500 + Math.floor(i / 8) * 250);
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/kids-40.png' });
  // Headless frame rate is a logged regression signal only, never a pass/fail bar or a
  // phone result (plan §7): CI runners have no GPU and render WebGL in software.
  const fps = await page.evaluate(() => window.__PK__!.fps());
  console.log(`headless fps with 40+ kids: ${fps.toFixed(1)}`);
  expect(fps).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
