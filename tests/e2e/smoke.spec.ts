import { expect, test, type Page } from '@playwright/test';

async function boot(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__PK__?.ready === true);
  // The world scrolls (D-040): debug tests place kids around world (540, 1100), so look there.
  if (query.includes('debug=1')) await page.evaluate(() => window.__PK__!.centerOn(540, 1100));
  return errors;
}

async function frames(page: Page, n: number): Promise<void> {
  await page.evaluate(async (count) => {
    for (let i = 0; i < count; i++) await new Promise((r) => requestAnimationFrame(() => r(null)));
  }, n);
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
  const errors = await boot(page, '?seed=3&debug=1&calm=1');
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
  // Held kids float above the finger, so put the finger below the target's feet.
  const lift = await page.evaluate(() => {
    const a = window.__PK__!.worldToScreen(0, 0);
    const b = window.__PK__!.worldToScreen(0, 70);
    return b.y - a.y;
  });
  await page.mouse.move(to.x, to.y + lift, { steps: 12 });
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

test('a released kid stays where it was dropped (no snap-back)', async ({ page }) => {
  const errors = await boot(page, '?seed=5&debug=1&calm=1');
  const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 200, 1500));
  await page.waitForTimeout(150);
  const from = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  // Open ground, clear of the Garden's scenery reserve (map v2), so nothing deflects it.
  const to = await page.evaluate(() => window.__PK__!.worldToScreen(850, 1500));
  await page.mouse.move(from.x, from.y - 20);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.waitForTimeout(100);
  // While held, the kid floats above the finger (smaller y), so the face isn't covered.
  const held = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  const liftPx = await page.evaluate(() => window.__PK__!.worldToScreen(0, 70).y - window.__PK__!.worldToScreen(0, 0).y);
  expect(held.y).toBeLessThan(to.y - liftPx * 0.8);
  await page.mouse.up();
  const landing = { x: to.x, y: to.y - liftPx };
  // Sample the rendered position over the next frames: it must never jump back toward the start.
  const samples = await page.evaluate(async (k) => {
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      out.push(window.__PK__!.screenPointOf(k)!);
    }
    return out;
  }, id);
  const startDist = Math.hypot(to.x - from.x, to.y - from.y);
  for (const p of samples) expect(Math.hypot(p.x - landing.x, p.y - landing.y)).toBeLessThan(startDist * 0.1);
  expect(errors).toEqual([]);
});

test('a kid dropped outside the play area lands clamped without a jump', async ({ page }) => {
  const errors = await boot(page, '?seed=8&debug=1&calm=1');
  const id = await page.evaluate(() => window.__PK__!.debugAdd!('snow', 540, 1200));
  await page.waitForTimeout(150);
  const p = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  // Release up in the Garden's zone, above where kids may stand (world y 250).
  const below = await page.evaluate(() => window.__PK__!.worldToScreen(540, 250));
  await page.mouse.move(p.x, p.y - 20);
  await page.mouse.down();
  await page.mouse.move(below.x, below.y, { steps: 8 });
  await page.mouse.up();
  const ys = await page.evaluate(async (k) => {
    const out: number[] = [];
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      out.push(window.__PK__!.screenPointOf(k)!.y);
    }
    return out;
  }, id);
  // Every rendered frame after release sits at the same clamped landing height.
  expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(2);
  expect(errors).toEqual([]);
});

test('an OS-cancelled touch releases the kid and dragging still works', async ({ page }) => {
  const errors = await boot(page, '?seed=6&debug=1&calm=1');
  const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 300, 1200));
  await page.waitForTimeout(150);
  const p = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  // Start a drag, then deliver a native pointercancel straight to the canvas.
  await page.mouse.move(p.x, p.y - 20);
  await page.mouse.down();
  await page.mouse.move(p.x + 60, p.y - 20, { steps: 4 });
  await page.evaluate(() => {
    document.querySelector('canvas')!.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true }));
  });
  await page.mouse.up();
  await page.waitForTimeout(200);
  // The kid is back near its start, and a fresh drag works.
  const back = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  expect(Math.hypot(back.x - p.x, back.y - p.y)).toBeLessThan(5);
  await page.mouse.move(back.x, back.y - 20);
  await page.mouse.down();
  await page.mouse.move(back.x + 100, back.y - 20, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const moved = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  expect(moved.x - back.x).toBeGreaterThan(60);
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

test('dragging empty ground pans the map (D-040)', async ({ page }) => {
  const errors = await boot(page, '?seed=9&debug=1&calm=1');
  const before = await page.evaluate(() => window.__PK__!.worldToScreen(540, 1100));
  // calm mode has no kids, so this press lands on empty ground.
  await page.mouse.move(200, 600);
  await page.mouse.down();
  await page.mouse.move(200, 300, { steps: 8 });
  await page.mouse.up();
  await frames(page, 2);
  const after = await page.evaluate(() => window.__PK__!.worldToScreen(540, 1100));
  // The map followed the finger up (at least most of the 300 px; inertia may add more).
  expect(before.y - after.y).toBeGreaterThan(250);
  expect(errors).toEqual([]);
});

test('holding a kid at the screen edge scrolls the map and carries the kid along', async ({ page }) => {
  const errors = await boot(page, '?seed=10&debug=1&calm=1');
  const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 540, 1100));
  await page.waitForTimeout(150);
  const p = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  const size = page.viewportSize()!;
  await page.mouse.move(p.x, p.y - 20);
  await page.mouse.down();
  await page.mouse.move(size.width / 2, size.height - 6, { steps: 8 });
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForTimeout(250);
  const kid = await page.evaluate((k) => window.__PK__!.kids().find((c) => c.id === k)!, id);
  // It was carried well below where the starting view ended.
  expect(kid.y).toBeGreaterThan(2300);
  expect(errors).toEqual([]);
});

