import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

test.describe('Rare kids on the map (D-072, GUI_MVP §16.2, §15.5)', () => {
  // The rare kids' art and content come with WILD-ART: until then Hero and Lantern stand in.
  const RARE = '?seed=3&debug=1&calm=1&rare=hero,lantern';

  /** Two rare Hero Kids and an ordinary Fire Kid, spaced apart, in view. Returns their ids (ordinary last). */
  async function rares(page: Page): Promise<number[]> {
    await boot(page, RARE);
    const ids = await page.evaluate(() => {
      const pk = window.__PK__!;
      const out = [pk.debugAdd!('hero', 1016, 2978, { body: 'round', scale: 1 }), pk.debugAdd!('hero', 1246, 2978, { body: 'round', scale: 1 })];
      out.push(pk.debugAdd!('fire', 1476, 2978, { body: 'round', scale: 1 }));
      pk.centerOn(1256, 3028);
      return out;
    });
    await page.waitForTimeout(300);
    return ids;
  }

  test('every rare kid shows the sleeve, and no mark; an ordinary kid shows neither', async ({ page }) => {
    const ids = await rares(page);
    const shown = await page.evaluate(() => window.__PK__!.rares());
    expect(shown.map((r) => r.id).sort((a, b) => a - b)).toEqual(ids.slice(0, 2).sort((a, b) => a - b));
    for (const r of shown) {
      expect(r.sleeve).toBe(true);
      expect(r.sleeveAlpha).toBeGreaterThanOrEqual(0.8 - 1e-9);
      expect(r.sleeveAlpha).toBeLessThanOrEqual(1);
    }
  });

  test('a rare that sprouts live bursts, then settles into its idle sleeve (§15.5)', async ({ page }) => {
    await boot(page, RARE);
    const before = await page.evaluate(() => window.__PK__!.kids().map((k) => k.id));
    // Per frame from the sprout's step: the newborn's sleeve opacity and scale.
    const log = await page.evaluate(
      (old) =>
        new Promise<[number, number][]>((done) => {
          const pk = window.__PK__!;
          pk.debugReadySeed!(0, 'hero');
          const out: [number, number][] = [];
          const end = performance.now() + 1200;
          const frame = () => {
            const r = pk.rares().find((x) => !old.includes(x.id));
            if (r) out.push([r.sleeveAlpha, r.sleeveScale]);
            if (performance.now() < end) requestAnimationFrame(frame);
            else done(out);
          };
          requestAnimationFrame(frame);
        }),
      before,
    );
    expect(log.length).toBeGreaterThan(5);
    // It burst: faded well below the idle floor while growing past its idle size...
    const faded = log.filter(([a]) => a < 0.5);
    expect(faded.length).toBeGreaterThan(0);
    const settled = log[log.length - 1]!;
    expect(Math.max(...faded.map(([, s]) => s))).toBeGreaterThan(settled[1] * 1.05);
    // ...then settled into the idle pulse, at idle size.
    expect(settled[0]).toBeGreaterThanOrEqual(0.8 - 1e-9);
  });

  test('a rare kid is marked Rare in the picker, its card and the Dex has no variant rows', async ({ page }) => {
    await boot(page, RARE);
    await page.evaluate(() => {
      window.__PK__!.debugAdd!('hero', 1056, 3128);
      window.__PK__!.debugAdd!('fire', 1356, 3128);
    });
    await page.locator('[data-nav=garden]').click();
    await page.getByRole('button', { name: 'Add kids' }).first().click();
    const rows = page.getByRole('dialog').locator('.picker-row');
    await expect(rows.filter({ hasText: 'Hero' })).toContainText('Rare');
    await expect(rows.filter({ hasText: 'Fire' })).not.toContainText('Rare');
    // No variant marks anywhere, and no sleeve in a list portrait.
    await expect(rows.locator('[data-asset^="fx_variant"]')).toHaveCount(0);
    await expect(rows.locator('[data-asset="fx_rare_sparkle"]')).toHaveCount(0);
    // Back out of the picker, then the Garden sheet.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.locator('[data-nav=dex]').click();
    const dex = page.getByRole('dialog', { name: 'Potato-Dex' });
    await dex.getByRole('button', { name: 'Rares', exact: true }).click();
    await dex.locator('[data-kid="hero"]').click();
    await expect(dex.locator('.dex-detail-name')).toHaveText(/Hero/);
    await expect(dex.getByText('Rare variants')).toHaveCount(0);
  });

  test('a rare kind new to the Dex meets the player as New!; the next one from the plot as From your plot (§15.5, D-087, D-088)', async ({ page }) => {
    await boot(page, `${RARE}&arrivals=1`);
    await page.evaluate(() => window.__PK__!.debugReadySeed!(0, 'hero'));
    const popup = page.getByRole('dialog');
    await expect(popup.locator('.arrival-status')).toHaveText('New!');
    await expect(popup.locator('.arrival-sentence')).toContainText('Hero Kid');
    await expect(popup.locator('.arrival-category')).toHaveText('Rare');
    expect((await page.evaluate(() => window.__PK__!.arrival()))!.source).toBe('plot');
    await popup.getByRole('button', { name: 'Continue' }).click();
    await expect(popup).toHaveCount(0);
    await page.evaluate(() => window.__PK__!.debugReadySeed!(0, 'hero'));
    await expect(popup.locator('.arrival-status')).toHaveText('From your plot');
    await expect(popup.locator('.arrival-category')).toHaveText('Rare');
    expect((await page.evaluate(() => window.__PK__!.arrival()))!.isNew).toBe(false);
  });

  test("a press just outside a small kid's body, within 44 CSS px, picks it up (§16.1, any kid; Codex review, PR #77)", async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    const id = await page.evaluate(() => {
      window.__PK__!.centerOn(1256, 3228);
      // Smaller than any rolled look (test only), so the target reaches well past its sprites.
      return window.__PK__!.debugAdd!('fire', 1256, 3228, { scale: 0.36 });
    });
    await page.waitForTimeout(200);
    const at = await page.evaluate((i) => {
      const pk = window.__PK__!;
      const k = pk.kids().find((c) => c.id === i)!;
      const a = pk.worldToScreen(k.x + k.box.left, k.y + k.box.top);
      const b = pk.worldToScreen(k.x + k.box.right, k.y + k.box.bottom);
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, w: b.x - a.x, h: b.y - a.y, kx: k.x };
    }, id);
    // Small on screen: its drawn box is well under 44 px wide.
    expect(at.w).toBeLessThan(30);
    // Right of its box, inside the 44 px target: press, drag 100 px, release.
    const x = at.x + at.w / 2 + (22 - at.w / 2) / 2;
    expect(x).toBeGreaterThan(at.x + at.w / 2);
    await page.mouse.move(x, at.y);
    await page.mouse.down();
    await page.mouse.move(x + 100, at.y, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate((i) => window.__PK__!.kids().find((c) => c.id === i)!.x, id)).toBeGreaterThan(at.kx + 40);
  });

  test('a rare whose costume is still loading bursts once it appears (Codex review, PR #77)', async ({ page }) => {
    await boot(page, RARE);
    const type = 'hero';
    expect(await page.evaluate((t) => window.__PK__!.debugLoadedCostumes!().includes(t), type)).toBe(false);
    const before = await page.evaluate(() => window.__PK__!.kids().map((k) => k.id));
    const log = await page.evaluate(
      ([old, t]) =>
        new Promise<number[]>((done) => {
          const pk = window.__PK__!;
          pk.debugReadySeed!(0, t);
          const out: number[] = [];
          const end = performance.now() + 3000;
          const frame = () => {
            const r = pk.rares().find((x) => !old.includes(x.id));
            if (r) out.push(r.sleeveAlpha);
            if (performance.now() < end) requestAnimationFrame(frame);
            else done(out);
          };
          requestAnimationFrame(frame);
        }),
      [before, type] as const,
    );
    // Drawn only once its costume arrived, and it burst then: faded well below the idle floor.
    expect(log.length).toBeGreaterThan(5);
    expect(log.filter((a) => a < 0.5).length).toBeGreaterThan(0);
  });

  test('on the map the sleeve moves in its small loop (D-095); turning reduced motion on stills it at once (Codex review, PR #77)', async ({ page }) => {
    const ids = await rares(page);
    const sleeve = () => page.evaluate((id) => window.__PK__!.rares().find((r) => r.id === id)!, ids[0]!);
    // Moving (D-094): within a cycle it dims, and it tilts both ways.
    const seen: { a: number; r: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const s = await sleeve();
      seen.push({ a: s.sleeveAlpha, r: s.sleeveRotation });
      await page.waitForTimeout(200);
    }
    expect(Math.min(...seen.map((s) => s.a))).toBeLessThan(0.99);
    expect(Math.min(...seen.map((s) => s.r))).toBeLessThan(-0.01);
    expect(Math.max(...seen.map((s) => s.r))).toBeGreaterThan(0.01);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(100);
    for (let i = 0; i < 12; i++) {
      const s = await sleeve();
      expect(s.sleeveAlpha).toBe(1);
      expect(s.sleeveRotation).toBe(0);
      await page.waitForTimeout(200);
    }
  });

  test('reduced motion: the sleeve holds still at full opacity, and a newborn rare never bursts', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await boot(page, RARE);
    const before = await page.evaluate(() => window.__PK__!.kids().map((k) => k.id));
    const alphas = await page.evaluate(
      (old) =>
        new Promise<number[]>((done) => {
          const pk = window.__PK__!;
          pk.debugReadySeed!(0, 'hero');
          const out: number[] = [];
          const end = performance.now() + 800;
          const frame = () => {
            const r = pk.rares().find((x) => !old.includes(x.id));
            if (r) out.push(r.sleeveAlpha);
            if (performance.now() < end) requestAnimationFrame(frame);
            else done(out);
          };
          requestAnimationFrame(frame);
        }),
      before,
    );
    expect(alphas.length).toBeGreaterThan(5);
    expect(new Set(alphas)).toEqual(new Set([1]));
  });
});
