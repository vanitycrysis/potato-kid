import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { boot, balance, price, frames } from './helpers';

test.describe('Potato-Dex (GUI_MVP §§7, 9)', () => {
  const dexButton = (page: Page) => page.locator('[data-nav=dex]');
  const dialog = (page: Page) => page.getByRole('dialog', { name: 'Potato-Dex' });
  const roster = JSON.parse(readFileSync('src/content/kids.json', 'utf8')) as { id: string; special?: boolean; rare?: boolean }[];
  const totals = {
    kids: roster.length,
    /** Each Kids segment's size (§16.4). */
    ordinary: roster.filter((k) => !k.special && !k.rare).length,
    specials: roster.filter((k) => k.special).length,
    rares: roster.filter((k) => k.rare).length,
    recipes: (JSON.parse(readFileSync('src/content/recipes.json', 'utf8')) as unknown[]).length,
  };

  /** A calm game with exactly Potato and Water discovered (no recipe found yet). */
  async function twoKnown(page: Page): Promise<string[]> {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => {
      window.__PK__!.debugAdd!('plain', 706, 3228);
      window.__PK__!.debugAdd!('water', 1286, 3228);
    });
    return errors;
  }

  test('the whole roster: discovered kids first, then identical packets that reveal nothing', async ({ page }) => {
    const errors = await twoKnown(page);
    await dexButton(page).click();
    await expect(dialog(page).locator('.sheet-subtitle')).toHaveText(`2 / ${totals.kids} discovered`);
    // The Ordinary segment first (§16.4): its kids, then its packets.
    const cells = dialog(page).locator('.dex-cell');
    await expect(cells).toHaveCount(totals.ordinary);
    // Discovered first, in roster order, then packets: a packet's position says nothing.
    await expect(cells.nth(0)).toHaveAttribute('role', 'listitem');
    await expect(cells.nth(0).locator('.dex-tile')).toHaveAttribute('aria-label', 'Potato Kid, Tier 1');
    await expect(cells.nth(1).locator('.dex-tile')).toHaveAttribute('aria-label', 'Water Kid, Tier 1');
    await expect(cells.nth(1).locator('.dex-tile-name')).toHaveText('Water');
    const packets = dialog(page).locator('.dex-unknown');
    await expect(packets).toHaveCount(totals.ordinary - 2);
    // Every packet is identical: same text, no tier, no data, not a button.
    const html = await packets.evaluateAll((els) => [...new Set(els.map((e) => e.outerHTML))]);
    expect(html).toHaveLength(1);
    expect(html[0]).not.toMatch(/tier|data-kid|button/i);
    expect(await dialog(page).locator('.dex-cell').nth(2).locator('.dex-unknown').count()).toBe(1);
    // Specials and Rares: none found yet, all the same packets; the combined count is unchanged.
    await dialog(page).getByRole('button', { name: 'Specials', exact: true }).click();
    await expect(cells).toHaveCount(totals.specials);
    await expect(packets).toHaveCount(totals.specials);
    await dialog(page).getByRole('button', { name: 'Rares', exact: true }).click();
    await expect(cells).toHaveCount(totals.rares);
    await expect(packets).toHaveCount(totals.rares);
    await expect(dialog(page).locator('.dex-segment-helper')).toHaveText(`Rares 0 / ${totals.rares}`);
    const html2 = await packets.evaluateAll((els) => [...new Set(els.map((e) => e.outerHTML))]);
    expect(html2).toEqual(html);
    await expect(dialog(page).locator('.sheet-subtitle')).toHaveText(`2 / ${totals.kids} discovered`);
    expect(errors).toEqual([]);
  });

  test('each segment keeps its own search; a found special shows its label and apex facts (§16.4)', async ({ page }) => {
    await twoKnown(page);
    await page.evaluate(() => window.__PK__!.debugAdd!('gift', 996, 3928));
    await dexButton(page).click();
    const field = dialog(page).getByLabel('Find a discovered kid');
    await field.fill('wat');
    await dialog(page).getByRole('button', { name: 'Specials', exact: true }).click();
    await expect(field).toHaveValue('');
    await expect(dialog(page).locator('[data-kid="gift"]')).toContainText('Special');
    await dialog(page).getByRole('button', { name: 'Ordinary', exact: true }).click();
    await expect(field).toHaveValue('wat');
    await dialog(page).getByRole('button', { name: 'Specials', exact: true }).click();
    await dialog(page).locator('[data-kid="gift"]').click();
    await expect(dialog(page).locator('.dex-detail-name')).toHaveText('Gift Kid');
    await expect(dialog(page).locator('.dex-apex-label')).toHaveText('Special · From planting');
    await expect(dialog(page)).toContainText('No fusion recipes.');
    await expect(dialog(page)).toContainText('Cannot be bought.');
    await expect(dialog(page).getByText('Found recipes')).toHaveCount(0);
    // Back: the Specials segment, as it was.
    await dialog(page).getByRole('button', { name: 'Back to kids' }).click();
    await expect(dialog(page).getByRole('button', { name: 'Specials', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog(page).locator('[data-kid="gift"]')).toBeFocused();
    // A search here counts only this segment's kids: Water is Ordinary (Codex review, #94).
    await field.fill('wat');
    await expect(dialog(page).getByText('No discovered kids match.')).toBeVisible();
  });

  test("each segment keeps its scroll, also through another segment's kid detail (Codex review, #94)", async ({ page }) => {
    await twoKnown(page);
    // A special sprouts, so the Specials segment has a kid to open.
    await page.evaluate(() => window.__PK__!.debugReadySeed!(0, 'gift'));
    await expect.poll(() => page.evaluate(() => window.__PK__!.debugKnown!().includes('gift'))).toBe(true);
    await dexButton(page).click();
    const body = dialog(page).locator('.sheet-body');
    await body.evaluate((e) => (e.scrollTop = 300));
    const kept = await body.evaluate((e) => e.scrollTop);
    expect(kept).toBeGreaterThan(100);
    // Switched where it is: a real click wouldn't scroll the list back up first.
    await dialog(page).getByRole('button', { name: 'Specials', exact: true }).dispatchEvent('click');
    await dialog(page).locator('[data-kid="gift"]').click();
    await expect(dialog(page).locator('.dex-detail-name')).toHaveText('Gift Kid');
    await dialog(page).getByRole('button', { name: 'Back to kids' }).click();
    await expect(dialog(page).getByRole('button', { name: 'Specials', exact: true })).toHaveAttribute('aria-pressed', 'true');
    // Ordinary is where it was left.
    await dialog(page).getByRole('button', { name: 'Ordinary', exact: true }).click();
    await expect.poll(() => body.evaluate((e) => e.scrollTop)).toBe(kept);
  });

  test('search finds discovered names only', async ({ page }) => {
    await twoKnown(page);
    await dexButton(page).click();
    const field = dialog(page).getByLabel('Find a discovered kid');
    await field.fill('wat');
    await expect(dialog(page).locator('.dex-cell:visible')).toHaveCount(1);
    await expect(dialog(page).getByText(`${totals.ordinary - 2} still undiscovered`)).toBeVisible();
    // An undiscovered kid is never found, by its name or its id.
    for (const q of ['Firefighter', 'firefighter', 'steam']) {
      await field.fill(q);
      await expect(dialog(page).locator('.dex-cell:visible')).toHaveCount(0);
      await expect(dialog(page).getByText('No discovered kids match.')).toBeVisible();
    }
  });

  test('recipes are revealed by being made, not by knowing their kids', async ({ page }) => {
    await twoKnown(page);
    // Firefighter discovered too, but Potato + Water was never fused: still unknown.
    await page.evaluate(() => window.__PK__!.debugAdd!('firefighter', 996, 3928));
    await dexButton(page).click();
    await dialog(page).getByRole('tab', { name: 'Recipes' }).click();
    await expect(dialog(page).getByText(`0 / ${totals.recipes} recipes found`)).toBeVisible();
    await expect(dialog(page).locator('.dex-recipe')).toHaveCount(0);
    await expect(dialog(page).locator('.dex-recipe-unknown')).toHaveCount(totals.recipes);
    // Every unknown card is the same packet and words: no symbols, portraits or tier.
    const unknown = await dialog(page).locator('.dex-recipe-unknown').evaluateAll((els) => [...new Set(els.map((e) => e.textContent))]);
    expect(unknown).toEqual(['Unknown recipeKeep experimenting.']);
    await expect(dialog(page).locator('.dex-recipe-unknown .portrait, .dex-recipe-unknown .tier, .dex-recipe-unknown .dex-sym')).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Fuse Potato and Water: two kids placed on one spot end up touching.
    await page.evaluate(() => {
      window.__PK__!.debugAdd!('plain', 1176, 3148);
      window.__PK__!.debugAdd!('water', 1176, 3148);
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.discoveredRecipes())).toContain('plain|water');
    await dexButton(page).click();
    // The Dex reopens on the tab it was left on.
    await expect(dialog(page).getByRole('tab', { name: 'Recipes' })).toHaveAttribute('aria-selected', 'true');
    await expect(dialog(page).getByText(`1 / ${totals.recipes} recipes found`)).toBeVisible();
    const row = dialog(page).locator('.dex-recipe');
    await expect(row).toHaveCount(1);
    await expect(row).toHaveAttribute('aria-label', 'Potato Kid plus Water Kid makes Firefighter Kid');
    await expect(row.locator('.dex-end-name')).toHaveText(['Potato', 'Water', 'Firefighter']);
    await expect(dialog(page).locator('.dex-recipe-unknown')).toHaveCount(totals.recipes - 1);
  });

  test('a kid’s detail: income and found recipes; Back returns to its tile', async ({ page }) => {
    await twoKnown(page);
    await page.evaluate(() => {
      window.__PK__!.debugAdd!('plain', 1176, 3148);
      window.__PK__!.debugAdd!('water', 1176, 3148);
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.discoveredRecipes())).toContain('plain|water');
    await dexButton(page).click();
    await dialog(page).getByRole('button', { name: 'Water Kid, Tier 1' }).click();
    await expect(dialog(page).locator('.dex-detail-name')).toHaveText('Water Kid');
    await expect(dialog(page).getByText(`Earns ${Math.round(balance.economy.materialsPerSecond * 3600)} Materials / h`)).toBeVisible();
    await expect(dialog(page).locator('.dex-detail .dex-recipe')).toHaveAttribute('aria-label', 'Potato Kid plus Water Kid makes Firefighter Kid');
    await expect(dialog(page).getByRole('button', { name: 'Back to kids' })).toBeFocused();
    // Tier-2 Firefighter, no recipe of its own made yet (it is only a result here).
    await dialog(page).getByRole('button', { name: 'Back to kids' }).click();
    await expect(dialog(page).getByRole('button', { name: 'Water Kid, Tier 1' })).toBeFocused();
    await dialog(page).getByRole('button', { name: 'Firefighter Kid, Tier 2' }).click();
    await expect(dialog(page).getByText(`Earns ${Math.round(balance.economy.materialsPerSecond * 3600 * 2)} Materials / h`)).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Back to kids' }).click();
    await page.evaluate(() => window.__PK__!.debugAdd!('snow', 1286, 3928));
    await dialog(page).getByRole('button', { name: 'Snow Kid, Tier 1' }).click();
    await expect(dialog(page).getByText('No recipes found for this kid yet.')).toBeVisible();
  });

  test('tab, search and scroll are kept across closing and reopening', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 640 });
    await twoKnown(page);
    await dexButton(page).click();
    await dialog(page).getByLabel('Find a discovered kid').fill('pot');
    await page.keyboard.press('Escape');
    await dexButton(page).click();
    await expect(dialog(page).getByLabel('Find a discovered kid')).toHaveValue('pot');
    await dialog(page).getByLabel('Find a discovered kid').fill('');
    // Mid-list, away from either end, so no clamping is involved.
    await dialog(page).locator('.sheet-body').evaluate((e) => (e.scrollTop = 600));
    const before = await dialog(page).locator('.sheet-body').evaluate((e) => e.scrollTop);
    expect(before).toBe(600);
    await dialog(page).getByRole('tab', { name: 'Recipes' }).click();
    await dialog(page).getByRole('tab', { name: 'Kids' }).click();
    await expect.poll(() => dialog(page).locator('.sheet-body').evaluate((e) => e.scrollTop)).toBe(before);
    // A scroll made just before closing is kept too.
    await dialog(page).locator('.sheet-body').evaluate((e) => (e.scrollTop = 300));
    await frames(page, 2);
    await page.keyboard.press('Escape');
    await dexButton(page).click();
    await expect.poll(() => dialog(page).locator('.sheet-body').evaluate((e) => e.scrollTop)).toBe(300);
  });

  test('the tab strip is one tab stop; arrows move and select', async ({ page }) => {
    await twoKnown(page);
    await dexButton(page).click();
    const kids = dialog(page).getByRole('tab', { name: 'Kids' });
    await kids.focus();
    await page.keyboard.press('ArrowRight');
    await expect(dialog(page).getByRole('tab', { name: 'Recipes' })).toBeFocused();
    await expect(dialog(page).getByRole('tab', { name: 'Recipes' })).toHaveAttribute('aria-selected', 'true');
    await expect(kids).toHaveAttribute('tabindex', '-1');
    await page.keyboard.press('End');
    await expect(dialog(page).getByRole('tab', { name: 'Compendium' })).toHaveAttribute('aria-selected', 'true');
  });

  test('the Compendium tab reaches the same states as the tray, with its own subtitle', async ({ page }) => {
    await twoKnown(page);
    await dexButton(page).click();
    await dialog(page).getByRole('tab', { name: 'Compendium' }).click();
    await expect(dialog(page).locator('.sheet-subtitle')).toHaveText('Level 0 / 1');
    await page.evaluate((m) => window.__PK__!.debugGive!({ materials: m }), price('compendium', 0));
    await dialog(page).getByRole('button', { name: /Build Compendium/ }).click();
    await expect(dialog(page).locator('.sheet-subtitle')).toHaveText('Level 1 / 1 · Fully built');
    await expect(dialog(page).locator('.comp-card')).toHaveCount(2);
    await page.evaluate(() => window.__PK__!.debugGive!({ potatokens: 5 }));
    const before = await page.evaluate(() => window.__PK__!.kids().length);
    await dialog(page).getByRole('button', { name: 'Bring back Water Kid for 1 Potatokens' }).click();
    await expect(dialog(page).locator('.comp-arrived:visible')).toHaveCount(1);
    expect(await page.evaluate(() => window.__PK__!.kids().length)).toBe(before + 1);
    // Back to Kids: the Dex subtitle returns.
    await dialog(page).getByRole('tab', { name: 'Kids' }).click();
    await expect(dialog(page).locator('.sheet-subtitle')).toHaveText(/^2 \/ \d+ discovered$/);
  });

  test('a discovery card opens that kid in the Dex', async ({ page }) => {
    await twoKnown(page);
    // A kind already found: its new recipe is a card (a new kind would be a popup, D-087).
    await page.evaluate((t) => window.__PK__!.debugKnow!(t), 'firefighter');
    await page.evaluate(() => {
      window.__PK__!.debugAdd!('plain', 1176, 3148);
      window.__PK__!.debugAdd!('water', 1176, 3148);
    });
    const card = page.locator('.feedback .toast-button');
    await expect(card).toContainText('Firefighter Kid', { timeout: 10_000 });
    await card.click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).locator('.dex-detail-name')).toHaveText('Firefighter Kid');
  });

  test('Tab wraps inside the Dex: inactive tabs are not tab stops (Codex review, PR #43)', async ({ page }) => {
    await twoKnown(page);
    await dexButton(page).click();
    await dialog(page).getByRole('tab', { name: 'Recipes' }).click();
    // On Recipes the last real stop is the Recipes tab; Tab from it must wrap, not escape.
    // (Chrome may also stop on a scrollable body, so keep pressing.)
    await dialog(page).getByRole('tab', { name: 'Recipes' }).focus();
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    }
  });

  test('an open detail shows a recipe found while it is up (Codex review, PR #43)', async ({ page }) => {
    await twoKnown(page);
    await dexButton(page).click();
    await dialog(page).getByRole('button', { name: 'Water Kid, Tier 1' }).click();
    await expect(dialog(page).getByText('No recipes found for this kid yet.')).toBeVisible();
    await page.evaluate(() => {
      window.__PK__!.debugAdd!('plain', 1176, 3148);
      window.__PK__!.debugAdd!('water', 1176, 3148);
    });
    await expect(dialog(page).locator('.dex-detail .dex-recipe')).toHaveAttribute('aria-label', 'Potato Kid plus Water Kid makes Firefighter Kid');
    await expect(dialog(page).getByRole('button', { name: 'Back to kids' })).toBeFocused();
  });

  test('the Dex Compendium tab keeps its scroll through the offline summary (Codex review, PR #43)', async ({ page }) => {
    await twoKnown(page);
    await page.evaluate((m) => {
      ['snow', 'wind', 'stone', 'chef', 'sprout', 'sail', 'kite', 'builder', 'forge', 'steam', 'hero', 'fire'].forEach((t, i) =>
        window.__PK__!.debugAdd!(t, 606 + (i % 4) * 260, 2028 + Math.floor(i / 4) * 300),
      );
      window.__PK__!.debugGive!({ materials: m });
      window.__PK__!.debugCommand!({ type: 'upgrade', building: 'compendium' });
    }, price('compendium', 0));
    await expect.poll(() => page.evaluate(() => window.__PK__!.buildings().levels.compendium)).toBe(1);
    await dexButton(page).click();
    await dialog(page).getByRole('tab', { name: 'Compendium' }).click();
    // Placed kids may fuse into more types; any long list will do.
    await expect.poll(() => dialog(page).locator('.comp-card').count()).toBeGreaterThanOrEqual(10);
    await dialog(page).locator('.sheet-body').evaluate((e) => (e.scrollTop = 700));
    await frames(page, 2);
    await page.evaluate(() => window.__PK__!.debugAway!(60_000));
    await page.getByRole('dialog', { name: 'Welcome back' }).getByRole('button', { name: 'Back to the garden' }).click();
    await expect(dialog(page).getByRole('tab', { name: 'Compendium' })).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => dialog(page).locator('.sheet-body').evaluate((e) => e.scrollTop)).toBe(700);
  });

  test('Back focuses the search field when the kept search hides the kid (Codex review, PR #43)', async ({ page }) => {
    await twoKnown(page);
    // A kind already found: its new recipe is a card (a new kind would be a popup, D-087).
    await page.evaluate((t) => window.__PK__!.debugKnow!(t), 'firefighter');
    await dexButton(page).click();
    await dialog(page).getByLabel('Find a discovered kid').fill('wat');
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      window.__PK__!.debugAdd!('plain', 1176, 3148);
      window.__PK__!.debugAdd!('water', 1176, 3148);
    });
    const card = page.locator('.feedback .toast-button');
    await expect(card).toContainText('Firefighter Kid', { timeout: 10_000 });
    await card.click();
    await expect(dialog(page).locator('.dex-detail-name')).toHaveText('Firefighter Kid');
    await dialog(page).getByRole('button', { name: 'Back to kids' }).click();
    await expect(dialog(page).getByLabel('Find a discovered kid')).toBeFocused();
  });

  test('an open detail comes back after the offline summary (Codex review, PR #43)', async ({ page }) => {
    await twoKnown(page);
    await dexButton(page).click();
    await dialog(page).getByRole('button', { name: 'Water Kid, Tier 1' }).click();
    await expect(dialog(page).locator('.dex-detail-name')).toHaveText('Water Kid');
    await page.evaluate(() => window.__PK__!.debugAway!(60_000));
    await page.getByRole('dialog', { name: 'Welcome back' }).getByRole('button', { name: 'Back to the garden' }).click();
    await expect(dialog(page).locator('.dex-detail-name')).toHaveText('Water Kid');
    // Back still returns to the grid, at its tile.
    await dialog(page).getByRole('button', { name: 'Back to kids' }).click();
    await expect(dialog(page).getByRole('button', { name: 'Water Kid, Tier 1' })).toBeFocused();
  });

  test('closing a Dex opened from a discovery card returns focus to the card (Codex review, PR #43)', async ({ page }) => {
    await twoKnown(page);
    // A kind already found: its new recipe is a card (a new kind would be a popup, D-087).
    await page.evaluate((t) => window.__PK__!.debugKnow!(t), 'firefighter');
    await page.evaluate(() => {
      window.__PK__!.debugAdd!('plain', 1176, 3148);
      window.__PK__!.debugAdd!('water', 1176, 3148);
    });
    const card = page.locator('.feedback .toast-button');
    await expect(card).toContainText('Firefighter Kid', { timeout: 10_000 });
    await card.focus();
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(card).toBeFocused();
  });

  test('read-only disables the Dex with its reason', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: false, recovery: false, readOnly: true }));
    await expect(dexButton(page)).toBeDisabled();
    await expect(dexButton(page)).toHaveAttribute('aria-label', 'Potato-Dex: Update the game to continue.');
  });
});
