import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

test.describe('A kid near the top of the screen opens its card by touch (owner bug, TOP-EDGE-TAP)', () => {
  /** A Fire Kid mid-map, the camera moved so its feet stand at screen y = `feet`. */
  async function kidWithFeetAt(page: Page, feet: number): Promise<{ x: number; y: number }> {
    await boot(page, '?seed=3&debug=1&calm=1');
    const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 1500, 2000));
    const at = (y: number) =>
      page.evaluate(([i, y]) => {
        window.__PK__!.centerOn(1500, y);
        return window.__PK__!.screenPointOf(i)!;
      }, [id, y] as const);
    const a = await at(2000);
    const b = await at(2100);
    const p = await at(2000 + ((a.y - feet) * 100) / (a.y - b.y));
    expect(p.y).toBeCloseTo(feet, 0);
    await page.waitForTimeout(200);
    return p;
  }

  test('a tap above the card\'s top edge: the click that follows lands on the scrim and must not close the card', async ({ page }) => {
    const feet = await kidWithFeetAt(page, 160);
    await page.touchscreen.tap(feet.x, feet.y - 30);
    const card = page.getByRole('dialog');
    await expect(card.locator('.sheet-title')).toHaveText('Fire Kid');
    // The tap point is on the scrim, above the card, so a stray click would have closed it.
    expect((await card.boundingBox())!.y).toBeGreaterThan(feet.y - 30);
    await page.waitForTimeout(300);
    await expect(card).toBeVisible();
    // A real tap on the scrim still closes it.
    await page.touchscreen.tap(feet.x, feet.y - 30);
    await expect(card).toBeHidden();
  });

  test('a tap on the kid just under a stat chip is the kid\'s, not the chip\'s', async ({ page }) => {
    const feet = await kidWithFeetAt(page, 95);
    const box = (await page.locator('.hud-potatokens').boundingBox())!;
    // The kid is under the middle chip; the tap is on its visible body, a few px below the chip.
    expect(feet.x).toBeGreaterThan(box.x);
    expect(feet.x).toBeLessThan(box.x + box.width);
    const y = box.y + box.height + 3;
    expect(y).toBeLessThan(feet.y - 5);
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [feet.x, y] as const)).toBe('CANVAS');
    await page.touchscreen.tap(feet.x, y);
    await expect(page.getByRole('dialog').locator('.sheet-title')).toHaveText('Fire Kid');
    await expect(page.locator('.name-bubble')).toBeHidden();
  });
});
