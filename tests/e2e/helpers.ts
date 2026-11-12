// Shared helpers for the e2e specs (split out of the old single smoke.spec.ts).
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

export async function boot(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__PK__?.ready === true);
  // The world scrolls (D-040): debug tests place kids beside the Garden, so look there.
  if (query.includes('debug=1')) await page.evaluate(() => window.__PK__!.centerOn(996, 2828));
  return errors;
}

// Prices from the shipped balance, computed as the sim computes them, so tuning (D-052)
// never strands a test with a stale amount.
export const balance = JSON.parse(readFileSync('src/content/balance.json', 'utf8')) as {
  buildings: Record<string, { costBase: number; costGrowth: number }>;
  economy: { respawnMaterials: number; materialsPerSecond: number };
  planting: { growSeconds: number; unlockCostBase: number; unlockCostGrowth: number; startPlots: number };
};
/** Materials to unlock the plot after the `unlocked` ones. */
export const plotPrice = (unlocked: number) => Math.ceil(balance.planting.unlockCostBase * balance.planting.unlockCostGrowth ** (unlocked - balance.planting.startPlots));
/** Materials to upgrade `building` from `level`. */
export const price = (building: string, level: number) => Math.ceil(balance.buildings[building]!.costBase * balance.buildings[building]!.costGrowth ** level);
/** Materials to bring back a kid of `tier` from the Compendium. */
export const respawnPrice = (tier: number) => Math.ceil(balance.economy.respawnMaterials * 2 ** (tier - 1));

/** Opens one of the Notebook's tools (GUI_MVP §19.2): the Notebook, then that row. */
export async function openTool(page: Page, label: 'Capacity' | 'Spawn bias' | 'Compendium' | 'Map view' | 'Settings'): Promise<void> {
  await page.locator('[data-nav=notebook]').click();
  await page.getByRole('dialog', { name: 'Notebook' }).getByRole('button', { name: label, exact: true }).click();
}

export async function frames(page: Page, n: number): Promise<void> {
  await page.evaluate(async (count) => {
    for (let i = 0; i < count; i++) await new Promise((r) => requestAnimationFrame(() => r(null)));
  }, n);
}

/** Drags kid `a` onto kid `b` (finger below b's feet, as held kids float above the finger). */
export async function dropOnto(page: Page, a: number, b: number, release = true): Promise<void> {
  const from = await page.evaluate((id) => window.__PK__!.screenPointOf(id)!, a);
  await page.mouse.move(from.x, from.y - 20);
  await page.mouse.down();
  const to = await page.evaluate((id) => window.__PK__!.screenPointOf(id)!, b);
  const lift = await page.evaluate(() => window.__PK__!.worldToScreen(456, 1798).y - window.__PK__!.worldToScreen(456, 1728).y);
  await page.mouse.move(to.x, to.y + lift, { steps: 10 });
  if (release) await page.mouse.up();
}
