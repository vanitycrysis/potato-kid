import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

test.describe('Planting, drag path (D-061, GUI_MVP §15.1)', () => {
  /** Picks a kid up and holds it over the Garden target for `ms`, then releases. */
  async function holdOverHome(page: Page, id: number, ms: number): Promise<void> {
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    const t = await page.evaluate(() => window.__PK__!.worldToScreen(1536, 2156));
    await page.mouse.move(k.x, k.y - 20);
    await page.mouse.down();
    await page.mouse.move(t.x, t.y, { steps: 8 });
    await page.waitForTimeout(ms);
    await page.mouse.up();
  }

  async function setup(page: Page): Promise<{ id: number; errors: string[] }> {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.centerOn(1536, 2488));
    const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 1216, 2728));
    await page.waitForTimeout(200);
    return { id, errors };
  }

  test('holding over the Garden, then releasing, adds the kid to a plot', async ({ page }) => {
    const { id, errors } = await setup(page);
    const wallet = await page.evaluate(() => window.__PK__!.wallet());
    await holdOverHome(page, id, 450);
    await expect.poll(() => page.evaluate((i) => window.__PK__!.kids().some((k) => k.id === i), id)).toBe(false);
    // It leaves the map at once, with no farewell (§15.1), and the plot gains it.
    expect(await page.evaluate(() => window.__PK__!.plots()[0]!.kids)).toBe(1);
    await expect(page.locator('.toast-home')).toContainText('Fire Kid added to Plot 1.');
    await expect(page.locator('.toast-home')).toContainText('Add 3–5 kids, then press Start growing.');
    // Still discovered; no refund.
    await page.locator('[data-nav=dex]').click();
    await expect(page.getByRole('button', { name: 'Fire Kid, Tier 1' })).toBeVisible();
    const after = await page.evaluate(() => window.__PK__!.wallet());
    expect(after.potatokens).toBe(wallet.potatokens);
    expect(errors).toEqual([]);
  });

  test('a cancelled plot gives its kids back to the map with their ids, drawn (D-074)', async ({ page }) => {
    const { errors } = await setup(page);
    const ids = await page.evaluate(() => {
      const pk = window.__PK__!;
      const ids = [0, 1, 2].map((i) => pk.debugAdd!('plain', 1856 + i * 250, 4328));
      pk.debugCommand!({ type: 'plant', kidIds: ids, plot: 0 });
      pk.debugCommand!({ type: 'startGrowing', plot: 0 });
      return ids;
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('growing');
    await page.evaluate(() => window.__PK__!.debugCommand!({ type: 'emptyPlot', plot: 0 }));
    await expect.poll(() => page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('empty');
    // Back on the map with their ids, each drawn (it has a view).
    const back = await page.evaluate((list) => list.map((i) => ({ live: window.__PK__!.kids().some((k) => k.id === i), drawn: window.__PK__!.screenPointOf(i) !== undefined })), ids);
    expect(back).toEqual(ids.map(() => ({ live: true, drawn: true })));
    expect(errors).toEqual([]);
  });

  test('releasing before the 400 ms dwell places the kid normally', async ({ page }) => {
    const { id } = await setup(page);
    // Straight in and straight out: a stepped move can itself take 400 ms on a slow runner.
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    const t = await page.evaluate(() => window.__PK__!.worldToScreen(1536, 2156));
    await page.mouse.move(k.x, k.y - 20);
    await page.mouse.down();
    await page.mouse.move(t.x, t.y);
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await page.evaluate((i) => window.__PK__!.kids().some((k) => k.id === i), id)).toBe(true);
    expect(await page.evaluate(() => window.__PK__!.home())).toMatchObject({ state: 'hidden' });
  });

  test('the target labels each state, and hides when no kid is held', async ({ page }) => {
    const { id } = await setup(page);
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    const t = await page.evaluate(() => window.__PK__!.worldToScreen(1536, 2156));
    await expect(page.locator('.home-label:not(.home-probe)')).toBeHidden();
    await page.mouse.move(k.x, k.y - 20);
    await page.mouse.down();
    await page.mouse.move(k.x + 30, k.y + 120, { steps: 6 });
    await expect(page.locator('.home-label:not(.home-probe) .home-heading')).toHaveText('Add to Plot 1');
    await page.mouse.move(t.x, t.y, { steps: 6 });
    await expect(page.locator('.home-label:not(.home-probe) .home-heading')).toHaveText('Keep holding…');
    await expect(page.locator('.home-label:not(.home-probe) .home-heading')).toHaveText('Release to add this kid');
    await expect(page.locator('.home-label:not(.home-probe)')).toContainText('Plot 1: 0 → 1 / 5.');
    await expect(page.locator('.home-target')).toHaveAttribute('data-state', 'ready');
    // Moving off resets: back to "Add to Plot 1", and releasing there drops normally.
    await page.mouse.move(k.x + 30, k.y + 120, { steps: 6 });
    await expect(page.locator('.home-label:not(.home-probe) .home-heading')).toHaveText('Add to Plot 1');
    await page.mouse.up();
    await expect(page.locator('.home-label:not(.home-probe)')).toBeHidden();
    expect(await page.evaluate((i) => window.__PK__!.kids().some((k) => k.id === i), id)).toBe(true);
  });

  test('with every plot full the target never arms, and a release over it keeps the kid (GUI_MVP §15.1)', async ({ page }) => {
    const { id } = await setup(page);
    // Fill the only plot (five kids, not started).
    await page.evaluate(() => {
      const pk = window.__PK__!;
      const ids = Array.from({ length: 5 }, (_, i) => pk.debugAdd!('plain', 756 + i * 250, 4328));
      pk.debugCommand!({ type: 'plant', kidIds: ids });
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.plots()[0]!.kids)).toBe(5);
    // The first-time explanation for that add goes first.
    await page.locator('.toast-home').getByRole('button', { name: 'Dismiss' }).click();
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    const t = await page.evaluate(() => window.__PK__!.worldToScreen(1536, 2156));
    await page.mouse.move(k.x, k.y - 20);
    await page.mouse.down();
    await page.mouse.move(t.x, t.y, { steps: 8 });
    await expect(page.locator('.home-label:not(.home-probe) .home-heading')).toHaveText('All plots are full.');
    await page.waitForTimeout(600); // well past the 400 ms dwell
    // The map held still under the finger, though the target never armed.
    expect(await page.evaluate(() => window.__PK__!.worldToScreen(1536, 2156))).toEqual(t);
    await expect(page.locator('.home-target')).not.toHaveAttribute('data-state', 'ready');
    await page.mouse.up();
    await expect(page.locator('.feedback')).toContainText('All plots are full.');
    expect(await page.evaluate((i) => window.__PK__!.kids().some((c) => c.id === i), id)).toBe(true);
    expect(await page.evaluate(() => window.__PK__!.plots()[0]!.kids)).toBe(5);
  });

  test('a view change just before release restarts the dwell (Codex review, PR #50)', async ({ page }) => {
    const { id } = await setup(page);
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    const t = await page.evaluate(() => window.__PK__!.worldToScreen(1536, 2156));
    await page.mouse.move(k.x, k.y - 20);
    await page.mouse.down();
    await page.mouse.move(t.x, t.y, { steps: 8 });
    await expect.poll(() => page.evaluate(() => window.__PK__!.home().state)).toBe('ready');
    // In one task, with no frame between: the camera moves a world unit, then release.
    // Sideways: vertically the view is clamped at the world's top edge here.
    await page.evaluate(([x, y]) => {
      window.__PK__!.centerOn(1537, 2488);
      document.querySelector('canvas')!.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, bubbles: true }));
    }, [t.x, t.y] as const);
    await page.waitForTimeout(300);
    expect(await page.evaluate((i) => window.__PK__!.kids().some((c) => c.id === i), id)).toBe(true);
  });

  test('a drop by the spawn outlet, below the target, is an ordinary drop', async ({ page }) => {
    const { id } = await setup(page);
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    // Just below the target's bottom edge (world y 556): outside, however long it is held.
    const below = await page.evaluate(() => window.__PK__!.worldToScreen(1536, 2368));
    await page.mouse.move(k.x, k.y - 20);
    await page.mouse.down();
    await page.mouse.move(below.x, below.y, { steps: 8 });
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.__PK__!.home().state)).toBe('shown');
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await page.evaluate((i) => window.__PK__!.kids().some((k) => k.id === i), id)).toBe(true);
  });
});
