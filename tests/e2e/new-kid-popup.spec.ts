import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

test.describe('the new-kid popup (D-087, GUI_MVP §27.4-27.5)', () => {
  const popup = (page: Page) => page.getByRole('dialog');
  /** Plain and Water touching: they fuse into Firefighter Kid, new to the Dex. */
  async function fuseNew(page: Page, query = '?seed=3&debug=1&calm=1&arrivals=1'): Promise<void> {
    await boot(page, query);
    await page.evaluate(() => {
      const pk = window.__PK__!;
      pk.centerOn(1256, 3228);
      pk.debugAdd!('plain', 1236, 3228);
      pk.debugAdd!('water', 1276, 3228);
    });
    await expect(popup(page).locator('.arrival-sentence')).toContainText('Firefighter Kid');
  }

  test('a new kind from a fusion: New!, its line, tier and award; the sprite waves; Continue closes it and no card follows', async ({ page }) => {
    await fuseNew(page);
    const p = popup(page);
    await expect(p).toHaveAttribute('aria-modal', 'true');
    await expect(p.locator('.arrival-status')).toHaveText('New!');
    const shown = (await page.evaluate(() => window.__PK__!.arrival()))!;
    expect(shown.source).toBe('fusion');
    expect(shown.isNew).toBe(true);
    await expect(p.locator('.arrival-category')).toHaveText('Tier 2');
    await expect(p.locator('.arrival-award')).toContainText('Potatoken');
    // Focus on the line; the world is paused behind it.
    await expect(p.locator('.arrival-sentence')).toBeFocused();
    expect(await page.locator('.top-stack').evaluate((e) => (e as HTMLElement).inert)).toBe(true);
    // The wave plays: a wave frame, seen in the page every frame (the greeting repeats every
    // 3 s, so CI's slow round trips can't miss it).
    const waved = await page.evaluate(
      () =>
        new Promise<boolean>((done) => {
          const until = performance.now() + 4000;
          const tick = () => {
            if (/wave/.test(window.__PK__!.arrival()?.body ?? '')) return done(true);
            if (performance.now() > until) return done(false);
            requestAnimationFrame(tick);
          };
          tick();
        }),
    );
    expect(waved).toBe(true);
    await p.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(p).toHaveCount(0);
    await page.waitForTimeout(500);
    await expect(page.locator('.feedback')).not.toContainText('New');
    expect(await page.locator('.top-stack').evaluate((e) => (e as HTMLElement).inert)).toBe(false);
  });

  test('it greets again while it stays open, and Escape acknowledges it', async ({ page }) => {
    await fuseNew(page);
    // Every frame for 4 s: the wave, 2.5 s still, then the wave again.
    const log = await page.evaluate(
      () =>
        new Promise<{ t: number; wave: boolean }[]>((done) => {
          const out: { t: number; wave: boolean }[] = [];
          const t0 = performance.now();
          const frame = () => {
            const t = performance.now() - t0;
            out.push({ t, wave: /wave/.test(window.__PK__!.arrival()?.body ?? '') });
            if (t < 4000) requestAnimationFrame(frame);
            else done(out);
          };
          requestAnimationFrame(frame);
        }),
    );
    // Waving at some frames, standing at others, and waving again after a long still spell.
    const waves = log.filter((f) => f.wave).map((f) => f.t);
    expect(waves.length).toBeGreaterThan(0);
    const gaps = waves.slice(1).map((t, i) => t - waves[i]!);
    expect(Math.max(...gaps)).toBeGreaterThan(2000);
    await page.keyboard.press('Escape');
    await expect(popup(page)).toHaveCount(0);
  });

  test('reduced motion: it stands still, no wave', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await fuseNew(page);
    for (let i = 0; i < 8; i++) {
      expect(await page.evaluate(() => window.__PK__!.arrival()!.body)).toMatch(/stand/);
      await page.waitForTimeout(150);
    }
  });

  test('an arrival not yet acknowledged comes back after a reload, with the same line', async ({ page }) => {
    await fuseNew(page);
    const before = (await page.evaluate(() => window.__PK__!.arrival()))!.sentence;
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForFunction(() => window.__PK__?.ready === true);
    await expect(popup(page).locator('.arrival-sentence')).toHaveText(before);
    await popup(page).getByRole('button', { name: 'Continue', exact: true }).click();
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForFunction(() => window.__PK__?.ready === true);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__PK__!.arrival())).toBeNull();
  });

  test("Android's Back acknowledges the popup up, and only it (Codex review, #117)", async ({ page }) => {
    await fuseNew(page);
    expect(await page.evaluate(() => window.__PK__!.debugBack!())).toBe(true);
    await expect(popup(page)).toHaveCount(0);
    // Nothing else open: Back is the app's again.
    expect(await page.evaluate(() => window.__PK__!.debugBack!())).toBe(false);
  });

  test('a short screen too narrow for the compact panel gets the single column, without sideways overflow; a rotation lays it out again with its line (Codex review, #117)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 480 });
    await fuseNew(page);
    const a = (await page.evaluate(() => window.__PK__!.arrival()))!;
    expect(a.layout).toBe('fallback');
    expect(await popup(page).evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    await page.setViewportSize({ width: 640, height: 360 });
    await expect.poll(async () => (await page.evaluate(() => window.__PK__!.arrival()))!.layout).toBe('compact');
    expect((await page.evaluate(() => window.__PK__!.arrival()))!.sentence).toBe(a.sentence);
    expect(await popup(page).evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
  });

  test('a kind found mid-pan waits for the finger to lift (Codex review, #117)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1&arrivals=1');
    await page.evaluate(() => window.__PK__!.centerOn(1256, 3228));
    const at = await page.evaluate(() => window.__PK__!.worldToScreen(1256, 3428));
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + 30, at.y - 20, { steps: 6 });
    await page.evaluate(() => {
      const pk = window.__PK__!;
      pk.debugAdd!('plain', 1236, 3228);
      pk.debugAdd!('water', 1276, 3228);
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.debugKnown!().includes('firefighter'))).toBe(true);
    await page.waitForTimeout(400);
    await expect(popup(page)).toHaveCount(0);
    // Still panning: the map follows the finger.
    const before = await page.evaluate(() => window.__PK__!.worldToScreen(1256, 3228));
    await page.mouse.move(at.x + 60, at.y - 40, { steps: 6 });
    const after = await page.evaluate(() => window.__PK__!.worldToScreen(1256, 3228));
    expect(after.x - before.x).toBeGreaterThan(20);
    await page.mouse.up();
    await expect(popup(page).locator('.arrival-sentence')).toContainText('Firefighter Kid');
  });

  test('a motion preference changed while it is up applies at once (Codex review, #117)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await fuseNew(page);
    await page.waitForTimeout(600);
    expect((await page.evaluate(() => window.__PK__!.arrival()))!.body).toMatch(/stand/);
    // Allowed again: after a full rest, it waves.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect.poll(() => page.evaluate(() => window.__PK__!.arrival()!.body), { timeout: 5000, intervals: [50] }).toMatch(/wave/);
    // Reduced mid-wave: it stands at once.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(100);
    expect((await page.evaluate(() => window.__PK__!.arrival()))!.body).toMatch(/stand/);
  });

  test('after the last of several popups from the map, focus goes to the Garden (Codex review, #117)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1&arrivals=1');
    // Two new kinds in one step.
    await page.evaluate(() => {
      const pk = window.__PK__!;
      pk.centerOn(1256, 3228);
      pk.debugAdd!('plain', 1236, 3228);
      pk.debugAdd!('water', 1276, 3228);
      pk.debugAdd!('fire', 1536, 3228);
      pk.debugAdd!('water', 1576, 3228);
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.arrival()?.waiting ?? 0)).toBe(2);
    await popup(page).getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(popup(page).locator('.arrival-sentence')).toBeFocused();
    await popup(page).getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(popup(page)).toHaveCount(0);
    await expect(page.locator('[data-nav=garden]')).toBeFocused();
  });

  test('a return summary still waiting is kept with the game: after a reload it follows its popups (Codex review, #117)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1&arrivals=1');
    await page.evaluate(() => window.__PK__!.debugAway!(6 * 3600 * 1000));
    await expect(popup(page).locator('.arrival-status')).toHaveText('New!');
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForFunction(() => window.__PK__?.ready === true);
    for (;;) {
      if (!(await page.evaluate(() => window.__PK__!.arrival()))) break;
      await popup(page).getByRole('button', { name: 'Continue', exact: true }).click();
      await page.waitForTimeout(150);
    }
    await expect(page.getByRole('dialog', { name: 'Welcome back' })).toBeVisible();
  });

  test('two returns before the first is seen: both summaries, oldest first (Codex review, #117)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1&arrivals=1');
    await page.evaluate(() => window.__PK__!.debugAway!(6 * 3600 * 1000));
    await expect(popup(page).locator('.arrival-status')).toHaveText('New!');
    await page.evaluate(() => window.__PK__!.debugAway!(2 * 3600 * 1000));
    for (;;) {
      if (!(await page.evaluate(() => window.__PK__!.arrival()))) break;
      await popup(page).getByRole('button', { name: 'Continue', exact: true }).click();
      await page.waitForTimeout(150);
    }
    const summary = page.getByRole('dialog', { name: 'Welcome back' });
    await expect(summary).toContainText('6 h');
    await summary.getByRole('button', { name: 'Back to the garden' }).click();
    await expect(summary).toContainText('2 h');
    await summary.getByRole('button', { name: 'Back to the garden' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('the first-run tutorial waits for a popup restored at start (Codex review, #117)', async ({ page }) => {
    await fuseNew(page);
    await page.waitForTimeout(300);
    await page.goto('/?seed=3&debug=1&calm=1&arrivals=1&tutorial=1');
    await page.waitForFunction(() => window.__PK__?.ready === true);
    await expect(popup(page).locator('.arrival-sentence')).toContainText('Firefighter Kid');
    await page.waitForTimeout(500);
    await expect(page.locator('#tutorial-card')).toBeHidden();
    await popup(page).getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.locator('#tutorial-card')).toBeVisible();
  });

  test('an unanswered recovery warning comes first; a save banner stays usable above a popup (Codex review, #117)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1&arrivals=1');
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: false, recovery: true, readOnly: false }));
    await page.evaluate(() => {
      const pk = window.__PK__!;
      pk.centerOn(1256, 3228);
      pk.debugAdd!('plain', 1236, 3228);
      pk.debugAdd!('water', 1276, 3228);
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.debugKnown!().includes('firefighter'))).toBe(true);
    await page.waitForTimeout(400);
    await expect(page.locator('.arrival')).toHaveCount(0);
    await page.locator('.banner').getByRole('button').first().click();
    await expect(page.locator('.arrival')).toHaveCount(1);
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false }));
    await expect(page.locator('.banner')).toBeVisible();
    expect(await page.locator('.banners').evaluate((e) => (e as HTMLElement).inert)).toBe(false);
  });

  /** A crash from here on: the saves land nowhere, then the app starts again (Codex review round 2, #117). */
  async function crashAndRestart(page: Page, query = '?seed=3&debug=1&calm=1&arrivals=1'): Promise<void> {
    // Let any save under way land first.
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {};
    });
    await page.goto('/' + query);
    await page.waitForFunction(() => window.__PK__?.ready === true);
  }

  test('a new kind found by fusion is saved with its popup: a crash right after still shows it (Codex review round 2, #117)', async ({ page }) => {
    await fuseNew(page);
    await crashAndRestart(page);
    await expect(popup(page).locator('.arrival-sentence')).toContainText('Firefighter Kid');
  });

  test('a popup or summary acknowledged is saved so: after a crash it does not come back (Codex review round 2, #117)', async ({ page }) => {
    await fuseNew(page);
    await popup(page).getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(popup(page)).toHaveCount(0);
    await crashAndRestart(page);
    await page.waitForTimeout(500);
    await expect(popup(page)).toHaveCount(0);
    // A return summary, likewise.
    await page.evaluate(() => window.__PK__!.debugAway!(2 * 3600 * 1000));
    for (;;) {
      await page.waitForTimeout(150);
      if (!(await page.evaluate(() => window.__PK__!.arrival()))) break;
      await popup(page).getByRole('button', { name: 'Continue', exact: true }).click();
    }
    const summary = page.getByRole('dialog', { name: 'Welcome back' });
    await summary.getByRole('button', { name: 'Back to the garden' }).click();
    await expect(summary).toHaveCount(0);
    await crashAndRestart(page);
    await page.waitForTimeout(500);
    await expect(page.getByRole('dialog', { name: 'Welcome back' })).toHaveCount(0);
  });

  test('a kind found while the tutorial is up: the tutorial steps aside for its popup and comes back at its step (Codex review round 2, #117)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1&arrivals=1&tutorial=1');
    const card = page.locator('#tutorial-card');
    await card.getByRole('button', { name: 'Next' }).click();
    await expect(card.locator('.tutorial-step')).toHaveText('Welcome · 2 of 3');
    await page.evaluate(() => {
      const pk = window.__PK__!;
      pk.centerOn(1256, 3228);
      pk.debugAdd!('plain', 1236, 3228);
      pk.debugAdd!('water', 1276, 3228);
    });
    await expect(popup(page).locator('.arrival-sentence')).toContainText('Firefighter Kid');
    await expect(card).toBeHidden();
    await popup(page).getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(card).toBeVisible();
    await expect(card.locator('.tutorial-step')).toHaveText('Welcome · 2 of 3');
  });

  test('the panel keeps inside the safe-area insets, and picks its layout from the width between them (Codex review round 3, #117)', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 360 });
    await boot(page, '?seed=3&debug=1&calm=1&arrivals=1');
    // A landscape cutout on each side: 520 px left between them, still compact.
    await page.addStyleTag({ content: ':root { --ui-ml: 60px !important; --ui-mr: 60px !important; }' });
    await page.evaluate(() => {
      const pk = window.__PK__!;
      pk.centerOn(1256, 3228);
      pk.debugAdd!('plain', 1236, 3228);
      pk.debugAdd!('water', 1276, 3228);
    });
    await expect(popup(page).locator('.arrival-sentence')).toContainText('Firefighter Kid');
    expect((await page.evaluate(() => window.__PK__!.arrival()))!.layout).toBe('compact');
    let box = (await popup(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(60 - 0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(640 - 60 + 0.5);
    // Wider cutouts: too narrow for the compact panel, so the single column, still inside.
    await page.addStyleTag({ content: ':root { --ui-ml: 90px !important; --ui-mr: 90px !important; }' });
    await page.setViewportSize({ width: 641, height: 360 });
    await expect.poll(async () => (await page.evaluate(() => window.__PK__!.arrival()))!.layout).toBe('fallback');
    box = (await popup(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(90 - 0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(641 - 90 + 0.5);
  });

  test("a Rare's popup portrait moves in its sleeve, also after a rotation (Codex review round 3, #117)", async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1&arrivals=1&rare=hero,lantern');
    await page.evaluate(() => window.__PK__!.debugReadySeed!(0, 'hero'));
    await page.evaluate(() => window.__PK__!.debugCommand!({ type: 'harvest', plot: 0 }));
    await expect(popup(page).locator('.arrival-sentence')).toContainText('Hero');
    await expect(popup(page).locator('.arrival-sprite .portrait-sleeve')).toHaveCount(1);
    await page.setViewportSize({ width: 640, height: 360 });
    await expect.poll(async () => (await page.evaluate(() => window.__PK__!.arrival()))!.layout).toBe('compact');
    await expect(popup(page).locator('.arrival-sprite .portrait-sleeve')).toHaveCount(1);
  });

  test("the popup draws the newborn's own saved scale, carried from its birth (Codex review round 3, #117)", async ({ page }) => {
    await fuseNew(page);
    const kid = await page.evaluate(() => window.__PK__!.kids().find((k) => k.type === 'firefighter')!);
    expect((await page.evaluate(() => window.__PK__!.arrival()))!.savedScale).toBe(kid.look.scale);
    await popup(page).getByRole('button', { name: 'Continue', exact: true }).click();
    // A small kid is drawn small; a large one as large as fits, uncropped.
    await page.evaluate(() => window.__PK__!.debugMeet!('plain', { body: 'round', face: 'classic', scale: 0.9 }));
    await expect.poll(async () => (await page.evaluate(() => window.__PK__!.arrival()))?.scale).toBeCloseTo(0.9, 3);
    await popup(page).getByRole('button', { name: 'Continue', exact: true }).click();
    await page.evaluate(() => window.__PK__!.debugMeet!('plain', { body: 'round', face: 'classic', scale: 1.1 }));
    await expect.poll(async () => (await page.evaluate(() => window.__PK__!.arrival()))?.scale ?? 0).toBeGreaterThan(1);
    expect((await page.evaluate(() => window.__PK__!.arrival()))!.scale).toBeLessThanOrEqual(1.1);
  });

  test('a rotation mid-greeting lets the wave go on (Codex review round 3, #117)', async ({ page }) => {
    await fuseNew(page);
    // All in the page (CI stretches round trips): as a greeting begins, the popup is laid out
    // again as compact; a frame later it is the same wave, further on.
    const r = await page.evaluate(
      () =>
        new Promise<{ before: number; after: number | null; layout: string; body: string } | null>((done) => {
          const until = performance.now() + 4000;
          const tick = () => {
            const a = window.__PK__!.arrival()!;
            if (a.clipTime !== null && a.clipTime < 0.25 && a.layout === 'portrait') {
              const before = a.clipTime;
              window.__PK__!.debugArrivalLayout!('compact', 192);
              requestAnimationFrame(() => {
                const b = window.__PK__!.arrival()!;
                done({ before, after: b.clipTime, layout: b.layout, body: b.body });
              });
              return;
            }
            if (performance.now() > until) return done(null);
            requestAnimationFrame(tick);
          };
          tick();
        }),
    );
    expect(r).not.toBeNull();
    expect(r!.layout).toBe('compact');
    expect(r!.after).not.toBeNull();
    expect(r!.after!).toBeGreaterThan(r!.before);
    expect(r!.body).toMatch(/wave/);
  });

  test("a Rare's whole sleeve fits its slot in the portrait panel: no sideways scroll, nothing clipped (Codex review round 4, #117)", async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1&arrivals=1');
    await page.evaluate(() => window.__PK__!.debugMeet!('rainbow', { body: 'round', face: 'classic' }));
    await expect(popup(page).locator('.arrival-sprite .portrait-sleeve')).toHaveCount(1);
    expect((await page.evaluate(() => window.__PK__!.arrival()))!.layout).toBe('portrait');
    expect(await popup(page).evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    // The sleeve's reserved box lies inside the panel.
    const wrap = (await popup(page).locator('.arrival-sprite .portrait-wrap').evaluate((e) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return { left: r.left - parseFloat(cs.marginLeft), right: r.right + parseFloat(cs.marginRight) };
    }))!;
    const panel = (await popup(page).boundingBox())!;
    expect(wrap.left).toBeGreaterThanOrEqual(panel.x - 0.5);
    expect(wrap.right).toBeLessThanOrEqual(panel.x + panel.width + 0.5);
  });

  test('a short screen with a save banner gets the 224 px compact panel, and a banner appearing lays it out again (Codex review round 4, #117)', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 320 });
    await boot(page, '?seed=3&debug=1&calm=1&arrivals=1');
    await page.evaluate(() => window.__PK__!.debugMeet!('plain', { body: 'round', face: 'classic' }));
    await expect.poll(async () => (await page.evaluate(() => window.__PK__!.arrival()))?.layout).toBe('compact');
    expect((await page.evaluate(() => window.__PK__!.arrival()))!.sprite).toBe(192);
    // An unsaved-progress banner takes its height: the smaller compact panel, Continue in view.
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false }));
    await expect.poll(async () => (await page.evaluate(() => window.__PK__!.arrival()))!.sprite).toBe(128);
    await expect(popup(page).getByRole('button', { name: 'Continue', exact: true })).toBeInViewport({ ratio: 1 });
    const panel = (await popup(page).boundingBox())!;
    const banner = (await page.locator('.banners').boundingBox())!;
    expect(panel.y).toBeGreaterThanOrEqual(banner.y + banner.height - 0.5);
  });

  test('a recovery notice hidden behind the unsaved warning holds no popup back (Codex review round 5, #117)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1&arrivals=1');
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: true, readOnly: false }));
    await page.evaluate(() => {
      const pk = window.__PK__!;
      pk.centerOn(1256, 3228);
      pk.debugAdd!('plain', 1236, 3228);
      pk.debugAdd!('water', 1276, 3228);
    });
    await expect(popup(page).locator('.arrival-sentence')).toContainText('Firefighter Kid');
  });

  test('a very narrow portrait screen gets the single column, its kid inside the panel (Codex review round 5, #117)', async ({ page }) => {
    await page.setViewportSize({ width: 200, height: 700 });
    await fuseNew(page);
    const a = (await page.evaluate(() => window.__PK__!.arrival()))!;
    expect(a.layout).toBe('fallback');
    expect(await popup(page).evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    const art = (await popup(page).locator('.arrival-sprite .portrait').first().boundingBox())!;
    const panel = (await popup(page).boundingBox())!;
    expect(art.x).toBeGreaterThanOrEqual(panel.x - 0.5);
    expect(art.x + art.width).toBeLessThanOrEqual(panel.x + panel.width + 0.5);
  });

  test('back from hidden, the greeting goes on where it was (Codex review round 5, #117)', async ({ page }) => {
    await fuseNew(page);
    // All in the page: the greeting's time, then hidden with no frames for 400 ms (the main
    // thread held), back, and one frame on. It moves by that frame, not by the gap.
    const { before, after, frame } = await page.evaluate(async () => {
      const at = () => window.__PK__!.arrival()!.clipTime;
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const before = at();
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      const until = performance.now() + 400;
      while (performance.now() < until);
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
      const t = performance.now();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      return { before, after: at(), frame: (performance.now() - t) / 1000 };
    });
    expect(before).not.toBeNull();
    expect(after! - before!).toBeLessThanOrEqual(frame + 0.02);
  });

  test('page mode: the popup is in the page flow below the banner, all of it reachable, in place of the HUD and tray (Codex review round 6, #117)', async ({ page }) => {
    await page.setViewportSize({ width: 300, height: 200 });
    await boot(page, '?seed=3&debug=1&calm=1&arrivals=1');
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false }));
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.hudFit)).toBe('page');
    await page.evaluate(() => window.__PK__!.debugMeet!('plain', { body: 'round', face: 'classic' }));
    await expect(popup(page)).toHaveCount(1);
    await expect(popup(page)).toHaveCSS('position', 'static');
    await expect(page.locator('.top-stack')).toBeHidden();
    await expect(page.locator('.tray')).toBeHidden();
    // Below the banner, and every control can be scrolled to.
    const banner = (await page.locator('.banners').boundingBox())!;
    const top = await popup(page).evaluate((e) => e.getBoundingClientRect().top + document.scrollingElement!.scrollTop);
    expect(top).toBeGreaterThanOrEqual(banner.y + banner.height - 0.5);
    const go = popup(page).getByRole('button', { name: 'Continue', exact: true });
    await go.scrollIntoViewIfNeeded();
    await expect(go).toBeInViewport({ ratio: 1 });
    await go.click();
    await expect(popup(page)).toHaveCount(0);
    await expect(page.locator('.top-stack')).toBeVisible();
  });

  test('kinds first found while away meet the player one by one, then the summary counts them (§27.5)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1&arrivals=1');
    await page.evaluate(() => window.__PK__!.debugAway!(6 * 3600 * 1000));
    const fresh = await page.evaluate(() => {
      const pk = window.__PK__!;
      return new Set((pk.lastOffline()?.spawned ?? []).map((k) => k.type)).size;
    });
    const known = await page.evaluate(() => window.__PK__!.lastOffline()!.spawned.length);
    expect(known).toBeGreaterThan(0);
    // Each popup first, all from the Garden and new; the summary waits.
    let seen = 0;
    for (;;) {
      const a = await page.evaluate(() => window.__PK__!.arrival());
      if (!a) break;
      expect(a.source).toBe('garden');
      expect(a.isNew).toBe(true);
      await expect(page.getByRole('dialog', { name: 'Welcome back' })).toHaveCount(0);
      seen++;
      await popup(page).getByRole('button', { name: 'Continue', exact: true }).click();
      await page.waitForTimeout(150);
    }
    expect(seen).toBeGreaterThan(0);
    expect(seen).toBeLessThanOrEqual(fresh);
    const summary = page.getByRole('dialog', { name: 'Welcome back' });
    await expect(summary).toBeVisible();
    await expect(summary.locator('.stat-row', { hasText: 'New kinds' })).toContainText(`${seen} · Shown above`);
  });
});
