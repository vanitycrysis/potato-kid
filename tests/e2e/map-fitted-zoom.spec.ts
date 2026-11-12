import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

test.describe('the 4 × 4 map and its fitted zoom (D-071, GUI_MVP §§20.1-20.2)', () => {
  const scale = (page: Page) => page.evaluate(() => window.__PK__!.worldToScreen(180, 0).x - window.__PK__!.worldToScreen(0, 0).x);

  test('a compact landscape screen keeps a kid canvas at 65 CSS px at 1×; portrait fits 1080 units across', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 360 });
    await boot(page, '?seed=3&debug=1&calm=1');
    // min(640/1080, 360/1920) would be 33.75 px per 180 units: the floor is 65 (§20.1).
    expect(await scale(page)).toBeCloseTo(65, 6);
    // Portrait keeps its plain fit, even below the floor (at 390 wide they're equal).
    await page.setViewportSize({ width: 360, height: 780 });
    await expect.poll(() => scale(page)).toBeCloseTo((360 / 1080) * 180, 6);
    // A tall landscape window (not compact) keeps the plain fit.
    await page.setViewportSize({ width: 1200, height: 700 });
    await expect.poll(() => scale(page)).toBeCloseTo(Math.min(1200 / 1080, 700 / 1920) * 180, 6);
  });

  test('the world is 3072 × 5376 (D-076) and the game starts beside the Garden in its middle', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    const frame = await page.evaluate(() => window.__PK__!.gardenFrame());
    expect(frame.x).toBe(1536);
    // The view starts on the Garden: its outlet is on screen.
    const outlet = await page.evaluate((y) => window.__PK__!.worldToScreen(1536, y), frame.bottom);
    const size = page.viewportSize()!;
    expect(outlet.y).toBeGreaterThan(0);
    expect(outlet.y).toBeLessThan(size.height);
    // As far as the camera goes: the world's far corner.
    await page.evaluate(() => window.__PK__!.centerOn(99999, 99999));
    const corner = await page.evaluate(() => window.__PK__!.worldToScreen(3072, 5376));
    expect(corner.x).toBeCloseTo(size.width, 0);
  });
});
