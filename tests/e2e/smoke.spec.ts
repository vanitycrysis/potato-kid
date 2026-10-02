import { expect, test, type Page } from '@playwright/test';

async function boot(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__PK__?.ready === true);
  // The world scrolls (D-040): debug tests place kids around world (540, 1100), so look there.
  if (query.includes('debug=1')) await page.evaluate(() => window.__PK__!.centerOn(540, 1100));
  return errors;
}

async function frames(page: Page, n: number): Promise<void> {
  await page.evaluate(async (count) => {
    for (let i = 0; i < count; i++) await new Promise((r) => requestAnimationFrame(() => r(null)));
  }, n);
}

test('boots, renders and spawns from the Garden', async ({ page }) => {
  const errors = await boot(page, '?seed=1');
  await expect(page.locator('canvas')).toBeVisible();
  const start = await page.evaluate(() => window.__PK__!.kids().length);
  expect(start).toBeGreaterThan(0);
  await expect(page.locator('.hud-value')).toHaveText(`${start}/12`);
  await expect(page.locator('.hud-countdown')).toContainText('Next kid');
  await page.screenshot({ path: 'test-results/boot.png' });
  expect(errors).toEqual([]);
});

test('dragging a plain kid onto a water kid makes a firefighter (R1)', async ({ page }) => {
  const errors = await boot(page, '?seed=3&debug=1&calm=1');
  // Place the pair far apart so they can't touch by wandering first.
  const { plain, water } = await page.evaluate(() => ({
    plain: window.__PK__!.debugAdd!('plain', 250, 1500),
    water: window.__PK__!.debugAdd!('water', 830, 700),
  }));
  await page.waitForTimeout(200);

  const from = await page.evaluate((id) => window.__PK__!.screenPointOf(id)!, plain);
  // Grab a little above the ground point (on the body), like a finger would.
  await page.mouse.move(from.x, from.y - 20);
  await page.mouse.down();
  const to = await page.evaluate((id) => window.__PK__!.screenPointOf(id)!, water);
  // Held kids float above the finger, so put the finger below the target's feet.
  const lift = await page.evaluate(() => {
    const a = window.__PK__!.worldToScreen(0, 0);
    const b = window.__PK__!.worldToScreen(0, 70);
    return b.y - a.y;
  });
  await page.mouse.move(to.x, to.y + lift, { steps: 12 });
  // Held kids show Codex's pick-up, then held clip (ASSET-PLAYABLE part B).
  expect(['pick_up', 'held']).toContain(await page.evaluate((id) => window.__PK__!.presentationOf(id)?.clip, plain));
  await page.mouse.up();

  await expect
    .poll(() => page.evaluate(() => window.__PK__!.kids().map((k) => k.type)), { timeout: 3000 })
    .toContain('firefighter');
  // The child is born with the fusion effect, and this first discovery adds its spark.
  const child = await page.evaluate(() => window.__PK__!.kids().find((k) => k.type === 'firefighter')!.id);
  const seen = new Set<string>();
  await expect
    .poll(
      async () => {
        for (const fx of (await page.evaluate((id) => window.__PK__!.presentationOf(id)?.effects ?? [], child))) seen.add(fx);
        return [...seen].sort();
      },
      { timeout: 2000, intervals: [20] },
    )
    .toEqual(['discovery', 'fusion', 'spawn']);
  const ids = await page.evaluate(() => window.__PK__!.kids().map((k) => k.id));
  expect(ids).not.toContain(plain);
  expect(ids).not.toContain(water);
  expect(await page.evaluate(() => window.__PK__!.discoveredRecipes())).toContain('plain|water');
  await expect(page.locator('.toast')).toContainText('New discovery');
  await page.screenshot({ path: 'test-results/fusion.png' });
  expect(errors).toEqual([]);
});

