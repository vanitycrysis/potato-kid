import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

test.describe('tapping fields and farming kids from far away (§20.1, §22.2; Codex review, #90)', () => {
  /** Field 1 grows apple with `farmers` Potato Kids; a 320 px phone zoomed all the way out. */
  async function farOut(page: Page, farmers: number): Promise<number[]> {
    await page.setViewportSize({ width: 320, height: 700 });
    await boot(page, '?seed=3&debug=1&calm=1');
    const workers = await page.evaluate((farmers) => {
      const pk = window.__PK__!;
      pk.debugGive!({ materials: 5000 });
      pk.debugCommand!({ type: 'unlockField' });
      pk.debugCommand!({ type: 'setFieldFood', field: 0, food: 'apple' });
      const workers = Array.from({ length: farmers }, (_, i) => pk.debugAdd!('plain', 1676 + 150 * i, 3748));
      pk.debugCommand!({ type: 'farm', field: 0, kidIds: workers });
      pk.centerOn(1166, 3498);
      return workers;
    }, farmers);
    await expect.poll(() => page.evaluate(() => window.__PK__!.fields()[0]?.kids.length ?? -1)).toBe(farmers);
    const c = await page.evaluate(() => window.__PK__!.worldToScreen(1166, 3498));
    await page.evaluate((at) => document.querySelector('canvas')!.dispatchEvent(new WheelEvent('wheel', { deltaY: 1, deltaMode: 2, clientX: at.x, clientY: at.y, bubbles: true, cancelable: true })), c);
    await expect.poll(() => page.evaluate(() => window.__PK__!.zoom())).toBe(0.5);
    await page.waitForTimeout(300);
    return workers;
  }

  /** A map kid placed near `x, y`, and its pickup box's centre (world) and CSS px per world unit. */
  async function mapKid(page: Page, type: string, x: number, y: number) {
    return page.evaluate(
      ([type, x, y]) => {
        const pk = window.__PK__!;
        const id = pk.debugAdd!(type, x, y);
        const k = pk.kids().find((c) => c.id === id)!;
        const a = pk.worldToScreen(0, 0);
        const b = pk.worldToScreen(100, 0);
        return { id, cx: k.x + (k.box.left + k.box.right) / 2, cy: k.y + (k.box.top + k.box.bottom) / 2, perUnit: (b.x - a.x) / 100 };
      },
      [type, x, y] as const,
    );
  }

  test('a tap on the field’s soil opens the field, even inside a nearby kid’s 44 px pickup halo', async ({ page }) => {
    await farOut(page, 0);
    // A map kid just right of Field 1's bay (the bed's right edge is x 1382).
    const k = await mapKid(page, 'fire', 1476, 3498);
    // On the bed, 2 units in from its edge, level with the kid: inside the kid's halo too.
    const tap = { x: 1380, y: k.cy };
    expect(Math.abs(tap.x - k.cx) * k.perUnit).toBeLessThan(22);
    const at = await page.evaluate((t) => window.__PK__!.worldToScreen(t.x, t.y), tap);
    await page.mouse.click(at.x, at.y);
    await expect(page.getByRole('dialog', { name: 'Field 1' })).toBeVisible();
  });

  test('a tap just off the bed beside a small farming kid opens its card', async ({ page }) => {
    const [worker] = await farOut(page, 1);
    // Its pad is front left (x 1058); the bed's left edge is x 950. Off the bed, level with it.
    const feet = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, worker!);
    const off = await page.evaluate(() => window.__PK__!.worldToScreen(946, 0).x);
    expect(feet.x - off).toBeLessThan(22);
    await page.mouse.click(off, feet.y - 6);
    await expect(page.getByRole('dialog', { name: 'Potato Kid' }).locator('.sheet-subtitle')).toHaveText('Farming Apple · Field 1 · Kid 1');
  });

  test('a tap that reaches a map kid and a farming kid asks which, and says which one is farming', async ({ page }) => {
    // The second farmer takes the front-right pad (x 1274); the bed's right edge is x 1382.
    // Map v4's ornaments crowd the bay's left side (D-076), so this is the right side.
    const [, worker] = await farOut(page, 2);
    const feet = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, worker!);
    // A map kid right of the bay, level with the worker.
    const k = await mapKid(page, 'fire', 1476, 3498);
    const off = await page.evaluate(() => window.__PK__!.worldToScreen(1386, 0).x);
    const kidAt = await page.evaluate((k) => window.__PK__!.worldToScreen(k.cx, k.cy), k);
    expect(Math.abs(off - kidAt.x)).toBeLessThan(22);
    expect(off - feet.x).toBeLessThan(22);
    await page.mouse.click(off, Math.round((feet.y - 6 + kidAt.y) / 2));
    const which = page.getByRole('dialog', { name: 'Which kid?' });
    await expect(which.locator('.kids-row')).toHaveCount(2);
    await expect(which.locator(`.kids-row[data-kid="${worker}"]`)).toContainText('Farming Apple · Field 1');
    await expect(which.locator(`.kids-row[data-kid="${k.id}"]`)).toContainText('Fire Kid');
    await which.locator(`.kids-row[data-kid="${worker}"]`).click();
    await expect(page.getByRole('dialog', { name: 'Potato Kid' }).locator('.sheet-subtitle')).toHaveText('Farming Apple · Field 1 · Kid 2');
  });
});
