import { expect, test } from '@playwright/test';

test('boots and renders a canvas', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __PK_READY__?: boolean }).__PK_READY__ === true);
  await expect(page.locator('canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/smoke.png' });
  expect(errors).toEqual([]);
});
