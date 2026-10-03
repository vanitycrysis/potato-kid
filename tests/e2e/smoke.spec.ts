import { readFileSync } from 'node:fs';
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
  // A moment away shows no return summary (D-049).
  await expect(page.locator('.sheet')).toHaveCount(0);
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
  // Building launchers are disabled too, with the reason (Codex review, PR #39).
  for (const name of ['Garden', 'Capacity', 'Bias']) {
    await expect(page.getByRole('button', { name: `${name}: Update the game to continue.` })).toBeDisabled();
  }
  const before = await page.evaluate(() => window.__PK__!.wallet());
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__PK__!.wallet())).toEqual(before);
  expect(await page.evaluate(() => localStorage.getItem('CapacitorStorage.potato-kid/slotB'))).toBeNull();
});

/** Drags kid `a` onto kid `b` (finger below b's feet, as held kids float above the finger). */
async function dropOnto(page: Page, a: number, b: number, release = true): Promise<void> {
  const from = await page.evaluate((id) => window.__PK__!.screenPointOf(id)!, a);
  await page.mouse.move(from.x, from.y - 20);
  await page.mouse.down();
  const to = await page.evaluate((id) => window.__PK__!.screenPointOf(id)!, b);
  const lift = await page.evaluate(() => window.__PK__!.worldToScreen(0, 70).y - window.__PK__!.worldToScreen(0, 0).y);
  await page.mouse.move(to.x, to.y + lift, { steps: 10 });
  if (release) await page.mouse.up();
}

test.describe('GUI-MVP feedback rules (Codex review, PR #33)', () => {
  test('a feedback card never takes the last 44 px of play band (568x320)', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 320 });
    await boot(page, '?seed=3&debug=1&calm=1');
    // The pair is placed touching, so it fuses on the next step: this test is about the
    // play band, not dragging (a drag in so short a band would edge-scroll).
    await page.evaluate(() => {
      window.__PK__!.debugAdd!('plain', 500, 1150);
      window.__PK__!.debugAdd!('water', 560, 1150);
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
    const { a, b, c } = await page.evaluate(() => ({
      a: window.__PK__!.debugAdd!('plain', 250, 1500),
      b: window.__PK__!.debugAdd!('water', 830, 700),
      // Well below the feedback card, so pressing it starts a real drag.
      c: window.__PK__!.debugAdd!('fire', 300, 1650),
    }));
    await page.waitForTimeout(200);
    await dropOnto(page, a, b);
    await expect(page.locator('.feedback')).toContainText('New discovery');
    // Hold another kid for longer than a card's 2.5 s.
    const p = await page.evaluate((id) => window.__PK__!.screenPointOf(id)!, c);
    await page.mouse.move(p.x, p.y - 20);
    await page.mouse.down();
    await page.mouse.move(p.x + 30, p.y - 30, { steps: 4 });
    expect(['pick_up', 'held']).toContain(await page.evaluate((id) => window.__PK__!.presentationOf(id)?.clip, c));
    await page.waitForTimeout(3200);
    await expect(page.locator('.feedback')).toContainText('New discovery');
    await page.mouse.up();
  });

  test('a save banner settles a held kid before the HUD shifts', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 300, 1500));
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
        Math.min(document.querySelector('.tray')!.getBoundingClientRect().top, document.querySelector('.dex-button')!.getBoundingClientRect().top) -
        document.querySelector('.top-stack')!.getBoundingClientRect().bottom,
    );

  test('the play band counts the Dex button too (320x568)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await boot(page, '?seed=3&debug=1&calm=1');
    const { a, b } = await page.evaluate(() => ({ a: window.__PK__!.debugAdd!('plain', 400, 1300), b: window.__PK__!.debugAdd!('water', 700, 1300) }));
    await page.waitForTimeout(200);
    await dropOnto(page, a, b);
    await expect.poll(() => page.evaluate(() => window.__PK__!.discoveredRecipes())).toContain('plain|water');
    for (let i = 0; i < 8; i++) {
      expect(await band(page)).toBeGreaterThanOrEqual(44);
      await page.waitForTimeout(200);
    }
  });

  test('a refusal that cannot fit waits, and appears once there is room', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 320 });
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
    const { a, b } = await page.evaluate(() => ({ a: window.__PK__!.debugAdd!('plain', 300, 1150), b: window.__PK__!.debugAdd!('water', 800, 1150) }));
    await page.waitForTimeout(200);
    await dropOnto(page, a, b);
    await expect(page.locator('.feedback')).toContainText('New discovery');
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false }));
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(150);
      expect(await band(page)).toBeGreaterThanOrEqual(44);
    }
  });

  test('a requeued reward never blocks a waiting refusal (640x360)', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 360 });
    await boot(page, '?seed=3&debug=1&calm=1');
    const { a, b, c } = await page.evaluate(() => ({
      a: window.__PK__!.debugAdd!('plain', 300, 1150),
      b: window.__PK__!.debugAdd!('water', 800, 1150),
      // Low on screen, well clear of the feedback card, so pressing it really holds it.
      c: window.__PK__!.debugAdd!('fire', 1300, 1700),
    }));
    await page.waitForTimeout(200);
    await dropOnto(page, a, b);
    await expect(page.locator('.feedback')).toContainText('New discovery');
    // Hold a kid (feedback freezes), queue a refusal, then a banner that settles the drag
    // and leaves room for the short refusal but not the reward card.
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
      return [...document.querySelectorAll('.top-stack > *, .tray, .dex-button')].some((e) => {
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
    const { a, b, c } = await page.evaluate(() => ({
      a: window.__PK__!.debugAdd!('plain', 250, 1500),
      b: window.__PK__!.debugAdd!('water', 830, 700),
      c: window.__PK__!.debugAdd!('fire', 300, 1650),
    }));
    await page.waitForTimeout(200);
    await dropOnto(page, a, b);
    await expect(page.locator('.feedback')).toContainText('New discovery');
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
  const { hero, glass } = await page.evaluate(() => ({ hero: window.__PK__!.debugAdd!('hero', 300, 1500), glass: window.__PK__!.debugAdd!('glassblower', 830, 700) }));
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
  const { hero, glass } = await page.evaluate(() => ({ hero: window.__PK__!.debugAdd!('hero', 300, 1500), glass: window.__PK__!.debugAdd!('glassblower', 830, 700) }));
  for (const id of [hero, glass]) await expect.poll(() => page.evaluate((k) => !!window.__PK__!.screenPointOf(k), id)).toBe(true);
  await dropOnto(page, hero, glass);
  await expect.poll(() => page.evaluate(() => window.__PK__!.kids().map((k) => k.type))).toContain('lantern');
  const lantern = await page.evaluate(() => window.__PK__!.kids().find((k) => k.type === 'lantern')!.id);
  await expect(page.locator('.feedback')).toContainText('New discovery', { timeout: 15_000 });
  expect(await page.evaluate((id) => !!window.__PK__!.screenPointOf(id), lantern)).toBe(true);
  expect(errors).toEqual([]);
});

