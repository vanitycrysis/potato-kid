import { expect, test, type Page } from '@playwright/test';
import { boot, price, openTool, dropOnto } from './helpers';

test.describe('building sheets (GUI_MVP §§2, 4, 5)', () => {
  const garden = (page: Page) => page.locator('[data-nav=garden]');

  test('the Garden upgrades in place, and an unaffordable upgrade sends nothing', async ({ page }) => {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    await garden(page).click();
    const action = page.locator('.sheet-action');
    await expect(action).toHaveAttribute('aria-disabled', 'true');
    await action.click({ force: true }); // a deliberate tap on the disabled control
    await page.waitForTimeout(300);
    expect((await page.evaluate(() => window.__PK__!.buildings())).levels.garden).toBe(1);
    // Nothing was sent: the engine would have answered with a refusal.
    await expect(page.locator('.garden-rate .sheet-status')).toBeHidden();
    await page.evaluate(() => window.__PK__!.debugGive!({ materials: 100 }));
    await expect(action).toHaveAttribute('aria-disabled', 'false');
    const before = await page.evaluate(() => window.__PK__!.wallet().materials);
    await action.click();
    await expect(page.locator('.garden-rate .sheet-status')).toContainText('Garden is now level 2.');
    expect((await page.evaluate(() => window.__PK__!.buildings())).levels.garden).toBe(2);
    expect(await page.evaluate(() => window.__PK__!.wallet().materials)).toBeLessThan(before);
    await expect(page.locator('.sheet-subtitle')).toHaveText('Level 2 / 10');
    await expect(page.locator('.sheet')).toBeVisible(); // stays open
    expect(errors).toEqual([]);
  });

  test('an engine refusal shows inside the sheet, never as a world card', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    const cost = price('garden', 1);
    await page.evaluate((m) => window.__PK__!.debugGive!({ materials: m }), cost);
    await garden(page).click();
    // Send the upgrade, then lose the Materials before the sim applies it.
    await page.evaluate((m) => {
      (document.querySelector('.sheet-action') as HTMLButtonElement).click();
      window.__PK__!.debugGive!({ materials: -m });
    }, cost);
    await expect(page.locator('.garden-rate .sheet-status')).toContainText('Not enough Materials.');
    // World cards wait while a sheet is open, so check after it closes too. Sampled, not a
    // retrying assertion: a leaked 2.5 s card would eventually vanish and pass a retry.
    await page.keyboard.press('Escape');
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(200);
      expect(await page.locator('.feedback').textContent()).toBe('');
    }
  });

  test('Spawn bias: seeds are disabled until built, then a pick sets the target', async ({ page }) => {
    await boot(page, '?seed=3&debug=1');
    await openTool(page, 'Spawn bias');
    await expect(page.locator('.seed-card').first()).toHaveAttribute('aria-disabled', 'true');
    await page.locator('.seed-card').first().click({ force: true });
    await page.waitForTimeout(300);
    expect((await page.evaluate(() => window.__PK__!.buildings())).biasTarget).toBeNull();
    // The UI sent nothing (the engine would have refused it with "Build Spawn bias first.").
    await expect(page.locator('.sheet-status')).toBeHidden();
    await page.evaluate(() => window.__PK__!.debugGive!({ materials: 100 }));
    await page.locator('.sheet-action').click();
    await expect(page.locator('.sheet-subtitle')).toHaveText(/Level 1 \//);
    await page.locator('.seed-card').first().click();
    await expect.poll(() => page.evaluate(() => window.__PK__!.buildings().biasTarget)).toBe('plain');
    await expect(page.locator('.seed-card').first()).toHaveAttribute('aria-checked', 'true');
    await page.locator('.seed-none').click();
    await expect.poll(() => page.evaluate(() => window.__PK__!.buildings().biasTarget)).toBeNull();
  });

  test('Escape, the scrim and the X close; focus returns; the world ignores input meanwhile', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 996, 3028));
    await page.waitForTimeout(200);
    await garden(page).click();
    await expect(page.locator('.sheet')).toBeVisible();
    // A press on the scrim over a kid closes the sheet and does not pick the kid up.
    const p = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
    await page.mouse.click(p.x, p.y - 400);
    await expect(page.locator('.sheet')).toHaveCount(0);
    await expect(garden(page)).toBeFocused();
    await garden(page).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.sheet')).toHaveCount(0);
    await garden(page).click();
    await page.locator('.sheet-close').click();
    await expect(page.locator('.sheet')).toHaveCount(0);
    // With a sheet open, the world doesn't react to a drag at all.
    await garden(page).click();
    expect(await page.evaluate(() => (document.getElementById('app') as HTMLElement).inert)).toBe(true);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => (document.getElementById('app') as HTMLElement).inert)).toBe(false);
  });

  test('a card visible when a sheet opens keeps its time until the sheet closes (Codex review, PR #39)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    // A kind already found: its new recipe is a card (a new kind would be a popup, D-087).
    await page.evaluate((t) => window.__PK__!.debugKnow!(t), 'firefighter');
    const { a, b } = await page.evaluate(() => ({ a: window.__PK__!.debugAdd!('plain', 706, 3228), b: window.__PK__!.debugAdd!('water', 1286, 2428) }));
    await page.waitForTimeout(200);
    await dropOnto(page, a, b);
    await expect(page.locator('.feedback')).toContainText('New recipe found');
    await garden(page).click();
    await page.waitForTimeout(3200); // longer than a card's 2.5 s
    await page.keyboard.press('Escape');
    expect(await page.locator('.feedback').textContent()).toContain('New recipe found');
  });

  test('opening a sheet ends a pan in progress (Codex review, PR #39)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    // Start panning on empty ground.
    await page.mouse.move(200, 600);
    await page.mouse.down();
    await page.mouse.move(220, 560, { steps: 3 });
    await page.evaluate(() => (document.querySelector('[data-nav=garden]') as HTMLButtonElement).click());
    await expect(page.locator('.sheet')).toBeVisible();
    const before = await page.evaluate(() => window.__PK__!.worldToScreen(1456, 2728));
    await page.mouse.move(300, 300, { steps: 5 });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__PK__!.worldToScreen(1456, 2728))).toEqual(before);
    await page.mouse.up();
  });

  test('save banners stay above an open sheet and usable (Codex review, PR #39)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await garden(page).click();
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: false, recovery: true, readOnly: false }));
    const onTop = await page.evaluate(() => {
      const b = document.querySelector('.banner')!.getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return !!hit?.closest('.banner');
    });
    expect(onTop).toBe(true);
    await page.getByRole('button', { name: 'Dismiss save recovery notice' }).click();
    await expect(page.locator('.banner')).toHaveCount(0);
  });

  test('a banner appearing under an open sheet re-places it below the banner (Codex review, PR #39)', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 360 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await garden(page).click();
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false }));
    await expect
      .poll(() =>
        page.evaluate(() => document.querySelector('.sheet')!.getBoundingClientRect().top - document.querySelector('.banner')!.getBoundingClientRect().bottom),
      )
      .toBeGreaterThanOrEqual(0);
  });

  test('page mode: a sheet flows in the page with its action reachable (Codex review, PR #39)', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 200 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false }));
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.hudFit)).toBe('page');
    await page.locator('[data-nav=garden]').scrollIntoViewIfNeeded();
    await page.locator('[data-nav=garden]').click();
    const action = page.locator('.sheet-action');
    await action.scrollIntoViewIfNeeded();
    await expect(action).toBeInViewport();
    expect(await page.locator('.sheet-body').evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThan(100);
  });

  test('a refusal on a short sheet scrolls into view (Codex review, PR #39)', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 360 });
    await boot(page, '?seed=3&debug=1&calm=1');
    const cost = price('garden', 1);
    await page.evaluate((m) => window.__PK__!.debugGive!({ materials: m }), cost);
    await garden(page).click();
    await page.evaluate((m) => {
      (document.querySelector('.sheet-action') as HTMLButtonElement).click();
      window.__PK__!.debugGive!({ materials: -m });
    }, cost);
    await expect(page.locator('.garden-rate .sheet-status')).toContainText('Not enough Materials.');
    const inBody = await page.evaluate(() => {
      const r = document.querySelector('.garden-rate .sheet-status')!.getBoundingClientRect();
      const body = document.querySelector('.sheet-body')!.getBoundingClientRect();
      return r.top >= body.top - 1 && r.bottom <= body.bottom + 1;
    });
    expect(inBody).toBe(true);
  });

  test('keyboard: Shift+Tab from the heading stays in the sheet; arrows move and select seeds (Codex review, PR #39)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1');
    await page.evaluate(() => window.__PK__!.debugGive!({ materials: 100 }));
    await openTool(page, 'Spawn bias');
    await page.locator('.sheet-action').click();
    await expect(page.locator('.sheet-subtitle')).toHaveText(/Level 1 \//);
    await page.locator('.sheet-title').focus();
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => !!document.querySelector('.sheet')!.contains(document.activeElement))).toBe(true);
    // Every choice, None included, is in the one labelled radio group.
    const groups = await page.locator('.seed-card, .seed-none').evaluateAll((els) => new Set(els.map((e) => e.closest('[role="radiogroup"]'))).size);
    expect(groups).toBe(1);
    await expect(page.locator('.seed-none')).toHaveAttribute('role', 'radio');
    expect(await page.locator('.seed-none').evaluate((e) => !!e.closest('[role="radiogroup"][aria-label="Choose a seed"]'))).toBe(true);
    // One tab stop in the group: the selected choice (None while nothing is favoured).
    expect(await page.locator('.seed-card, .seed-none').evaluateAll((els) => els.filter((e) => (e as HTMLElement).tabIndex === 0).length)).toBe(1);
    await page.locator('.seed-none').focus();
    await page.keyboard.press('Home');
    await expect.poll(() => page.evaluate(() => window.__PK__!.buildings().biasTarget)).toBe('plain');
    await expect(page.locator('.seed-card').first()).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => page.evaluate(() => window.__PK__!.buildings().biasTarget)).not.toBe('plain');
    await expect(page.locator('.seed-card').nth(1)).toBeFocused();
  });
});
