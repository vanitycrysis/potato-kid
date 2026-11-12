import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

test.describe('Planting, tapping a plot on the map (GUI_MVP §15.2)', () => {
  // Plot n's soil centre: the Garden's ground (1536, 2348, map v4) plus its offset, then the soil's middle.
  const offsets = [
    [-96, 88],
    [96, 88],
  ] as const;
  const soil = (n: number) => ({ x: 1536 + offsets[n - 1]![0], y: 2348 + offsets[n - 1]![1] - 37.5 });

  async function setup(page: Page): Promise<{ x: number; y: number }> {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.centerOn(1536, 2488));
    await page.waitForTimeout(100);
    return page.evaluate((p) => window.__PK__!.worldToScreen(p.x, p.y), soil(1));
  }

  /**
   * Pointer events on the canvas, all in one task, so a busy test machine can't stretch a
   * tap past its 220 ms. Returns the map's screen point for plot 1 after the last move.
   */
  function press(page: Page, steps: ['pointerdown' | 'pointermove' | 'pointerup', number, number][]) {
    return page.evaluate(
      ([steps, plot]) => {
        const canvas = document.querySelector('canvas')!;
        let held: { x: number; y: number } | null = null;
        for (const [type, x, y] of steps) {
          canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1, bubbles: true }));
          if (type === 'pointermove') held = window.__PK__!.worldToScreen(plot.x, plot.y);
        }
        return held;
      },
      [steps, soil(1)] as const,
    );
  }
  const tap = (page: Page, p: { x: number; y: number }) => press(page, [['pointerdown', p.x, p.y], ['pointerup', p.x, p.y]]);

  test('a tap on an empty plot opens its picker; on a growing plot, its detail', async ({ page }) => {
    const at = await setup(page);
    await tap(page, at);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').locator('.sheet-title')).toHaveText('Pick kids for Plot 1');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.evaluate(() => {
      const pk = window.__PK__!;
      pk.debugCommand!({ type: 'plant', kidIds: [0, 1, 2].map((i) => pk.debugAdd!('plain', 756 + i * 250, 4328)), plot: 0 });
      pk.debugCommand!({ type: 'startGrowing', plot: 0 });
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('growing');
    await tap(page, at);
    await expect(page.getByRole('dialog').locator('.sheet-title')).toHaveText('Plot 1');
    await expect(page.getByRole('dialog').locator('.sheet-subtitle')).toHaveText('3 / 5 kids · Growing');
  });

  test('a ready plot waits for a tap; the tap brings its kid up at the Garden and opens nothing (D-088)', async ({ page }) => {
    const at = await setup(page);
    // Growing: no glow.
    await page.evaluate(() => {
      const pk = window.__PK__!;
      pk.debugCommand!({ type: 'plant', kidIds: [0, 1, 2].map((i) => pk.debugAdd!('plain', 756 + i * 250, 4328)), plot: 0 });
      pk.debugCommand!({ type: 'startGrowing', plot: 0 });
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('growing');
    expect(await page.evaluate(() => window.__PK__!.plots()[0]!.glow)).toBe(false);
    await page.evaluate(() => window.__PK__!.debugReadySeed!(0, 'hero', true));
    const before = await page.evaluate(() => window.__PK__!.kids().length);
    // It waits, however long, glowing under its checked sign: nothing comes up by itself.
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('ready');
    const ready = await page.evaluate(() => window.__PK__!.plots()[0]!);
    expect(ready.glow).toBe(true);
    // The sign is at least 96 CSS px across at any zoom (§27.6); zoomed in, larger.
    expect(ready.signCss!).toBeGreaterThanOrEqual(96 - 0.01);
    expect(await page.evaluate(() => window.__PK__!.kids().length)).toBe(before);
    await tap(page, at);
    await expect.poll(() => page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('empty');
    expect(await page.evaluate(() => window.__PK__!.kids().filter((k) => k.type === 'hero').length)).toBe(1);
    expect(await page.evaluate(() => window.__PK__!.kids().length)).toBe(before + 1);
    // No sheet opens over its arrival, and the glow is gone; an empty plot's tap opens its picker again.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => window.__PK__!.plots()[0]!.glow)).toBe(false);
    await tap(page, at);
    await expect(page.getByRole('dialog').locator('.sheet-title')).toHaveText('Pick kids for Plot 1');
  });

  test('two quick taps on a ready plot are one harvest: no refusal follows the arrival (Codex review round 2, #115)', async ({ page }) => {
    const at = await setup(page);
    await page.evaluate(() => window.__PK__!.debugReadySeed!(0, 'hero', true));
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => window.__PK__!.kids().length);
    await page.evaluate(() => {
      const w = window as unknown as { stepTypes: string[] };
      w.stepTypes = [];
      window.__PK__!.debugListenSteps!((t) => w.stepTypes.push(...t));
    });
    // Both taps in one task, so no sim step can run between them.
    await press(page, [
      ['pointerdown', at.x, at.y],
      ['pointerup', at.x, at.y],
      ['pointerdown', at.x, at.y],
      ['pointerup', at.x, at.y],
    ]);
    await expect.poll(() => page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('empty');
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__PK__!.kids().length)).toBe(before + 1);
    // One request, so no refusal at all.
    expect(await page.evaluate(() => (window as unknown as { stepTypes: string[] }).stepTypes)).not.toContain('rejected');
  });

  test('the Garden says a plot is ready to sprout; its Harvest sprout brings the kid up and closes the Garden (D-088, §27.6)', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => window.__PK__!.debugReadySeed!(0, 'hero', true));
    await page.locator('[data-nav=garden]').click();
    const sheet = page.getByRole('dialog');
    const row = sheet.locator('.plot-row').first();
    await expect(row.locator('.plot-row-status')).toHaveText('Ready to sprout');
    await expect(row.locator('.plot-row-waiting')).toHaveText('Tap the plot or choose Harvest sprout.');
    // The detail says the same and has the same button.
    await row.getByRole('button', { name: 'View plot' }).click();
    await expect(sheet.locator('.plot-row-status')).toHaveText('Ready to sprout');
    await expect(sheet.getByRole('button', { name: 'Harvest sprout' })).toBeVisible();
    await sheet.locator('.plot-back').click();
    await row.getByRole('button', { name: 'Harvest sprout' }).click();
    await expect(sheet).toHaveCount(0);
    expect(await page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('empty');
    expect(await page.evaluate(() => window.__PK__!.kids().filter((k) => k.type === 'hero').length)).toBe(1);
  });

  test("a refused Harvest sprout says why in the plot's own row, and the plot stays ready (Codex review, #115)", async ({ page }) => {
    await setup(page);
    await page.evaluate(() => {
      const pk = window.__PK__!;
      pk.debugReadySeed!(0, 'hero', true);
      // Nothing by the Garden is clear.
      pk.debugObstacle!({ minX: 0, minY: 0, maxX: 4000, maxY: 6000 });
    });
    await page.locator('[data-nav=garden]').click();
    const row = page.getByRole('dialog').locator('.plot-row').first();
    await row.getByRole('button', { name: 'Harvest sprout' }).click();
    await expect(row.locator('.plot-row-waiting')).toHaveText('No clear spot near the Garden. Try again after kids move.');
    await expect(row.locator('.plot-row-waiting')).toHaveAttribute('role', 'status');
    await expect(row.locator('.plot-row-status')).toHaveText('Ready · Waiting for a clear spot');
    expect(await page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('ready');
    await expect(page.getByRole('dialog')).toHaveCount(1);
    // Room again: the row stops saying it waits, and nothing comes up until asked (Codex review round 3, #115).
    await page.evaluate(() => window.__PK__!.debugObstacle!(null));
    await expect(row.locator('.plot-row-waiting')).toHaveText('Tap the plot or choose Harvest sprout.');
    await expect(row.locator('.plot-row-status')).toHaveText('Ready to sprout');
    expect(await page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('ready');
  });

  test('a long press or a pan opens nothing; a jitter within 8 px is still a tap, and the map holds', async ({ page }) => {
    const at = await setup(page);
    // Held past 220 ms.
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.waitForTimeout(350);
    await page.mouse.up();
    await page.waitForTimeout(200);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Moved 30 px: a pan, which moves the map.
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + 30, at.y, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Wait out the fling: a press on a moving map is never a tap.
    let was = '';
    await expect
      .poll(
        async () => {
          const now = JSON.stringify(await page.evaluate((p) => window.__PK__!.worldToScreen(p.x, p.y), soil(1)));
          const still = now === was;
          was = now;
          return still;
        },
        { intervals: [150] },
      )
      .toBe(true);
    const moved = await page.evaluate((p) => window.__PK__!.worldToScreen(p.x, p.y), soil(1));
    expect(moved.x).toBeGreaterThan(at.x + 10);
    // Within 8 px the map holds still, and the tap opens the plot.
    const during = await press(page, [
      ['pointerdown', moved.x, moved.y],
      ['pointermove', moved.x + 3, moved.y + 1],
      ['pointermove', moved.x + 5, moved.y + 3],
      ['pointerup', moved.x + 5, moved.y + 3],
    ]);
    expect(during).toEqual(moved);
    await expect(page.getByRole('dialog').locator('.sheet-title')).toHaveText('Pick kids for Plot 1');
  });

  test('a locked plot is no target, and a tap on bare ground opens nothing', async ({ page }) => {
    await setup(page);
    const locked = await page.evaluate((p) => window.__PK__!.worldToScreen(p.x, p.y), soil(2));
    await tap(page, locked);
    await page.waitForTimeout(300);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const bare = await page.evaluate(() => window.__PK__!.worldToScreen(1536, 2728));
    await tap(page, bare);
    await page.waitForTimeout(300);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('a second finger on a kid cancels a tap on a plot (Codex review, PR #72)', async ({ page }) => {
    const at = await setup(page);
    const kid = await page.evaluate(() => window.__PK__!.debugAdd!('plain', 1536, 2728));
    await page.waitForTimeout(200);
    const k = await page.evaluate((id) => window.__PK__!.screenPointOf(id)!, kid);
    // Touch 1 on the plot, touch 2 on the kid, touch 1 lifts at once: no tap.
    await page.evaluate(
      ([at, k]) => {
        const canvas = document.querySelector('canvas')!;
        const fire = (type: string, id: number, p: { x: number; y: number }) =>
          canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: p.x, clientY: p.y, bubbles: true }));
        fire('pointerdown', 1, at);
        fire('pointerdown', 2, { x: k.x, y: k.y - 20 });
        fire('pointerup', 1, at);
        fire('pointerup', 2, { x: k.x, y: k.y - 20 });
      },
      [at, k] as const,
    );
    await page.waitForTimeout(300);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // The same touch alone is a tap.
    await page.evaluate((at) => {
      const canvas = document.querySelector('canvas')!;
      const fire = (type: string) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: at.x, clientY: at.y, bubbles: true }));
      fire('pointerdown');
      fire('pointerup');
    }, at);
    await expect(page.getByRole('dialog').locator('.sheet-title')).toHaveText('Pick kids for Plot 1');
  });
});