test.describe('short viewports with a persistent banner (GUI_MVP §3.1)', () => {
  const measure = (page: Page) =>
    page.evaluate(() => ({
      mode: document.querySelector('.hud')!.getAttribute('data-mode'),
      fit: document.documentElement.dataset.hudFit,
      band:
        Math.min(document.querySelector('.tray')!.getBoundingClientRect().top, document.querySelector('.dex-button')!.getBoundingClientRect().top) -
        document.querySelector('.top-stack')!.getBoundingClientRect().bottom,
    }));

  for (const kind of ['unsaved', 'recovery'] as const) {
    test(`568x320 with the ${kind} banner keeps the 44 px band via the two-row HUD`, async ({ page }) => {
      await page.setViewportSize({ width: 568, height: 320 });
      await boot(page, '?seed=3&debug=1&calm=1');
      await page.evaluate((k) => window.__PK__!.debugSaveStatus!({ unsaved: k === 'unsaved', recovery: k === 'recovery', readOnly: false }), kind);
      await expect.poll(() => measure(page)).toMatchObject({ mode: 'tworow', fit: 'usual' });
      // 44 px of play plus the two 8 px world gaps.
      expect((await measure(page)).band).toBeGreaterThanOrEqual(44 + 16);
    });
  }

  test('640x360 keeps the usual compact HUD; dismissing restores the usual layout at 568x320', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 360 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: false, recovery: true, readOnly: false }));
    await expect.poll(() => measure(page)).toMatchObject({ mode: 'compact', fit: 'usual' });
    await page.setViewportSize({ width: 568, height: 320 });
    await expect.poll(() => measure(page)).toMatchObject({ mode: 'tworow' });
    await page.getByRole('button', { name: 'Dismiss save recovery notice' }).click();
    await expect.poll(() => measure(page)).toMatchObject({ mode: 'portrait', fit: 'usual' });
  });

  test('too short for any HUD and the band: the world hides and the GUI becomes a page', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 200 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false }));
    await expect.poll(() => measure(page)).toMatchObject({ fit: 'page' });
    await expect(page.locator('#app')).toBeHidden();
    await expect(page.locator('.page-hint')).toBeVisible();
    await page.locator('.tray').scrollIntoViewIfNeeded();
    // Really shown, not clipped to 1 px by the compact rule (Codex review, PR #37).
    expect(await page.locator('.tray-label').first().evaluate((e) => e.getBoundingClientRect().width)).toBeGreaterThan(20);
    await page.setViewportSize({ width: 568, height: 700 });
    await expect.poll(() => measure(page)).toMatchObject({ fit: 'usual' });
    await expect(page.locator('#app')).toBeVisible();
  });

  test('the HUD scroll window keeps its offset across re-measurement', async ({ page }) => {
    await page.setViewportSize({ width: 340, height: 330 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false }));
    await expect.poll(() => measure(page)).toMatchObject({ fit: 'window' });
    await page.locator('.hud').evaluate((e) => (e.scrollTop = 40));
    const before = await page.locator('.hud').evaluate((e) => e.scrollTop);
    expect(before).toBeGreaterThan(0);
    await page.setViewportSize({ width: 340, height: 332 });
    await expect.poll(() => measure(page)).toMatchObject({ fit: 'window' });
    await page.waitForTimeout(200);
    expect(await page.locator('.hud').evaluate((e) => e.scrollTop)).toBe(before);
  });
});

