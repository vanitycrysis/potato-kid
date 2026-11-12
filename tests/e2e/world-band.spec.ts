import { expect, test, type Page } from '@playwright/test';
import { boot, openTool } from './helpers';

test.describe('the world band and its fallbacks (GUI_MVP §§19.1, 19.3)', () => {
  const measure = (page: Page) =>
    page.evaluate(() => {
      const hud = document.querySelector('.hud')!.getBoundingClientRect();
      const tray = document.querySelector('.tray')!.getBoundingClientRect();
      return {
        fit: document.documentElement.dataset.hudFit,
        hud: hud.height,
        nav: tray.height,
        // The unobscured world: HUD bottom + 8 to navigation top − 8 (§19.1).
        band: tray.top - 8 - (document.querySelector('.top-stack')!.getBoundingClientRect().bottom + 8),
      };
    });

  // Codex's measured bands (§23.1): 684 of 844 (81.0 %), 232 of 360 (64.4 %).
  for (const [w, h, band] of [[390, 844, 684], [640, 360, 232]] as const) {
    test(`${w}x${h} with no sheet: a 44 px stat row and a 52 px tray leave the world ${band} px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await boot(page, '?seed=3&debug=1&calm=1');
      await expect.poll(() => measure(page)).toEqual({ fit: 'usual', hud: 44, nav: 52, band });
    });
  }

  for (const kind of ['unsaved', 'recovery'] as const) {
    test(`568x320 with the ${kind} banner keeps both rows, the HUD 8 px below the banner`, async ({ page }) => {
      await page.setViewportSize({ width: 568, height: 320 });
      await boot(page, '?seed=3&debug=1&calm=1');
      await page.evaluate((k) => window.__PK__!.debugSaveStatus!({ unsaved: k === 'unsaved', recovery: k === 'recovery', readOnly: false }), kind);
      await expect.poll(() => measure(page)).toMatchObject({ fit: 'usual', hud: 44, nav: 52 });
      // The band follows the banner's actual height B (§23.1): 64 or 72 at least, more if
      // its copy wraps. The tray's top is H − 8 − 52 = 260.
      const b = await page.locator('.banners').evaluate((e) => e.getBoundingClientRect().bottom);
      expect(b).toBeGreaterThanOrEqual(8 + (kind === 'unsaved' ? 64 : 72));
      expect((await measure(page)).band).toBe(260 - 8 - (b + 8 + 44 + 8));
      expect((await measure(page)).band).toBeGreaterThanOrEqual(44);
    });
  }

  test('too short for both rows and the band: the world hides and the GUI becomes a page', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 200 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false }));
    await expect.poll(() => measure(page)).toMatchObject({ fit: 'page' });
    await expect(page.locator('#app')).toBeHidden();
    await expect(page.locator('.page-hint')).toBeVisible();
    await page.locator('.tray').scrollIntoViewIfNeeded();
    // Labels stay, never clipped (Codex review, PR #37).
    expect(await page.locator('.tray-label').first().evaluate((e) => e.getBoundingClientRect().width)).toBeGreaterThan(20);
    await page.setViewportSize({ width: 568, height: 700 });
    await expect.poll(() => measure(page)).toMatchObject({ fit: 'usual' });
    await expect(page.locator('#app')).toBeVisible();
  });

  test('a short screen: a Notebook page with no bar or footer still scrolls as one, so every control shows whole (Codex review round 5, PR #87)', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 276 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false }));
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.hudFit)).toBe('usual');
    await openTool(page, 'Map view');
    const sheet = page.getByRole('dialog', { name: 'Map view' });
    await expect(sheet).toHaveAttribute('data-tight', 'true');
    for (const name of ['Zoom out', 'Reset · 100%', 'Zoom in', 'Find Garden', 'Done']) {
      const b = sheet.getByRole('button', { name });
      await b.scrollIntoViewIfNeeded();
      await expect(b).toBeInViewport({ ratio: 1 });
    }
  });

  test('the navigation growing on its own (a font loading) re-selects the layout (Codex review round 4, PR #87)', async ({ page }) => {
    await page.setViewportSize({ width: 240, height: 480 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false }));
    await expect.poll(() => measure(page)).toMatchObject({ fit: 'usual' });
    // No resize: only the navigation's content grows, past what leaves the band.
    await page.addStyleTag({ content: '.tray-cell { min-height: 300px !important; }' });
    await expect.poll(() => measure(page).then((m) => m.fit)).not.toBe('usual');
    // A scroll window keeps the band; else the page takes over and the world hides.
    const m = await measure(page);
    if (m.fit === 'window') expect(m.band).toBeGreaterThanOrEqual(44);
    else await expect(page.locator('#app')).toBeHidden();
  });

  test('a scroll window grows to show its tallest control whole, and the page takes over when that leaves no band (Codex review round 2, PR #87)', async ({ page }) => {
    // Enlarged text: stat chips wrap onto rows, each 70 px tall instead of 44 (§23.1).
    await page.setViewportSize({ width: 240, height: 420 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.addStyleTag({ content: '.hud-stat { min-height: 70px !important; min-width: 200px !important; }' });
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false }));
    await expect.poll(() => measure(page)).toMatchObject({ fit: 'window', hud: 70 + 16 });
    expect((await measure(page)).band).toBeGreaterThanOrEqual(44);
    // Every chip can be scrolled wholly into the window.
    const whole = await page.evaluate(() => {
      const hud = document.querySelector('.hud') as HTMLElement;
      return [...hud.children].every((c) => (c as HTMLElement).offsetHeight <= hud.clientHeight);
    });
    expect(whole).toBe(true);
    // Shorter: the grown windows would leave no band, so the page takes over.
    await page.setViewportSize({ width: 240, height: 330 });
    await expect.poll(() => measure(page)).toMatchObject({ fit: 'page' });
  });

  test('rows that wrap on a narrow screen become 60 px scroll windows, which keep their offset', async ({ page }) => {
    // Too narrow for three stat chips in a row (counts wide enough to wrap them): they wrap,
    // and with a banner the natural layout leaves no band (§23.1).
    await page.setViewportSize({ width: 240, height: 360 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.addStyleTag({ content: '.hud-stat { min-width: 120px !important; }' });
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false }));
    await expect.poll(() => measure(page)).toMatchObject({ fit: 'window', hud: 60, nav: 60 });
    expect((await measure(page)).band).toBeGreaterThanOrEqual(44);
    await page.locator('.hud').evaluate((e) => (e.scrollTop = 40));
    const before = await page.locator('.hud').evaluate((e) => e.scrollTop);
    expect(before).toBeGreaterThan(0);
    await page.setViewportSize({ width: 240, height: 362 });
    await expect.poll(() => measure(page)).toMatchObject({ fit: 'window' });
    await page.waitForTimeout(200);
    expect(await page.locator('.hud').evaluate((e) => e.scrollTop)).toBe(before);
  });
});
