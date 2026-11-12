import { expect, test, type Page } from '@playwright/test';
import { boot, frames, dropOnto } from './helpers';

test.describe('GUI-MVP feedback rules (Codex review, PR #33)', () => {
  test('a feedback card never takes the last 44 px of play band (568x320)', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 320 });
    await boot(page, '?seed=3&debug=1&calm=1');
    // The pair is placed touching, so it fuses on the next step: this test is about the
    // play band, not dragging (a drag in so short a band would edge-scroll).
    await page.evaluate(() => {
      window.__PK__!.debugAdd!('plain', 956, 2878);
      window.__PK__!.debugAdd!('water', 1016, 2878);
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.discoveredRecipes())).toContain('plain|water');
    for (let i = 0; i < 8; i++) {
      const band = await page.evaluate(() => document.querySelector('.tray')!.getBoundingClientRect().top - document.querySelector('.top-stack')!.getBoundingClientRect().bottom);
      expect(band).toBeGreaterThanOrEqual(44);
      await page.waitForTimeout(200);
    }
  });

  test('a visible card keeps its time while a kid is held', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    // A kind already found: its new recipe is a card (a new kind would be a popup, D-087).
    await page.evaluate((t) => window.__PK__!.debugKnow!(t), 'firefighter');
    const { a, b, c } = await page.evaluate(() => ({
      a: window.__PK__!.debugAdd!('plain', 706, 3228),
      b: window.__PK__!.debugAdd!('water', 1286, 2428),
      // Well below the feedback card, so pressing it starts a real drag.
      c: window.__PK__!.debugAdd!('fire', 756, 3378),
    }));
    await page.waitForTimeout(200);
    await dropOnto(page, a, b);
    await expect(page.locator('.feedback')).toContainText('New recipe found');
    // Hold another kid for longer than a card's 2.5 s.
    const p = await page.evaluate((id) => window.__PK__!.screenPointOf(id)!, c);
    await page.mouse.move(p.x, p.y - 20);
    await page.mouse.down();
    await page.mouse.move(p.x + 30, p.y - 30, { steps: 4 });
    expect(['pick_up', 'held']).toContain(await page.evaluate((id) => window.__PK__!.presentationOf(id)?.clip, c));
    await page.waitForTimeout(3200);
    await expect(page.locator('.feedback')).toContainText('New recipe found');
    await page.mouse.up();
  });

  test('a save banner settles a held kid before the HUD shifts', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 756, 3228));
    await page.waitForTimeout(150);
    const p = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
    await page.mouse.move(p.x, p.y - 20);
    await page.mouse.down();
    await page.mouse.move(p.x + 40, p.y - 40, { steps: 4 });
    expect(['pick_up', 'held']).toContain(await page.evaluate((k) => window.__PK__!.presentationOf(k)?.clip, id));
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false }));
    await expect.poll(() => page.evaluate((k) => window.__PK__!.presentationOf(k)?.clip, id)).not.toMatch(/^(pick_up|held)$/);
    await page.mouse.up();
  });

  test('types discovered offline are not announced as new later', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugAway!(120_000));
    const discovered = await page.evaluate(() => (window.__PK__!.lastOffline()?.spawned ?? []).map((k) => k.type));
    expect(discovered.length).toBeGreaterThan(0);
    const known = await page.evaluate(() => window.__PK__!.debugKnown!());
    for (const t of discovered) expect(known).toContain(t);
  });

  /** Free band between the top stack and the higher of the tray and the Dex button. */
  const band = (page: Page) =>
    page.evaluate(
      () =>
        Math.min(document.querySelector('.tray')!.getBoundingClientRect().top, document.querySelector('[data-nav=dex]')!.getBoundingClientRect().top) -
        document.querySelector('.top-stack')!.getBoundingClientRect().bottom,
    );

  test('the play band counts the Dex button too (320x568)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await boot(page, '?seed=3&debug=1&calm=1');
    const { a, b } = await page.evaluate(() => ({ a: window.__PK__!.debugAdd!('plain', 856, 3028), b: window.__PK__!.debugAdd!('water', 1156, 3028) }));
    await page.waitForTimeout(200);
    await dropOnto(page, a, b);
    await expect.poll(() => page.evaluate(() => window.__PK__!.discoveredRecipes())).toContain('plain|water');
    for (let i = 0; i < 8; i++) {
      expect(await band(page)).toBeGreaterThanOrEqual(44);
      await page.waitForTimeout(200);
    }
  });

  test('a refusal that cannot fit waits, and appears once there is room', async ({ page }) => {
    // Navigation top 170, HUD bottom 52 (§23.1): a 72 px refusal card and its gap would leave
    // less than the 44 px band.
    await page.setViewportSize({ width: 568, height: 230 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugCommand!({ type: 'upgrade', building: 'garden' })); // no Materials
    // Sampled, not retried: a card shown too early would vanish after 2.5 s and pass a retry.
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(150);
      expect(await page.locator('.feedback').textContent()).toBe('');
    }
    await page.setViewportSize({ width: 568, height: 800 });
    await expect(page.locator('.feedback')).toContainText('Not enough');
  });

  test('a visible card that stops fitting goes back to the queue (640x360 + banner)', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 360 });
    await boot(page, '?seed=3&debug=1&calm=1');
    // A kind already found: its new recipe is a card (a new kind would be a popup, D-087).
    await page.evaluate((t) => window.__PK__!.debugKnow!(t), 'firefighter');
    const { a, b } = await page.evaluate(() => ({ a: window.__PK__!.debugAdd!('plain', 756, 2878), b: window.__PK__!.debugAdd!('water', 1256, 2878) }));
    await page.waitForTimeout(200);
    await dropOnto(page, a, b);
    await expect(page.locator('.feedback')).toContainText('New recipe found');
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false }));
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(150);
      expect(await band(page)).toBeGreaterThanOrEqual(44);
    }
  });

  test('a requeued reward never blocks a waiting refusal (640x360)', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 360 });
    await boot(page, '?seed=3&debug=1&calm=1');
    // A kind already found: its new recipe is a card (a new kind would be a popup, D-087).
    await page.evaluate((t) => window.__PK__!.debugKnow!(t), 'firefighter');
    const { a, b, c } = await page.evaluate(() => ({
      a: window.__PK__!.debugAdd!('plain', 1076, 2878),
      b: window.__PK__!.debugAdd!('water', 1476, 2878),
      c: window.__PK__!.debugAdd!('fire', 2076, 2908),
    }));
    // The pair mid-band, so the drag never edge-scrolls (the landscape fit floor shows about
    // 1770 × 576 world units of play band, §20.1).
    await page.evaluate(() => window.__PK__!.centerOn(1276, 2848));
    await page.waitForTimeout(200);
    await dropOnto(page, a, b);
    await expect(page.locator('.feedback')).toContainText('New recipe found');
    // Hold a kid (feedback freezes), queue a refusal, then a banner that settles the drag
    // and leaves room for the short refusal but not the reward card. The camera may have
    // moved since (the narrow landscape view): bring the kid back, low in the play band.
    await page.evaluate((id) => {
      const k = window.__PK__!.kids().find((x) => x.id === id)!;
      window.__PK__!.centerOn(k.x, k.y - 150);
    }, c);
    await frames(page, 2);
    const p = await page.evaluate((id) => window.__PK__!.screenPointOf(id)!, c);
    await page.mouse.move(p.x, p.y - 20);
    await page.mouse.down();
    await page.mouse.move(p.x + 20, p.y - 30, { steps: 3 });
    expect(['pick_up', 'held']).toContain(await page.evaluate((id) => window.__PK__!.presentationOf(id)?.clip, c));
    await page.evaluate(() => window.__PK__!.debugCommand!({ type: 'upgrade', building: 'garden' }));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false }));
    await page.mouse.up();
    await expect(page.locator('.feedback')).toContainText('Not enough');
  });

  test('the read-only notice is never covered (568x320)', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 320 });
    await page.addInitScript(() => {
      localStorage.setItem('CapacitorStorage.potato-kid/slotA', JSON.stringify({ schema: 99, revision: 5, savedAt: 1, state: {}, checksum: 'x' }));
    });
    await page.goto('/?seed=3&calm=1');
    await page.waitForFunction(() => window.__PK__?.ready === true);
    // Overlap by geometry: the HUD has pointer-events: none, so hit-testing can't see it.
    const covered = await page.evaluate(() => {
      const n = document.querySelector('.readonly-notice')!.getBoundingClientRect();
      return [...document.querySelectorAll('.top-stack > *, .tray')].some((e) => {
        const r = e.getBoundingClientRect();
        const shown = getComputedStyle(e).display !== 'none' && r.width > 0 && r.height > 0;
        return shown && r.left < n.right && r.right > n.left && r.top < n.bottom && r.bottom > n.top;
      });
    });
    expect(covered).toBe(false);
  });

  test('a resize during a drag still takes a card that no longer fits off screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page, '?seed=3&debug=1&calm=1');
    // A kind already found: its new recipe is a card (a new kind would be a popup, D-087).
    await page.evaluate((t) => window.__PK__!.debugKnow!(t), 'firefighter');
    const { a, b, c } = await page.evaluate(() => ({
      a: window.__PK__!.debugAdd!('plain', 706, 3228),
      b: window.__PK__!.debugAdd!('water', 1286, 2428),
      c: window.__PK__!.debugAdd!('fire', 756, 3378),
    }));
    await page.waitForTimeout(200);
    await dropOnto(page, a, b);
    await expect(page.locator('.feedback')).toContainText('New recipe found');
    const p = await page.evaluate((id) => window.__PK__!.screenPointOf(id)!, c);
    await page.mouse.move(p.x, p.y - 20);
    await page.mouse.down();
    await page.mouse.move(p.x + 20, p.y - 30, { steps: 3 });
    expect(['pick_up', 'held']).toContain(await page.evaluate((id) => window.__PK__!.presentationOf(id)?.clip, c));
    await page.setViewportSize({ width: 568, height: 320 });
    await page.waitForTimeout(300);
    expect(await band(page)).toBeGreaterThanOrEqual(44);
    await page.mouse.up();
  });
});