test.describe('building sheets (GUI_MVP §§2, 4, 5)', () => {
  const garden = (page: Page) => page.locator('.tray-cell').nth(0);
  const bias = (page: Page) => page.locator('.tray-cell').nth(2);

  test('the Garden upgrades in place, and an unaffordable upgrade sends nothing', async ({ page }) => {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    await garden(page).click();
    const action = page.locator('.sheet-action');
    await expect(action).toHaveAttribute('aria-disabled', 'true');
    await action.click({ force: true }); // a deliberate tap on the disabled control
    await page.waitForTimeout(300);
    expect((await page.evaluate(() => window.__PK__!.buildings())).levels.garden).toBe(1);
    // Nothing was sent: the engine would have answered with a refusal.
    await expect(page.locator('.sheet-status')).toBeHidden();
    await page.evaluate(() => window.__PK__!.debugGive!({ materials: 100 }));
    await expect(action).toHaveAttribute('aria-disabled', 'false');
    const before = await page.evaluate(() => window.__PK__!.wallet().materials);
    await action.click();
    await expect(page.locator('.sheet-status')).toContainText('Garden is now level 2.');
    expect((await page.evaluate(() => window.__PK__!.buildings())).levels.garden).toBe(2);
    expect(await page.evaluate(() => window.__PK__!.wallet().materials)).toBeLessThan(before);
    await expect(page.locator('.sheet-subtitle')).toHaveText('Level 2 / 10');
    await expect(page.locator('.sheet')).toBeVisible(); // stays open
    expect(errors).toEqual([]);
  });

  test('an engine refusal shows inside the sheet, never as a world card', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugGive!({ materials: 32 }));
    await garden(page).click();
    // Send the upgrade, then lose the Materials before the sim applies it.
    await page.evaluate(() => {
      (document.querySelector('.sheet-action') as HTMLButtonElement).click();
      window.__PK__!.debugGive!({ materials: -32 });
    });
    await expect(page.locator('.sheet-status')).toContainText('Not enough Materials.');
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
    await bias(page).click();
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
    const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 540, 1300));
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
    const { a, b } = await page.evaluate(() => ({ a: window.__PK__!.debugAdd!('plain', 250, 1500), b: window.__PK__!.debugAdd!('water', 830, 700) }));
    await page.waitForTimeout(200);
    await dropOnto(page, a, b);
    await expect(page.locator('.feedback')).toContainText('New discovery');
    await garden(page).click();
    await page.waitForTimeout(3200); // longer than a card's 2.5 s
    await page.keyboard.press('Escape');
    expect(await page.locator('.feedback').textContent()).toContain('New discovery');
  });

  test('opening a sheet ends a pan in progress (Codex review, PR #39)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    // Start panning on empty ground.
    await page.mouse.move(200, 600);
    await page.mouse.down();
    await page.mouse.move(220, 560, { steps: 3 });
    await page.evaluate(() => (document.querySelectorAll('.tray-cell')[0] as HTMLButtonElement).click());
    await expect(page.locator('.sheet')).toBeVisible();
    const before = await page.evaluate(() => window.__PK__!.worldToScreen(1000, 1000));
    await page.mouse.move(300, 300, { steps: 5 });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__PK__!.worldToScreen(1000, 1000))).toEqual(before);
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
    await page.locator('.tray-cell').nth(0).scrollIntoViewIfNeeded();
    await page.locator('.tray-cell').nth(0).click();
    const action = page.locator('.sheet-action');
    await action.scrollIntoViewIfNeeded();
    await expect(action).toBeInViewport();
    expect(await page.locator('.sheet-body').evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThan(100);
  });

  test('a refusal on a short sheet scrolls into view (Codex review, PR #39)', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 360 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugGive!({ materials: 32 }));
    await garden(page).click();
    await page.evaluate(() => {
      (document.querySelector('.sheet-action') as HTMLButtonElement).click();
      window.__PK__!.debugGive!({ materials: -32 });
    });
    await expect(page.locator('.sheet-status')).toContainText('Not enough Materials.');
    const inBody = await page.evaluate(() => {
      const r = document.querySelector('.sheet-status')!.getBoundingClientRect();
      const body = document.querySelector('.sheet-body')!.getBoundingClientRect();
      return r.top >= body.top - 1 && r.bottom <= body.bottom + 1;
    });
    expect(inBody).toBe(true);
  });

  test('keyboard: Shift+Tab from the heading stays in the sheet; arrows move and select seeds (Codex review, PR #39)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1');
    await page.evaluate(() => window.__PK__!.debugGive!({ materials: 100 }));
    await bias(page).click();
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


