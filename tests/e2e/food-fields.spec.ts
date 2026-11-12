import { expect, test } from '@playwright/test';
import { boot } from './helpers';

test.describe('food fields on the map (D-069, GUI_MVP §22.1)', () => {
  test('a bought field shows its bed, two crop stamps once it has a food, and its kids on their pads', async ({ page }) => {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    expect(await page.evaluate(() => window.__PK__!.fields())).toEqual([]);
    const ids = await page.evaluate(() => {
      const pk = window.__PK__!;
      pk.debugGive!({ materials: 1e6 });
      pk.debugCommand!({ type: 'unlockField' });
      // Neither hates apples (Potato Kid hates pickles, Chef Kid carrots).
      pk.debugCommand!({ type: 'setFieldFood', field: 0, food: 'apple' });
      return [pk.debugAdd!('plain', 2276, 3148), pk.debugAdd!('chef', 2576, 3148)];
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.fields())).toEqual([{ food: 'apple', crops: 2, kids: [] }]);
    await page.evaluate((ids) => window.__PK__!.debugCommand!({ type: 'farm', field: 0, kidIds: ids }), ids);
    // Front left, then front right (Codex's admission order).
    await expect.poll(() => page.evaluate(() => window.__PK__!.fields()[0]!.kids)).toEqual([
      { id: ids[0], pad: 2 },
      { id: ids[1], pad: 3 },
    ]);
    // Off the map: farming kids aren't map kids.
    expect(await page.evaluate((ids) => window.__PK__!.kids().filter((k) => ids.includes(k.id)).length, ids)).toBe(0);
    await page.evaluate(() => window.__PK__!.centerOn(1166, 3448));
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'test-results/field.png' });
    // The first leaves; the second keeps its pad.
    await page.evaluate((id) => window.__PK__!.debugCommand!({ type: 'unfarm', field: 0, kidId: id }), ids[0]!);
    await expect.poll(() => page.evaluate(() => window.__PK__!.fields()[0]!.kids)).toEqual([{ id: ids[1], pad: 3 }]);
    expect(errors).toEqual([]);
  });
});
