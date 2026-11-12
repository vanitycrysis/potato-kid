import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

test.describe('taking kids out of a plot, and cancelling a growing one (D-074, GUI_MVP §21)', () => {
  /** Plants these kids into plot 1 and opens its detail from the Garden. Returns their ids. */
  async function planted(page: Page, types: string[], name?: string): Promise<number[]> {
    const ids = await page.evaluate(
      ([types, name]) => {
        const pk = window.__PK__!;
        const ids = types.map((t, i) => pk.debugAdd!(t, 876 + i * 260, 3348));
        // A name costs Materials (D-067).
        if (name) {
          pk.debugGive!({ materials: 1000 });
          pk.debugCommand!({ type: 'name', kidId: ids[0]!, name });
        }
        pk.debugCommand!({ type: 'plant', kidIds: ids, plot: 0 });
        return ids;
      },
      [types, name ?? null] as const,
    );
    await expect.poll(() => page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('filling');
    await page.locator('[data-nav=garden]').click();
    await page.getByRole('button', { name: 'Review plot' }).first().click();
    await expect(page.getByRole('dialog').locator('.sheet-title')).toHaveText('Plot 1');
    return ids;
  }
  const note = (page: Page) => page.getByRole('dialog').locator('.plot-note');

  test('Take out brings one kid back at once, with its name; the plot keeps the rest', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    const ids = await planted(page, ['plain', 'fire', 'water'], 'Spud');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Take kids out before growing, or cancel while growing.');
    await dialog.getByRole('button', { name: 'Take out Spud' }).click();
    await expect(note(page)).toContainText('Spud is back by the Garden.');
    await expect.poll(() => page.evaluate((id) => window.__PK__!.kids().some((k) => k.id === id), ids[0]!)).toBe(true);
    await expect(dialog.locator('.plot-take-out')).toHaveCount(2);
    expect(await page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('filling');
  });

  test('Empty plot asks first; Keep filling sends nothing; then every kid comes back', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await planted(page, ['plain', 'fire']);
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Empty plot', exact: true }).click();
    await expect(dialog.locator('.plot-confirm-heading')).toHaveText('Empty Plot 1?');
    await expect(dialog).toContainText('All 2 kids will return by the Garden. Nothing is charged.');
    await dialog.getByRole('button', { name: 'Keep filling' }).click();
    await expect(dialog.locator('.plot-confirm-heading')).toHaveCount(0);
    expect(await page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('filling');
    await dialog.getByRole('button', { name: 'Empty plot', exact: true }).click();
    await dialog.getByRole('button', { name: 'Empty plot · 2 kids' }).click();
    await expect(note(page)).toContainText('Plot 1 is empty. 2 kids are back by the Garden.');
    expect(await page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('empty');
  });

  test('a growing plot: Cancel growing reviews the loss, then brings every kid back', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await planted(page, ['plain', 'fire', 'water']);
    await page.evaluate(() => window.__PK__!.debugCommand!({ type: 'startGrowing', plot: 0 }));
    await expect.poll(() => page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('growing');
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.plot-take-out')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cancel growing', exact: true }).click();
    await expect(dialog.locator('.plot-confirm-heading')).toHaveText('Cancel Plot 1?');
    for (const line of ['All 3 kids will return by the Garden.', 'Growing time will be lost. Start again from the beginning if you plant them again.', 'Nothing is charged or refunded.', 'Room needed: 3.']) {
      await expect(dialog).toContainText(line);
    }
    await expect(dialog.locator('.sheet-footer .ui-button')).toHaveText(['Keep growing', 'Cancel growing · 3 kids']);
    await dialog.getByRole('button', { name: 'Cancel growing · 3 kids' }).click();
    await expect(note(page)).toContainText('Plot 1 was cancelled. 3 kids are back by the Garden.');
    await expect(note(page)).toContainText('Growing time was lost.');
    expect(await page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('empty');
  });

  test('a full map: Take out is refused with its exact reason, and the kid stays in the plot', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await planted(page, ['plain', 'fire', 'water']);
    // Fill the map behind the sheet.
    await page.evaluate(() => {
      const pk = window.__PK__!;
      for (let i = pk.kids().length; i < 12; i++) pk.debugAdd!('snow', 676 + (i % 6) * 260, 3848 + Math.floor(i / 6) * 300);
    });
    const dialog = page.getByRole('dialog');
    await dialog.locator('.plot-take-out').first().click();
    await expect(note(page)).toContainText('The map is full. Make room for 1 kid, then try Take out again.');
    expect(await page.evaluate(() => window.__PK__!.plots()[0]!.kids)).toBe(3);
  });

  test('an open Empty review holds Add kids and Start growing; Start review holds Empty (Codex review, PR #89)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await planted(page, ['plain', 'fire', 'water']);
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Empty plot', exact: true }).click();
    await expect(dialog.locator('.plot-add')).toHaveAttribute('aria-disabled', 'true');
    await expect(dialog.locator('.plot-start')).toHaveAttribute('aria-disabled', 'true');
    await expect(dialog.locator('.plot-take-out').first()).toHaveAttribute('aria-disabled', 'true');
    await dialog.locator('.plot-start').click({ force: true }); // a deliberate tap on the held control
    await expect(dialog.locator('.plot-review-heading')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Keep filling' }).click();
    await expect(dialog.locator('.plot-start')).toHaveAttribute('aria-disabled', 'false');
    await dialog.locator('.plot-start').click();
    await expect(dialog.locator('.plot-review-heading')).toBeVisible();
    await expect(dialog.locator('.plot-empty')).toHaveAttribute('aria-disabled', 'true');
  });

  test('the review shows the map’s room as it is now, and holds its action on a full map (Codex review, PR #89)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await planted(page, ['plain', 'fire', 'water']);
    await page.evaluate(() => window.__PK__!.debugCommand!({ type: 'startGrowing', plot: 0 }));
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Cancel growing', exact: true }).click();
    const room = () => page.evaluate(() => 12 - window.__PK__!.kids().length);
    await expect(dialog.locator('.plot-confirm-room')).toHaveText(`Room needed: 3. Room on map: ${await room()}.`);
    const action = dialog.getByRole('button', { name: /Cancel growing · 3 kids/ });
    await expect(action).toHaveAttribute('aria-disabled', 'false');
    // Kids arrive while the review is open: the count follows, and with less room than
    // needed the action waits, saying why.
    await page.evaluate(() => {
      const pk = window.__PK__!;
      for (let i = pk.kids().length; i < 11; i++) pk.debugAdd!('snow', 676 + (i % 6) * 260, 3848 + Math.floor(i / 6) * 300);
    });
    await expect(dialog.locator('.plot-confirm-room')).toHaveText('Room needed: 3. Room on map: 1.');
    await expect(action).toHaveAttribute('aria-disabled', 'true');
    await expect(dialog.locator('.plot-confirm-full')).toBeVisible();
    await expect(dialog.locator('.plot-confirm-full')).toHaveText("There isn't room on the map for all 3 kids. Make room, then try again.");
  });

  test('a refused Cancel keeps focus on its action, for a keyboard retry (Codex review, PR #89)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await planted(page, ['plain', 'fire', 'water']);
    await page.evaluate(() => window.__PK__!.debugCommand!({ type: 'startGrowing', plot: 0 }));
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Cancel growing', exact: true }).click();
    const action = dialog.getByRole('button', { name: /Cancel growing · 3 kids/ });
    await action.focus();
    // In one task: the action is sent, then the map fills before the engine answers.
    await page.evaluate(() => {
      (document.querySelector('.plot-confirm-action') as HTMLButtonElement).click();
      const pk = window.__PK__!;
      for (let i = pk.kids().length; i < 12; i++) pk.debugAdd!('snow', 676 + (i % 6) * 260, 3848 + Math.floor(i / 6) * 300);
    });
    await expect(dialog.locator('.plot-note')).toContainText("There isn't room on the map for all 3 kids.");
    await expect(dialog.locator('.plot-confirm-action')).toBeFocused();
  });

  test('a review that the plot outgrows closes and says why; its kid comes up even on a full map (D-084)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await planted(page, ['plain', 'fire', 'water']);
    await page.evaluate(() => window.__PK__!.debugCommand!({ type: 'startGrowing', plot: 0 }));
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Cancel growing', exact: true }).click();
    await expect(dialog.locator('.plot-confirm-heading')).toBeVisible();
    // The sprout finishes while the review is open, on a full map.
    await page.evaluate(() => {
      const pk = window.__PK__!;
      for (let i = pk.kids().length; i < 12; i++) pk.debugAdd!('snow', 676 + (i % 6) * 260, 3848 + Math.floor(i / 6) * 300);
      pk.debugReadySeed!(0, 'plain');
    });
    await expect(note(page)).toContainText('This sprout has finished growing and cannot be cancelled.');
    await expect(dialog.locator('.plot-confirm-heading')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /Cancel growing/ })).toHaveCount(0);
    // Its kid came up over capacity (a full map no longer holds a sprout, D-084): the plot is empty.
    await expect.poll(() => page.evaluate(() => window.__PK__!.kids().length)).toBe(13);
    await expect(dialog.locator('.plot-detail')).toContainText('Add 3 more kids to Start growing.');
  });
});