test.describe('Compendium, offline summary and Settings (GUI_MVP §§6, 8, 11)', () => {
  const garden = (page: Page) => page.locator('.tray-cell').nth(0);
  const compendium = (page: Page) => page.locator('.tray-cell').nth(3);
  const zeroMaterials = (page: Page) => page.evaluate(() => window.__PK__!.debugGive!({ materials: -window.__PK__!.wallet().materials }));

  /** A calm game with Potato and Fire discovered and the Compendium built. */
  async function built(page: Page): Promise<string[]> {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => {
      window.__PK__!.debugAdd!('plain', 250, 1500);
      window.__PK__!.debugAdd!('fire', 830, 1500);
      window.__PK__!.debugGive!({ materials: 120 });
      window.__PK__!.debugCommand!({ type: 'upgrade', building: 'compendium' });
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.buildings().levels.compendium)).toBe(1);
    return errors;
  }

  test('the Compendium builds in place, then brings a kid back for either currency', async ({ page }) => {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugAdd!('plain', 250, 1500));
    await compendium(page).click();
    await expect(page.locator('.sheet-subtitle')).toHaveText('Level 0 / 1');
    const build = page.locator('.sheet-action');
    await expect(build).toHaveAttribute('aria-disabled', 'true');
    await page.evaluate(() => window.__PK__!.debugGive!({ materials: 120 }));
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
    await expect(mat).toHaveAttribute('aria-label', 'Bring back Potato Kid for 40 Materials: Not enough Materials.');
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
    await page.evaluate(() => window.__PK__!.debugGive!({ materials: 40 }));
    await compendium(page).click();
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
            for (let i = 0; window.__PK__!.kids().length < 12 && i < 40; i++) window.__PK__!.debugAdd!('plain', 150 + (i % 5) * 200, 1900 + Math.floor(i / 5) * 250);
          });
          await page.waitForTimeout(300);
          return page.evaluate(() => window.__PK__!.kids().length);
        },
        { timeout: 10_000 },
      )
      .toBe(12);
    await compendium(page).click();
    await expect(page.locator('.sheet-bar .sheet-status')).toContainText('Garden is full. Make room for a kid.');
    for (const b of await page.locator('.comp-buy').all()) {
      await expect(b).toHaveAttribute('aria-disabled', 'true');
      await expect(b).toHaveClass(/is-full/);
      await expect(b).toHaveAttribute('aria-label', /: Garden is full\. Make room for a kid\.$/);
    }
  });

  test('search matches discovered names only', async ({ page }) => {
    await built(page);
    await compendium(page).click();
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
    await page.evaluate(() => window.__PK__!.debugAdd!('plain', 250, 1500));
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
    await page.evaluate(() => window.__PK__!.debugAdd!('plain', 250, 1500));
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

  test('an absence beyond the cap says what was not credited', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugAway!(9 * 3600_000));
    const summary = page.getByRole('dialog', { name: 'Welcome back' });
    await expect(summary).toContainText('Time credited: 8 h 0 m');
    await expect(summary).toContainText('Capped at 8 h; extra time was not credited.');
    // Abbreviated Materials also show the exact amount.
    await expect(summary.locator('.stat-exact')).toHaveText(/^\([\d,]+ Materials\)$/);
    await page.keyboard.press('Escape');
    await expect(summary).toBeHidden();
    await expect(page.locator('.sheet')).toHaveCount(0);
  });

  test('Settings: Audio Off disables the sliders; choices persist across a reload', async ({ page }) => {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    await page.getByRole('button', { name: 'Settings' }).click();
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
    expect(await page.evaluate(() => window.__PK__!.settings())).toEqual({ audio: true, music: 100, sfx: 80 });

    await page.evaluate(() => window.__PK__!.debugAway!(0)); // the game is saved, so the reload resumes it
    await page.reload();
    await page.waitForFunction(() => window.__PK__?.ready === true);
    expect(await page.evaluate(() => window.__PK__!.settings())).toEqual({ audio: true, music: 100, sfx: 80 });
    // A reload a moment later is too short an absence for the summary (D-049).
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByLabel('Music')).toHaveValue('100');
    expect(errors).toEqual([]);
  });

  test('read-only disables the Compendium launcher too', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: false, recovery: false, readOnly: true }));
    await expect(compendium(page)).toBeDisabled();
    await expect(compendium(page)).toHaveAttribute('aria-label', 'Compendium: Update the game to continue.');
  });
  test('a short screen with a banner and a status keeps search and cards reachable (Codex review, PR #41)', async ({ page }) => {
    await built(page);
    await page.setViewportSize({ width: 568, height: 320 });
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false }));
    await page.evaluate(() => window.__PK__!.debugGive!({ materials: 1000, potatokens: 50 }));
    await compendium(page).click({ force: true });
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
      types.forEach((t, i) => window.__PK__!.debugAdd!(t, 150 + (i % 4) * 260, 300 + Math.floor(i / 4) * 300));
    });
    await compendium(page).click();
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
    await compendium(page).click();
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
      types.forEach((t, i) => window.__PK__!.debugAdd!(t, 150 + (i % 4) * 260, 300 + Math.floor(i / 4) * 300));
      window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false });
    });
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.hudFit)).toBe('page');
    await compendium(page).scrollIntoViewIfNeeded();
    await compendium(page).click();
    await expect(page.locator('.comp-card')).toHaveCount(10);
    await page.locator('.comp-card').nth(6).scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => document.scrollingElement!.scrollTop);
    expect(before).toBeGreaterThan(200);
    await page.evaluate(() => window.__PK__!.debugAway!(60_000));
    await page.getByRole('dialog', { name: 'Welcome back' }).getByRole('button', { name: 'Back to the garden' }).click();
    await expect(page.getByRole('dialog', { name: 'Compendium' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(before);
  });

  test('page mode: re-measuring the HUD keeps the page where it was', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 200 });
    await built(page);
    await page.evaluate(() => {
      ['water', 'snow', 'wind', 'stone', 'chef', 'sprout'].forEach((t, i) => window.__PK__!.debugAdd!(t, 150 + (i % 4) * 260, 300 + Math.floor(i / 4) * 300));
      window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false });
    });
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.hudFit)).toBe('page');
    await compendium(page).scrollIntoViewIfNeeded();
    await compendium(page).click();
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
      types.forEach((t, i) => window.__PK__!.debugAdd!(t, 150 + (i % 4) * 260, 300 + Math.floor(i / 4) * 300));
      window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false });
    });
    await compendium(page).click({ force: true });
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