test('a released kid stays where it was dropped (no snap-back)', async ({ page }) => {
  const errors = await boot(page, '?seed=5&debug=1&calm=1');
  const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 200, 1500));
  await page.waitForTimeout(150);
  const from = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  // Open ground, clear of the Garden's scenery reserve (map v2), so nothing deflects it.
  const to = await page.evaluate(() => window.__PK__!.worldToScreen(850, 1500));
  await page.mouse.move(from.x, from.y - 20);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.waitForTimeout(100);
  // While held, the kid floats above the finger (smaller y), so the face isn't covered.
  const held = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  const liftPx = await page.evaluate(() => window.__PK__!.worldToScreen(0, 70).y - window.__PK__!.worldToScreen(0, 0).y);
  expect(held.y).toBeLessThan(to.y - liftPx * 0.8);
  await page.mouse.up();
  const landing = { x: to.x, y: to.y - liftPx };
  // Sample the rendered position over the next frames: it must never jump back toward the start.
  const samples = await page.evaluate(async (k) => {
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      out.push(window.__PK__!.screenPointOf(k)!);
    }
    return out;
  }, id);
  const startDist = Math.hypot(to.x - from.x, to.y - from.y);
  for (const p of samples) expect(Math.hypot(p.x - landing.x, p.y - landing.y)).toBeLessThan(startDist * 0.1);
  expect(errors).toEqual([]);
});

test('a kid dropped outside the play area lands clamped without a jump', async ({ page }) => {
  const errors = await boot(page, '?seed=8&debug=1&calm=1');
  const id = await page.evaluate(() => window.__PK__!.debugAdd!('snow', 540, 1200));
  await page.waitForTimeout(150);
  const p = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  // Release up in the Garden's zone, above where kids may stand (world y 250).
  const below = await page.evaluate(() => window.__PK__!.worldToScreen(540, 250));
  await page.mouse.move(p.x, p.y - 20);
  await page.mouse.down();
  await page.mouse.move(below.x, below.y, { steps: 8 });
  await page.mouse.up();
  const ys = await page.evaluate(async (k) => {
    const out: number[] = [];
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      out.push(window.__PK__!.screenPointOf(k)!.y);
    }
    return out;
  }, id);
  // Every rendered frame after release sits at the same clamped landing height.
  expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(2);
  expect(errors).toEqual([]);
});

test('an OS-cancelled touch releases the kid and dragging still works', async ({ page }) => {
  const errors = await boot(page, '?seed=6&debug=1&calm=1');
  const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 300, 1200));
  await page.waitForTimeout(150);
  const p = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  // Start a drag, then deliver a native pointercancel straight to the canvas.
  await page.mouse.move(p.x, p.y - 20);
  await page.mouse.down();
  await page.mouse.move(p.x + 60, p.y - 20, { steps: 4 });
  await page.evaluate(() => {
    document.querySelector('canvas')!.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true }));
  });
  await page.mouse.up();
  await page.waitForTimeout(200);
  // The kid is back near its start, and a fresh drag works.
  const back = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  expect(Math.hypot(back.x - p.x, back.y - p.y)).toBeLessThan(5);
  await page.mouse.move(back.x, back.y - 20);
  await page.mouse.down();
  await page.mouse.move(back.x + 100, back.y - 20, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const moved = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  expect(moved.x - back.x).toBeGreaterThan(60);
  expect(errors).toEqual([]);
});

