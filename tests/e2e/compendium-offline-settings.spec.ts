import { expect, test, type Page } from '@playwright/test';
import { boot, price, respawnPrice, openTool, frames } from './helpers';

test.describe('Compendium, offline summary and Settings (GUI_MVP §§6, 8, 11)', () => {
  const garden = (page: Page) => page.locator('[data-nav=garden]');
  const zeroMaterials = (page: Page) => page.evaluate(() => window.__PK__!.debugGive!({ materials: -window.__PK__!.wallet().materials }));

  /** A calm game with Potato and Fire discovered and the Compendium built. */
  async function built(page: Page): Promise<string[]> {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate((m) => {
      window.__PK__!.debugAdd!('plain', 706, 3228);
      window.__PK__!.debugAdd!('fire', 1286, 3228);
      window.__PK__!.debugGive!({ materials: m });
      window.__PK__!.debugCommand!({ type: 'upgrade', building: 'compendium' });
    }, price('compendium', 0));
    await expect.poll(() => page.evaluate(() => window.__PK__!.buildings().levels.compendium)).toBe(1);
    return errors;
  }

  test('the Compendium sells ordinary kids only: a found rare kid is not listed (D-072, GUI_MVP §16.4)', async ({ page }) => {
    // Hero stands in for a rare kid until the rares' content exists.
    await boot(page, '?seed=3&debug=1&calm=1&rare=hero');
    await page.evaluate((m) => {
      window.__PK__!.debugAdd!('plain', 706, 3228);
      window.__PK__!.debugAdd!('hero', 1286, 3228);
      window.__PK__!.debugGive!({ materials: m });
      window.__PK__!.debugCommand!({ type: 'upgrade', building: 'compendium' });
    }, price('compendium', 0));
    await expect.poll(() => page.evaluate(() => window.__PK__!.buildings().levels.compendium)).toBe(1);
    await openTool(page, 'Compendium');
    await expect(page.locator('.comp-card')).toHaveCount(1);
    await expect(page.locator('.comp-card')).toContainText('Potato Kid');
  });

  test('the Compendium builds in place, then brings a kid back for either currency', async ({ page }) => {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugAdd!('plain', 706, 3228));
    await openTool(page, 'Compendium');
    await expect(page.locator('.sheet-subtitle')).toHaveText('Level 0 / 1');
    const build = page.locator('.sheet-action');
    await expect(build).toHaveAttribute('aria-disabled', 'true');
    await page.evaluate((m) => window.__PK__!.debugGive!({ materials: m }), price('compendium', 0));
    await build.click();
    // Straight to the list in the same sheet, with no misplaced success message.
    await expect(page.locator('.sheet-subtitle')).toHaveText('Level 1 / 1 · Fully built');
    await expect(page.locator('.comp-card')).toHaveCount(1);
    // Sampled, not retried: a 2 s message would pass a retrying check by expiring.
    for (let i = 0; i < 4; i++) {
      expect(await page.locator('.sheet-status').isHidden()).toBe(true);
      await page.waitForTimeout(100);
    }

    // Alternative payments: with no Materials only the Materials price is unavailable.
    await zeroMaterials(page);
    await page.evaluate(() => window.__PK__!.debugGive!({ potatokens: 5 }));
    const [mat, pt] = [page.locator('.comp-buy').nth(0), page.locator('.comp-buy').nth(1)];
    await expect(mat).toHaveAttribute('aria-disabled', 'true');
    await expect(mat).toHaveAttribute('aria-label', `Bring back Potato Kid for ${respawnPrice(1)} Materials: Not enough Materials.`);
    await expect(pt).toHaveAttribute('aria-disabled', 'false');
    await expect(pt).toHaveAttribute('aria-label', 'Bring back Potato Kid for 1 Potatokens');
    await mat.click({ force: true }); // a deliberate tap on the unavailable price sends nothing
    await page.waitForTimeout(300);
    await expect(page.locator('.sheet-status')).toBeHidden();

    const before = await page.evaluate(() => ({ kids: window.__PK__!.kids().length, pt: window.__PK__!.wallet().potatokens }));
    await pt.click();
    await expect(page.locator('.comp-arrived')).toBeVisible();
    const after = await page.evaluate(() => ({ kids: window.__PK__!.kids(), pt: window.__PK__!.wallet().potatokens }));
    expect(after.kids).toHaveLength(before.kids + 1);
    expect(after.kids[after.kids.length - 1]!.type).toBe('plain');
    expect(after.pt).toBe(before.pt - 1);
    await expect(page.locator('.sheet')).toBeVisible(); // stays open, no confirmation
    expect(errors).toEqual([]);
  });

  test('an engine refusal keeps the currency the player chose, inside the sheet', async ({ page }) => {
    await built(page);
    await page.evaluate((m) => window.__PK__!.debugGive!({ materials: m }), respawnPrice(1));
    await openTool(page, 'Compendium');
    // Pay with Materials, then lose them before the sim applies the purchase.
    await page.evaluate(() => {
      (document.querySelector('.comp-buy') as HTMLButtonElement).click();
      window.__PK__!.debugGive!({ materials: -window.__PK__!.wallet().materials });
    });
    await expect(page.locator('.sheet-bar .sheet-status')).toContainText('Not enough Materials.');
    await page.keyboard.press('Escape');
    // Sampled, not retried: a leaked 2.5 s world card would vanish and pass a retry.
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(200);
      expect(await page.locator('.feedback').textContent()).toBe('');
    }
  });

  test('a full Garden disables both prices and says why', async ({ page }) => {
    await built(page);
    await page.evaluate(() => window.__PK__!.debugGive!({ materials: 1000, potatokens: 50 }));
    // Fill every place. A kid placed touching another may fuse (two become one), so top up
    // until the count holds.
    await expect
      .poll(
        async () => {
          await page.evaluate(() => {
            for (let i = 0; window.__PK__!.kids().length < 12 && i < 40; i++) window.__PK__!.debugAdd!('plain', 606 + (i % 5) * 200, 3628 + Math.floor(i / 5) * 250);
          });
          await page.waitForTimeout(300);
          return page.evaluate(() => window.__PK__!.kids().length);
        },
        { timeout: 10_000 },
      )
      .toBe(12);
    await openTool(page, 'Compendium');
    await expect(page.locator('.sheet-bar .sheet-status')).toContainText('Garden is full. Make room for a kid.');
    for (const b of await page.locator('.comp-buy').all()) {
      await expect(b).toHaveAttribute('aria-disabled', 'true');
      await expect(b).toHaveClass(/is-full/);
      await expect(b).toHaveAttribute('aria-label', /: Garden is full\. Make room for a kid\.$/);
    }
  });

  test('search matches discovered names only', async ({ page }) => {
    await built(page);
    await openTool(page, 'Compendium');
    await expect(page.locator('.comp-card')).toHaveCount(2);
    await expect(page.getByText('2 discovered kids')).toBeVisible();
    const field = page.getByLabel('Find a discovered kid');
    await field.fill('FIRE');
    await expect(page.locator('.comp-card:visible')).toHaveCount(1);
    await expect(page.locator('.comp-card:visible')).toContainText('Fire Kid');
    // An undiscovered kid is never found, even by its exact name.
    await field.fill('Steam');
    await expect(page.locator('.comp-card:visible')).toHaveCount(0);
    await expect(page.getByText('No discovered kids match.')).toBeVisible();
  });

  test('the return summary shows one report, and the sheet it interrupted comes back', async ({ page }) => {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugAdd!('plain', 706, 3228));
    await garden(page).click();
    await page.evaluate(() => window.__PK__!.debugAway!(60_000));
    const summary = page.getByRole('dialog', { name: 'Welcome back' });
    await expect(summary).toBeVisible();
    const report = (await page.evaluate(() => window.__PK__!.lastOffline()))!;
    await expect(summary).toContainText('Time credited: 1 m 00 s');
    await expect(summary).not.toContainText('Capped');
    await expect(summary.locator('.stat-row').nth(1)).toContainText(`Kids arrived${report.spawned.length}`);
    await expect(summary.locator('.stat-row').nth(2)).toContainText('Milestone Potatokens+');
    // Dismissing credits nothing more: only ordinary income accrues meanwhile.
    const before = await page.evaluate(() => window.__PK__!.wallet().materials);
    await summary.getByRole('button', { name: 'Back to the garden' }).click();
    await expect(page.getByRole('dialog', { name: 'Garden' })).toBeVisible();
    const after = await page.evaluate(() => window.__PK__!.wallet().materials);
    expect(after - before).toBeLessThan(report.materials / 4);
    expect(errors).toEqual([]);
  });

  test('a short absence credits its rewards but shows no summary (D-049)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugAdd!('plain', 706, 3228));
    const before = await page.evaluate(() => window.__PK__!.wallet().materials);
    await page.evaluate(() => window.__PK__!.debugAway!(59_000));
    expect(await page.evaluate(() => window.__PK__!.lastOffline()!.seconds)).toBeCloseTo(59, 0);
    expect(await page.evaluate(() => window.__PK__!.wallet().materials)).toBeGreaterThan(before);
    await frames(page, 3);
    await expect(page.locator('.sheet')).toHaveCount(0);
    // A minute or more does show it.
    await page.evaluate(() => window.__PK__!.debugAway!(60_000));
    await expect(page.getByRole('dialog', { name: 'Welcome back' })).toBeVisible();
  });

  test('a long absence is credited in full, with no cap (D-080)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugAway!((3 * 24 + 5) * 3600_000));
    const summary = page.getByRole('dialog', { name: 'Welcome back' });
    await expect(summary).toContainText('Time credited: 3 d 5 h');
    expect(await page.evaluate(() => window.__PK__!.lastOffline()!.seconds)).toBeCloseTo((3 * 24 + 5) * 3600, 0);
    await expect(summary).not.toContainText('Capped');
    // Abbreviated Materials also show the exact amount.
    await expect(summary.locator('.stat-exact')).toHaveText(/^\([\d,]+ Materials\)$/);
    await page.keyboard.press('Escape');
    await expect(summary).toBeHidden();
    await expect(page.locator('.sheet')).toHaveCount(0);
  });

  test('Settings: Audio Off disables the sliders; choices persist across a reload', async ({ page }) => {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    await openTool(page, 'Settings');
    const music = page.getByLabel('Music');
    await expect(music).toHaveValue('70');
    await page.getByRole('radio', { name: 'Off' }).click();
    await expect(page.getByRole('radio', { name: 'Off' })).toHaveAttribute('aria-checked', 'true');
    await expect(music).toBeDisabled();
    await expect(page.getByLabel('Sound effects')).toBeDisabled();
    await expect(music).toHaveValue('70'); // the value stays where it was
    // Arrow keys move between On and Off and select.
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('radio', { name: 'On' })).toBeFocused();
    await expect(music).toBeEnabled();
    await music.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.settings-value').first()).toHaveText('69%');
    await page.keyboard.press('End');
    await page.getByRole('button', { name: 'Done' }).click();
    expect(await page.evaluate(() => window.__PK__!.settings())).toMatchObject({ audio: true, music: 100, sfx: 80, plantV2Explained: false });

    await page.evaluate(() => window.__PK__!.debugAway!(0)); // the game is saved, so the reload resumes it
    await page.reload();
    await page.waitForFunction(() => window.__PK__?.ready === true);
    expect(await page.evaluate(() => window.__PK__!.settings())).toMatchObject({ audio: true, music: 100, sfx: 80, plantV2Explained: false });
    // A reload a moment later is too short an absence for the summary (D-049).
    await openTool(page, 'Settings');
    await expect(page.getByLabel('Music')).toHaveValue('100');
    expect(errors).toEqual([]);
  });

  test('read-only disables the Compendium launcher too, in the Notebook (GUI_MVP §19.2)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: false, recovery: false, readOnly: true }));
    await page.locator('[data-nav=notebook]').click();
    const row = page.locator('.notebook-row[data-row=compendium]');
    await expect(row).toBeDisabled();
    await expect(row).toHaveAttribute('aria-label', 'Compendium: Update the game to continue.');
    // Settings and Map view stay available.
    await expect(page.locator('.notebook-row[data-row=settings]')).toBeEnabled();
    await expect(page.locator('.notebook-row[data-row=mapview]')).toBeEnabled();
  });
  test('a short screen with a banner and a status keeps search and cards reachable (Codex review, PR #41)', async ({ page }) => {
    await built(page);
    await page.setViewportSize({ width: 568, height: 320 });
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false }));
    await page.evaluate(() => window.__PK__!.debugGive!({ materials: 1000, potatokens: 50 }));
    await openTool(page, 'Compendium');
    // Trigger the status row: a refusal for a purchase whose Materials vanish first.
    await page.evaluate(() => {
      (document.querySelector('.comp-buy') as HTMLButtonElement).click();
      window.__PK__!.debugGive!({ materials: -window.__PK__!.wallet().materials });
    });
    await expect(page.locator('.sheet-bar .sheet-status')).toContainText('Not enough Materials.');
    await expect(page.locator('.banner')).toBeVisible();
    await expect(page.locator('.sheet')).toHaveAttribute('data-tight', 'true');
    // Each control can be brought into view and is the thing actually under its centre.
    for (const target of [page.getByLabel('Find a discovered kid'), page.locator('.comp-buy').nth(1), page.locator('.comp-buy').last()]) {
      await target.scrollIntoViewIfNeeded();
      const hit = await target.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return r.height > 0 && !!at && el.contains(at);
      });
      expect(hit).toBe(true);
    }
  });

  test('closing the Compendium ends every unseen portrait’s wait (Codex review, PR #41)', async ({ page }) => {
    // Count observers still watching: created by observe(), ended by disconnect().
    await page.addInitScript(() => {
      const Native = window.IntersectionObserver;
      const w = window as unknown as { __liveObservers: number };
      w.__liveObservers = 0;
      window.IntersectionObserver = class extends Native {
        private live = false;
        override observe(t: Element): void {
          if (!this.live) w.__liveObservers++;
          this.live = true;
          super.observe(t);
        }
        override disconnect(): void {
          if (this.live) w.__liveObservers--;
          this.live = false;
          super.disconnect();
        }
      };
    });
    await built(page);
    await page.evaluate(() => {
      const types = ['water', 'snow', 'wind', 'stone', 'chef', 'sprout', 'sail', 'kite', 'builder', 'forge', 'steam', 'hero'];
      types.forEach((t, i) => window.__PK__!.debugAdd!(t, 606 + (i % 4) * 260, 2028 + Math.floor(i / 4) * 300));
    });
    await openTool(page, 'Compendium');
    await expect(page.locator('.comp-card')).toHaveCount(14);
    // Most cards are far below the fold, so their portraits are still waiting.
    expect(await page.evaluate(() => (window as unknown as { __liveObservers: number }).__liveObservers)).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => (window as unknown as { __liveObservers: number }).__liveObservers)).toBe(0);
  });
  test('a soft keyboard that shrinks only the visual viewport keeps the sheet above it (Codex review, PR #41)', async ({ page }) => {
    // Mobile browsers may resize only visualViewport for the keyboard; stand one in.
    await page.addInitScript(() => {
      let keyboard = 0;
      const vv = new EventTarget();
      Object.defineProperties(vv, {
        width: { get: () => window.innerWidth },
        height: { get: () => window.innerHeight - keyboard },
        offsetTop: { get: () => 0 },
        offsetLeft: { get: () => 0 },
        scale: { get: () => 1 },
      });
      Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => vv });
      (window as unknown as { __keyboard: (px: number) => void }).__keyboard = (px) => {
        keyboard = px;
        vv.dispatchEvent(new Event('resize'));
      };
    });
    await built(page);
    await openTool(page, 'Compendium');
    await page.getByLabel('Find a discovered kid').focus();
    const visible = await page.evaluate(() => {
      (window as unknown as { __keyboard: (px: number) => void }).__keyboard(400);
      return window.innerHeight - 400;
    });
    await expect.poll(() => page.locator('.sheet').evaluate((e) => e.getBoundingClientRect().bottom)).toBeLessThanOrEqual(visible);
    // The last price can still be scrolled above the keyboard.
    const last = page.locator('.comp-buy').last();
    await last.evaluate((e) => e.scrollIntoView({ block: 'nearest' }));
    expect(await last.evaluate((e) => e.getBoundingClientRect().bottom)).toBeLessThanOrEqual(visible);
  });

  test('page mode: a sheet interrupted by the summary comes back at its page position (Codex review, PR #41)', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 200 });
    await built(page);
    await page.evaluate(() => {
      const types = ['water', 'snow', 'wind', 'stone', 'chef', 'sprout', 'sail', 'kite'];
      types.forEach((t, i) => window.__PK__!.debugAdd!(t, 606 + (i % 4) * 260, 2028 + Math.floor(i / 4) * 300));
      window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false });
    });
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.hudFit)).toBe('page');
    await openTool(page, 'Compendium');
    await expect(page.locator('.comp-card')).toHaveCount(10);
    await page.locator('.comp-card').nth(6).scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => document.scrollingElement!.scrollTop);
    expect(before).toBeGreaterThan(200);
    await page.evaluate(() => window.__PK__!.debugAway!(60_000));
    await page.getByRole('dialog', { name: 'Welcome back' }).getByRole('button', { name: 'Back to the garden' }).click();
    await expect(page.getByRole('dialog', { name: 'Compendium' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(before);
  });

  test('page mode: a closing sheet leaves the page flow at once', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 200 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false }));
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.hudFit)).toBe('page');
    await page.locator('[data-nav=garden]').scrollIntoViewIfNeeded();
    await page.locator('[data-nav=garden]').click();
    await expect(page.getByRole('dialog', { name: 'Garden' })).toBeVisible();
    // Sampled right after closing, during the fade: no longer taking space in the page.
    const display = await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('.sheet-close')!.click();
      return getComputedStyle(document.querySelector('.sheet')!).display;
    });
    expect(display).toBe('none');
  });

  test('page mode: re-measuring the HUD keeps the page where it was', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 200 });
    await built(page);
    await page.evaluate(() => {
      ['water', 'snow', 'wind', 'stone', 'chef', 'sprout'].forEach((t, i) => window.__PK__!.debugAdd!(t, 606 + (i % 4) * 260, 2028 + Math.floor(i / 4) * 300));
      window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false });
    });
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.hudFit)).toBe('page');
    await openTool(page, 'Compendium');
    await page.evaluate(() => (document.scrollingElement!.scrollTop = 900));
    // Any re-measure (a resize, a banner change) runs the HUD layout again.
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    expect(await page.evaluate(() => document.documentElement.dataset.hudFit)).toBe('page');
    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(900);
  });

  test('portraits stay lazy when the whole sheet scrolls (Codex review, PR #41)', async ({ page }) => {
    await built(page);
    await page.setViewportSize({ width: 568, height: 320 });
    await page.evaluate(() => {
      const types = ['water', 'snow', 'wind', 'stone', 'chef', 'sprout', 'sail', 'kite', 'builder', 'forge', 'steam', 'hero'];
      types.forEach((t, i) => window.__PK__!.debugAdd!(t, 606 + (i % 4) * 260, 2028 + Math.floor(i / 4) * 300));
      window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false });
    });
    await openTool(page, 'Compendium');
    await expect(page.locator('.comp-card')).toHaveCount(14);
    await expect(page.locator('.sheet')).toHaveAttribute('data-tight', 'true');
    await page.waitForTimeout(300);
    // Only cards within a row of view are composed (here, none yet); scrolling the sheet
    // composes what it reaches, and the rest still wait.
    await page.locator('.comp-card').first().scrollIntoViewIfNeeded();
    await expect(page.locator('.comp-card').first().locator('.portrait-canvas')).toHaveCount(1);
    expect(await page.locator('.comp-card .portrait-canvas').count()).toBeLessThan(8);
    await page.locator('.comp-card').last().scrollIntoViewIfNeeded();
    await expect(page.locator('.comp-card').last().locator('.portrait-canvas')).toHaveCount(1);
  });
});
