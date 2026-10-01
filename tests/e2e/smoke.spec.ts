import { expect, test, type Page } from '@playwright/test';

async function boot(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__PK__?.ready === true);
  return errors;
}

test('boots and renders a canvas', async ({ page }) => {
  const errors = await boot(page, '?seed=1');
  await expect(page.locator('canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('40 layered kids wander', async ({ page }) => {
  const errors = await boot(page, '?seed=7&kids=40');
  expect(await page.evaluate(() => window.__PK__!.kids)).toBe(40);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/kids-40.png' });
  // Headless frame rate is a regression signal only, never a phone result (plan §7).
  const fps = await page.evaluate(() => window.__PK__!.fps());
  console.log(`headless fps with 40 kids: ${fps.toFixed(1)}`);
  expect(fps).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});