test('40+ kids render without errors', async ({ page }) => {
  const errors = await boot(page, '?seed=7&debug=1');
  await page.evaluate(() => {
    for (let i = 0; i < 40; i++) window.__PK__!.debugAdd!(['plain', 'fire', 'water', 'snow'][i % 4]!, 100 + (i % 8) * 120, 500 + Math.floor(i / 8) * 250);
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/kids-40.png' });
  // Headless frame rate is a logged regression signal only, never a pass/fail bar or a
  // phone result (plan §7): CI runners have no GPU and render WebGL in software.
  const fps = await page.evaluate(() => window.__PK__!.fps());
  console.log(`headless fps with 40+ kids: ${fps.toFixed(1)}`);
  expect(fps).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('dragging empty ground pans the map (D-040)', async ({ page }) => {
  const errors = await boot(page, '?seed=9&debug=1&calm=1');
  const before = await page.evaluate(() => window.__PK__!.worldToScreen(540, 1100));
  // calm mode has no kids, so this press lands on empty ground.
  await page.mouse.move(200, 600);
  await page.mouse.down();
  await page.mouse.move(200, 300, { steps: 8 });
  await page.mouse.up();
  await frames(page, 2);
  const after = await page.evaluate(() => window.__PK__!.worldToScreen(540, 1100));
  // The map followed the finger up (at least most of the 300 px; inertia may add more).
  expect(before.y - after.y).toBeGreaterThan(250);
  expect(errors).toEqual([]);
});

test('holding a kid at the screen edge scrolls the map and carries the kid along', async ({ page }) => {
  const errors = await boot(page, '?seed=10&debug=1&calm=1');
  const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 540, 1100));
  await page.waitForTimeout(150);
  const p = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  const size = page.viewportSize()!;
  await page.mouse.move(p.x, p.y - 20);
  await page.mouse.down();
  // Hold just inside the visible play area's bottom edge (above the tray), not behind it.
  const trayTop = await page.locator('.tray').evaluate((e) => e.getBoundingClientRect().top);
  await page.mouse.move(size.width / 2, trayTop - 10, { steps: 8 });
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForTimeout(250);
  const kid = await page.evaluate((k) => window.__PK__!.kids().find((c) => c.id === k)!, id);
  // It was carried well below where the starting view ended.
  expect(kid.y).toBeGreaterThan(2300);
  expect(errors).toEqual([]);
});

test('dropping a kid onto a non-partner never overlaps them (D-039, D-043)', async ({ page }) => {
  const errors = await boot(page, '?seed=12&debug=1&calm=1');
  const { fire, snow } = await page.evaluate(() => ({
    fire: window.__PK__!.debugAdd!('fire', 540, 1100),
    snow: window.__PK__!.debugAdd!('snow', 540, 1600),
  }));
  await page.waitForTimeout(150);
  const from = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, snow);
  const onto = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, fire);
  const liftPx = await page.evaluate(() => window.__PK__!.worldToScreen(0, 70).y - window.__PK__!.worldToScreen(0, 0).y);
  await page.mouse.move(from.x, from.y - 20);
  await page.mouse.down();
  await page.mouse.move(onto.x, onto.y + liftPx, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const kids = await page.evaluate(() => window.__PK__!.kids());
  const a = kids.find((k) => k.id === fire)!;
  const b = kids.find((k) => k.id === snow)!;
  // Their silhouette boxes (D-043) don't intersect: separated on at least one axis.
  const dx = Math.max(a.x + a.box.left - (b.x + b.box.right), b.x + b.box.left - (a.x + a.box.right));
  const dy = Math.max(a.y + a.box.top - (b.y + b.box.bottom), b.y + b.box.top - (a.y + a.box.bottom));
  expect(Math.max(dx, dy)).toBeGreaterThanOrEqual(-0.01);
  // The kid already standing there wasn't shoved.
  expect(a.x).toBeCloseTo(540, 0);
  expect(a.y).toBeCloseTo(1100, 0);
  expect(errors).toEqual([]);
});

test('a pan that pauses before release does not fling', async ({ page }) => {
  const errors = await boot(page, '?seed=13&debug=1&calm=1');
  await page.mouse.move(200, 700);
  await page.mouse.down();
  await page.mouse.move(200, 400, { steps: 6 });
  await page.waitForTimeout(400); // finger rests
  const rested = await page.evaluate(() => window.__PK__!.worldToScreen(540, 1100));
  await page.mouse.up();
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__PK__!.worldToScreen(540, 1100));
  expect(Math.abs(after.y - rested.y)).toBeLessThan(2);
  expect(errors).toEqual([]);
});

test('rotating the screen keeps the same world point centred', async ({ page }) => {
  const errors = await boot(page, '?seed=14&debug=1&calm=1');
  await page.evaluate(() => window.__PK__!.centerOn(1080, 2000));
  await page.setViewportSize({ width: 915, height: 413 });
  await page.waitForTimeout(300);
  const c = await page.evaluate(() => window.__PK__!.worldToScreen(1080, 2000));
  expect(Math.abs(c.x - 915 / 2)).toBeLessThan(3);
  expect(Math.abs(c.y - 413 / 2)).toBeLessThan(3);
  expect(errors).toEqual([]);
});

