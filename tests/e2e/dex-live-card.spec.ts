import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

test.describe("The Dex opens a live kid's card (GUI_MVP §15.6, §18.1)", () => {
  const dialog = (page: Page) => page.getByRole('dialog', { name: 'Potato-Dex' });
  const sheet = (page: Page) => page.getByRole('dialog');

  /** Every plot unlocked, so several kids can be planted in a row (D-054). */
  async function allPlots(page: Page): Promise<void> {
    await page.evaluate(() => {
      window.__PK__!.debugGive!({ materials: 1e7 });
      for (let i = 0; i < 3; i++) window.__PK__!.debugCommand!({ type: 'unlockPlot' });
    });
    await page.evaluate(() => window.__PK__!.debugAway!(0)); // one step: the unlocks apply
  }

  /** Two Fire Kids on the map, every plot unlocked, the Dex open on Fire's detail. */
  async function fireDetail(page: Page): Promise<number[]> {
    await boot(page, '?seed=3&debug=1&calm=1');
    await allPlots(page);
    const ids = await page.evaluate(() => [window.__PK__!.debugAdd!('fire', 756, 2928), window.__PK__!.debugAdd!('fire', 1256, 2928)]);
    await page.locator('[data-nav=dex]').click();
    await dialog(page).getByRole('button', { name: 'Fire Kid, Tier 1' }).click();
    return ids;
  }

  test("a row opens that kid's card; Back returns to the detail with its row focused; closing returns to the Dex button", async ({ page }) => {
    await fireDetail(page);
    await expect(dialog(page).locator('.dex-home-heading')).toHaveText('On your map · 2');
    await dialog(page).getByRole('button', { name: 'Fire Kid, kid 2 on your map' }).click();
    await expect(sheet(page).locator('.sheet-title')).toHaveText('Fire Kid');
    await expect(sheet(page).locator('.sheet-subtitle')).toHaveText('On your map · Kid 2');
    await sheet(page).getByRole('button', { name: 'Back to Fire Kid' }).click();
    await expect(dialog(page).locator('.dex-detail-name')).toHaveText('Fire Kid');
    await expect(dialog(page).getByRole('button', { name: 'Fire Kid, kid 2 on your map' })).toBeFocused();
    await dialog(page).getByRole('button', { name: 'Fire Kid, kid 1 on your map' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('[data-nav=dex]')).toBeFocused();
  });

  test('a named copy leads with its name, its type and number beside it, and follows a new name at once (Codex review, FEED-NAME)', async ({ page }) => {
    const ids = await fireDetail(page);
    await page.evaluate((id) => window.__PK__!.debugCommand!({ type: 'name', kidId: id, name: 'Sir Spud' }), ids[0]!);
    const row = dialog(page).getByRole('button', { name: 'Sir Spud, Fire Kid, kid 1 on your map' });
    await expect(row).toContainText('Sir Spud');
    await expect(row).toContainText('Fire Kid · Kid 1');
    await page.evaluate((id) => window.__PK__!.debugCommand!({ type: 'name', kidId: id, name: null }), ids[0]!);
    await expect(dialog(page).getByRole('button', { name: 'Fire Kid, kid 1 on your map' })).toContainText('Kid 1');
  });

  test('from the card, a growing plot cannot be chosen, and a chosen plot that starts meanwhile is never swapped (GUI_MVP §15.3, §15.6)', async ({ page }) => {
    await fireDetail(page);
    // Plot 1 growing, Plot 2 holding three kids, not started.
    await page.evaluate(() => {
      const pk = window.__PK__!;
      const plant = (plot: number) => pk.debugCommand!({ type: 'plant', kidIds: [0, 1, 2].map((i) => pk.debugAdd!('plain', 1856 + i * 250, 4328 + plot * 250)), plot });
      plant(0);
      plant(1);
      pk.debugCommand!({ type: 'startGrowing', plot: 0 });
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.plots().map((p) => p.state))).toEqual(['growing', 'filling', 'empty', 'empty']);
    await dialog(page).getByRole('button', { name: /kid 1 on your map/ }).click();
    await sheet(page).getByRole('button', { name: 'Choose a plot' }).click();
    const growing = sheet(page).getByRole('button', { name: /^Plot 1 ·/ });
    await expect(growing).toHaveText('Plot 1 · 3 / 5Growing.');
    await expect(growing).toHaveAttribute('aria-disabled', 'true');
    await growing.click({ force: true });
    await expect(sheet(page).locator('.dex-home-confirm-title', { hasText: /^Add / })).toHaveCount(0);
    await sheet(page).getByRole('button', { name: /^Plot 2 ·/ }).click();
    await expect(sheet(page)).toContainText('Plot 2: 3 → 4 / 5');
    await expect(sheet(page)).toContainText('Special roll: 10% → 12.5%');
    await page.evaluate(() => window.__PK__!.debugCommand!({ type: 'startGrowing', plot: 1 }));
    await expect(sheet(page)).toContainText('This plot is already growing. Choose another plot.');
    const add = sheet(page).getByRole('button', { name: 'Add this kid' });
    await expect(add).toHaveAttribute('aria-disabled', 'true');
    await add.click({ force: true });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__PK__!.plots().map((p) => p.kids))).toEqual([3, 3, 0, 0]);
  });

  test('a type with no copies on the map says so (Codex review round 2, FEED-NAME)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    // Discovered, then planted away: none left on the map.
    await page.evaluate(() => {
      const pk = window.__PK__!;
      pk.debugCommand!({ type: 'plant', kidIds: [pk.debugAdd!('fire', 1256, 3228)], plot: 0 });
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.kids().length)).toBe(0);
    await page.locator('[data-nav=dex]').click();
    await dialog(page).locator('[data-kid="fire"]').click();
    await expect(dialog(page).locator('.dex-home-heading')).toHaveText('On your map · 0');
    await expect(dialog(page).locator('.dex-home')).toContainText('None on your map.');
  });

  test('planting from a card opened in the Dex: closing the plot detail returns focus to the Dex button (Codex review round 2, FEED-NAME)', async ({ page }) => {
    await fireDetail(page);
    await dialog(page).getByRole('button', { name: /kid 1 on your map/ }).click();
    await sheet(page).getByRole('button', { name: 'Choose a plot' }).click();
    await sheet(page).getByRole('button', { name: /^Plot 1 ·/ }).click();
    await sheet(page).getByRole('button', { name: 'Add this kid' }).click();
    await expect(sheet(page).locator('.sheet-title')).toHaveText('Plot 1');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('[data-nav=dex]')).toBeFocused();
  });

  test('a 24-letter name wraps inside the Dex row and the picker row (Codex review round 4, FEED-NAME)', async ({ page }) => {
    // A phone: 24 W's are wider than a row's text column.
    await page.setViewportSize({ width: 390, height: 844 });
    const ids = await fireDetail(page);
    await page.evaluate((id) => window.__PK__!.debugCommand!({ type: 'name', kidId: id, name: 'W'.repeat(24) }), ids[0]!);
    const row = dialog(page).getByRole('button', { name: new RegExp(`^${'W'.repeat(24)}, Fire Kid`) });
    await expect(row).toBeVisible();
    // The name itself stays inside the row (a button would just clip it).
    expect(
      await row.evaluate((r) => {
        const name = r.querySelector('.dex-home-row-name')!.getBoundingClientRect();
        return name.right <= r.getBoundingClientRect().right + 0.5 && r.getBoundingClientRect().right <= r.closest('.sheet')!.getBoundingClientRect().right;
      }),
    ).toBe(true);
    await page.keyboard.press('Escape');
    await page.locator('[data-nav=garden]').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Add kids' }).first().click();
    const picker = page.getByRole('dialog').locator('.picker-row').nth(0);
    await expect(picker.locator('.picker-row-name')).toHaveText('W'.repeat(24));
    expect(
      await picker.evaluate((r) => {
        const box = r.querySelector('.picker-check')!.getBoundingClientRect();
        const row = r.getBoundingClientRect();
        return box.right <= row.right + 0.5 && r.scrollWidth <= r.clientWidth + 1;
      }),
    ).toBe(true);
  });

  test('a card whose kid has left comes back after the return summary too, read-only, draft kept (Codex review round 4, FEED-NAME)', async ({ page }) => {
    await fireDetail(page);
    await dialog(page).getByRole('button', { name: /kid 1 on your map/ }).click();
    await sheet(page).getByRole('button', { name: 'Name', exact: true }).click();
    await sheet(page).getByLabel('Kid name').fill('Sir Sp');
    // Fire + Water make Steam: the kid fuses away, then the app is away a while.
    await page.evaluate(() => window.__PK__!.debugAdd!('water', 756, 2928));
    await expect(sheet(page).locator('.kid-status')).toContainText('This kid has already left the map.');
    await page.evaluate(() => window.__PK__!.debugAway!(60_000));
    await page.getByRole('dialog', { name: 'Welcome back' }).getByRole('button', { name: 'Back to the garden' }).click();
    await expect(sheet(page).locator('.sheet-title')).toHaveText('Name this kid');
    await expect(sheet(page).getByLabel('Kid name')).toHaveValue('Sir Sp');
    await expect(sheet(page).locator('.kid-status')).toContainText('This kid has already left the map.');
    await expect(sheet(page).getByLabel('Kid name')).toBeDisabled();
  });

  test("an open card keeps its kid's number when a lower copy leaves (Codex review round 8, FEED-NAME)", async ({ page }) => {
    await fireDetail(page);
    await dialog(page).getByRole('button', { name: 'Fire Kid, kid 2 on your map' }).click();
    await expect(sheet(page).locator('.sheet-subtitle')).toHaveText('On your map · Kid 2');
    // Kid 1 fuses away (Fire + Water make Steam).
    await page.evaluate(() => window.__PK__!.debugAdd!('water', 756, 2928));
    await expect.poll(() => page.evaluate(() => window.__PK__!.kids().filter((k) => k.type === 'fire').length)).toBe(1);
    await page.waitForTimeout(200);
    await expect(sheet(page).locator('.sheet-subtitle')).toHaveText('On your map · Kid 2');
  });

  test("a Dex row's number carries into the card it opens, even after a lower copy left (Codex review round 9, FEED-NAME)", async ({ page }) => {
    await fireDetail(page);
    // Kid 1 fuses away while the detail is open; the row for kid 2 keeps its number.
    await page.evaluate(() => window.__PK__!.debugAdd!('water', 756, 2928));
    await expect(dialog(page).getByRole('button', { name: /kid 1 on your map/ })).toHaveCount(0);
    await dialog(page).getByRole('button', { name: 'Fire Kid, kid 2 on your map' }).click();
    await expect(sheet(page).locator('.sheet-subtitle')).toHaveText('On your map · Kid 2');
    await sheet(page).getByRole('button', { name: 'Choose a plot' }).click();
    await sheet(page).getByRole('button', { name: /^Plot 1 ·/ }).click();
    await expect(sheet(page).locator('.dex-home-who')).toContainText('Kid 2');
  });

  test('an add refused because its plot filled says so about that plot (Codex review round 8, FEED-NAME)', async ({ page }) => {
    await fireDetail(page);
    await dialog(page).getByRole('button', { name: /kid 1 on your map/ }).click();
    await sheet(page).getByRole('button', { name: 'Choose a plot' }).click();
    await sheet(page).getByRole('button', { name: /^Plot 1 ·/ }).click();
    // In one task: Plot 1 fills, then Add, before any frame redraws it.
    await page.evaluate(() => {
      const pk = window.__PK__!;
      pk.debugCommand!({ type: 'plant', kidIds: [0, 1, 2, 3, 4].map((i) => pk.debugAdd!('plain', 1856 + i * 200, 4428)), plot: 0 });
      [...document.querySelectorAll<HTMLButtonElement>('.sheet button')].find((b) => b.textContent === 'Add this kid')!.click();
    });
    await expect(sheet(page).locator('.kid-status')).toContainText('This plot is full. Review it to Start growing.');
    await expect(sheet(page).locator('.kid-status')).not.toContainText('All plots');
  });

  test('the return summary hands back a kid card on its Name page, with the draft (Codex review, FEED-NAME)', async ({ page }) => {
    await fireDetail(page);
    await dialog(page).getByRole('button', { name: /kid 1 on your map/ }).click();
    await sheet(page).getByRole('button', { name: 'Name', exact: true }).click();
    await sheet(page).getByLabel('Kid name').fill('Sir Sp');
    await page.evaluate(() => window.__PK__!.debugAway!(60_000));
    await page.getByRole('dialog', { name: 'Welcome back' }).getByRole('button', { name: 'Back to the garden' }).click();
    await expect(sheet(page).locator('.sheet-title')).toHaveText('Name this kid');
    await expect(sheet(page).getByLabel('Kid name')).toHaveValue('Sir Sp');
    // And still the way back to the Dex.
    await sheet(page).getByRole('button', { name: 'Back', exact: true }).click();
    await expect(sheet(page).getByRole('button', { name: 'Back to Fire Kid' })).toBeVisible();
  });

  test('focus on a copy that fuses away moves to the section heading (Codex review, PR #54)', async ({ page }) => {
    await fireDetail(page);
    await dialog(page).getByRole('button', { name: /kid 1 on your map/ }).focus();
    await page.evaluate(() => window.__PK__!.debugAdd!('water', 756, 2928));
    await expect(dialog(page).locator('.dex-home-heading')).toBeFocused();
  });

  test('a drag send gets a world card: the first explains, later ones are short', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await allPlots(page);
    await page.evaluate(() => window.__PK__!.centerOn(1536, 2488));
    const send = async (x: number) => {
      const id = await page.evaluate((px) => window.__PK__!.debugAdd!('fire', px, 2728), x);
      await page.waitForTimeout(200);
      const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
      const t = await page.evaluate(() => window.__PK__!.worldToScreen(1536, 2156));
      await page.mouse.move(k.x, k.y - 20);
      await page.mouse.down();
      await page.mouse.move(t.x, t.y, { steps: 8 });
      await page.waitForTimeout(450);
      await page.mouse.up();
    };
    await send(1216);
    const card = page.locator('.feedback .toast-home');
    await expect(card).toContainText('Fire Kid added to Plot 1.');
    await expect(card).toContainText('Their types stay in your Potato-Dex.');
    await expect(card).toContainText('Add 3–5 kids, then press Start growing.');
    expect(await page.evaluate(() => window.__PK__!.settings().plantV2Explained)).toBe(true);
    await card.getByRole('button', { name: 'Dismiss' }).click();
    await expect(card).toHaveCount(0);
    await send(1856);
    await expect(card).toContainText('Start growing at 3–5.');
    await expect(card.getByRole('button', { name: 'Dismiss' })).toHaveCount(0);
  });

});