test.describe('Potato-Dex (GUI_MVP §§7, 9)', () => {
  const dexButton = (page: Page) => page.locator('.dex-button');
  const dialog = (page: Page) => page.getByRole('dialog', { name: 'Potato-Dex' });
  const totals = {
    kids: (JSON.parse(readFileSync('src/content/kids.json', 'utf8')) as unknown[]).length,
    recipes: (JSON.parse(readFileSync('src/content/recipes.json', 'utf8')) as unknown[]).length,
  };

  /** A calm game with exactly Potato and Water discovered (no recipe found yet). */
  async function twoKnown(page: Page): Promise<string[]> {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => {
      window.__PK__!.debugAdd!('plain', 250, 1500);
      window.__PK__!.debugAdd!('water', 830, 1500);
    });
    return errors;
  }

  test('the whole roster: discovered kids first, then identical packets that reveal nothing', async ({ page }) => {
    const errors = await twoKnown(page);
    await dexButton(page).click();
    await expect(dialog(page).locator('.sheet-subtitle')).toHaveText(`2 / ${totals.kids} discovered`);
    const cells = dialog(page).locator('.dex-cell');
    await expect(cells).toHaveCount(totals.kids);
    // Discovered first, in roster order, then packets: a packet's position says nothing.
    await expect(cells.nth(0)).toHaveAttribute('role', 'listitem');
    await expect(cells.nth(0).locator('.dex-tile')).toHaveAttribute('aria-label', 'Potato Kid, Tier 1');
    await expect(cells.nth(1).locator('.dex-tile')).toHaveAttribute('aria-label', 'Water Kid, Tier 1');
    await expect(cells.nth(1).locator('.dex-tile-name')).toHaveText('Water');
    const packets = dialog(page).locator('.dex-unknown');
    await expect(packets).toHaveCount(totals.kids - 2);
    // Every packet is identical: same text, no tier, no data, not a button.
    const html = await packets.evaluateAll((els) => [...new Set(els.map((e) => e.outerHTML))]);
    expect(html).toHaveLength(1);
    expect(html[0]).not.toMatch(/tier|data-kid|button/i);
    expect(await dialog(page).locator('.dex-cell').nth(2).locator('.dex-unknown').count()).toBe(1);
    expect(errors).toEqual([]);
  });

  test('search finds discovered names only', async ({ page }) => {
    await twoKnown(page);
    await dexButton(page).click();
    const field = dialog(page).getByLabel('Find a discovered kid');
    await field.fill('wat');
    await expect(dialog(page).locator('.dex-cell:visible')).toHaveCount(1);
    await expect(dialog(page).getByText(`${totals.kids - 2} still undiscovered`)).toBeVisible();
    // An undiscovered kid is never found, by its name or its id.
    for (const q of ['Firefighter', 'firefighter', 'steam']) {
      await field.fill(q);
      await expect(dialog(page).locator('.dex-cell:visible')).toHaveCount(0);
      await expect(dialog(page).getByText('No discovered kids match.')).toBeVisible();
    }
  });

  test('recipes are revealed by being made, not by knowing their kids', async ({ page }) => {
    await twoKnown(page);
    // Firefighter discovered too, but Potato + Water was never fused: still unknown.
    await page.evaluate(() => window.__PK__!.debugAdd!('firefighter', 540, 2200));
    await dexButton(page).click();
    await dialog(page).getByRole('tab', { name: 'Recipes' }).click();
    await expect(dialog(page).getByText(`0 / ${totals.recipes} recipes found`)).toBeVisible();
    await expect(dialog(page).locator('.dex-recipe')).toHaveCount(0);
    await expect(dialog(page).locator('.dex-recipe-unknown')).toHaveCount(totals.recipes);
    // Every unknown card is the same packet and words: no symbols, portraits or tier.
    const unknown = await dialog(page).locator('.dex-recipe-unknown').evaluateAll((els) => [...new Set(els.map((e) => e.textContent))]);
    expect(unknown).toEqual(['Unknown recipeKeep experimenting.']);
    await expect(dialog(page).locator('.dex-recipe-unknown .portrait, .dex-recipe-unknown .tier, .dex-recipe-unknown .dex-sym')).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Fuse Potato and Water: two kids placed on one spot end up touching.
    await page.evaluate(() => {
      window.__PK__!.debugAdd!('plain', 540, 2600);
      window.__PK__!.debugAdd!('water', 540, 2600);
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.discoveredRecipes())).toContain('plain|water');
    await dexButton(page).click();
    // The Dex reopens on the tab it was left on.
    await expect(dialog(page).getByRole('tab', { name: 'Recipes' })).toHaveAttribute('aria-selected', 'true');
    await expect(dialog(page).getByText(`1 / ${totals.recipes} recipes found`)).toBeVisible();
    const row = dialog(page).locator('.dex-recipe');
    await expect(row).toHaveCount(1);
    await expect(row).toHaveAttribute('aria-label', 'Potato Kid plus Water Kid makes Firefighter Kid');
    await expect(row.locator('.dex-end-name')).toHaveText(['Potato', 'Water', 'Firefighter']);
    await expect(dialog(page).locator('.dex-recipe-unknown')).toHaveCount(totals.recipes - 1);
  });

  test('a kid’s detail: income and found recipes; Back returns to its tile', async ({ page }) => {
    await twoKnown(page);
    await page.evaluate(() => {
      window.__PK__!.debugAdd!('plain', 540, 2600);
      window.__PK__!.debugAdd!('water', 540, 2600);
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.discoveredRecipes())).toContain('plain|water');
    await dexButton(page).click();
    await dialog(page).getByRole('button', { name: 'Water Kid, Tier 1' }).click();
    await expect(dialog(page).locator('.dex-detail-name')).toHaveText('Water Kid');
    await expect(dialog(page).getByText('Earns 0.5 Materials / s')).toBeVisible();
    await expect(dialog(page).locator('.dex-detail .dex-recipe')).toHaveAttribute('aria-label', 'Potato Kid plus Water Kid makes Firefighter Kid');
    await expect(dialog(page).getByRole('button', { name: 'Back to kids' })).toBeFocused();
    // Tier-2 Firefighter, no recipe of its own made yet (it is only a result here).
    await dialog(page).getByRole('button', { name: 'Back to kids' }).click();
    await expect(dialog(page).getByRole('button', { name: 'Water Kid, Tier 1' })).toBeFocused();
    await dialog(page).getByRole('button', { name: 'Firefighter Kid, Tier 2' }).click();
    await expect(dialog(page).getByText('Earns 1 Materials / s')).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Back to kids' }).click();
    await page.evaluate(() => window.__PK__!.debugAdd!('snow', 830, 2200));
    await dialog(page).getByRole('button', { name: 'Snow Kid, Tier 1' }).click();
    await expect(dialog(page).getByText('No recipes found for this kid yet.')).toBeVisible();
  });

  test('tab, search and scroll are kept across closing and reopening', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 640 });
    await twoKnown(page);
    await dexButton(page).click();
    await dialog(page).getByLabel('Find a discovered kid').fill('pot');
    await page.keyboard.press('Escape');
    await dexButton(page).click();
    await expect(dialog(page).getByLabel('Find a discovered kid')).toHaveValue('pot');
    await dialog(page).getByLabel('Find a discovered kid').fill('');
    // Mid-list, away from either end, so no clamping is involved.
    await dialog(page).locator('.sheet-body').evaluate((e) => (e.scrollTop = 600));
    const before = await dialog(page).locator('.sheet-body').evaluate((e) => e.scrollTop);
    expect(before).toBe(600);
    await dialog(page).getByRole('tab', { name: 'Recipes' }).click();
    await dialog(page).getByRole('tab', { name: 'Kids' }).click();
    await expect.poll(() => dialog(page).locator('.sheet-body').evaluate((e) => e.scrollTop)).toBe(before);
    // A scroll made just before closing is kept too.
    await dialog(page).locator('.sheet-body').evaluate((e) => (e.scrollTop = 300));
    await frames(page, 2);
    await page.keyboard.press('Escape');
    await dexButton(page).click();
    await expect.poll(() => dialog(page).locator('.sheet-body').evaluate((e) => e.scrollTop)).toBe(300);
  });

  test('the tab strip is one tab stop; arrows move and select', async ({ page }) => {
    await twoKnown(page);
    await dexButton(page).click();
    const kids = dialog(page).getByRole('tab', { name: 'Kids' });
    await kids.focus();
    await page.keyboard.press('ArrowRight');
    await expect(dialog(page).getByRole('tab', { name: 'Recipes' })).toBeFocused();
    await expect(dialog(page).getByRole('tab', { name: 'Recipes' })).toHaveAttribute('aria-selected', 'true');
    await expect(kids).toHaveAttribute('tabindex', '-1');
    await page.keyboard.press('End');
    await expect(dialog(page).getByRole('tab', { name: 'Compendium' })).toHaveAttribute('aria-selected', 'true');
  });

  test('the Compendium tab reaches the same states as the tray, with its own subtitle', async ({ page }) => {
    await twoKnown(page);
    await dexButton(page).click();
    await dialog(page).getByRole('tab', { name: 'Compendium' }).click();
    await expect(dialog(page).locator('.sheet-subtitle')).toHaveText('Level 0 / 1');
    await page.evaluate(() => window.__PK__!.debugGive!({ materials: 120 }));
    await dialog(page).getByRole('button', { name: /Build Compendium/ }).click();
    await expect(dialog(page).locator('.sheet-subtitle')).toHaveText('Level 1 / 1 · Fully built');
    await expect(dialog(page).locator('.comp-card')).toHaveCount(2);
    await page.evaluate(() => window.__PK__!.debugGive!({ potatokens: 5 }));
    const before = await page.evaluate(() => window.__PK__!.kids().length);
    await dialog(page).getByRole('button', { name: 'Bring back Water Kid for 1 Potatokens' }).click();
    await expect(dialog(page).locator('.comp-arrived:visible')).toHaveCount(1);
    expect(await page.evaluate(() => window.__PK__!.kids().length)).toBe(before + 1);
    // Back to Kids: the Dex subtitle returns.
    await dialog(page).getByRole('tab', { name: 'Kids' }).click();
    await expect(dialog(page).locator('.sheet-subtitle')).toHaveText(/^2 \/ \d+ discovered$/);
  });

  test('a discovery card opens that kid in the Dex', async ({ page }) => {
    await twoKnown(page);
    await page.evaluate(() => {
      window.__PK__!.debugAdd!('plain', 540, 2600);
      window.__PK__!.debugAdd!('water', 540, 2600);
    });
    const card = page.locator('.feedback .toast-button');
    await expect(card).toContainText('Firefighter Kid', { timeout: 10_000 });
    await card.click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).locator('.dex-detail-name')).toHaveText('Firefighter Kid');
  });

  test('Tab wraps inside the Dex: inactive tabs are not tab stops (Codex review, PR #43)', async ({ page }) => {
    await twoKnown(page);
    await dexButton(page).click();
    await dialog(page).getByRole('tab', { name: 'Recipes' }).click();
    // On Recipes the last real stop is the Recipes tab; Tab from it must wrap, not escape.
    // (Chrome may also stop on a scrollable body, so keep pressing.)
    await dialog(page).getByRole('tab', { name: 'Recipes' }).focus();
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    }
  });

  test('an open detail shows a recipe found while it is up (Codex review, PR #43)', async ({ page }) => {
    await twoKnown(page);
    await dexButton(page).click();
    await dialog(page).getByRole('button', { name: 'Water Kid, Tier 1' }).click();
    await expect(dialog(page).getByText('No recipes found for this kid yet.')).toBeVisible();
    await page.evaluate(() => {
      window.__PK__!.debugAdd!('plain', 540, 2600);
      window.__PK__!.debugAdd!('water', 540, 2600);
    });
    await expect(dialog(page).locator('.dex-detail .dex-recipe')).toHaveAttribute('aria-label', 'Potato Kid plus Water Kid makes Firefighter Kid');
    await expect(dialog(page).getByRole('button', { name: 'Back to kids' })).toBeFocused();
  });

  test('the Dex Compendium tab keeps its scroll through the offline summary (Codex review, PR #43)', async ({ page }) => {
    await twoKnown(page);
    await page.evaluate(() => {
      ['snow', 'wind', 'stone', 'chef', 'sprout', 'sail', 'kite', 'builder', 'forge', 'steam', 'hero', 'fire'].forEach((t, i) =>
        window.__PK__!.debugAdd!(t, 150 + (i % 4) * 260, 300 + Math.floor(i / 4) * 300),
      );
      window.__PK__!.debugGive!({ materials: 120 });
      window.__PK__!.debugCommand!({ type: 'upgrade', building: 'compendium' });
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.buildings().levels.compendium)).toBe(1);
    await dexButton(page).click();
    await dialog(page).getByRole('tab', { name: 'Compendium' }).click();
    // Placed kids may fuse into more types; any long list will do.
    await expect.poll(() => dialog(page).locator('.comp-card').count()).toBeGreaterThanOrEqual(10);
    await dialog(page).locator('.sheet-body').evaluate((e) => (e.scrollTop = 700));
    await frames(page, 2);
    await page.evaluate(() => window.__PK__!.debugAway!(60_000));
    await page.getByRole('dialog', { name: 'Welcome back' }).getByRole('button', { name: 'Back to the garden' }).click();
    await expect(dialog(page).getByRole('tab', { name: 'Compendium' })).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => dialog(page).locator('.sheet-body').evaluate((e) => e.scrollTop)).toBe(700);
  });

  test('Back focuses the search field when the kept search hides the kid (Codex review, PR #43)', async ({ page }) => {
    await twoKnown(page);
    await dexButton(page).click();
    await dialog(page).getByLabel('Find a discovered kid').fill('wat');
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      window.__PK__!.debugAdd!('plain', 540, 2600);
      window.__PK__!.debugAdd!('water', 540, 2600);
    });
    const card = page.locator('.feedback .toast-button');
    await expect(card).toContainText('Firefighter Kid', { timeout: 10_000 });
    await card.click();
    await expect(dialog(page).locator('.dex-detail-name')).toHaveText('Firefighter Kid');
    await dialog(page).getByRole('button', { name: 'Back to kids' }).click();
    await expect(dialog(page).getByLabel('Find a discovered kid')).toBeFocused();
  });

  test('an open detail comes back after the offline summary (Codex review, PR #43)', async ({ page }) => {
    await twoKnown(page);
    await dexButton(page).click();
    await dialog(page).getByRole('button', { name: 'Water Kid, Tier 1' }).click();
    await expect(dialog(page).locator('.dex-detail-name')).toHaveText('Water Kid');
    await page.evaluate(() => window.__PK__!.debugAway!(60_000));
    await page.getByRole('dialog', { name: 'Welcome back' }).getByRole('button', { name: 'Back to the garden' }).click();
    await expect(dialog(page).locator('.dex-detail-name')).toHaveText('Water Kid');
    // Back still returns to the grid, at its tile.
    await dialog(page).getByRole('button', { name: 'Back to kids' }).click();
    await expect(dialog(page).getByRole('button', { name: 'Water Kid, Tier 1' })).toBeFocused();
  });

  test('closing a Dex opened from a discovery card returns focus to the card (Codex review, PR #43)', async ({ page }) => {
    await twoKnown(page);
    await page.evaluate(() => {
      window.__PK__!.debugAdd!('plain', 540, 2600);
      window.__PK__!.debugAdd!('water', 540, 2600);
    });
    const card = page.locator('.feedback .toast-button');
    await expect(card).toContainText('Firefighter Kid', { timeout: 10_000 });
    await card.focus();
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(card).toBeFocused();
  });

  test('read-only disables the Dex with its reason', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: false, recovery: false, readOnly: true }));
    await expect(dexButton(page)).toBeDisabled();
    await expect(dexButton(page)).toHaveAttribute('aria-label', 'Potato-Dex: Update the game to continue.');
  });
});