test('backgrounding mid-pan does not lock input', async ({ page }) => {
  const errors = await boot(page, '?seed=15&debug=1&calm=1');
  const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 540, 1100));
  await page.mouse.move(200, 700);
  await page.mouse.down();
  await page.mouse.move(200, 650, { steps: 3 });
  // Simulate the app being hidden mid-gesture (the pointerup never arrives).
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  // A fresh drag of the kid must work.
  const p = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  await page.mouse.move(p.x, p.y - 20);
  await page.mouse.down();
  await page.mouse.move(p.x + 120, p.y - 20, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const kid = await page.evaluate((k) => window.__PK__!.kids().find((c) => c.id === k)!, id);
  expect(kid.x).toBeGreaterThan(560);
  expect(errors).toEqual([]);
});

test('a kid at the bottom edge of the world can be scrolled out from under the tray', async ({ page }) => {
  const errors = await boot(page, '?seed=16&debug=1&calm=1');
  const id = await page.evaluate(() => window.__PK__!.debugAdd!('plain', 1080, 3830));
  await page.evaluate(() => window.__PK__!.centerOn(1080, 99999)); // scroll as far down as allowed
  await page.waitForTimeout(150);
  const p = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  const trayTop = await page.locator('.tray').evaluate((e) => e.getBoundingClientRect().top);
  expect(p.y).toBeLessThanOrEqual(trayTop + 1); // its feet are visible above the tray
  expect(errors).toEqual([]);
});

test('a kid in the bottom-right corner can be scrolled out from under the Dex button', async ({ page }) => {
  const errors = await boot(page, '?seed=17&debug=1&calm=1');
  const id = await page.evaluate(() => window.__PK__!.debugAdd!('plain', 2080, 3830));
  await page.evaluate(() => window.__PK__!.centerOn(99999, 99999)); // as far down-right as allowed
  await page.waitForTimeout(150);
  const p = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  const dexTop = await page.locator('.dex-button').evaluate((e) => e.getBoundingClientRect().top);
  expect(p.y).toBeLessThanOrEqual(dexTop + 1);
  expect(errors).toEqual([]);
});

test('on a short landscape screen, holding a kid still in the middle does not scroll', async ({ page }) => {
  await page.setViewportSize({ width: 915, height: 413 });
  const errors = await boot(page, '?seed=18&debug=1&calm=1');
  const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 1080, 1500));
  await page.evaluate(() => window.__PK__!.centerOn(1080, 1460));
  await page.waitForTimeout(150);
  const p = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  const top = await page.locator('.hud').evaluate((e) => e.getBoundingClientRect().bottom);
  const bottom = await page.evaluate(() =>
    Math.min(document.querySelector('.tray')!.getBoundingClientRect().top, document.querySelector('.dex-button')!.getBoundingClientRect().top),
  );
  await page.mouse.move(p.x, p.y - 10);
  await page.mouse.down();
  await page.waitForTimeout(100);
  // Centre the held kid's silhouette in the usable band between the HUD and the tray/Dex.
  const kid = await page.evaluate((k) => window.__PK__!.kids().find((c) => c.id === k)!, id);
  const zoom = await page.evaluate(() => (window.__PK__!.worldToScreen(0, 100).y - window.__PK__!.worldToScreen(0, 0).y) / 100);
  const at = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  const centre = at.y + ((kid.box.top + kid.box.bottom) / 2) * zoom;
  await page.mouse.move(p.x, p.y - 10 + ((top + bottom) / 2 - centre), { steps: 2 });
  const before = await page.evaluate(() => window.__PK__!.worldToScreen(1080, 1460));
  await page.waitForTimeout(600);
  const during = await page.evaluate(() => window.__PK__!.worldToScreen(1080, 1460));
  await page.mouse.up();
  expect(Math.abs(during.y - before.y)).toBeLessThan(2);
  expect(errors).toEqual([]);
});