test('costumes load when a type appears and are released after it leaves (ROSTER-SCALE)', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = await boot(page, '?seed=3&debug=1&calm=1');
  // Hero and Glassblower aren't in the spawn pool, so their costumes start unloaded.
  expect(await page.evaluate(() => window.__PK__!.debugLoadedCostumes!())).not.toContain('hero');
  const { hero, glass } = await page.evaluate(() => ({ hero: window.__PK__!.debugAdd!('hero', 756, 3228), glass: window.__PK__!.debugAdd!('glassblower', 1286, 2428) }));
  // Both parents are drawn (their costumes loaded) before any drag (Codex review, PR #35).
  for (const id of [hero, glass]) await expect.poll(() => page.evaluate((k) => !!window.__PK__!.screenPointOf(k), id)).toBe(true);
  expect(await page.evaluate(() => window.__PK__!.debugLoadedCostumes!())).toEqual(expect.arrayContaining(['hero', 'glassblower']));
  // Fuse them (hero + glassblower -> lantern): both types leave the map.
  await dropOnto(page, hero, glass);
  await expect.poll(() => page.evaluate(() => window.__PK__!.kids().map((k) => k.type))).toContain('lantern');
  const lantern = await page.evaluate(() => window.__PK__!.kids().find((k) => k.type === 'lantern')!.id);
  await expect.poll(() => page.evaluate((id) => !!window.__PK__!.screenPointOf(id), lantern)).toBe(true);
  // 15 s after the last of them left, their costumes are released; the lantern's stays.
  await expect
    .poll(() => page.evaluate(() => window.__PK__!.debugLoadedCostumes!()), { timeout: 25_000, intervals: [1000] })
    .not.toEqual(expect.arrayContaining(['hero']));
  const loaded = await page.evaluate(() => window.__PK__!.debugLoadedCostumes!());
  expect(loaded).not.toContain('glassblower');
  expect(loaded).toContain('lantern');
  expect(errors).toEqual([]);
});

