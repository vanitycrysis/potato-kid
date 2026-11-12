import { expect, test, type Page } from '@playwright/test';
import { boot, balance } from './helpers';

test.describe('plots on the map (D-061, GUI_MVP §15.2)', () => {
  const plot0 = (page: Page) => page.evaluate(() => window.__PK__!.plots()[0]!);

  test('a plot fills with a stamp per kid, then shows its stages; ripe on a full map, it waits, and a tap still brings it up (D-084, D-088)', async ({ page }) => {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    await expect.poll(async () => (await plot0(page)).shown).toEqual(['fx_plant_plot', 'fx_plant_filling']);
    // Fill the map but for three places, then plant three (from the far side of the map).
    await page.evaluate(() => {
      const pk = window.__PK__!;
      const ids: number[] = [];
      for (let i = 0; i < 12; i++) ids.push(pk.debugAdd!(['plain', 'plain', 'plain', 'fire'][i % 4]!, 656 + (i % 4) * 260, 3428 + Math.floor(i / 4) * 300));
      pk.debugCommand!({ type: 'plant', kidIds: ids.slice(0, 3) });
    });
    await expect.poll(async () => (await plot0(page)).shown).toEqual(['fx_plant_plot', 'fx_plant_filling', 'fx_plant_slot_filled', 'fx_plant_slot_filled', 'fx_plant_slot_filled']);
    expect((await plot0(page)).state).toBe('filling');
    await page.evaluate(() => window.__PK__!.debugCommand!({ type: 'startGrowing', plot: 0 }));
    await expect.poll(async () => (await plot0(page)).shown).toEqual(['fx_plant_plot', 'fx_plant_seed']);
    const grow = balance.planting.growSeconds;
    await page.evaluate((s) => window.__PK__!.debugAway!(s * 1000), grow * 0.4);
    await expect.poll(async () => (await plot0(page)).shown).toEqual(['fx_plant_plot', 'fx_plant_shoot']);
    await page.evaluate((s) => window.__PK__!.debugAway!(s * 1000), grow * 0.4);
    await expect.poll(async () => (await plot0(page)).shown).toEqual(['fx_plant_plot', 'fx_plant_leaves']);
    // Fill the three free places. Ripe, it waits under its checked sign (D-088)...
    await page.evaluate(() => {
      for (let i = 0; i < 3; i++) window.__PK__!.debugAdd!('plain', 756 + i * 260, 4428);
    });
    const full = await page.evaluate(() => window.__PK__!.kids().length);
    await page.evaluate((s) => window.__PK__!.debugAway!(s * 1000), grow * 0.3);
    await expect.poll(async () => (await plot0(page)).shown).toEqual(['fx_plant_plot', 'fx_plant_ready']);
    expect(await page.evaluate(() => window.__PK__!.kids().length)).toBe(full);
    // ...and a tap brings it up all the same, over capacity (D-084).
    await page.evaluate(() => window.__PK__!.debugCommand!({ type: 'harvest', plot: 0 }));
    await expect.poll(() => page.evaluate(() => window.__PK__!.kids().length)).toBe(full + 1);
    expect((await plot0(page)).waiting).toBeNull();
    await expect.poll(async () => (await plot0(page)).shown).toEqual(['fx_plant_plot', 'fx_plant_filling']);
    expect(errors).toEqual([]);
  });
});