test('a held kid never disappears behind the HUD while scrolling up', async ({ page }) => {
  const errors = await boot(page, '?seed=19&debug=1&calm=1');
  const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 1080, 2600));
  await page.evaluate(() => window.__PK__!.centerOn(1080, 2400));
  await page.waitForTimeout(150);
  const p = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  const hudBottom = await page.locator('.hud').evaluate((e) => e.getBoundingClientRect().bottom);
  await page.mouse.move(p.x, p.y - 20);
  await page.mouse.down();
  await page.mouse.move(p.x, hudBottom + 10, { steps: 6 });
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(120);
    const kid = await page.evaluate((k) => window.__PK__!.kids().find((c) => c.id === k)!, id);
    const at = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
    const top = await page.evaluate(([y, t]) => window.__PK__!.worldToScreen(0, y + t).y - window.__PK__!.worldToScreen(0, y).y, [0, kid.box.top] as const);
    // The silhouette's top edge stays at or below the HUD.
    expect(at.y + top).toBeGreaterThanOrEqual(hudBottom - 1);
  }
  await page.mouse.up();
  expect(errors).toEqual([]);
});

for (const [w, h] of [[640, 360], [568, 320]] as const) {
  test(`on a ${w}x${h} screen a held kid stays visible below the HUD`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    const errors = await boot(page, '?seed=20&debug=1&calm=1');
    const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 1080, 1500));
    await page.evaluate(() => window.__PK__!.centerOn(1080, 1500));
    await page.waitForTimeout(150);
    const hudBottom = await page.locator('.hud').evaluate((e) => e.getBoundingClientRect().bottom);
    const bottom = await page.evaluate(() =>
      Math.min(document.querySelector('.tray')!.getBoundingClientRect().top, document.querySelector('.dex-button')!.getBoundingClientRect().top),
    );
    const zoom = await page.evaluate(() => (window.__PK__!.worldToScreen(0, 100).y - window.__PK__!.worldToScreen(0, 0).y) / 100);
    const kid0 = await page.evaluate((k) => window.__PK__!.kids().find((c) => c.id === k)!, id);
    // The compact layout leaves room for at least one kid between HUD and tray.
    expect(bottom - hudBottom).toBeGreaterThan((kid0.box.bottom - kid0.box.top) * zoom);
    const p = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
    await page.mouse.move(p.x, p.y - 5);
    await page.mouse.down();
    await page.mouse.move(p.x, hudBottom + 2, { steps: 4 });
    await page.waitForTimeout(150);
    const at = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
    expect(at.y + kid0.box.top * zoom).toBeGreaterThanOrEqual(hudBottom - 1);
    await page.mouse.up();
    expect(errors).toEqual([]);
  });
}

test('the build ships the bundled font with its full licence (SIL OFL condition 2)', async ({ request }) => {
  const res = await request.get('/assets/PatrickHand-OFL.txt');
  expect(res.ok()).toBe(true);
  const text = await res.text();
  expect(text).toContain('Copyright (c) 2010-2012 Patrick Wagesreiter');
  expect(text).toContain('SIL OPEN FONT LICENSE Version 1.1');
});

test('a reloaded game continues from its save (plan §4)', async ({ page }) => {
  const errors = await boot(page, '?seed=3&debug=1&calm=1');
  await page.evaluate(() => {
    window.__PK__!.debugAdd!('plain', 250, 1500);
    window.__PK__!.debugAdd!('fire', 830, 1500);
  });
  // Saves land on load, then every 10 s and on events; wait for one that includes the kids.
  await page.evaluate(() => window.__PK__!.debugAway!(0));
  const before = await page.evaluate(() => ({ kids: window.__PK__!.kids().map((k) => [k.id, k.type]), wallet: window.__PK__!.wallet() }));
  expect(await page.evaluate(() => window.__PK__!.save().mode)).toBe('normal');

  await page.reload();
  await page.waitForFunction(() => window.__PK__?.ready === true);
  const after = await page.evaluate(() => ({ kids: window.__PK__!.kids().map((k) => [k.id, k.type]), wallet: window.__PK__!.wallet() }));
  expect(after.kids).toEqual(before.kids);
  expect(after.wallet.materials).toBeGreaterThanOrEqual(before.wallet.materials);
  expect(errors).toEqual([]);
});

