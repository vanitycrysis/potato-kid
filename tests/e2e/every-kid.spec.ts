import { expect, test } from '@playwright/test';
import { boot, frames } from './helpers';

test.describe('every kid on the map, and Which kid? (GUI_MVP §§19.2, 20.1)', () => {
  test('Dex → Kids on map lists every kid, even off screen; search narrows; a row opens its card, whose Back returns as it was', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    const ids = await page.evaluate(() => {
      const pk = window.__PK__!;
      // One far off screen (the world's corner), two near the Garden.
      return [pk.debugAdd!('plain', 3576, 6448), pk.debugAdd!('water', 1176, 3148), pk.debugAdd!('fire', 1876, 3148)];
    });
    await page.locator('[data-nav=dex]').click();
    const onMap = page.getByRole('button', { name: 'Kids on map (3)' });
    await expect(onMap).toBeVisible();
    await onMap.click();
    const list = page.getByRole('dialog', { name: 'Kids on map' });
    await expect(list.locator('.kids-row')).toHaveCount(3);
    await expect(list.locator('.kids-row').first()).toHaveAttribute('data-kid', String(ids[0]));
    await list.getByLabel('Find a kid on your map').fill('water');
    await expect(list.locator('.kids-row:visible')).toHaveCount(1);
    await list.locator('.kids-row:visible').click();
    const card = page.getByRole('dialog', { name: 'Water Kid' });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Back to Kids on map' }).click();
    await expect(list.getByLabel('Find a kid on your map')).toHaveValue('water');
    await expect(list.locator(`.kids-row[data-kid="${ids[1]}"]`)).toBeFocused();
    await list.getByRole('button', { name: 'Back to Potato-Dex' }).click();
    await expect(page.getByRole('button', { name: 'Kids on map (3)' })).toBeFocused();
  });

  test('a tap between two small kids asks Which kid?; a drag from the same spot picks up the nearer', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    // At the farthest zoom a kid is drawn under 44 px: its pickup target grows to 44 px.
    const at = await page.evaluate(() => window.__PK__!.worldToScreen(1536, 3148));
    await page.evaluate((at) => document.querySelector('canvas')!.dispatchEvent(new WheelEvent('wheel', { deltaY: 2000, clientX: at.x, clientY: at.y, bubbles: true, cancelable: true })), at);
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBe(0.5);
    const [a, b] = await page.evaluate(() => {
      const pk = window.__PK__!;
      const a = pk.debugAdd!('plain', 1376, 3148);
      const box = pk.kids().find((k) => k.id === a)!.box;
      // Bodies 50 world units apart (about 9 px at this zoom): both targets reach the middle.
      return [a, pk.debugAdd!('fire', 1376 + box.right - box.left + 50, 3148)];
    });
    await frames(page, 3);
    const mid = await page.evaluate(([a, b]) => {
      const pk = window.__PK__!;
      const ka = pk.kids().find((k) => k.id === a)!;
      const kb = pk.kids().find((k) => k.id === b)!;
      const left = pk.worldToScreen(ka.x + ka.box.right, ka.y + (ka.box.top + ka.box.bottom) / 2);
      const right = pk.worldToScreen(kb.x + kb.box.left, kb.y + (kb.box.top + kb.box.bottom) / 2);
      return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 + 1 };
    }, [a, b] as const);
    // A tap, timed in the page.
    await page.evaluate((p) => {
      const canvas = document.querySelector('canvas')!;
      for (const type of ['pointerdown', 'pointerup']) canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', isPrimary: true, clientX: p.x, clientY: p.y, buttons: type === 'pointerdown' ? 1 : 0, bubbles: true }));
    }, mid);
    const which = page.getByRole('dialog', { name: 'Which kid?' });
    await expect(which).toBeVisible();
    await expect(which.locator('.kids-row')).toHaveCount(2);
    await which.locator(`.kids-row[data-kid="${b}"]`).click();
    await expect(page.getByRole('dialog', { name: 'Fire Kid' })).toBeVisible();
    await page.keyboard.press('Escape');
    // A drag from the same spot takes one kid, never asks.
    await page.mouse.move(mid.x, mid.y);
    await page.mouse.down();
    await page.mouse.move(mid.x, mid.y - 40, { steps: 4 });
    const held = await page.evaluate(() => window.__PK__!.kids().filter((k) => k.held).map((k) => k.id));
    expect(held).toHaveLength(1);
    expect([a, b]).toContain(held[0]);
    await page.mouse.up();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('Kids on map interrupted by the return summary comes back, still a page of the Dex', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugAdd!('plain', 1176, 3148));
    await page.locator('[data-nav=dex]').click();
    await page.getByRole('button', { name: /^Kids on map \(/ }).click();
    await page.evaluate(() => window.__PK__!.debugAway!(120_000));
    await page.getByRole('dialog', { name: 'Welcome back' }).getByRole('button', { name: 'Back to the garden' }).click();
    await expect(page.getByRole('dialog', { name: 'Kids on map' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to Potato-Dex' }).click();
    await expect(page.getByRole('dialog', { name: 'Potato-Dex' })).toBeVisible();
  });
});
