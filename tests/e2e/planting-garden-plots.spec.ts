import { expect, test, type Page } from '@playwright/test';
import { boot, balance, plotPrice } from './helpers';

test.describe("Planting, the Garden's plots (GUI_MVP §15.3-15.4)", () => {
  const sheet = (page: Page) => page.getByRole('dialog');
  const row = (page: Page, n: number) => page.locator('.plot-row').nth(n - 1);

  /** The Garden open on its overview, with Tier 1 kids of these types on the map. */
  async function garden(page: Page, kids: string[] = []): Promise<number[]> {
    await boot(page, '?seed=3&debug=1&calm=1');
    const ids = await page.evaluate((types) => types.map((t, i) => window.__PK__!.debugAdd!(t, 756 + (i % 4) * 300, 3228 + Math.floor(i / 4) * 300)), kids);
    await page.locator('[data-nav=garden]').click();
    return ids;
  }

  /** Puts `n` new Potato Kids straight into plot `plot` (0-based), as a drag would. */
  async function plantPlain(page: Page, n: number, plot = 0): Promise<void> {
    const before = await page.evaluate((i) => window.__PK__!.plots()[i]!.kids, plot);
    await page.evaluate(
      ([n, plot]) => {
        const pk = window.__PK__!;
        pk.debugCommand!({ type: 'plant', kidIds: Array.from({ length: n }, (_, i) => pk.debugAdd!('plain', 1856 + i * 200, 4428 + plot * 200)), plot });
      },
      [n, plot] as const,
    );
    await expect.poll(() => page.evaluate((i) => window.__PK__!.plots()[i]!.kids, plot)).toBe(before + n);
  }

  test('the overview: one empty plot, three locked, and More plots unlocks the next', async ({ page }) => {
    await garden(page);
    await expect(row(page, 1).locator('.plot-row-heading')).toHaveText('Plot 1');
    await expect(row(page, 1).locator('.plot-row-status')).toHaveText('Empty · 0 / 5');
    await expect(row(page, 1).getByRole('img', { name: 'Empty space' })).toHaveCount(5);
    for (const n of [2, 3, 4]) await expect(row(page, n).locator('.plot-row-heading')).toHaveText(`Plot ${n} · Locked`);
    await expect(row(page, 2).getByRole('button')).toHaveCount(0);
    const cost = plotPrice(1);
    const unlock = sheet(page).getByRole('button', { name: `Unlock plot 2 · ${cost.toLocaleString('en-US')} Materials` });
    await expect(sheet(page).locator('.garden-more')).toContainText('Now 1 · Next 2');
    await expect(unlock).toHaveAttribute('aria-disabled', 'true');
    await page.evaluate((m) => window.__PK__!.debugGive!({ materials: m }), cost);
    await expect(unlock).toHaveAttribute('aria-disabled', 'false');
    await unlock.click();
    await expect(sheet(page).locator('.garden-more .sheet-status')).toContainText('Plot 2 unlocked.');
    await expect(row(page, 2).locator('.plot-row-status')).toHaveText('Empty · 0 / 5');
    expect(await page.evaluate(() => window.__PK__!.wallet().materials)).toBe(0);
    await expect(sheet(page).locator('.garden-more')).toContainText('Now 2 · Next 3');
  });

  test('the picker adds the kids chosen, all at once, with the odds before and after (§15.3)', async ({ page }) => {
    const ids = await garden(page, ['fire', 'water', 'plain', 'plain']);
    await row(page, 1).getByRole('button', { name: 'Add kids' }).click();
    await expect(sheet(page).locator('.sheet-title')).toHaveText('Pick kids for Plot 1');
    await expect(sheet(page).locator('.sheet-subtitle')).toHaveText('0 / 5 in this plot · 5 spaces');
    // Every kid on the map, numbered within its type.
    await expect(sheet(page).locator('.picker-row')).toHaveCount(4);
    await expect(sheet(page).locator('.picker-row').nth(3)).toContainText('Tier 1 · Kid 2');
    const add = sheet(page).locator('.picker-add');
    await expect(add).toHaveText('Select kids to add');
    await expect(add).toHaveAttribute('aria-disabled', 'true');
    for (const n of [0, 1, 2]) await sheet(page).locator('.picker-row').nth(n).click();
    // Choosing sends nothing: all four are still on the map.
    expect(await page.evaluate(() => window.__PK__!.kids().length)).toBe(4);
    const footer = sheet(page).locator('.picker-lines');
    await expect(footer).toContainText('Plot 1: 0 → 3 / 5');
    await expect(footer).toContainText('Special roll: Need 3 more → 10%');
    await expect(footer).toContainText('Rare roll: Need 3 more → 5%');
    await expect(footer).toContainText('Leaves map now. Take out before growing.');
    await expect(sheet(page).locator('.picker-helpers')).toContainText('Two separate rolls. If both hit, the sprout is the rare kid.');
    await add.click();
    // One step: the three are planted together, and the detail shows what happened.
    await expect.poll(() => page.evaluate(() => window.__PK__!.kids().map((k) => k.id))).toEqual([ids[3]]);
    expect(await page.evaluate(() => window.__PK__!.plots()[0]!.kids)).toBe(3);
    await expect(sheet(page).locator('.sheet-title')).toHaveText('Plot 1');
    await expect(sheet(page).locator('.sheet-title')).toBeFocused();
    await expect(sheet(page).locator('.sheet-subtitle')).toHaveText('3 / 5 kids · Filling');
    const note = sheet(page).locator('.plot-note');
    await expect(note).toContainText('3 kids added to Plot 1.');
    await expect(note).toContainText('Add 3–5 kids, then press Start growing.');
    expect(await page.evaluate(() => window.__PK__!.settings().plantV2Explained)).toBe(true);
    await expect(sheet(page).locator('.plot-kid')).toHaveCount(3);
    await expect(sheet(page).locator('.plot-space')).toHaveText(['Space 4 · Empty', 'Space 5 · Empty']);
    // Answered in the sheet: no world card. Sampled, not retried.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(200);
      expect(await page.locator('.feedback').textContent()).toBe('');
    }
  });

  test('the picker stops at the free spaces, and a chosen kid that leaves is unchecked, never swapped (§15.3)', async ({ page }) => {
    await garden(page, ['fire', 'plain', 'plain']);
    await plantPlain(page, 3);
    await row(page, 1).getByRole('button', { name: 'Add kids' }).click();
    await expect(sheet(page).locator('.sheet-subtitle')).toHaveText('3 / 5 in this plot · 2 spaces');
    const rows = sheet(page).locator('.picker-row');
    await rows.nth(0).click();
    await rows.nth(1).click();
    await expect(sheet(page).locator('.picker-limit')).toHaveText('All 2 spaces selected. Uncheck a kid to change your choice.');
    await expect(rows.nth(2).locator('input')).toBeDisabled();
    await expect(rows.nth(1).locator('input')).toBeEnabled();
    await expect(sheet(page).locator('.picker-add')).toHaveText('Add 2 kids');
    // Fire Kid (the first chosen) fuses away: unchecked, said once, nothing chosen instead.
    await page.evaluate(() => window.__PK__!.debugAdd!('water', 756, 2928));
    await expect(sheet(page).locator('.picker-blocked')).toContainText('The map changed. Check these kids and try Add again.');
    await expect(sheet(page).locator('.picker-add')).toHaveText('Add 1 kid');
    await expect(rows.locator('input:checked')).toHaveCount(1);
  });

  test('Start growing: disabled below 3, then a review that sends nothing, then a second press starts it (§15.4)', async ({ page }) => {
    await garden(page);
    await plantPlain(page, 2);
    await row(page, 1).getByRole('button', { name: 'Review plot' }).click();
    const start = sheet(page).locator('.plot-start');
    await expect(start).toHaveAttribute('aria-disabled', 'true');
    await expect(sheet(page).locator('.plot-start-helper')).toHaveText('Add 1 more kid to Start growing.');
    await expect(sheet(page).locator('.plot-odds')).toContainText('Special roll: Need 1 more');
    await plantPlain(page, 1);
    await expect(sheet(page).locator('.plot-start-helper')).toHaveText('You can add 2 more before starting.');
    await expect(sheet(page).locator('.plot-odds')).toContainText('Special roll: 10%');
    await start.click();
    // The review: exactly what starting does. Nothing was sent.
    await expect(sheet(page).locator('.plot-review-heading')).toHaveText('Start Plot 1 growing?');
    await expect(sheet(page).locator('.plot-review-heading')).toBeFocused();
    // D-074: kids can come back, so the review says what cancelling costs (GUI_MVP §21.3).
    await expect(sheet(page).locator('.plot-review')).toContainText('One new kid will sprout. Cancelling before it is ready returns these kids and loses the growing time.');
    await expect(sheet(page).locator('.plot-start')).toHaveText('Start growing · 3 kids');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('filling');
    await sheet(page).locator('.plot-start').click();
    await expect.poll(() => page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('growing');
    await expect(sheet(page).locator('.plot-note')).toContainText('Plot 1 is growing.');
    await expect(sheet(page).locator('.plot-note')).toContainText(`One kid sprouts in ${balance.planting.growSeconds / 60} m 00 s.`);
    await expect(sheet(page).locator('.sheet-subtitle')).toHaveText('3 / 5 kids · Growing');
    await expect(sheet(page).locator('.sheet-footer')).toHaveText('Back to plots');
    await sheet(page).locator('.sheet-footer').getByRole('button', { name: 'Back to plots' }).click();
    await expect(row(page, 1).locator('.plot-row-status')).toHaveText(/^Growing · (29:5\d|30:00)$/);
    await expect(row(page, 1).getByRole('progressbar')).toHaveAttribute('aria-label', /^Plot 1, \d+ percent grown, \d+:\d\d left$/);
    await expect(row(page, 1).getByRole('button', { name: 'View plot' })).toBeVisible();
    await expect(row(page, 1).getByRole('button', { name: 'Add kids' })).toBeHidden();
    // Answered in the sheet: no growing card once it closes. The debug adds have their own
    // cards (6 s, then 2.5 s), so watch until the queue has drained. Sampled, not retried.
    await page.keyboard.press('Escape');
    const seen = await page.evaluate(
      () =>
        new Promise<string[]>((done) => {
          const texts = new Set<string>();
          const end = performance.now() + 12000;
          const tick = () => {
            const t = document.querySelector('.feedback')?.textContent ?? '';
            if (t) texts.add(t);
            if (performance.now() > end) done([...texts]);
            else requestAnimationFrame(tick);
          };
          tick();
        }),
    );
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.filter((t) => t.includes('is growing'))).toEqual([]);
  });

  test('a review closes when the plot changes under it, and Escape steps back (§15.4)', async ({ page }) => {
    await garden(page);
    await plantPlain(page, 3);
    await row(page, 1).getByRole('button', { name: 'Review plot' }).click();
    await sheet(page).locator('.plot-start').click();
    await expect(sheet(page).locator('.plot-review')).toBeVisible();
    // A kid dragged in meanwhile.
    await plantPlain(page, 1);
    await expect(sheet(page).locator('.plot-note')).toContainText('This plot changed. Review it again before starting.');
    await expect(sheet(page).locator('.plot-review')).toHaveCount(0);
    await expect(sheet(page).locator('.plot-start')).toHaveText('Start growing');
    expect(await page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('filling');
    // Escape: the review, then the detail, then the sheet.
    await sheet(page).locator('.plot-start').click();
    await expect(sheet(page).locator('.plot-review')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet(page).locator('.plot-review')).toHaveCount(0);
    await expect(sheet(page).locator('.sheet-title')).toHaveText('Plot 1');
    await page.keyboard.press('Escape');
    await expect(sheet(page).locator('.sheet-title')).toHaveText('Garden');
    await expect(row(page, 1).locator('.plot-row-heading')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('on a short screen with a banner, every kid and Add can still be reached (Codex review, PR #72)', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 300 });
    await garden(page, ['fire', 'plain', 'water']);
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false }));
    await row(page, 1).getByRole('button', { name: 'Add kids' }).scrollIntoViewIfNeeded();
    await row(page, 1).getByRole('button', { name: 'Add kids' }).click();
    const rows = sheet(page).locator('.picker-row');
    await rows.nth(0).scrollIntoViewIfNeeded();
    await rows.nth(0).click();
    // Each row, then Add, scrolls fully into the visible sheet: nothing is out of reach.
    const visible = (sel: string, n = 0) =>
      page.evaluate(
        ([sel, n]) => {
          const el = document.querySelectorAll(sel)[n]!;
          el.scrollIntoView({ block: 'nearest' });
          const r = el.getBoundingClientRect();
          const s = document.querySelector('.sheet')!.getBoundingClientRect();
          return r.height > 0 && r.top >= s.top - 1 && r.bottom <= Math.min(s.bottom, window.innerHeight) + 1;
        },
        [sel, n] as const,
      );
    for (const n of [0, 1, 2]) expect(await visible('.picker-row', n)).toBe(true);
    expect(await visible('.picker-add')).toBe(true);
    await sheet(page).locator('.picker-add').click();
    await expect.poll(() => page.evaluate(() => window.__PK__!.plots()[0]!.kids)).toBe(1);
  });

  test("the return summary hands back the picker with its draft, and a plot's detail (Codex review, PR #72)", async ({ page }) => {
    await garden(page, ['fire', 'plain', 'water']);
    await row(page, 1).getByRole('button', { name: 'Add kids' }).click();
    const rows = sheet(page).locator('.picker-row');
    await rows.nth(0).click();
    await rows.nth(2).click();
    await sheet(page).getByLabel('Find a kid on your map').fill('kid');
    await page.evaluate(() => window.__PK__!.debugAway!(60_000));
    const summary = page.getByRole('dialog', { name: 'Welcome back' });
    await summary.getByRole('button', { name: 'Back to the garden' }).click();
    await expect(sheet(page).locator('.sheet-title')).toHaveText('Pick kids for Plot 1');
    await expect(sheet(page).locator('.picker-row input:checked')).toHaveCount(2);
    await expect(rows.nth(0).locator('input')).toBeChecked();
    await expect(rows.nth(2).locator('input')).toBeChecked();
    await expect(sheet(page).getByLabel('Find a kid on your map')).toHaveValue('kid');
    await expect(sheet(page).locator('.picker-add')).toHaveText('Add 2 kids');
    // A plot's detail comes back as itself too.
    await sheet(page).getByRole('button', { name: 'Back to plots' }).click();
    await row(page, 1).getByRole('button', { name: 'Review plot' }).click();
    await page.evaluate(() => window.__PK__!.debugAway!(60_000));
    await summary.getByRole('button', { name: 'Back to the garden' }).click();
    await expect(sheet(page).locator('.sheet-title')).toHaveText('Plot 1');
    await expect(sheet(page).locator('.plot-start')).toBeVisible();
  });

  test('leaving the picker before Add lands spends no explanation: the next add shows it (Codex review, PR #72)', async ({ page }) => {
    await garden(page, ['fire', 'plain', 'water', 'plain']);
    await row(page, 1).getByRole('button', { name: 'Add kids' }).click();
    for (const n of [0, 1, 2]) await sheet(page).locator('.picker-row').nth(n).click();
    // In one task, before the sim's next step: Add, then back to the plots.
    await page.evaluate(() => {
      const byText = (t: string) => [...document.querySelectorAll<HTMLButtonElement>('.sheet button')].find((b) => b.textContent === t)!;
      byText('Add 3 kids').click();
      byText('Back to plots').click();
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.plots()[0]!.kids)).toBe(3);
    await expect(row(page, 1).locator('.plot-row-status')).toHaveText('Filling · 3 / 5');
    expect(await page.evaluate(() => window.__PK__!.settings().plantV2Explained)).toBe(false);
    await row(page, 1).getByRole('button', { name: 'Add kids' }).click();
    await sheet(page).locator('.picker-row').nth(0).click();
    await sheet(page).locator('.picker-add').click();
    await expect(sheet(page).locator('.plot-note')).toContainText('Add 3–5 kids, then press Start growing.');
    expect(await page.evaluate(() => window.__PK__!.settings().plantV2Explained)).toBe(true);
  });

  test('a focused checkbox keeps its focus when another kid arrives (Codex review, PR #72)', async ({ page }) => {
    await garden(page, ['fire', 'plain']);
    await row(page, 1).getByRole('button', { name: 'Add kids' }).click();
    const box = sheet(page).locator('.picker-row').nth(1).locator('input');
    await box.focus();
    await page.evaluate(() => window.__PK__!.debugAdd!('water', 1856, 4128));
    await expect(sheet(page).locator('.picker-row')).toHaveCount(3);
    await expect(box).toBeFocused();
    await page.keyboard.press('Space');
    await expect(box).toBeChecked();
  });

  test('a happy kid counts one tier higher in every preview: the picker, the plot and its review (Codex review, FEED-NAME)', async ({ page }) => {
    // Three Chef Kids (T2) in Plot 1; a fourth, fed, waits on the map.
    const [chef] = await garden(page, ['chef']);
    await page.evaluate(() => {
      const pk = window.__PK__!;
      pk.debugGive!({ materials: 1000 });
      pk.debugCommand!({ type: 'plant', kidIds: [0, 1, 2].map((i) => pk.debugAdd!('chef', 1856 + i * 200, 4428)), plot: 0 });
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.plots()[0]!.kids)).toBe(3);
    await page.evaluate((id) => { window.__PK__!.debugGive!({ pantry: { apple: 1 } }); window.__PK__!.debugCommand!({ type: 'feed', kidId: id, food: 'apple' }); }, chef!);
    await row(page, 1).getByRole('button', { name: 'Add kids' }).click();
    await sheet(page).locator('.picker-row').nth(0).click();
    // 3 × T2 + one happy T2: mean tier 2.25 → 12.92 % / 6.46 % (§15.3), not 12.5 % / 6.25 %.
    await expect(sheet(page).locator('.picker-lines')).toContainText('Special roll: 10% → 12.92%');
    await expect(sheet(page).locator('.picker-lines')).toContainText('Rare roll: 5% → 6.46%');
    await sheet(page).locator('.picker-add').click();
    await expect(sheet(page).locator('.plot-odds')).toContainText('Special roll: 12.92%');
    await sheet(page).locator('.plot-start').click();
    await expect(sheet(page).locator('.plot-review')).toContainText('Special roll: 12.92%');
  });

  test('a named kid shows its name and type in the picker, is found by its name, and follows a rename (Codex review, FEED-NAME)', async ({ page }) => {
    const [fireKid] = await garden(page, ['fire', 'fire']);
    await page.evaluate((id) => {
      window.__PK__!.debugGive!({ materials: 1000 });
      window.__PK__!.debugCommand!({ type: 'name', kidId: id, name: 'Sir Spud' });
    }, fireKid!);
    await row(page, 1).getByRole('button', { name: 'Add kids' }).click();
    const first = sheet(page).locator('.picker-row').nth(0);
    await expect(first.locator('.picker-row-name')).toHaveText('Sir Spud');
    await expect(first.locator('.picker-row-type')).toHaveText('Fire Kid');
    await sheet(page).getByLabel('Find a kid on your map').fill('spud');
    await expect(sheet(page).locator('.picker-row:visible')).toHaveCount(1);
    await page.evaluate((id) => window.__PK__!.debugCommand!({ type: 'name', kidId: id, name: 'Lady Mash' }), fireKid!);
    await expect(first.locator('.picker-row-name')).toHaveText('Lady Mash');
    await sheet(page).getByLabel('Find a kid on your map').fill('mash');
    await expect(sheet(page).locator('.picker-row:visible')).toHaveCount(1);
  });

  test('the picker says which kids are happy, live; an accepted happy kid stays counted a tier higher (Codex review round 9, FEED-NAME)', async ({ page }) => {
    const [a] = await garden(page, ['chef', 'chef']);
    await page.evaluate(() => window.__PK__!.debugGive!({ materials: 1000 }));
    await row(page, 1).getByRole('button', { name: 'Add kids' }).click();
    const first = sheet(page).locator('.picker-row').nth(0);
    await expect(first.locator('.picker-row-detail')).toHaveText('Tier 2 · Kid 1');
    // Fed while the picker is open: the row says so at once.
    await page.evaluate((id) => { window.__PK__!.debugGive!({ pantry: { apple: 1 } }); window.__PK__!.debugCommand!({ type: 'feed', kidId: id, food: 'apple' }); }, a!);
    await expect(first.locator('.picker-row-detail')).toHaveText('Tier 2 · Happy · Counts as Tier 3 · Kid 1');
    await expect(sheet(page).locator('.picker-row').nth(1).locator('.picker-row-detail')).toHaveText('Tier 2 · Kid 2');
    await first.click();
    await sheet(page).locator('.picker-add').click();
    await expect(sheet(page).locator('.plot-kid')).toContainText('Tier 2 · Counted as Tier 3 when added');
  });

  test('a full plot sparkles beside Start growing and takes no more kids (§15.4)', async ({ page }) => {
    await garden(page);
    await plantPlain(page, 5);
    await expect(row(page, 1).getByRole('button', { name: 'Add kids' })).toHaveAttribute('aria-disabled', 'true');
    await row(page, 1).getByRole('button', { name: 'Review plot' }).click();
    await expect(sheet(page).locator('.plot-start-helper')).toHaveText('Full plot · 5 / 5');
    await expect(sheet(page).locator('.plot-start .plot-sparkle')).toBeVisible();
    await expect(sheet(page).getByRole('button', { name: 'Add kids' })).toHaveCount(0);
  });

  test('a plot that ripens while away waits for a tap, and the return summary says so; one with no planting has no such row (§15.5, D-088)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugAway!(60_000));
    const summary = page.getByRole('dialog', { name: 'Welcome back' });
    await expect(summary).toBeVisible();
    await expect(summary.locator('.offline-plots')).toHaveCount(0);
    await summary.getByRole('button', { name: 'Back to the garden' }).click();
    await plantPlain(page, 3);
    await page.evaluate(() => window.__PK__!.debugCommand!({ type: 'startGrowing', plot: 0 }));
    await expect.poll(() => page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('growing');
    await page.evaluate((s) => window.__PK__!.debugAway!((s + 60) * 1000), balance.planting.growSeconds);
    await expect(summary).toBeVisible();
    const report = (await page.evaluate(() => window.__PK__!.lastOffline()))!;
    expect(report.plotsWaiting).toBe(1);
    await expect(summary).not.toContainText('Kids sprouted');
    await expect(summary.locator('.offline-plots')).toHaveText('1 plot is ready to sprout.');
    expect(await page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('ready');
  });
});
