import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

test.describe('assigning a kid to a field by drag (D-069, GUI_MVP §22.4)', () => {
  /** Field 1's drop target's middle, in world units (Codex's dragRelative about its ground, 1166, 3588 in farm_v2). */
  const TARGET = { x: 1166, y: 3588 - 112 };

  /** A bought field growing `food`, the camera on it, and a kid of `type` beside it. */
  async function setup(page: Page, food: string, type = 'plain'): Promise<number> {
    await boot(page, '?seed=3&debug=1&calm=1');
    const id = await page.evaluate(
      ([food, type]) => {
        const pk = window.__PK__!;
        pk.debugGive!({ materials: 5000 });
        pk.debugCommand!({ type: 'unlockField' });
        pk.debugCommand!({ type: 'setFieldFood', field: 0, food });
        pk.centerOn(1166, 3548);
        return pk.debugAdd!(type, 1576, 3548);
      },
      [food, type] as const,
    );
    await page.waitForTimeout(300);
    return id;
  }

  /** Moves the finger to world point `w`, read at the moment of moving (the camera may have scrolled). */
  async function moveTo(page: Page, w: { x: number; y: number }): Promise<void> {
    const p = await page.evaluate((w) => window.__PK__!.worldToScreen(w.x, w.y), w);
    await page.mouse.move(p.x, p.y, { steps: 4 });
  }

  async function pick(page: Page, id: number): Promise<void> {
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    await page.mouse.move(k.x, k.y - 20);
    await page.mouse.down();
  }

  const label = (page: Page) => page.locator('.home-label:not(.home-probe)');

  /**
   * Touch pointer events to the canvas, in one page task: no frame runs between them, so a
   * dwell can't start in between however slow the machine (CI).
   */
  const touchTask = (page: Page, steps: ['pointerdown' | 'pointermove' | 'pointerup', number, number][]) =>
    page.evaluate((steps) => {
      const canvas = document.querySelector('canvas')!;
      for (const [type, x, y] of steps) canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1, bubbles: true }));
    }, steps);

  test('held near a field it can farm, the label says so; held over it, then released, the kid goes to work', async ({ page }) => {
    const id = await setup(page, 'apple');
    await pick(page, id);
    // Beside the field (the Garden's target is off screen): its entry label shows.
    await moveTo(page, { x: 1526, y: 3498 });
    await expect(label(page)).toContainText('Farm Apple in Field 1');
    await moveTo(page, TARGET);
    await expect(label(page)).toContainText(/Keep holding…|Release to start farming/);
    await page.waitForTimeout(500);
    await expect(label(page)).toContainText('Release to start farming');
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.__PK__!.fields()[0]?.kids.length ?? 0)).toBe(1);
    expect(await page.evaluate((i) => window.__PK__!.kids().some((k) => k.id === i), id)).toBe(false);
    // The world says it once: no sheet did (Codex review, #90).
    // After the setup's own cards (unlocked, food chosen), one at a time.
    const toast = page.locator('.toast', { hasText: 'Potato Kid is farming Apple in Field 1.' });
    await expect(toast).toBeVisible({ timeout: 15_000 });
    await expect(toast).toContainText('No Materials while farming. Take back from this field.');
    // Its map figure goes with it; the field draws it now.
    expect(await page.evaluate((i) => window.__PK__!.presentationOf(i), id)).toBeUndefined();
    await expect.poll(() => page.evaluate((i) => window.__PK__!.fields()[0]!.kids.some((k) => k.id === i), id)).toBe(true);
  });

  test('a second finger while armed over a field: it disarms, and the release keeps the kid (Codex review, #90)', async ({ page }) => {
    const id = await setup(page, 'apple');
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    const t = await page.evaluate((w) => window.__PK__!.worldToScreen(w.x, w.y), TARGET);
    const touch = (type: string, pid: number, x: number, y: number) =>
      page.evaluate(
        ([type, pid, x, y]) => {
          document.querySelector('canvas')!.dispatchEvent(new PointerEvent(type as string, { pointerId: pid as number, pointerType: 'touch', isPrimary: pid === 1, clientX: x as number, clientY: y as number, buttons: type === 'pointerup' ? 0 : 1, bubbles: true }));
        },
        [type, pid, x, y] as const,
      );
    await touch('pointerdown', 1, k.x, k.y - 20);
    for (let s = 1; s <= 6; s++) await touch('pointermove', 1, k.x + ((t.x - k.x) * s) / 6, k.y - 20 + ((t.y - k.y + 20) * s) / 6);
    await page.waitForTimeout(600);
    await expect(label(page)).toContainText('Release to start farming');
    await touch('pointerdown', 2, t.x + 60, t.y + 120);
    // Disarmed: the target and its label go.
    await expect(label(page)).toBeHidden();
    await touch('pointerup', 1, t.x, t.y);
    await touch('pointerup', 2, t.x + 60, t.y + 120);
    await page.waitForTimeout(400);
    expect(await page.evaluate((i) => window.__PK__!.kids().some((k) => k.id === i), id)).toBe(true);
    expect(await page.evaluate(() => window.__PK__!.fields()[0]!.kids)).toEqual([]);
  });

  test('armed, then the field changes food: the hold starts over, and an early release keeps the kid (Codex review, #90)', async ({ page }) => {
    const id = await setup(page, 'apple');
    await pick(page, id);
    await moveTo(page, TARGET);
    await page.waitForTimeout(600);
    await expect(label(page)).toContainText('Release to start farming');
    // The food changes; just after it applies (the hold restarted), the release.
    const at = await page.evaluate((w) => window.__PK__!.worldToScreen(w.x, w.y), TARGET);
    const shown = await page.evaluate(
      (at) =>
        new Promise<string>((done) => {
          window.__PK__!.debugCommand!({ type: 'setFieldFood', field: 0, food: 'corn' });
          // Frames until the sim has applied it (it steps on its own clock), then one more for
          // the label: far less than the 400 ms a fresh hold needs.
          const wait = () =>
            requestAnimationFrame(() => {
              if (window.__PK__!.fields()[0]?.food !== 'corn') return wait();
              requestAnimationFrame(() => {
                const text = document.querySelector('.home-label:not(.home-probe)')?.textContent ?? '';
                document.querySelector('canvas')!.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', isPrimary: true, clientX: at.x, clientY: at.y, buttons: 0, bubbles: true }));
                done(text);
              });
            });
          wait();
        }),
      at,
    );
    expect(shown).toMatch(/Keep holding…|Farm Corn in Field 1/);
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await page.evaluate((i) => window.__PK__!.kids().some((k) => k.id === i), id)).toBe(true);
    expect(await page.evaluate(() => window.__PK__!.fields()[0]!.kids)).toEqual([]);
  });

  test('an armed drag cancelled, and a new one released over the field before a frame: no farming (Codex review, #90)', async ({ page }) => {
    const id = await setup(page, 'apple');
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    const t = await page.evaluate((w) => window.__PK__!.worldToScreen(w.x, w.y), TARGET);
    await touchTask(page, [['pointerdown', k.x, k.y - 20]]);
    await touchTask(page, [['pointermove', k.x - 40, k.y - 40]]);
    await page.waitForTimeout(100);
    await touchTask(page, [['pointermove', t.x, t.y]]);
    await page.waitForTimeout(600);
    await expect(label(page)).toContainText('Release to start farming');
    // Cancelled, then picked up again where it is drawn (still over the field until the next
    // frame) and let go over the field, all before the next frame.
    await page.evaluate(
      ([id, t]) => {
        const canvas = document.querySelector('canvas')!;
        const send = (type: string, x: number, y: number) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1, bubbles: true }));
        send('pointercancel', t.x, t.y);
        const at = window.__PK__!.screenPointOf(id)!;
        send('pointerdown', at.x, at.y - 20);
        // Past the tap's slop, staying inside the field's target (leaving it would end a dwell).
        send('pointermove', t.x + 30, t.y);
        send('pointermove', t.x, t.y);
        send('pointerup', t.x, t.y);
      },
      [id, t] as const,
    );
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__PK__!.fields()[0]!.kids)).toEqual([]);
    expect(await page.evaluate((i) => window.__PK__!.kids().some((k) => k.id === i), id)).toBe(true);
  });

  test('released before the dwell, the kid stays on the map', async ({ page }) => {
    const id = await setup(page, 'apple');
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    const t = await page.evaluate((w) => window.__PK__!.worldToScreen(w.x, w.y), TARGET);
    await touchTask(page, [['pointerdown', k.x, k.y - 20]]);
    // Out past the tap's slop first: a drag, not a tap.
    await touchTask(page, [['pointermove', k.x - 40, k.y - 40]]);
    await page.waitForTimeout(100);
    // Onto the field and off the screen at once: no frame, so no dwell.
    await touchTask(page, [
      ['pointermove', t.x, t.y],
      ['pointerup', t.x, t.y],
    ]);
    await page.waitForTimeout(300);
    expect(await page.evaluate((i) => window.__PK__!.kids().some((k) => k.id === i), id)).toBe(true);
    expect(await page.evaluate(() => window.__PK__!.fields()[0]!.kids)).toEqual([]);
  });

  test('over a field growing a food it hates, the label says why, it never arms, and the kid stays', async ({ page }) => {
    // Potato Kid hates pickles.
    const id = await setup(page, 'pickle');
    await pick(page, id);
    await moveTo(page, TARGET);
    await page.waitForTimeout(700);
    await expect(label(page)).toContainText('Potato Kid won’t farm Pickle.');
    await expect(page.locator('.home-target')).toHaveAttribute('data-refused', 'true');
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await page.evaluate((i) => window.__PK__!.kids().some((k) => k.id === i), id)).toBe(true);
    expect(await page.evaluate(() => window.__PK__!.fields()[0]!.kids)).toEqual([]);
  });

  test('kept on the map after a field release, the kid lands clear of a partner that walked up: no fusion (Codex review, #90)', async ({ page }) => {
    const id = await setup(page, 'pickle');
    const start = await page.evaluate((i) => window.__PK__!.kids().find((k) => k.id === i)!, id);
    await pick(page, id);
    // A recipe partner (Potato Kid + Water) arrives right where the kid will be put back.
    await page.evaluate((s) => window.__PK__!.debugAdd!('water', s.x + 70, s.y), start);
    await moveTo(page, TARGET);
    await page.waitForTimeout(200);
    await page.mouse.up();
    await page.waitForTimeout(600);
    const kids = await page.evaluate(() => window.__PK__!.kids().map((k) => ({ id: k.id, type: k.type })));
    expect(kids.some((k) => k.id === id && k.type === 'plain')).toBe(true);
    expect(kids.some((k) => k.type === 'firefighter')).toBe(false);
  });

  test('held over a field at the screen edge, the map holds still and the field arms (Codex review, #90)', async ({ page }) => {
    await setup(page, 'apple');
    // A kid left of the field, which stays on screen when the field moves to the right edge.
    const id = await page.evaluate(() => window.__PK__!.debugAdd!('plain', 826, 3498));
    // Field 1's target ends just inside the right edge: a finger there is in the edge zone.
    const size = page.viewportSize()!;
    await page.evaluate((w) => {
      const pk = window.__PK__!;
      const a = pk.worldToScreen(0, 0);
      const b = pk.worldToScreen(100, 0);
      const perUnit = (b.x - a.x) / 100;
      // Put the target's right side (x 1366) 6 px inside the right edge: setup centred x 1166.
      const right = pk.worldToScreen(1366, 3476);
      pk.centerOn(1166 + (right.x - (w - 6)) / perUnit, 3548);
    }, size.width);
    await page.waitForTimeout(200);
    const edge = await page.evaluate(() => window.__PK__!.worldToScreen(1366, 3476));
    const before = await page.evaluate(() => window.__PK__!.worldToScreen(0, 0));
    await pick(page, id);
    await page.mouse.move(edge.x - 12, edge.y, { steps: 6 });
    await page.waitForTimeout(700);
    // Held still: an edge scroll would carry it many px in 700 ms. A slow CI frame may let
    // the first ramp frame through on the way in (a fraction of a px, map v4 run).
    const after = await page.evaluate(() => window.__PK__!.worldToScreen(0, 0));
    expect(Math.abs(after.x - before.x)).toBeLessThan(0.5);
    expect(Math.abs(after.y - before.y)).toBeLessThan(0.5);
    await expect(label(page)).toContainText('Release to start farming');
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.__PK__!.fields()[0]!.kids.length)).toBe(1);
  });

  test('no room for the field’s label: no assigning by drag there, and the kid stays (Codex review, #90)', async ({ page }) => {
    const id = await setup(page, 'apple');
    // A label far too big to place anywhere.
    await page.addStyleTag({ content: '.home-label { min-height: 2000px !important; }' });
    await page.setViewportSize({ width: page.viewportSize()!.width, height: page.viewportSize()!.height - 1 });
    await page.waitForTimeout(200);
    await pick(page, id);
    await moveTo(page, TARGET);
    await page.waitForTimeout(700);
    await expect(label(page)).toBeHidden();
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await page.evaluate((i) => window.__PK__!.kids().some((k) => k.id === i), id)).toBe(true);
    expect(await page.evaluate(() => window.__PK__!.fields()[0]!.kids)).toEqual([]);
  });
});
