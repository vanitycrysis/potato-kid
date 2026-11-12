import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

test.describe('pinch-to-zoom (D-071)', () => {
  type Pt = { x: number; y: number };
  /** Sends touch pointer events to the canvas in one page task: [type, pointerId, x, y]. */
  function touches(page: Page, steps: ['pointerdown' | 'pointermove' | 'pointerup', number, number, number][]) {
    return page.evaluate((steps) => {
      const canvas = document.querySelector('canvas')!;
      for (const [type, id, x, y] of steps) {
        canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1, bubbles: true }));
      }
    }, steps);
  }

  async function setup(page: Page): Promise<{ errors: string[]; anchor: Pt; at: Pt }> {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    // An open stretch of map, away from the edges, with no kid under the fingers.
    const anchor = { x: 1536, y: 3928 };
    await page.evaluate((a) => window.__PK__!.centerOn(a.x, a.y), anchor);
    await page.waitForTimeout(100);
    const at = await page.evaluate((a) => window.__PK__!.worldToScreen(a.x, a.y), anchor);
    return { errors, anchor, at };
  }

  const near = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y) < 1.5;

  test('spreading two fingers zooms in about their midpoint, which stays on the same spot of the map', async ({ page }) => {
    const { errors, anchor, at } = await setup(page);
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBe(1);
    await touches(page, [
      ['pointerdown', 1, at.x - 40, at.y],
      ['pointerdown', 2, at.x + 40, at.y],
      ['pointermove', 1, at.x - 60, at.y],
      ['pointermove', 2, at.x + 60, at.y],
    ]);
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBeCloseTo(1.5, 5);
    // The map point that was between the fingers is still between them.
    expect(near(await page.evaluate((a) => window.__PK__!.worldToScreen(a.x, a.y), anchor), at)).toBe(true);
    // Both fingers moving together pan the map with them.
    await touches(page, [
      ['pointermove', 1, at.x - 60, at.y + 30],
      ['pointermove', 2, at.x + 60, at.y + 30],
      ['pointerup', 1, at.x - 60, at.y + 30],
      ['pointerup', 2, at.x + 60, at.y + 30],
    ]);
    expect(near(await page.evaluate((a) => window.__PK__!.worldToScreen(a.x, a.y), anchor), { x: at.x, y: at.y + 30 })).toBe(true);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('zoom stops at half and at twice the fitted zoom', async ({ page }) => {
    const { at } = await setup(page);
    await touches(page, [
      ['pointerdown', 1, at.x - 100, at.y],
      ['pointerdown', 2, at.x + 100, at.y],
      ['pointermove', 1, at.x - 5, at.y],
      ['pointermove', 2, at.x + 5, at.y],
    ]);
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBe(0.5);
    await touches(page, [
      // The pinch scales from its start (200 px at zoom 1): 440 px would be 2.2.
      ['pointermove', 1, at.x - 220, at.y],
      ['pointermove', 2, at.x + 220, at.y],
      ['pointerup', 1, at.x - 220, at.y],
      ['pointerup', 2, at.x + 220, at.y],
    ]);
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBe(2);
  });

  test('after one finger lifts, the other pans on from where it is, with no jump', async ({ page }) => {
    const { anchor, at } = await setup(page);
    await touches(page, [
      ['pointerdown', 1, at.x - 40, at.y],
      ['pointerdown', 2, at.x + 40, at.y],
      ['pointermove', 2, at.x + 80, at.y],
      ['pointerup', 1, at.x - 40, at.y],
    ]);
    const before = await page.evaluate((a) => window.__PK__!.worldToScreen(a.x, a.y), anchor);
    // The first move only follows the finger from where it is: nothing jumps.
    await touches(page, [['pointermove', 2, at.x + 80, at.y + 30]]);
    const after = await page.evaluate((a) => window.__PK__!.worldToScreen(a.x, a.y), anchor);
    expect(near(after, { x: before.x, y: before.y + 30 })).toBe(true);
    await touches(page, [['pointerup', 2, at.x + 80, at.y + 30]]);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('a second finger on a kid just pressed pinches instead: the kid is put back, with no card and no drag', async ({ page }) => {
    await setup(page);
    const id = await page.evaluate((a) => window.__PK__!.debugAdd!('plain', a.x, a.y), { x: 1536, y: 3928 });
    await page.waitForTimeout(200);
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    const before = await page.evaluate((i) => window.__PK__!.kids().find((x) => x.id === i)!, id);
    await touches(page, [
      ['pointerdown', 1, k.x, k.y - 20],
      ['pointerdown', 2, k.x + 120, k.y - 20],
      ['pointermove', 2, k.x + 180, k.y - 20],
      ['pointerup', 1, k.x, k.y - 20],
      ['pointerup', 2, k.x + 180, k.y - 20],
    ]);
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBeGreaterThan(1);
    await page.waitForTimeout(300);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const after = await page.evaluate((i) => window.__PK__!.kids().find((x) => x.id === i)!, id);
    expect({ x: after.x, y: after.y, held: after.held }).toEqual({ x: before.x, y: before.y, held: false });
  });

  test('a second finger landing on a kid while the first pans pinches too, and picks nothing up', async ({ page }) => {
    await setup(page);
    const id = await page.evaluate(() => window.__PK__!.debugAdd!('plain', 1536, 3928));
    await page.waitForTimeout(200);
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    const ground = { x: k.x - 150, y: k.y + 150 };
    await touches(page, [
      ['pointerdown', 1, ground.x, ground.y],
      ['pointerdown', 2, k.x, k.y - 20],
      ['pointermove', 2, k.x + 60, k.y - 20],
      ['pointerup', 2, k.x + 60, k.y - 20],
      ['pointerup', 1, ground.x, ground.y],
    ]);
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBeGreaterThan(1);
    expect(await page.evaluate((i) => window.__PK__!.kids().find((x) => x.id === i)!.held, id)).toBe(false);
  });

  test('a second finger after the 220 ms tap window, before any frame has seen it pass, leaves the kid dragged', async ({ page }) => {
    await setup(page);
    const id = await page.evaluate(() => window.__PK__!.debugAdd!('plain', 1536, 3928));
    await page.waitForTimeout(200);
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    // One page task: no frame runs between the press and the second finger (Codex review, PR #83).
    await page.evaluate((k) => {
      const canvas = document.querySelector('canvas')!;
      const send = (type: string, id: number, x: number, y: number) =>
        canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, buttons: 1, bubbles: true }));
      send('pointerdown', 1, k.x, k.y - 20);
      const t = performance.now();
      while (performance.now() - t < 260) {
        // Held past the tap window.
      }
      send('pointerdown', 2, k.x + 120, k.y - 20);
      send('pointermove', 2, k.x + 180, k.y - 20);
    }, k);
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBe(1);
    expect(await page.evaluate((i) => window.__PK__!.kids().find((x) => x.id === i)!.held, id)).toBe(true);
    await touches(page, [
      ['pointermove', 1, k.x + 60, k.y - 20],
      ['pointerup', 1, k.x + 60, k.y - 20],
      ['pointerup', 2, k.x + 180, k.y - 20],
    ]);
  });

  test('a second finger while a kid is being dragged is ignored: the drag goes on and nothing zooms', async ({ page }) => {
    await setup(page);
    const id = await page.evaluate(() => window.__PK__!.debugAdd!('plain', 1536, 3928));
    await page.waitForTimeout(200);
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    await touches(page, [
      ['pointerdown', 1, k.x, k.y - 20],
      ['pointermove', 1, k.x + 40, k.y - 20], // past 8 px: a drag
      ['pointerdown', 2, k.x - 150, k.y + 100],
      ['pointermove', 2, k.x - 250, k.y + 100],
      ['pointerup', 2, k.x - 250, k.y + 100],
      ['pointermove', 1, k.x + 80, k.y - 20],
      ['pointerup', 1, k.x + 80, k.y - 20],
    ]);
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBe(1);
    await expect.poll(() => page.evaluate((i) => window.__PK__!.kids().find((x) => x.id === i)!.x, id)).toBeGreaterThan(1556);
  });

  test('the zoom stays the same when the screen changes size', async ({ page }) => {
    const { at } = await setup(page);
    const span = () => page.evaluate(() => { const pk = window.__PK__!; return pk.worldToScreen(1756, 3928).x - pk.worldToScreen(1456, 3928).x; });
    const fitted = await span();
    await touches(page, [
      ['pointerdown', 1, at.x - 40, at.y],
      ['pointerdown', 2, at.x + 40, at.y],
      ['pointermove', 2, at.x + 120, at.y],
      ['pointerup', 1, at.x - 40, at.y],
      ['pointerup', 2, at.x + 120, at.y],
    ]);
    expect(await span()).toBeCloseTo(fitted * 2, 3);
    // Taller: the fitted zoom (1080 units across) is unchanged, so the map is drawn as before.
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: size.width, height: size.height + 60 });
    await expect.poll(span).toBeCloseTo(fitted * 2, 3);
  });

  test('a mouse wheel zooms about the pointer', async ({ page }) => {
    const { anchor, at } = await setup(page);
    // The project emulates a phone, where Playwright's wheel isn't delivered: send one.
    await page.evaluate((at) => document.querySelector('canvas')!.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, clientX: at.x, clientY: at.y, bubbles: true, cancelable: true })), at);
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBeCloseTo(Math.exp(0.3), 5);
    expect(near(await page.evaluate((a) => window.__PK__!.worldToScreen(a.x, a.y), anchor), at)).toBe(true);
  });

  test('a wheel counting lines or pages zooms as much as one counting pixels', async ({ page }) => {
    const { at } = await setup(page);
    const wheel = (deltaY: number, deltaMode: number) =>
      page.evaluate(([at, deltaY, deltaMode]) => document.querySelector('canvas')!.dispatchEvent(new WheelEvent('wheel', { deltaY, deltaMode, clientX: at.x, clientY: at.y, bubbles: true, cancelable: true })), [at, deltaY, deltaMode] as const);
    // Firefox's mouse wheel: three lines a notch, a line taken as 16 px (Codex review, PR #83).
    await wheel(-3, 1); // DOM_DELTA_LINE
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBeCloseTo(Math.exp(48 * 0.0015), 5);
    // A page zooms out a long way: clamped at the farthest zoom.
    await wheel(1, 2); // DOM_DELTA_PAGE
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBe(0.5);
  });

  test('a pinch cut short by the app going away leaves no gesture behind: one finger pans and the wheel zooms after', async ({ page }) => {
    const { anchor, at } = await setup(page);
    // Two fingers down, then the app is backgrounded; their pointerups never arrive.
    await touches(page, [
      ['pointerdown', 1, at.x - 40, at.y],
      ['pointerdown', 2, at.x + 40, at.y],
      ['pointermove', 2, at.x + 50, at.y],
    ]);
    await page.evaluate(() => window.__PK__!.debugAway!(1000));
    const zoomed = await page.evaluate(() => window.__PK__!.zoom());
    const before = await page.evaluate((a) => window.__PK__!.worldToScreen(a.x, a.y), anchor);
    await touches(page, [
      ['pointerdown', 3, at.x, at.y],
      ['pointermove', 3, at.x, at.y + 30],
    ]);
    expect(near(await page.evaluate((a) => window.__PK__!.worldToScreen(a.x, a.y), anchor), { x: before.x, y: before.y + 30 })).toBe(true);
    await touches(page, [['pointerup', 3, at.x, at.y + 30]]);
    await page.waitForTimeout(500);
    await page.evaluate((at) => document.querySelector('canvas')!.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, clientX: at.x, clientY: at.y, bubbles: true, cancelable: true })), at);
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBeCloseTo(zoomed * Math.exp(0.3), 5);
  });
});
