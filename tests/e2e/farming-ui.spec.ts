import { expect, test } from '@playwright/test';
import { boot } from './helpers';

test.describe('farming through the UI (D-069, GUI_MVP §22)', () => {
  test('unlock a field, choose its food, assign kids, and the pantry fills; then a kid eats what was grown', async ({ page }) => {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    const ids = await page.evaluate(() => {
      const pk = window.__PK__!;
      pk.debugGive!({ materials: 5000 });
      return [pk.debugAdd!('plain', 1176, 3148), pk.debugAdd!('chef', 1476, 3148), pk.debugAdd!('fire', 1776, 3148)];
    });
    // Garden → Fields → Unlock.
    await page.locator('[data-nav=garden]').click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Fields', exact: true }).click();
    await sheet.getByRole('button', { name: /Unlock field · 300 Materials/ }).click();
    await expect(sheet.locator('.garden-fields .plot-note')).toContainText('Field 1 unlocked. Choose a food to grow.');
    // View field → Choose food → Apple (no review: nothing farming yet).
    await sheet.locator('.field-view[data-field="0"]').click();
    await expect(page.getByRole('dialog', { name: 'Field 1' })).toBeVisible();
    await page.getByRole('button', { name: 'Choose food' }).click();
    await page.getByRole('dialog', { name: 'Food for Field 1' }).locator('.field-choose[data-food="apple"]').click();
    await expect(page.getByRole('dialog', { name: 'Field 1' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Field 1' }).locator('.plot-note')).toContainText('Field 1 now grows Apple.');
    // Assign kids → check two → Assign 2 kids.
    await page.getByRole('button', { name: 'Assign kids' }).click();
    const pick = page.getByRole('dialog', { name: 'Pick kids for Field 1' });
    await pick.locator(`.picker-check[data-kid="${ids[0]}"]`).check();
    await pick.locator(`.picker-check[data-kid="${ids[1]}"]`).check();
    await expect(pick.locator('.field-pick-count')).toHaveText('2 selected · 4 spaces');
    await pick.getByRole('button', { name: 'Assign 2 kids' }).click();
    const field = page.getByRole('dialog', { name: 'Field 1' });
    await expect(field.locator('.plot-note')).toContainText('2 kids are farming Apple in Field 1.');
    await expect(field.locator('.field-take-back')).toHaveCount(2);
    expect(await page.evaluate(() => window.__PK__!.kids().length)).toBe(1);
    // Time passes (offline, 3 h): bites go to the pantry.
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__PK__!.debugAway!(3 * 3600_000));
    const summary = page.getByRole('dialog', { name: 'Welcome back' });
    if (await summary.isVisible()) await summary.getByRole('button', { name: 'Back to the garden' }).click();
    const apples = await page.evaluate(() => window.__PK__!.pantry().apple ?? 0);
    expect(apples).toBeGreaterThanOrEqual(5);
    // Notebook → Pantry shows them.
    await page.locator('[data-nav=notebook]').click();
    await page.getByRole('dialog', { name: 'Notebook' }).getByRole('button', { name: 'Pantry', exact: true }).click();
    const pantry = page.getByRole('dialog', { name: 'Pantry' });
    await expect(pantry.locator('.pantry-row[data-food="apple"]')).toContainText(`${apples} bites`);
    await page.keyboard.press('Escape');
    // The fire kid on the map eats a farmed apple.
    await page.evaluate((id) => window.__PK__!.centerOn(window.__PK__!.kids().find((k) => k.id === id)!.x, window.__PK__!.kids().find((k) => k.id === id)!.y), ids[2]!);
    await page.waitForTimeout(200);
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, ids[2]!);
    await page.mouse.click(k.x, k.y - 20);
    const card = page.getByRole('dialog', { name: 'Fire Kid' });
    await card.getByRole('button', { name: 'Feed', exact: true }).click();
    await page.getByRole('button', { name: 'Feed Apple to Fire Kid, uses 1 pantry bite' }).click();
    await expect(page.getByRole('dialog').locator('.kid-status')).toContainText('1 bite used from the pantry.');
    expect(await page.evaluate(() => window.__PK__!.pantry().apple)).toBe(apples - 1);
    expect(errors).toEqual([]);
  });

  test('changing a field’s food reviews the loss and sends haters home; Take all back reviews, then brings them all back', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    const ids = await page.evaluate(() => {
      const pk = window.__PK__!;
      pk.debugGive!({ materials: 5000 });
      pk.debugCommand!({ type: 'unlockField' });
      pk.debugCommand!({ type: 'setFieldFood', field: 0, food: 'apple' });
      const ids = [pk.debugAdd!('plain', 1176, 3148), pk.debugAdd!('chef', 1476, 3148)];
      pk.debugCommand!({ type: 'farm', field: 0, kidIds: ids });
      return ids;
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.fields()[0]?.kids.length ?? 0)).toBe(2);
    await page.locator('[data-nav=garden]').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Fields', exact: true }).click();
    await page.locator('.field-view[data-field="0"]').click();
    await page.getByRole('button', { name: 'Change food' }).click();
    // Carrot: Chef Kid hates it, Potato Kid doesn't.
    const food = page.getByRole('dialog', { name: 'Food for Field 1' });
    await food.locator('.field-choose[data-food="carrot"]').click();
    const review = food.locator('.field-change-review');
    await expect(review.locator('.field-review-heading')).toHaveText('Change Field 1 to Carrot?');
    await expect(review).toContainText('Progress toward the next bite will be lost.');
    await expect(review).toContainText('1 kid won’t farm Carrot. They will return by the Garden.');
    await review.getByRole('button', { name: 'Change food' }).click();
    const field = page.getByRole('dialog', { name: 'Field 1' });
    await expect(field.locator('.plot-note')).toContainText('Field 1 now grows Carrot.');
    await expect(field.locator('.plot-note')).toContainText('1 kid is back by the Garden.');
    expect(await page.evaluate((id) => window.__PK__!.kids().some((k) => k.id === id), ids[1]!)).toBe(true);
    // Take all back: a review first, then everyone.
    await field.getByRole('button', { name: 'Take all back', exact: true }).click();
    await expect(field.locator('.field-review-heading')).toHaveText('Take all kids back from Field 1?');
    await field.getByRole('button', { name: /Take all back · 1 kid/ }).click();
    await expect(field.locator('.plot-note')).toContainText('All 1 kids are back by the Garden. Field 1 has no kids farming.');
    expect(await page.evaluate(() => window.__PK__!.fields()[0]!.kids)).toEqual([]);
  });
});