test.describe('Send home, drag path (D-048, GUI_MVP §13)', () => {
  /** Picks a kid up and holds it over the Garden target for `ms`, then releases. */
  async function holdOverHome(page: Page, id: number, ms: number): Promise<void> {
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    const t = await page.evaluate(() => window.__PK__!.worldToScreen(1080, 428));
    await page.mouse.move(k.x, k.y - 20);
    await page.mouse.down();
    await page.mouse.move(t.x, t.y, { steps: 8 });
    await page.waitForTimeout(ms);
    await page.mouse.up();
  }

  async function setup(page: Page): Promise<{ id: number; errors: string[] }> {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.centerOn(1080, 760));
    const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 760, 1000));
    await page.waitForTimeout(200);
    return { id, errors };
  }

  test('holding over the Garden, then releasing, sends the kid home', async ({ page }) => {
    const { id, errors } = await setup(page);
    const wallet = await page.evaluate(() => window.__PK__!.wallet());
    await holdOverHome(page, id, 450);
    await expect.poll(() => page.evaluate((i) => window.__PK__!.kids().some((k) => k.id === i), id)).toBe(false);
    // It waves goodbye apart from the sim, then is gone.
    expect(await page.evaluate(() => window.__PK__!.home().departing)).toBe(1);
    await expect.poll(() => page.evaluate(() => window.__PK__!.home().departing)).toBe(0);
    // Still discovered; no refund.
    await page.locator('.dex-button').click();
    await expect(page.getByRole('button', { name: 'Fire Kid, Tier 1' })).toBeVisible();
    const after = await page.evaluate(() => window.__PK__!.wallet());
    expect(after.potatokens).toBe(wallet.potatokens);
    expect(errors).toEqual([]);
  });

  test('releasing before the 400 ms dwell places the kid normally', async ({ page }) => {
    const { id } = await setup(page);
    await holdOverHome(page, id, 120);
    await page.waitForTimeout(300);
    expect(await page.evaluate((i) => window.__PK__!.kids().some((k) => k.id === i), id)).toBe(true);
    expect(await page.evaluate(() => window.__PK__!.home())).toMatchObject({ state: 'hidden', departing: 0 });
  });

  test('the target labels each state, and hides when no kid is held', async ({ page }) => {
    const { id } = await setup(page);
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    const t = await page.evaluate(() => window.__PK__!.worldToScreen(1080, 428));
    await expect(page.locator('.home-label:not(.home-probe)')).toBeHidden();
    await page.mouse.move(k.x, k.y - 20);
    await page.mouse.down();
    await page.mouse.move(k.x + 30, k.y + 120, { steps: 6 });
    await expect(page.locator('.home-label:not(.home-probe) .home-heading')).toHaveText('Send home');
    await page.mouse.move(t.x, t.y, { steps: 6 });
    await expect(page.locator('.home-label:not(.home-probe) .home-heading')).toHaveText('Keep holding…');
    await expect(page.locator('.home-label:not(.home-probe) .home-heading')).toHaveText('Release to send home');
    await expect(page.locator('.home-target')).toHaveAttribute('data-state', 'ready');
    // Moving off resets: back to "Send home", and releasing there drops normally.
    await page.mouse.move(k.x + 30, k.y + 120, { steps: 6 });
    await expect(page.locator('.home-label:not(.home-probe) .home-heading')).toHaveText('Send home');
    await page.mouse.up();
    await expect(page.locator('.home-label:not(.home-probe)')).toBeHidden();
    expect(await page.evaluate((i) => window.__PK__!.kids().some((k) => k.id === i), id)).toBe(true);
  });

  test('a view change just before release restarts the dwell (Codex review, PR #50)', async ({ page }) => {
    const { id } = await setup(page);
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    const t = await page.evaluate(() => window.__PK__!.worldToScreen(1080, 428));
    await page.mouse.move(k.x, k.y - 20);
    await page.mouse.down();
    await page.mouse.move(t.x, t.y, { steps: 8 });
    await expect.poll(() => page.evaluate(() => window.__PK__!.home().state)).toBe('ready');
    // In one task, with no frame between: the camera moves a world unit, then release.
    await page.evaluate(([x, y]) => {
      window.__PK__!.centerOn(1080, 761);
      document.querySelector('canvas')!.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, bubbles: true }));
    }, [t.x, t.y] as const);
    await page.waitForTimeout(300);
    expect(await page.evaluate((i) => window.__PK__!.kids().some((c) => c.id === i), id)).toBe(true);
  });

  test('a farewell ends at once rather than overlap a kid that arrives on its spot', async ({ page }) => {
    const { id } = await setup(page);
    await holdOverHome(page, id, 450);
    await expect.poll(() => page.evaluate(() => window.__PK__!.home().departing)).toBe(1);
    // A kid appears right where the departing view stands (the sim knows nothing of it).
    await page.evaluate(() => {
      const at = window.__PK__!.home().departingAt[0]!;
      window.__PK__!.debugAdd!('water', at.x, at.y);
    });
    await frames(page, 3);
    expect(await page.evaluate(() => window.__PK__!.home().departing)).toBe(0);
  });

  test('a drop by the spawn outlet, below the target, is an ordinary drop', async ({ page }) => {
    const { id } = await setup(page);
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    // Just below the target's bottom edge (world y 556): outside, however long it is held.
    const below = await page.evaluate(() => window.__PK__!.worldToScreen(1080, 640));
    await page.mouse.move(k.x, k.y - 20);
    await page.mouse.down();
    await page.mouse.move(below.x, below.y, { steps: 8 });
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.__PK__!.home().state)).toBe('shown');
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await page.evaluate((i) => window.__PK__!.kids().some((k) => k.id === i), id)).toBe(true);
  });
});