test('time away is credited once: Garden spawns and income (plan §3)', async ({ page }) => {
  const errors = await boot(page, '?seed=3&debug=1&calm=1');
  await page.evaluate(() => window.__PK__!.debugAdd!('plain', 250, 1500));
  const before = await page.evaluate(() => window.__PK__!.wallet().materials);
  await page.evaluate(() => window.__PK__!.debugAway!(60_000));
  const report = await page.evaluate(() => window.__PK__!.lastOffline());
  expect(report!.seconds).toBeCloseTo(60, 0);
  // calm: 12 s Garden, capacity 12, one kid placed -> five spawns in 60 s.
  expect(report!.spawned).toHaveLength(5);
  const after = await page.evaluate(() => window.__PK__!.wallet().materials);
  expect(after - before).toBeGreaterThanOrEqual(report!.materials - 1);
  // Every offline kid still on the map is drawn. (Once play resumes, two that arrived
  // touching may fuse, exactly as Garden spawns can online.)
  // Checked in one evaluate, so a fusion can't land between reading and checking.
  const undrawn = await page.evaluate((ids) => {
    const alive = new Set(window.__PK__!.kids().map((k) => k.id));
    return ids.filter((id) => alive.has(id) && !window.__PK__!.screenPointOf(id));
  }, report!.spawned.map((k) => k.id));
  expect(undrawn).toEqual([]);
  expect(errors).toEqual([]);
});

test('Spawn now spends a Potatoken and brings a kid; when broke it sends nothing (GUI_MVP §3)', async ({ page }) => {
  const errors = await boot(page, '?seed=3&debug=1&calm=1');
  const spawn = page.locator('.hud-spawn');
  const start = await page.evaluate(() => ({ kids: window.__PK__!.kids().length, tokens: window.__PK__!.wallet().potatokens }));
  expect(start.tokens).toBeGreaterThan(0);
  await spawn.click();
  await expect.poll(() => page.evaluate(() => window.__PK__!.kids().length)).toBe(start.kids + 1);
  expect(await page.evaluate(() => window.__PK__!.wallet().potatokens)).toBe(start.tokens - 1);
  await expect(page.locator('.feedback')).toContainText('Kid arrived at the Garden.');
  // Spend the rest; then the control is disabled and a tap changes nothing.
  for (let i = 1; i < start.tokens; i++) {
    await spawn.click();
    await expect.poll(() => page.evaluate(() => window.__PK__!.wallet().potatokens)).toBe(start.tokens - 1 - i);
  }
  await expect(spawn).toHaveAttribute('aria-disabled', 'true');
  const kids = await page.evaluate(() => window.__PK__!.kids().length);
  await spawn.click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__PK__!.kids().length)).toBe(kids);
  await expect(page.locator('.feedback')).not.toContainText('Not enough');
  expect(errors).toEqual([]);
});

test('a save from a newer app freezes the game and asks for an update (GUI_MVP §10)', async ({ page }) => {
  await page.addInitScript(() => {
    // A slot written by a future schema: the save manager must go read-only, never write.
    localStorage.setItem('CapacitorStorage.potato-kid/slotA', JSON.stringify({ schema: 99, revision: 5, savedAt: 1, state: {}, checksum: 'x' }));
  });
  await page.goto('/?seed=3&calm=1');
  await page.waitForFunction(() => window.__PK__?.ready === true);
  await expect(page.locator('.banner')).toContainText('Please update the game.');
  await expect(page.locator('.readonly-notice')).toContainText('Your save is kept safe.');
  await expect(page.locator('.hud-spawn')).toHaveAttribute('aria-disabled', 'true');
  const before = await page.evaluate(() => window.__PK__!.wallet());
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__PK__!.wallet())).toEqual(before);
  expect(await page.evaluate(() => localStorage.getItem('CapacitorStorage.potato-kid/slotB'))).toBeNull();
});
