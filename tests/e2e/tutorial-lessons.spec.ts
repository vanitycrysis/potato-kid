import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

test.describe('Tutorial & lessons (D-086, GUI_MVP §27.3)', () => {
  const card = (page: Page) => page.locator('#tutorial-card');
  const lessons = (page: Page) => page.evaluate(() => window.__PK__!.lessons() as { intro: string; introPage: number; seen: string[]; pending: string[]; firstFusion: boolean });

  async function openFromIconGuide(page: Page) {
    await page.locator('[data-nav=notebook]').click();
    await page.getByRole('dialog', { name: 'Notebook' }).getByRole('button', { name: 'Icon guide', exact: true }).click();
    await page.getByRole('dialog', { name: 'Icon guide' }).getByRole('button', { name: 'Replay tutorial' }).click();
    return page.getByRole('dialog', { name: 'Tutorial & lessons' });
  }

  test('Replay tutorial opens the list: the introduction, then all twelve lessons by name, Seen or Not seen', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugLessons!({ seen: ['garden'] }));
    const sheet = await openFromIconGuide(page);
    const rows = sheet.locator('.lessons-row');
    await expect(rows).toHaveCount(13);
    await expect(rows.nth(0)).toHaveText('Introduction · 3 short cards');
    await expect(rows.nth(1)).toContainText('Plant a surprise');
    await expect(rows.nth(1)).toContainText('Not seen');
    await expect(sheet.locator('[data-lesson="garden"]')).toContainText('Seen');
    await expect(sheet.locator('[data-lesson="returns"]')).toContainText('Choose how to pay');
    // Its way back is to the Icon guide.
    await sheet.getByRole('button', { name: 'Back to Icon guide' }).click();
    await expect(page.getByRole('dialog', { name: 'Icon guide' })).toBeVisible();
  });

  test('one lesson replays inside the sheet with its route; Back to lessons; nothing is marked seen', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    const sheet = await openFromIconGuide(page);
    await sheet.locator('[data-lesson="fields"]').click();
    await expect(sheet.locator('.lessons-lesson-title')).toHaveText('Grow food');
    await expect(sheet.locator('.lessons-lesson-title')).toBeFocused();
    await expect(sheet.locator('.lesson-route')).toHaveText('How to find it Garden → Fields');
    await sheet.getByRole('button', { name: 'Back to lessons' }).click();
    await expect(sheet.locator('[data-lesson="fields"]')).toBeFocused();
    expect((await lessons(page)).seen).toEqual([]);
  });

  test('the introduction previews over the list from page 1, changing nothing; focus back on its row', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugLessons!({ intro: 'skipped' }));
    const sheet = await openFromIconGuide(page);
    await sheet.getByRole('button', { name: 'Introduction · 3 short cards' }).click();
    await expect(card(page).locator('.tutorial-step')).toHaveText('Welcome · 1 of 3');
    await card(page).getByRole('button', { name: 'Next' }).click();
    // A preview saves nothing as it goes, nor when it ends.
    expect(await lessons(page)).toMatchObject({ intro: 'skipped', introPage: 1 });
    // Escape is the card's, not the sheet's beneath it.
    await page.keyboard.press('Escape');
    await expect(card(page)).toBeHidden();
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Introduction · 3 short cards' })).toBeFocused();
    expect(await lessons(page)).toMatchObject({ intro: 'skipped', introPage: 1 });
  });

  test('closed, focus goes back to the Notebook control that opened Settings, still on the page (Codex review, #120)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.locator('[data-nav=notebook]').click();
    await page.getByRole('dialog', { name: 'Notebook' }).getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Replay tutorial' }).click();
    await expect(page.getByRole('dialog', { name: 'Tutorial & lessons' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('[data-nav=notebook]')).toBeFocused();
  });

  test('back to Settings, then closed: focus still goes back to the Notebook control (Codex review round 2, #120)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.locator('[data-nav=notebook]').click();
    await page.getByRole('dialog', { name: 'Notebook' }).getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Replay tutorial' }).click();
    await page.getByRole('dialog', { name: 'Tutorial & lessons' }).getByRole('button', { name: 'Back to Settings' }).click();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('[data-nav=notebook]')).toBeFocused();
  });

  test('after a return summary, the lesson being read comes back, and the list where it was scrolled (Codex review round 3, #120)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 600 });
    await boot(page, '?seed=3&debug=1&calm=1');
    const sheet = await openFromIconGuide(page);
    // The list, scrolled down.
    await sheet.locator('[data-lesson="returns"]').scrollIntoViewIfNeeded();
    const scrolled = await page.evaluate(() => {
      const b = document.querySelector('.sheet[data-key="lessons"] .sheet-body') as HTMLElement;
      return b.scrollTop || document.scrollingElement!.scrollTop;
    });
    expect(scrolled).toBeGreaterThan(0);
    await page.evaluate(() => window.__PK__!.debugAway!(120_000));
    await page.getByRole('dialog', { name: 'Welcome back' }).getByRole('button', { name: 'Back to the garden' }).click();
    await expect(sheet.locator('.lessons-row')).toHaveCount(13);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const b = document.querySelector('.sheet[data-key="lessons"]:not([aria-hidden]) .sheet-body') as HTMLElement;
          return b.scrollTop || document.scrollingElement!.scrollTop;
        }),
      )
      .toBe(scrolled);
    // A lesson, open: it comes back, not the list.
    await sheet.locator('[data-lesson="fields"]').click();
    await expect(sheet.locator('.lessons-lesson-title')).toHaveText('Grow food');
    await page.evaluate(() => window.__PK__!.debugAway!(120_000));
    await page.getByRole('dialog', { name: 'Welcome back' }).getByRole('button', { name: 'Back to the garden' }).click();
    await expect(sheet.locator('.lessons-lesson-title')).toHaveText('Grow food');
    await expect(sheet.getByRole('button', { name: 'Back to lessons' })).toBeVisible();
  });

  test('Settings has it too, with its way back to Settings', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.locator('[data-nav=notebook]').click();
    await page.getByRole('dialog', { name: 'Notebook' }).getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Replay tutorial' }).click();
    const sheet = page.getByRole('dialog', { name: 'Tutorial & lessons' });
    await sheet.getByRole('button', { name: 'Back to Settings' }).click();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  });
});
