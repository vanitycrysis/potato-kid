import { expect, test, type Page } from '@playwright/test';
import { boot, frames } from './helpers';

test.describe('the first-run introduction (D-086, GUI_MVP §27.1)', () => {
  const card = (page: Page) => page.locator('#tutorial-card');
  const lessons = (page: Page) => page.evaluate(() => window.__PK__!.lessons() as { intro: string; introPage: number; seen: string[]; pending: string[]; firstFusion: boolean });
  const titles = ['A garden of discoveries', 'Two kids, one discovery', 'Keep every discovery'];

  test('a first run offers it at page 1; Next and Back walk the three cards; Done closes it for good', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1&tutorial=1');
    await expect(card(page)).toBeVisible();
    await expect(card(page).locator('.tutorial-step')).toHaveText('Welcome · 1 of 3');
    await expect(card(page).locator('.tutorial-title')).toBeFocused();
    // The world and the HUD wait meanwhile (§2).
    expect(await page.locator('.top-stack').evaluate((e) => (e as HTMLElement).inert)).toBe(true);
    await expect(card(page).getByRole('button', { name: 'Back' })).toHaveCount(0);
    await expect(card(page).getByRole('button', { name: 'Skip introduction' })).toBeVisible();
    for (let i = 0; i < 3; i++) {
      await expect(card(page).locator('.tutorial-title')).toHaveText(titles[i]!);
      await expect(card(page).locator('.tutorial-title')).toHaveAttribute('aria-label', `Welcome · ${i + 1} of 3: ${titles[i]}`);
      expect(await lessons(page)).toMatchObject({ intro: 'inProgress', introPage: i + 1 });
      if (i === 1) {
        // A labelled demo: two kids, a plus, an arrow and the unknown result; nothing is found.
        await expect(card(page).locator('.tutorial-kid')).toHaveCount(2);
        await expect(card(page).locator('[data-icon="icon_unknown"]')).toHaveCount(1);
        await card(page).getByRole('button', { name: 'Back' }).click();
        await expect(card(page).locator('.tutorial-title')).toHaveText(titles[0]!);
        await card(page).getByRole('button', { name: 'Next' }).click();
      }
      if (i < 2) await card(page).getByRole('button', { name: 'Next' }).click();
    }
    // Page 3 outlines the Dex control.
    const dex = (await page.locator('[data-nav=dex]').boundingBox())!;
    const spot = (await page.locator('.tutorial .tutorial-spot').boundingBox())!;
    expect(Math.abs(spot.x + 3 - dex.x)).toBeLessThan(2);
    await card(page).getByRole('button', { name: 'Done' }).click();
    await expect(card(page)).toBeHidden();
    expect((await lessons(page)).intro).toBe('completed');
    await expect(page.locator('[data-nav=garden]')).toBeFocused();
    await page.reload();
    await page.waitForFunction(() => window.__PK__?.ready === true);
    await page.waitForTimeout(300);
    await expect(card(page)).toBeHidden();
  });

  test('Escape skips it for good; an unfinished one resumes at its page, saved with the game at each page', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1&tutorial=1');
    await card(page).getByRole('button', { name: 'Next' }).click();
    await card(page).getByRole('button', { name: 'Next' }).click();
    // Saved as the page turned: a crash now (no save on the way out) still resumes at page 3.
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {};
    });
    await page.reload();
    await page.waitForFunction(() => window.__PK__?.ready === true);
    await expect(card(page).locator('.tutorial-step')).toHaveText('Welcome · 3 of 3');
    await page.keyboard.press('Escape');
    await expect(card(page)).toBeHidden();
    expect((await lessons(page)).intro).toBe('skipped');
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForFunction(() => window.__PK__?.ready === true);
    await page.waitForTimeout(300);
    await expect(card(page)).toBeHidden();
  });

  test('a tap outside skips; keyboard focus stays in the card', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1&tutorial=1');
    await card(page).getByRole('button', { name: 'Skip introduction' }).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(card(page).getByRole('button', { name: 'Next' })).toBeFocused();
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('#tutorial-card'))).toBe(true);
    }
    await page.mouse.click(10, 120);
    await expect(card(page)).toBeHidden();
    expect((await lessons(page)).intro).toBe('skipped');
  });

  test('centred, 360 px wide: at 390 x 844 and 640 x 360 its controls are in view', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1&tutorial=1');
    const box = (await card(page).boundingBox())!;
    expect(box.width).toBeCloseTo(360, 0);
    expect(Math.abs(box.x + box.width / 2 - page.viewportSize()!.width / 2)).toBeLessThan(2);
    await page.setViewportSize({ width: 640, height: 360 });
    await frames(page, 2);
    await expect(card(page).getByRole('button', { name: 'Next' })).toBeInViewport({ ratio: 1 });
    await expect(card(page).locator('.tutorial-title')).toBeInViewport({ ratio: 1 });
  });

  test('a return summary comes first: the card steps aside and comes back at its page', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1&tutorial=1');
    await card(page).getByRole('button', { name: 'Next' }).click();
    await page.evaluate(() => window.__PK__!.debugAway!(120_000));
    const summary = page.getByRole('dialog', { name: 'Welcome back' });
    await expect(summary).toBeVisible();
    await expect(card(page)).toBeHidden();
    await summary.getByRole('button', { name: 'Back to the garden' }).click();
    await expect(card(page).locator('.tutorial-step')).toHaveText('Welcome · 2 of 3');
  });

  test('in tests it waits unless asked for', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.waitForTimeout(300);
    await expect(card(page)).toBeHidden();
  });
});