test('dropping a kid onto a non-partner never overlaps them (D-039, D-043)', async ({ page }) => {
  const errors = await boot(page, '?seed=12&debug=1&calm=1');
  const { fire, snow } = await page.evaluate(() => ({
    fire: window.__PK__!.debugAdd!('fire', 540, 1100),
    snow: window.__PK__!.debugAdd!('snow', 540, 1600),
  }));
  await page.waitForTimeout(150);
  const from = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, snow);
  const onto = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, fire);
  const liftPx = await page.evaluate(() => window.__PK__!.worldToScreen(0, 70).y - window.__PK__!.worldToScreen(0, 0).y);
  await page.mouse.move(from.x, from.y - 20);
  await page.mouse.down();
  await page.mouse.move(onto.x, onto.y + liftPx, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const kids = await page.evaluate(() => window.__PK__!.kids());
  const a = kids.find((k) => k.id === fire)!;
  const b = kids.find((k) => k.id === snow)!;
  // Their silhouette boxes (D-043) don't intersect: separated on at least one axis.
  const dx = Math.max(a.x + a.box.left - (b.x + b.box.right), b.x + b.box.left - (a.x + a.box.right));
  const dy = Math.max(a.y + a.box.top - (b.y + b.box.bottom), b.y + b.box.top - (a.y + a.box.bottom));
  expect(Math.max(dx, dy)).toBeGreaterThanOrEqual(-0.01);
  // The kid already standing there wasn't shoved.
  expect(a.x).toBeCloseTo(540, 0);
  expect(a.y).toBeCloseTo(1100, 0);
  expect(errors).toEqual([]);
});

test('a pan that pauses before release does not fling', async ({ page }) => {
  const errors = await boot(page, '?seed=13&debug=1&calm=1');
  await page.mouse.move(200, 700);
  await page.mouse.down();
  await page.mouse.move(200, 400, { steps: 6 });
  await page.waitForTimeout(400); // finger rests
  const rested = await page.evaluate(() => window.__PK__!.worldToScreen(540, 1100));
  await page.mouse.up();
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__PK__!.worldToScreen(540, 1100));
  expect(Math.abs(after.y - rested.y)).toBeLessThan(2);
  expect(errors).toEqual([]);
});

test('rotating the screen keeps the same world point centred', async ({ page }) => {
  const errors = await boot(page, '?seed=14&debug=1&calm=1');
  await page.evaluate(() => window.__PK__!.centerOn(1080, 2000));
  await page.setViewportSize({ width: 915, height: 413 });
  await page.waitForTimeout(300);
  const c = await page.evaluate(() => window.__PK__!.worldToScreen(1080, 2000));
  expect(Math.abs(c.x - 915 / 2)).toBeLessThan(3);
  expect(Math.abs(c.y - 413 / 2)).toBeLessThan(3);
  expect(errors).toEqual([]);
});

test('backgrounding mid-pan does not lock input', async ({ page }) => {
  const errors = await boot(page, '?seed=15&debug=1&calm=1');
  const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 540, 1100));
  await page.mouse.move(200, 700);
  await page.mouse.down();
  await page.mouse.move(200, 650, { steps: 3 });
  // Simulate the app being hidden mid-gesture (the pointerup never arrives).
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  // A fresh drag of the kid must work.
  const p = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  await page.mouse.move(p.x, p.y - 20);
  await page.mouse.down();
  await page.mouse.move(p.x + 120, p.y - 20, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const kid = await page.evaluate((k) => window.__PK__!.kids().find((c) => c.id === k)!, id);
  expect(kid.x).toBeGreaterThan(560);
  expect(errors).toEqual([]);
});

