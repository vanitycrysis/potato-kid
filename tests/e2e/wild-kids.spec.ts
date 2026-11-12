import { expect, test, type Locator } from '@playwright/test';
import { boot } from './helpers';

test.describe('wild kids: the ten rares and twenty specials (D-072, D-073)', () => {
  test('a rare and a special are drawn from their own bodies, on the map and on their cards; a rare shows its profile', async ({ page }) => {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    const [rainbow, gift] = await page.evaluate(() => {
      const pk = window.__PK__!;
      const ids: [number, number] = [pk.debugAdd!('rainbow', 1076, 3048), pk.debugAdd!('gift', 1476, 3048)];
      pk.centerOn(1276, 2998);
      return ids;
    });
    await page.waitForTimeout(400);
    // The rare sparkles; the special doesn't (GUI_MVP §16.2).
    const rares = await page.evaluate(() => window.__PK__!.rares());
    expect(rares.find((r) => r.id === rainbow)?.sleeve).toBe(true);
    expect(rares.find((r) => r.id === gift)?.sleeve ?? false).toBe(false);
    // The rare's card: its own body, the face, no costume; its profile (§16.3).
    const at = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, rainbow);
    await page.mouse.click(at.x, at.y - 20);
    const card = page.getByRole('dialog', { name: 'Rainbow Kid' });
    await expect(card.locator('.kid-card-portrait .portrait-layer')).toHaveCount(2);
    await expect(card.locator('.kid-card-portrait .portrait-layer').first()).toHaveAttribute('data-asset', 'kid_body_wildrainbow_stand');
    // Its portrait moves in the rare sleeve (D-094, §27.7), behind the kid and unclipped.
    const sleeve = card.locator('.kid-card-portrait .portrait-sleeve');
    await expect(sleeve).toHaveCount(1);
    await expect(sleeve).toHaveCSS('animation-name', 'portrait-sleeve');
    await expect(sleeve).toHaveCSS('animation-duration', '2.4s');
    const art = (await sleeve.locator('img').boundingBox())!;
    const face = (await card.locator('.kid-card-portrait .portrait').boundingBox())!;
    expect(art.width).toBeGreaterThan(face.width * 0.9);
    expect(Math.abs(art.x + art.width / 2 - (face.x + face.width / 2))).toBeLessThan(12);
    await expect(card.locator('.kid-card-profile-label')).toHaveText('Rare · From planting');
    await expect(card.locator('.kid-card-profile')).toHaveText('A whole little day painted in six colours.');
    await expect(card).toContainText('Planting only. Cannot be bought.');
    await expect(card).toContainText('No fusion recipes.');
    // The Rare tier by name (D-082), never "Tier 6".
    await expect(card.locator('.kid-card-tier .tier')).toHaveText('Rare');
    await expect(card.locator('.kid-card-tier img[data-icon="badge_rare"]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    // The special's card: its own body; no rare profile.
    const g = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, gift);
    await page.mouse.click(g.x, g.y - 20);
    const special = page.getByRole('dialog', { name: 'Gift Kid' });
    await expect(special.locator('.kid-card-portrait .portrait-layer').first()).toHaveAttribute('data-asset', 'kid_body_wildgift_stand');
    // Only a rare has the sleeve (§27.7).
    await expect(special.locator('.portrait-sleeve')).toHaveCount(0);
    await expect(special.locator('.kid-card-profile-label')).toHaveCount(0);
    await expect(special).toContainText('Special kid');
    // The Special tier by name (D-082), and not the tier-5 badge it earns as.
    await expect(special.locator('.kid-card-tier .tier')).toHaveText('Special');
    expect(await special.locator('.kid-card-tier img').evaluateAll((imgs) => imgs.map((i) => (i as HTMLElement).dataset.icon))).toEqual(['badge_special']);
    expect(errors).toEqual([]);
  });

  test('a Special kid sprouts, is announced and shows in the Dex as the Special tier, with its own badge (D-082)', async ({ page }) => {
    const errors = await boot(page, '?seed=3&debug=1&calm=1&arrivals=1');
    await page.evaluate(() => window.__PK__!.debugReadySeed!(0, 'treasure_chest'));
    // Its popup (D-087): new, from the plot, the Special tier with its own badge (GUI_MVP §26),
    // never the tier-5 one it earns as.
    const popup = page.getByRole('dialog');
    await expect(popup.locator('.arrival-sentence')).toContainText('Treasure Chest');
    await expect(popup.locator('.arrival-status')).toHaveText('New!');
    await expect(popup.locator('.arrival-category')).toHaveText('Special');
    const icons = (l: Locator) => l.locator('img').evaluateAll((imgs) => imgs.map((i) => (i as HTMLElement).dataset.icon));
    expect(await icons(popup.locator('.arrival-category'))).toEqual(['badge_special']);
    await popup.getByRole('button', { name: 'Continue' }).click();
    await page.locator('[data-nav=dex]').click();
    const dex = page.getByRole('dialog', { name: 'Potato-Dex' });
    await dex.getByRole('button', { name: 'Specials', exact: true }).click();
    const tile = dex.locator('[data-kid="treasure_chest"]');
    await expect(tile).toHaveAttribute('aria-label', 'Treasure Chest Kid, Special');
    await expect(tile.locator('.tier')).toHaveText('Special');
    await tile.click();
    await expect(dex.locator('.dex-detail-name')).toHaveText(/Treasure Chest/);
    await expect(dex.locator('.dex-detail-tier')).toHaveText('Special');
    expect(await icons(dex.locator('.dex-detail-tier'))).toEqual(['badge_special']);
    expect(errors).toEqual([]);
  });
});