test('a discovery card waits until its kid is drawn, even if the costume loads slowly', async ({ page }) => {
  test.setTimeout(60_000);
  // Lantern's costume downloads take 3 s (a slow network).
  await page.route('**/kid_lantern_*', async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });
  const errors = await boot(page, '?seed=3&debug=1&calm=1');
  // A kind already found: its new recipe is a card (a new kind would be a popup, D-087).
  await page.evaluate((t) => window.__PK__!.debugKnow!(t), 'lantern');
  const { hero, glass } = await page.evaluate(() => ({ hero: window.__PK__!.debugAdd!('hero', 756, 3228), glass: window.__PK__!.debugAdd!('glassblower', 1286, 2428) }));
  for (const id of [hero, glass]) await expect.poll(() => page.evaluate((k) => !!window.__PK__!.screenPointOf(k), id)).toBe(true);
  await dropOnto(page, hero, glass);
  await expect.poll(() => page.evaluate(() => window.__PK__!.kids().map((k) => k.type))).toContain('lantern');
  const lantern = await page.evaluate(() => window.__PK__!.kids().find((k) => k.type === 'lantern')!.id);
  await expect(page.locator('.feedback')).toContainText('New recipe found', { timeout: 15_000 });
  expect(await page.evaluate((id) => !!window.__PK__!.screenPointOf(id), lantern)).toBe(true);
  expect(errors).toEqual([]);
});

test("a first rare's popup waits until its sprout is drawn, even if the costume loads slowly (Codex review, PR #77; D-087)", async ({ page }) => {
  test.setTimeout(60_000);
  await page.route('**/kid_lantern_*', async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });
  // Lantern stands in for a rare kid (D-072) until the rares' content exists.
  await boot(page, '?seed=3&debug=1&calm=1&rare=lantern&arrivals=1');
  // Per frame until its popup shows: the popup, and whether the kid is drawn.
  const log = await page.evaluate(
    () =>
      new Promise<[boolean, boolean][]>((done) => {
        const pk = window.__PK__!;
        const before = pk.kids().map((k) => k.id);
        pk.debugReadySeed!(0, 'lantern');
        const out: [boolean, boolean][] = [];
        const end = performance.now() + 20_000;
        const frame = () => {
          const card = pk.arrival() !== null;
          const drawn = pk.rares().some((r) => !before.includes(r.id));
          out.push([card, drawn]);
          if (card || performance.now() > end) done(out);
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );
  expect(log.filter(([card, drawn]) => card && !drawn)).toEqual([]);
  expect(log[log.length - 1]).toEqual([true, true]);
});
