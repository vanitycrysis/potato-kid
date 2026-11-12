import { expect, test, type Page } from '@playwright/test';
import { boot, frames } from './helpers';

test.describe('decorations kids use (D-090)', () => {
  // Map v5's southeast bench and southwest bird bath (Codex's decorations_v1 slots).
  const BENCH = { x: 2392, y: 3960, left: { x: 2284, y: 3905 }, right: { x: 2500, y: 3905 } };
  const BATH = { x: 680, y: 3960, left: { x: 572, y: 3920 } };
  const kid = (page: Page, id: number) => page.evaluate((i) => window.__PK__!.kids().find((k) => k.id === i)!, id);

  /** Drags kid `id` with the finger ending on world point `w`, and lets go. */
  async function dragTo(page: Page, id: number, w: { x: number; y: number }): Promise<void> {
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    await page.mouse.move(k.x, k.y - 20);
    await page.mouse.down();
    const p = await page.evaluate((w) => window.__PK__!.worldToScreen(w.x, w.y), w);
    await page.mouse.move(p.x, p.y, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(200);
  }

  async function nearBench(page: Page, types: string[]): Promise<number[]> {
    await boot(page, '?seed=3&debug=1&calm=1');
    const ids = await page.evaluate(
      ([types, b]) => {
        const pk = window.__PK__!;
        pk.centerOn(b.x, b.y + 200);
        return types.map((t, i) => pk.debugAdd!(t, b.x - 300 + i * 200, b.y + 420));
      },
      [types, BENCH] as const,
    );
    await page.waitForTimeout(300);
    return ids;
  }

  test('a kid dropped on the bench sits in the slot under the finger, and plays its sitting clip', async ({ page }) => {
    const [id] = await nearBench(page, ['plain']);
    await dragTo(page, id!, BENCH.right);
    const k = await kid(page, id!);
    expect(k.activity).toBe('visit');
    expect([Math.round(k.x), Math.round(k.y)]).toEqual([BENCH.right.x, BENCH.right.y]);
    await expect.poll(() => page.evaluate((i) => window.__PK__!.presentationOf(i)?.clip, id!)).toBe('decoration_sitting');
  });

  test('a full bench is just ground: the third kid lands beside it; picked up, a sitter frees its slot', async ({ page }) => {
    const [a, b, c] = await nearBench(page, ['plain', 'fire', 'snow']);
    await dragTo(page, a!, BENCH.left);
    await dragTo(page, b!, BENCH.right);
    expect((await kid(page, b!)).activity).toBe('visit');
    await dragTo(page, c!, BENCH.left);
    expect((await kid(page, c!)).activity).not.toBe('visit');
    // The left sitter, picked up and dropped away from the bench, walks again. The spot stays
    // clear of the screen's edge-scroll zone: a drag that ends there pans the map for as long
    // as the drag lasts, which moved the bench under the next drop on slow runs.
    await dragTo(page, a!, { x: BENCH.x - 250, y: BENCH.y + 450 });
    expect((await kid(page, a!)).activity).not.toBe('visit');
    // Its slot takes the next kid.
    await dragTo(page, c!, BENCH.left);
    expect((await kid(page, c!)).activity).toBe('visit');
  });

  test('recipe partners on one bench never fuse', async ({ page }) => {
    const [a, b] = await nearBench(page, ['plain', 'water']);
    await dragTo(page, a!, BENCH.left);
    await dragTo(page, b!, BENCH.right);
    await page.waitForTimeout(500);
    expect((await page.evaluate(() => window.__PK__!.kids().map((k) => k.type))).sort()).toEqual(['plain', 'water']);
  });

  test('a kid in the bird bath splashes', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    const id = await page.evaluate((b) => {
      const pk = window.__PK__!;
      pk.centerOn(b.x, b.y + 200);
      return pk.debugAdd!('plain', b.x + 200, b.y + 420);
    }, BATH);
    await page.waitForTimeout(300);
    await dragTo(page, id, BATH.left);
    expect((await kid(page, id)).activity).toBe('visit');
    await expect.poll(() => page.evaluate((i) => window.__PK__!.presentationOf(i)?.clip, id)).toBe('decoration_splash');
  });

  test('a tap on a sitter opens its card and leaves it seated; the card makes no planting promise (Codex review, #121)', async ({ page }) => {
    const [id] = await nearBench(page, ['plain']);
    await dragTo(page, id!, BENCH.left);
    expect((await kid(page, id!)).activity).toBe('visit');
    const at = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id!);
    await page.mouse.click(at.x, at.y - 20);
    const card = page.getByRole('dialog', { name: /Potato Kid/ });
    await expect(card).toBeVisible();
    await expect(card).toContainText('From a decoration: no planting bonus.');
    await expect(card).not.toContainText('when added to a plot');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const k = await kid(page, id!);
    expect(k.activity).toBe('visit');
    expect([Math.round(k.x), Math.round(k.y)]).toEqual([BENCH.left.x, BENCH.left.y]);
  });

  test("the plot picker promises no tier for a decoration's happiness (Codex review round 2, #121)", async ({ page }) => {
    const [id] = await nearBench(page, ['plain']);
    await dragTo(page, id!, BENCH.left);
    expect((await kid(page, id!)).activity).toBe('visit');
    await page.locator('[data-nav=garden]').click();
    await page.getByRole('dialog', { name: 'Garden' }).getByRole('button', { name: 'Add kids' }).first().click();
    const row = page.getByRole('dialog').locator('.picker-row').first();
    await expect(row).toContainText('Tier 1');
    await expect(row).not.toContainText('Counts as Tier');
  });

  test('a sitter whose press is cancelled is drawn back in its seat at once, before the sim applies it (Codex review round 4, #121)', async ({ page }) => {
    const [id] = await nearBench(page, ['plain']);
    await dragTo(page, id!, BENCH.left);
    await page.waitForTimeout(300);
    const seat = await page.evaluate((b) => window.__PK__!.worldToScreen(b.x, b.y), BENCH.left);
    const at = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id!);
    await page.mouse.move(at.x, at.y - 20);
    await page.mouse.down();
    // The pickup reached the sim: the kid is held there.
    await expect.poll(async () => (await kid(page, id!)).held).toBe(true);
    // The sim holds its steps, and the press is cancelled (as a tap on it is): frames show only
    // the scene's preview of where the cancel puts it.
    await page.evaluate(() => window.__PK__!.debugHoldSteps!(true));
    await page.evaluate(() => document.querySelector('canvas')!.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true, isPrimary: true, pointerType: 'mouse' })));
    await frames(page, 4);
    const drawn = (await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id!))!;
    await page.evaluate(() => window.__PK__!.debugHoldSteps!(false));
    await page.mouse.up();
    expect(Math.hypot(drawn.x - seat.x, drawn.y - seat.y)).toBeLessThan(3);
    await page.waitForTimeout(300);
    expect((await kid(page, id!)).activity).toBe('visit');
  });

  test('a kid sitting is saved so: after a reload it is still on the bench', async ({ page }) => {
    const [id] = await nearBench(page, ['plain']);
    await dragTo(page, id!, BENCH.left);
    await page.waitForTimeout(400);
    await page.reload();
    await page.waitForFunction(() => window.__PK__?.ready === true);
    const k = await kid(page, id!);
    expect(k.activity).toBe('visit');
    expect([Math.round(k.x), Math.round(k.y)]).toEqual([BENCH.left.x, BENCH.left.y]);
  });
});
