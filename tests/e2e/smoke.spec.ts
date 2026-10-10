import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

async function boot(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__PK__?.ready === true);
  // The world scrolls (D-040): debug tests place kids around world (540, 1100), so look there.
  if (query.includes('debug=1')) await page.evaluate(() => window.__PK__!.centerOn(1620, 3980));
  return errors;
}

// Prices from the shipped balance, computed as the sim computes them, so tuning (D-052)
// never strands a test with a stale amount.
const balance = JSON.parse(readFileSync('src/content/balance.json', 'utf8')) as {
  buildings: Record<string, { costBase: number; costGrowth: number }>;
  economy: { respawnMaterials: number; materialsPerSecond: number };
  planting: { growSeconds: number; unlockCostBase: number; unlockCostGrowth: number; startPlots: number };
};
/** Materials to unlock the plot after the `unlocked` ones. */
const plotPrice = (unlocked: number) => Math.ceil(balance.planting.unlockCostBase * balance.planting.unlockCostGrowth ** (unlocked - balance.planting.startPlots));
/** Materials to upgrade `building` from `level`. */
const price = (building: string, level: number) => Math.ceil(balance.buildings[building]!.costBase * balance.buildings[building]!.costGrowth ** level);
/** Materials to bring back a kid of `tier` from the Compendium. */
const respawnPrice = (tier: number) => Math.ceil(balance.economy.respawnMaterials * 2 ** (tier - 1));

/** Opens one of the Notebook's tools (GUI_MVP §19.2): the Notebook, then that row. */
async function openTool(page: Page, label: 'Capacity' | 'Spawn bias' | 'Compendium' | 'Map view' | 'Settings'): Promise<void> {
  await page.locator('[data-nav=notebook]').click();
  await page.getByRole('dialog', { name: 'Notebook' }).getByRole('button', { name: label, exact: true }).click();
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
  await page.screenshot({ path: 'test-results/boot.png' });
  // The timer lives in the Garden's Arrivals now (GUI_MVP §19.2).
  await page.locator('[data-nav=garden]').click();
  await expect(page.locator('.arrivals-next')).toContainText('Next kid');
  expect(errors).toEqual([]);
});

test('dragging a plain kid onto a water kid makes a firefighter (R1)', async ({ page }) => {
  const errors = await boot(page, '?seed=3&debug=1&calm=1');
  // Place the pair far apart so they can't touch by wandering first.
  const { plain, water } = await page.evaluate(() => ({
    plain: window.__PK__!.debugAdd!('plain', 1330, 4380),
    water: window.__PK__!.debugAdd!('water', 1910, 3580),
  }));
  await page.waitForTimeout(200);

  const from = await page.evaluate((id) => window.__PK__!.screenPointOf(id)!, plain);
  // Grab a little above the ground point (on the body), like a finger would.
  await page.mouse.move(from.x, from.y - 20);
  await page.mouse.down();
  const to = await page.evaluate((id) => window.__PK__!.screenPointOf(id)!, water);
  // Held kids float above the finger, so put the finger below the target's feet.
  const lift = await page.evaluate(() => {
    const a = window.__PK__!.worldToScreen(1080, 2880);
    const b = window.__PK__!.worldToScreen(1080, 2950);
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
  const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 1280, 4380));
  await page.waitForTimeout(150);
  const from = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  // Open ground, clear of the Garden's scenery reserve, so nothing deflects it.
  const to = await page.evaluate(() => window.__PK__!.worldToScreen(1930, 4380));
  await page.mouse.move(from.x, from.y - 20);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.waitForTimeout(100);
  // While held, the kid floats above the finger (smaller y), so the face isn't covered.
  const held = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  const liftPx = await page.evaluate(() => window.__PK__!.worldToScreen(1080, 2950).y - window.__PK__!.worldToScreen(1080, 2880).y);
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
  const id = await page.evaluate(() => window.__PK__!.debugAdd!('snow', 1620, 4080));
  await page.waitForTimeout(150);
  const p = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  // Release up in the Garden's zone, above where kids may stand (world y 250).
  const below = await page.evaluate(() => window.__PK__!.worldToScreen(1620, 3130));
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
  const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 1380, 4080));
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
    for (let i = 0; i < 40; i++) window.__PK__!.debugAdd!(['plain', 'fire', 'water', 'snow'][i % 4]!, 1180 + (i % 8) * 120, 3380 + Math.floor(i / 8) * 250);
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
  const before = await page.evaluate(() => window.__PK__!.worldToScreen(1620, 3980));
  // calm mode has no kids, so this press lands on empty ground.
  await page.mouse.move(200, 600);
  await page.mouse.down();
  await page.mouse.move(200, 300, { steps: 8 });
  await page.mouse.up();
  await frames(page, 2);
  const after = await page.evaluate(() => window.__PK__!.worldToScreen(1620, 3980));
  // The map followed the finger up (at least most of the 300 px; inertia may add more).
  expect(before.y - after.y).toBeGreaterThan(250);
  expect(errors).toEqual([]);
});

test('holding a kid at the screen edge scrolls the map and carries the kid along', async ({ page }) => {
  const errors = await boot(page, '?seed=10&debug=1&calm=1');
  const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 1620, 3980));
  await page.waitForTimeout(150);
  const p = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  const size = page.viewportSize()!;
  await page.mouse.move(p.x, p.y - 20);
  await page.mouse.down();
  // Hold just inside the visible play area's bottom edge (above the tray), not behind it.
  const trayTop = await page.locator('.tray').evaluate((e) => e.getBoundingClientRect().top);
  // Where the starting view ends, in world units.
  const viewEnd = await page.evaluate((t) => {
    const pk = window.__PK__!;
    const y0 = pk.worldToScreen(1080, 2880).y;
    return (t - y0) / ((pk.worldToScreen(1080, 2980).y - y0) / 100);
  }, trayTop);
  await page.mouse.move(size.width / 2, trayTop - 10, { steps: 8 });
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForTimeout(250);
  const kid = await page.evaluate((k) => window.__PK__!.kids().find((c) => c.id === k)!, id);
  // It was carried well below where the starting view ended.
  expect(kid.y).toBeGreaterThan(viewEnd + 250);
  expect(errors).toEqual([]);
});

test('dropping a kid onto a non-partner never overlaps them (D-039, D-043)', async ({ page }) => {
  const errors = await boot(page, '?seed=12&debug=1&calm=1');
  const { fire, snow } = await page.evaluate(() => ({
    fire: window.__PK__!.debugAdd!('fire', 1620, 3980),
    snow: window.__PK__!.debugAdd!('snow', 1620, 4480),
  }));
  await page.waitForTimeout(150);
  const from = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, snow);
  const onto = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, fire);
  const liftPx = await page.evaluate(() => window.__PK__!.worldToScreen(1080, 2950).y - window.__PK__!.worldToScreen(1080, 2880).y);
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
  expect(a.x).toBeCloseTo(1620, 0);
  expect(a.y).toBeCloseTo(3980, 0);
  expect(errors).toEqual([]);
});

test('a pan that pauses before release does not fling', async ({ page }) => {
  const errors = await boot(page, '?seed=13&debug=1&calm=1');
  await page.mouse.move(200, 700);
  await page.mouse.down();
  await page.mouse.move(200, 400, { steps: 6 });
  await page.waitForTimeout(400); // finger rests
  const rested = await page.evaluate(() => window.__PK__!.worldToScreen(1620, 3980));
  await page.mouse.up();
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__PK__!.worldToScreen(1620, 3980));
  expect(Math.abs(after.y - rested.y)).toBeLessThan(2);
  expect(errors).toEqual([]);
});

test('rotating the screen keeps the same world point centred', async ({ page }) => {
  const errors = await boot(page, '?seed=14&debug=1&calm=1');
  await page.evaluate(() => window.__PK__!.centerOn(2160, 4880));
  await page.setViewportSize({ width: 915, height: 413 });
  await page.waitForTimeout(300);
  const c = await page.evaluate(() => window.__PK__!.worldToScreen(2160, 4880));
  expect(Math.abs(c.x - 915 / 2)).toBeLessThan(3);
  expect(Math.abs(c.y - 413 / 2)).toBeLessThan(3);
  expect(errors).toEqual([]);
});

test('backgrounding mid-pan does not lock input', async ({ page }) => {
  const errors = await boot(page, '?seed=15&debug=1&calm=1');
  const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 1620, 3980));
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
  const id = await page.evaluate(() => window.__PK__!.debugAdd!('plain', 2160, 7670));
  await page.evaluate(() => window.__PK__!.centerOn(2160, 99999)); // scroll as far down as allowed
  await page.waitForTimeout(150);
  const p = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  const trayTop = await page.locator('.tray').evaluate((e) => e.getBoundingClientRect().top);
  expect(p.y).toBeLessThanOrEqual(trayTop + 1); // its feet are visible above the tray
  expect(errors).toEqual([]);
});

test('a kid in the bottom-right corner can be scrolled out from under the navigation', async ({ page }) => {
  const errors = await boot(page, '?seed=17&debug=1&calm=1');
  // The v3 world's corner (4320 × 7680).
  const id = await page.evaluate(() => window.__PK__!.debugAdd!('plain', 4240, 7670));
  await page.evaluate(() => window.__PK__!.centerOn(99999, 99999)); // as far down-right as allowed
  await page.waitForTimeout(150);
  const p = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  const dexTop = await page.locator('[data-nav=dex]').evaluate((e) => e.getBoundingClientRect().top);
  expect(p.y).toBeLessThanOrEqual(dexTop + 1);
  expect(errors).toEqual([]);
});

test('on a short landscape screen, holding a kid still in the middle does not scroll', async ({ page }) => {
  await page.setViewportSize({ width: 915, height: 413 });
  const errors = await boot(page, '?seed=18&debug=1&calm=1');
  const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 2160, 4380));
  await page.evaluate(() => window.__PK__!.centerOn(2160, 4340));
  await page.waitForTimeout(150);
  const p = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  const top = await page.locator('.hud').evaluate((e) => e.getBoundingClientRect().bottom);
  const bottom = await page.evaluate(() =>
    Math.min(document.querySelector('.tray')!.getBoundingClientRect().top, document.querySelector('[data-nav=dex]')!.getBoundingClientRect().top),
  );
  await page.mouse.move(p.x, p.y - 10);
  await page.mouse.down();
  await page.waitForTimeout(100);
  // Centre the held kid's silhouette in the usable band between the HUD and the tray/Dex.
  const kid = await page.evaluate((k) => window.__PK__!.kids().find((c) => c.id === k)!, id);
  const zoom = await page.evaluate(() => (window.__PK__!.worldToScreen(1080, 2980).y - window.__PK__!.worldToScreen(1080, 2880).y) / 100);
  const at = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
  const centre = at.y + ((kid.box.top + kid.box.bottom) / 2) * zoom;
  await page.mouse.move(p.x, p.y - 10 + ((top + bottom) / 2 - centre), { steps: 2 });
  const before = await page.evaluate(() => window.__PK__!.worldToScreen(2160, 4340));
  await page.waitForTimeout(600);
  const during = await page.evaluate(() => window.__PK__!.worldToScreen(2160, 4340));
  await page.mouse.up();
  expect(Math.abs(during.y - before.y)).toBeLessThan(2);
  expect(errors).toEqual([]);
});

test('a held kid never disappears behind the HUD while scrolling up', async ({ page }) => {
  const errors = await boot(page, '?seed=19&debug=1&calm=1');
  const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 2160, 5480));
  await page.evaluate(() => window.__PK__!.centerOn(2160, 5280));
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
    const top = await page.evaluate(([y, t]) => window.__PK__!.worldToScreen(1080, y + t).y - window.__PK__!.worldToScreen(1080, y).y, [0, kid.box.top] as const);
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
    const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 2160, 4380));
    await page.evaluate(() => window.__PK__!.centerOn(2160, 4380));
    await page.waitForTimeout(150);
    const hudBottom = await page.locator('.hud').evaluate((e) => e.getBoundingClientRect().bottom);
    const bottom = await page.evaluate(() =>
      Math.min(document.querySelector('.tray')!.getBoundingClientRect().top, document.querySelector('[data-nav=dex]')!.getBoundingClientRect().top),
    );
    const zoom = await page.evaluate(() => (window.__PK__!.worldToScreen(1080, 2980).y - window.__PK__!.worldToScreen(1080, 2880).y) / 100);
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
    window.__PK__!.debugAdd!('plain', 1330, 4380);
    window.__PK__!.debugAdd!('fire', 1910, 4380);
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
  await page.evaluate(() => window.__PK__!.debugAdd!('plain', 1330, 4380));
  const before = await page.evaluate(() => window.__PK__!.wallet().materials);
  await page.evaluate(() => window.__PK__!.debugAway!(300_000));
  const report = await page.evaluate(() => window.__PK__!.lastOffline());
  expect(report!.seconds).toBeCloseTo(300, 0);
  // A new game is in the tutorial (D-052): a kid a minute, so five spawns in 5 min.
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

test('Spawn now spends a Potatoken and brings a kid; when broke it sends nothing (GUI_MVP §§3, 19.2)', async ({ page }) => {
  const errors = await boot(page, '?seed=3&debug=1&calm=1');
  // Spawn now is in the Garden's Arrivals.
  await page.locator('[data-nav=garden]').click();
  const spawn = page.locator('.arrivals-spawn');
  const start = await page.evaluate(() => ({ kids: window.__PK__!.kids().length, tokens: window.__PK__!.wallet().potatokens }));
  expect(start.tokens).toBeGreaterThan(0);
  await spawn.click();
  await expect.poll(() => page.evaluate(() => window.__PK__!.kids().length)).toBe(start.kids + 1);
  expect(await page.evaluate(() => window.__PK__!.wallet().potatokens)).toBe(start.tokens - 1);
  // The Garden says so at once; the world's card waits for the sheet to close (§9).
  await expect(page.locator('.arrivals-population')).toContainText(`${start.kids + 1} of`);
  await page.keyboard.press('Escape');
  await expect(page.locator('.feedback')).toContainText('Kid arrived at the Garden.');
  await page.locator('[data-nav=garden]').click();
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
  // The Garden (with Spawn now) and the Dex are disabled, with the reason (Codex review, PR #39).
  for (const name of ['Garden', 'Dex']) {
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
  const lift = await page.evaluate(() => window.__PK__!.worldToScreen(1080, 2950).y - window.__PK__!.worldToScreen(1080, 2880).y);
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
      window.__PK__!.debugAdd!('plain', 1580, 4030);
      window.__PK__!.debugAdd!('water', 1640, 4030);
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
      a: window.__PK__!.debugAdd!('plain', 1330, 4380),
      b: window.__PK__!.debugAdd!('water', 1910, 3580),
      // Well below the feedback card, so pressing it starts a real drag.
      c: window.__PK__!.debugAdd!('fire', 1380, 4530),
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
    const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 1380, 4380));
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
    const { a, b } = await page.evaluate(() => ({ a: window.__PK__!.debugAdd!('plain', 1480, 4180), b: window.__PK__!.debugAdd!('water', 1780, 4180) }));
    await page.waitForTimeout(200);
    await dropOnto(page, a, b);
    await expect.poll(() => page.evaluate(() => window.__PK__!.discoveredRecipes())).toContain('plain|water');
    for (let i = 0; i < 8; i++) {
      expect(await band(page)).toBeGreaterThanOrEqual(44);
      await page.waitForTimeout(200);
    }
  });

  test('a refusal that cannot fit waits, and appears once there is room', async ({ page }) => {
    // Navigation top 182, HUD bottom 68: a 72 px refusal card and its gap would leave
    // less than the 44 px band.
    await page.setViewportSize({ width: 568, height: 250 });
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
    const { a, b } = await page.evaluate(() => ({ a: window.__PK__!.debugAdd!('plain', 1380, 4030), b: window.__PK__!.debugAdd!('water', 1880, 4030) }));
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
      a: window.__PK__!.debugAdd!('plain', 1700, 4030),
      b: window.__PK__!.debugAdd!('water', 2100, 4030),
      c: window.__PK__!.debugAdd!('fire', 2700, 4060),
    }));
    // The pair mid-band, so the drag never edge-scrolls (the landscape fit floor shows about
    // 1770 × 576 world units of play band, §20.1).
    await page.evaluate(() => window.__PK__!.centerOn(1900, 4000));
    await page.waitForTimeout(200);
    await dropOnto(page, a, b);
    await expect(page.locator('.feedback')).toContainText('New discovery');
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
    const { a, b, c } = await page.evaluate(() => ({
      a: window.__PK__!.debugAdd!('plain', 1330, 4380),
      b: window.__PK__!.debugAdd!('water', 1910, 3580),
      c: window.__PK__!.debugAdd!('fire', 1380, 4530),
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
  const { hero, glass } = await page.evaluate(() => ({ hero: window.__PK__!.debugAdd!('hero', 1380, 4380), glass: window.__PK__!.debugAdd!('glassblower', 1910, 3580) }));
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
  const { hero, glass } = await page.evaluate(() => ({ hero: window.__PK__!.debugAdd!('hero', 1380, 4380), glass: window.__PK__!.debugAdd!('glassblower', 1910, 3580) }));
  for (const id of [hero, glass]) await expect.poll(() => page.evaluate((k) => !!window.__PK__!.screenPointOf(k), id)).toBe(true);
  await dropOnto(page, hero, glass);
  await expect.poll(() => page.evaluate(() => window.__PK__!.kids().map((k) => k.type))).toContain('lantern');
  const lantern = await page.evaluate(() => window.__PK__!.kids().find((k) => k.type === 'lantern')!.id);
  await expect(page.locator('.feedback')).toContainText('New discovery', { timeout: 15_000 });
  expect(await page.evaluate((id) => !!window.__PK__!.screenPointOf(id), lantern)).toBe(true);
  expect(errors).toEqual([]);
});

test('a first rare card waits until its sprout is drawn, even if the costume loads slowly (Codex review, PR #77)', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route('**/kid_lantern_*', async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });
  // Lantern stands in for a rare kid (D-072) until the rares' content exists.
  await boot(page, '?seed=3&debug=1&calm=1&rare=lantern');
  // Per frame until its card shows: the Rare found card, and whether the kid is drawn.
  const log = await page.evaluate(
    () =>
      new Promise<[boolean, boolean][]>((done) => {
        const pk = window.__PK__!;
        const before = pk.kids().map((k) => k.id);
        pk.debugReadySeed!(0, 'lantern');
        const out: [boolean, boolean][] = [];
        const end = performance.now() + 20_000;
        const frame = () => {
          const card = (document.querySelector('.feedback')?.textContent ?? '').includes('Rare found');
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

test.describe('the world band and its fallbacks (GUI_MVP §§19.1, 19.3)', () => {
  const measure = (page: Page) =>
    page.evaluate(() => {
      const hud = document.querySelector('.hud')!.getBoundingClientRect();
      const tray = document.querySelector('.tray')!.getBoundingClientRect();
      return {
        fit: document.documentElement.dataset.hudFit,
        hud: hud.height,
        nav: tray.height,
        // The unobscured world: HUD bottom + 8 to navigation top − 8 (§19.1).
        band: tray.top - 8 - (document.querySelector('.top-stack')!.getBoundingClientRect().bottom + 8),
      };
    });

  // Codex's measured bands (§19.1): 660 of 844 (78.2 %), 208 of 360 (57.8 %).
  for (const [w, h, band] of [[390, 844, 660], [640, 360, 208]] as const) {
    test(`${w}x${h} with no sheet: a 60 px strip and a 60 px navigation row leave the world ${band} px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await boot(page, '?seed=3&debug=1&calm=1');
      await expect.poll(() => measure(page)).toEqual({ fit: 'usual', hud: 60, nav: 60, band });
    });
  }

  for (const kind of ['unsaved', 'recovery'] as const) {
    test(`568x320 with the ${kind} banner keeps both rows, the HUD 8 px below the banner`, async ({ page }) => {
      await page.setViewportSize({ width: 568, height: 320 });
      await boot(page, '?seed=3&debug=1&calm=1');
      await page.evaluate((k) => window.__PK__!.debugSaveStatus!({ unsaved: k === 'unsaved', recovery: k === 'recovery', readOnly: false }), kind);
      await expect.poll(() => measure(page)).toMatchObject({ fit: 'usual', hud: 60, nav: 60 });
      // The band follows the banner's actual height B (§19.3): 64 or 72 at least, more if
      // its copy wraps. Navigation top is H − 8 − 60 = 252.
      const b = await page.locator('.banners').evaluate((e) => e.getBoundingClientRect().bottom);
      expect(b).toBeGreaterThanOrEqual(8 + (kind === 'unsaved' ? 64 : 72));
      expect((await measure(page)).band).toBe(252 - 8 - (b + 8 + 60 + 8));
      expect((await measure(page)).band).toBeGreaterThanOrEqual(44);
    });
  }

  test('too short for both rows and the band: the world hides and the GUI becomes a page', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 200 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false }));
    await expect.poll(() => measure(page)).toMatchObject({ fit: 'page' });
    await expect(page.locator('#app')).toBeHidden();
    await expect(page.locator('.page-hint')).toBeVisible();
    await page.locator('.tray').scrollIntoViewIfNeeded();
    // Labels stay, never clipped (Codex review, PR #37).
    expect(await page.locator('.tray-label').first().evaluate((e) => e.getBoundingClientRect().width)).toBeGreaterThan(20);
    await page.setViewportSize({ width: 568, height: 700 });
    await expect.poll(() => measure(page)).toMatchObject({ fit: 'usual' });
    await expect(page.locator('#app')).toBeVisible();
  });

  test('a scroll window grows to show its tallest control whole, and the page takes over when that leaves no band (Codex review round 2, PR #87)', async ({ page }) => {
    // Enlarged text: navigation controls 70 px tall instead of 44.
    await page.setViewportSize({ width: 240, height: 360 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.addStyleTag({ content: '.tray-cell { min-height: 70px !important; }' });
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false }));
    await expect.poll(() => measure(page)).toMatchObject({ fit: 'window', nav: 70 + 16 });
    expect((await measure(page)).band).toBeGreaterThanOrEqual(44);
    // Every control can be scrolled wholly into the window.
    const whole = await page.evaluate(() => {
      const tray = document.querySelector('.tray') as HTMLElement;
      return [...tray.children].every((c) => (c as HTMLElement).offsetHeight <= tray.clientHeight);
    });
    expect(whole).toBe(true);
    // Shorter: the grown windows would leave no band, so the page takes over.
    await page.setViewportSize({ width: 240, height: 330 });
    await expect.poll(() => measure(page)).toMatchObject({ fit: 'page' });
  });

  test('rows that wrap on a narrow screen become 60 px scroll windows, which keep their offset', async ({ page }) => {
    // Too narrow for three stats or three labels in a row: both wrap, and with a banner
    // the natural layout leaves no band (§19.3).
    await page.setViewportSize({ width: 240, height: 360 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false }));
    await expect.poll(() => measure(page)).toMatchObject({ fit: 'window', hud: 60, nav: 60 });
    expect((await measure(page)).band).toBeGreaterThanOrEqual(44);
    await page.locator('.hud').evaluate((e) => (e.scrollTop = 40));
    const before = await page.locator('.hud').evaluate((e) => e.scrollTop);
    expect(before).toBeGreaterThan(0);
    await page.setViewportSize({ width: 240, height: 362 });
    await expect.poll(() => measure(page)).toMatchObject({ fit: 'window' });
    await page.waitForTimeout(200);
    expect(await page.locator('.hud').evaluate((e) => e.scrollTop)).toBe(before);
  });
});

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
    const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 1620, 4180));
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
    const { a, b } = await page.evaluate(() => ({ a: window.__PK__!.debugAdd!('plain', 1330, 4380), b: window.__PK__!.debugAdd!('water', 1910, 3580) }));
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
    await page.evaluate(() => (document.querySelector('[data-nav=garden]') as HTMLButtonElement).click());
    await expect(page.locator('.sheet')).toBeVisible();
    const before = await page.evaluate(() => window.__PK__!.worldToScreen(2080, 3880));
    await page.mouse.move(300, 300, { steps: 5 });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__PK__!.worldToScreen(2080, 3880))).toEqual(before);
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


test.describe('Compendium, offline summary and Settings (GUI_MVP §§6, 8, 11)', () => {
  const garden = (page: Page) => page.locator('[data-nav=garden]');
  const zeroMaterials = (page: Page) => page.evaluate(() => window.__PK__!.debugGive!({ materials: -window.__PK__!.wallet().materials }));

  /** A calm game with Potato and Fire discovered and the Compendium built. */
  async function built(page: Page): Promise<string[]> {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate((m) => {
      window.__PK__!.debugAdd!('plain', 1330, 4380);
      window.__PK__!.debugAdd!('fire', 1910, 4380);
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
      window.__PK__!.debugAdd!('plain', 1330, 4380);
      window.__PK__!.debugAdd!('hero', 1910, 4380);
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
    await page.evaluate(() => window.__PK__!.debugAdd!('plain', 1330, 4380));
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
            for (let i = 0; window.__PK__!.kids().length < 12 && i < 40; i++) window.__PK__!.debugAdd!('plain', 1230 + (i % 5) * 200, 4780 + Math.floor(i / 5) * 250);
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
    await page.evaluate(() => window.__PK__!.debugAdd!('plain', 1330, 4380));
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
    await page.evaluate(() => window.__PK__!.debugAdd!('plain', 1330, 4380));
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
    expect(await page.evaluate(() => window.__PK__!.settings())).toEqual({ audio: true, music: 100, sfx: 80, plantV2Explained: false });

    await page.evaluate(() => window.__PK__!.debugAway!(0)); // the game is saved, so the reload resumes it
    await page.reload();
    await page.waitForFunction(() => window.__PK__?.ready === true);
    expect(await page.evaluate(() => window.__PK__!.settings())).toEqual({ audio: true, music: 100, sfx: 80, plantV2Explained: false });
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
      types.forEach((t, i) => window.__PK__!.debugAdd!(t, 1230 + (i % 4) * 260, 3180 + Math.floor(i / 4) * 300));
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
      types.forEach((t, i) => window.__PK__!.debugAdd!(t, 1230 + (i % 4) * 260, 3180 + Math.floor(i / 4) * 300));
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
      ['water', 'snow', 'wind', 'stone', 'chef', 'sprout'].forEach((t, i) => window.__PK__!.debugAdd!(t, 1230 + (i % 4) * 260, 3180 + Math.floor(i / 4) * 300));
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
      types.forEach((t, i) => window.__PK__!.debugAdd!(t, 1230 + (i % 4) * 260, 3180 + Math.floor(i / 4) * 300));
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

test.describe('Potato-Dex (GUI_MVP §§7, 9)', () => {
  const dexButton = (page: Page) => page.locator('[data-nav=dex]');
  const dialog = (page: Page) => page.getByRole('dialog', { name: 'Potato-Dex' });
  const totals = {
    kids: (JSON.parse(readFileSync('src/content/kids.json', 'utf8')) as unknown[]).length,
    recipes: (JSON.parse(readFileSync('src/content/recipes.json', 'utf8')) as unknown[]).length,
  };

  /** A calm game with exactly Potato and Water discovered (no recipe found yet). */
  async function twoKnown(page: Page): Promise<string[]> {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => {
      window.__PK__!.debugAdd!('plain', 1330, 4380);
      window.__PK__!.debugAdd!('water', 1910, 4380);
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
    await page.evaluate(() => window.__PK__!.debugAdd!('firefighter', 1620, 5080));
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
      window.__PK__!.debugAdd!('plain', 1620, 5480);
      window.__PK__!.debugAdd!('water', 1620, 5480);
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
      window.__PK__!.debugAdd!('plain', 1620, 5480);
      window.__PK__!.debugAdd!('water', 1620, 5480);
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.discoveredRecipes())).toContain('plain|water');
    await dexButton(page).click();
    await dialog(page).getByRole('button', { name: 'Water Kid, Tier 1' }).click();
    await expect(dialog(page).locator('.dex-detail-name')).toHaveText('Water Kid');
    await expect(dialog(page).getByText(`Earns ${Math.round(balance.economy.materialsPerSecond * 3600)} Materials / h`)).toBeVisible();
    await expect(dialog(page).locator('.dex-detail .dex-recipe')).toHaveAttribute('aria-label', 'Potato Kid plus Water Kid makes Firefighter Kid');
    await expect(dialog(page).getByRole('button', { name: 'Back to kids' })).toBeFocused();
    // Tier-2 Firefighter, no recipe of its own made yet (it is only a result here).
    await dialog(page).getByRole('button', { name: 'Back to kids' }).click();
    await expect(dialog(page).getByRole('button', { name: 'Water Kid, Tier 1' })).toBeFocused();
    await dialog(page).getByRole('button', { name: 'Firefighter Kid, Tier 2' }).click();
    await expect(dialog(page).getByText(`Earns ${Math.round(balance.economy.materialsPerSecond * 3600 * 2)} Materials / h`)).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Back to kids' }).click();
    await page.evaluate(() => window.__PK__!.debugAdd!('snow', 1910, 5080));
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
    await page.evaluate((m) => window.__PK__!.debugGive!({ materials: m }), price('compendium', 0));
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
      window.__PK__!.debugAdd!('plain', 1620, 5480);
      window.__PK__!.debugAdd!('water', 1620, 5480);
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
      window.__PK__!.debugAdd!('plain', 1620, 5480);
      window.__PK__!.debugAdd!('water', 1620, 5480);
    });
    await expect(dialog(page).locator('.dex-detail .dex-recipe')).toHaveAttribute('aria-label', 'Potato Kid plus Water Kid makes Firefighter Kid');
    await expect(dialog(page).getByRole('button', { name: 'Back to kids' })).toBeFocused();
  });

  test('the Dex Compendium tab keeps its scroll through the offline summary (Codex review, PR #43)', async ({ page }) => {
    await twoKnown(page);
    await page.evaluate((m) => {
      ['snow', 'wind', 'stone', 'chef', 'sprout', 'sail', 'kite', 'builder', 'forge', 'steam', 'hero', 'fire'].forEach((t, i) =>
        window.__PK__!.debugAdd!(t, 1230 + (i % 4) * 260, 3180 + Math.floor(i / 4) * 300),
      );
      window.__PK__!.debugGive!({ materials: m });
      window.__PK__!.debugCommand!({ type: 'upgrade', building: 'compendium' });
    }, price('compendium', 0));
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
      window.__PK__!.debugAdd!('plain', 1620, 5480);
      window.__PK__!.debugAdd!('water', 1620, 5480);
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
      window.__PK__!.debugAdd!('plain', 1620, 5480);
      window.__PK__!.debugAdd!('water', 1620, 5480);
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
    await expect(dexButton(page)).toHaveAttribute('aria-label', 'Dex: Update the game to continue.');
  });
});

test.describe('audio runtime (ART_AUDIO_PLAN)', () => {
  const audio = (page: Page) => page.evaluate(() => window.__PK__!.audio());

  test('silent until a gesture; then music follows Settings, and a discovery plays its cue', async ({ page }) => {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    expect(await audio(page)).toMatchObject({ unlocked: false, musicPlaying: false, lastCue: null });
    // Only the end of a press grants activation: a pointerdown alone doesn't unlock
    // (Codex review, PR #53); its pointerup does.
    // An empty spot of the map, inside the viewport (Codex review, PR #53).
    await page.mouse.move(200, 600);
    await page.mouse.down();
    await page.waitForTimeout(200);
    expect((await audio(page)).unlocked).toBe(false);
    await page.mouse.up();
    await expect.poll(async () => (await audio(page)).unlocked).toBe(true);
    // The loop decodes after the cues.
    await expect.poll(async () => (await audio(page)).musicPlaying, { timeout: 15_000 }).toBe(true);
    // Audio Off pauses it; On brings it back. Music at 0 % stays quiet.
    await openTool(page, 'Settings');
    await page.getByRole('radio', { name: 'Off' }).click();
    await expect.poll(async () => (await audio(page)).musicPlaying).toBe(false);
    await page.getByRole('radio', { name: 'On' }).click();
    await expect.poll(async () => (await audio(page)).musicPlaying).toBe(true);
    await page.getByLabel('Music').fill('0');
    await expect.poll(async () => (await audio(page)).musicPlaying).toBe(false);
    await page.keyboard.press('Escape');
    // A first discovery plays the discovery cue (it replaces the fusion cue).
    await page.waitForTimeout(500); // cue buffers decode after the unlock
    await page.evaluate(() => {
      window.__PK__!.debugAdd!('plain', 1620, 5480);
      window.__PK__!.debugAdd!('water', 1620, 5480);
    });
    await expect.poll(async () => (await audio(page)).lastCue).toBe('sfx_discovery');
    // Hiding the app stops it, rather than freezing it to finish later (Codex review, PR #53).
    expect((await audio(page)).active).toBeGreaterThan(0);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect((await audio(page)).active).toBe(0);
    expect(errors).toEqual([]);
  });

  test('the music loops sample-accurately and keeps playing through app switches and interruptions (gate 4)', async ({ page }) => {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    const setHidden = (hidden: boolean) =>
      page.evaluate((h) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    const at = async () => (await audio(page)).music!.at;
    await page.mouse.click(200, 600);
    // The loop decodes after the cues.
    await expect.poll(async () => (await audio(page)).musicPlaying, { timeout: 15_000 }).toBe(true);
    const music = (await audio(page)).music!;
    expect(music.loop).toBe(true);
    // The whole 72 s master to within a sample or two (resampling to the context's rate):
    // no encoder padding or trimming at the seam.
    expect(Math.abs(music.seconds - 72)).toBeLessThanOrEqual(2 / music.sampleRate);

    // Hidden, the music pauses with the context; back in front it plays on from there.
    await setHidden(true);
    expect((await audio(page)).musicPlaying).toBe(false);
    await page.waitForTimeout(300);
    const paused = await at();
    await page.waitForTimeout(300);
    expect(await at()).toBeCloseTo(paused, 2);
    await setHidden(false);
    await expect.poll(async () => (await audio(page)).musicPlaying).toBe(true);
    await expect.poll(at).toBeGreaterThan(paused);
    expect(await at()).toBeLessThan(paused + 2);

    // The system suspends audio while the game is in front: the next tap wakes it.
    await page.evaluate(() => window.__PK__!.debugAudioInterrupt!());
    await expect.poll(async () => (await audio(page)).musicPlaying).toBe(false);
    await page.mouse.click(200, 600);
    await expect.poll(async () => (await audio(page)).musicPlaying).toBe(true);

    // Audio Off and On again picks the loop up where it stopped, not from the top.
    await page.waitForTimeout(600);
    await openTool(page, 'Settings');
    await page.getByRole('radio', { name: 'Off' }).click();
    await expect.poll(async () => (await audio(page)).music).toBeNull();
    await page.waitForTimeout(300);
    await page.getByRole('radio', { name: 'On' }).click();
    await expect.poll(async () => (await audio(page)).musicPlaying).toBe(true);
    const resumed = await at();
    expect(resumed).toBeGreaterThan(0.5);
    expect(errors).toEqual([]);
  });

  test('a tap on a kid sounds one UI tap, never a pick-up; a drag picks up once it is one (Codex review, FEED-NAME)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.mouse.click(200, 600);
    await expect.poll(async () => (await audio(page)).unlocked).toBe(true);
    const id = await page.evaluate(() => {
      window.__PK__!.centerOn(1880, 4380);
      return window.__PK__!.debugAdd!('fire', 1880, 4380);
    });
    await page.waitForTimeout(400);
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    let before = (await audio(page)).played.length;
    await page.mouse.click(k.x, k.y - 20);
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.waitForTimeout(300);
    expect((await audio(page)).played.slice(before)).toEqual(['sfx_ui_tap']);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    before = (await audio(page)).played.length;
    await page.mouse.move(k.x, k.y - 20);
    await page.mouse.down();
    await page.mouse.move(k.x + 60, k.y - 20, { steps: 4 });
    await expect.poll(async () => (await audio(page)).played.slice(before)).toContain('sfx_pick_up');
    await page.mouse.up();
  });

  test('a kid press cancelled by the system makes no sound later (Codex review, FEED-NAME)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.mouse.click(200, 600);
    await expect.poll(async () => (await audio(page)).unlocked).toBe(true);
    const id = await page.evaluate(() => {
      window.__PK__!.centerOn(1880, 4380);
      return window.__PK__!.debugAdd!('fire', 1880, 4380);
    });
    await page.waitForTimeout(400);
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    const before = (await audio(page)).played.length;
    await page.evaluate((p) => {
      const canvas = document.querySelector('canvas')!;
      const fire = (type: string) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: p.x, clientY: p.y - 20, buttons: 1, bubbles: true }));
      fire('pointerdown');
      fire('pointercancel');
    }, k);
    // Well past the 220 ms a press may be a tap: nothing resolves, nothing sounds.
    await page.waitForTimeout(600);
    expect((await audio(page)).played.slice(before)).toEqual([]);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('a command button plays its success cue alone; other buttons tap (Codex review, PR #53)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.mouse.click(200, 600);
    await expect.poll(async () => (await audio(page)).unlocked).toBe(true);
    await page.waitForTimeout(500);
    const before = (await audio(page)).played.length;
    await page.locator('[data-nav=garden]').click();
    await page.waitForTimeout(300);
    const opened = (await audio(page)).played.length;
    await page.getByRole('button', { name: /Spawn a random Garden kid/ }).click();
    await expect.poll(async () => (await audio(page)).played.slice(opened)).toEqual(['sfx_spawn']);
    await page.waitForTimeout(300);
    expect((await audio(page)).played.slice(opened)).toEqual(['sfx_spawn']);
    expect(before).toBeLessThan(opened);
    await page.keyboard.press('Escape');
    await openTool(page, 'Settings');
    await expect.poll(async () => (await audio(page)).lastCue).toBe('sfx_ui_tap');
  });
});

test.describe('Planting, drag path (D-061, GUI_MVP §15.1)', () => {
  /** Picks a kid up and holds it over the Garden target for `ms`, then releases. */
  async function holdOverHome(page: Page, id: number, ms: number): Promise<void> {
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    const t = await page.evaluate(() => window.__PK__!.worldToScreen(2160, 3308));
    await page.mouse.move(k.x, k.y - 20);
    await page.mouse.down();
    await page.mouse.move(t.x, t.y, { steps: 8 });
    await page.waitForTimeout(ms);
    await page.mouse.up();
  }

  async function setup(page: Page): Promise<{ id: number; errors: string[] }> {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.centerOn(2160, 3640));
    const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 1840, 3880));
    await page.waitForTimeout(200);
    return { id, errors };
  }

  test('holding over the Garden, then releasing, adds the kid to a plot', async ({ page }) => {
    const { id, errors } = await setup(page);
    const wallet = await page.evaluate(() => window.__PK__!.wallet());
    await holdOverHome(page, id, 450);
    await expect.poll(() => page.evaluate((i) => window.__PK__!.kids().some((k) => k.id === i), id)).toBe(false);
    // It leaves the map at once, with no farewell (§15.1), and the plot gains it.
    expect(await page.evaluate(() => window.__PK__!.plots()[0]!.kids)).toBe(1);
    await expect(page.locator('.toast-home')).toContainText('Fire Kid added to Plot 1.');
    await expect(page.locator('.toast-home')).toContainText('Add 3–5 kids, then press Start growing.');
    // Still discovered; no refund.
    await page.locator('[data-nav=dex]').click();
    await expect(page.getByRole('button', { name: 'Fire Kid, Tier 1' })).toBeVisible();
    const after = await page.evaluate(() => window.__PK__!.wallet());
    expect(after.potatokens).toBe(wallet.potatokens);
    expect(errors).toEqual([]);
  });

  test('a cancelled plot gives its kids back to the map with their ids, drawn (D-074)', async ({ page }) => {
    const { errors } = await setup(page);
    const ids = await page.evaluate(() => {
      const pk = window.__PK__!;
      const ids = [0, 1, 2].map((i) => pk.debugAdd!('plain', 2480 + i * 250, 5480));
      pk.debugCommand!({ type: 'plant', kidIds: ids, plot: 0 });
      pk.debugCommand!({ type: 'startGrowing', plot: 0 });
      return ids;
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('growing');
    await page.evaluate(() => window.__PK__!.debugCommand!({ type: 'emptyPlot', plot: 0 }));
    await expect.poll(() => page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('empty');
    // Back on the map with their ids, each drawn (it has a view).
    const back = await page.evaluate((list) => list.map((i) => ({ live: window.__PK__!.kids().some((k) => k.id === i), drawn: window.__PK__!.screenPointOf(i) !== undefined })), ids);
    expect(back).toEqual(ids.map(() => ({ live: true, drawn: true })));
    expect(errors).toEqual([]);
  });

  test('releasing before the 400 ms dwell places the kid normally', async ({ page }) => {
    const { id } = await setup(page);
    // Straight in and straight out: a stepped move can itself take 400 ms on a slow runner.
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    const t = await page.evaluate(() => window.__PK__!.worldToScreen(2160, 3308));
    await page.mouse.move(k.x, k.y - 20);
    await page.mouse.down();
    await page.mouse.move(t.x, t.y);
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await page.evaluate((i) => window.__PK__!.kids().some((k) => k.id === i), id)).toBe(true);
    expect(await page.evaluate(() => window.__PK__!.home())).toMatchObject({ state: 'hidden' });
  });

  test('the target labels each state, and hides when no kid is held', async ({ page }) => {
    const { id } = await setup(page);
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    const t = await page.evaluate(() => window.__PK__!.worldToScreen(2160, 3308));
    await expect(page.locator('.home-label:not(.home-probe)')).toBeHidden();
    await page.mouse.move(k.x, k.y - 20);
    await page.mouse.down();
    await page.mouse.move(k.x + 30, k.y + 120, { steps: 6 });
    await expect(page.locator('.home-label:not(.home-probe) .home-heading')).toHaveText('Add to Plot 1');
    await page.mouse.move(t.x, t.y, { steps: 6 });
    await expect(page.locator('.home-label:not(.home-probe) .home-heading')).toHaveText('Keep holding…');
    await expect(page.locator('.home-label:not(.home-probe) .home-heading')).toHaveText('Release to add this kid');
    await expect(page.locator('.home-label:not(.home-probe)')).toContainText('Plot 1: 0 → 1 / 5.');
    await expect(page.locator('.home-target')).toHaveAttribute('data-state', 'ready');
    // Moving off resets: back to "Add to Plot 1", and releasing there drops normally.
    await page.mouse.move(k.x + 30, k.y + 120, { steps: 6 });
    await expect(page.locator('.home-label:not(.home-probe) .home-heading')).toHaveText('Add to Plot 1');
    await page.mouse.up();
    await expect(page.locator('.home-label:not(.home-probe)')).toBeHidden();
    expect(await page.evaluate((i) => window.__PK__!.kids().some((k) => k.id === i), id)).toBe(true);
  });

  test('with every plot full the target never arms, and a release over it keeps the kid (GUI_MVP §15.1)', async ({ page }) => {
    const { id } = await setup(page);
    // Fill the only plot (five kids, not started).
    await page.evaluate(() => {
      const pk = window.__PK__!;
      const ids = Array.from({ length: 5 }, (_, i) => pk.debugAdd!('plain', 1380 + i * 250, 5480));
      pk.debugCommand!({ type: 'plant', kidIds: ids });
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.plots()[0]!.kids)).toBe(5);
    // The first-time explanation for that add goes first.
    await page.locator('.toast-home').getByRole('button', { name: 'Dismiss' }).click();
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    const t = await page.evaluate(() => window.__PK__!.worldToScreen(2160, 3308));
    await page.mouse.move(k.x, k.y - 20);
    await page.mouse.down();
    await page.mouse.move(t.x, t.y, { steps: 8 });
    await expect(page.locator('.home-label:not(.home-probe) .home-heading')).toHaveText('All plots are full.');
    await page.waitForTimeout(600); // well past the 400 ms dwell
    // The map held still under the finger, though the target never armed.
    expect(await page.evaluate(() => window.__PK__!.worldToScreen(2160, 3308))).toEqual(t);
    await expect(page.locator('.home-target')).not.toHaveAttribute('data-state', 'ready');
    await page.mouse.up();
    await expect(page.locator('.feedback')).toContainText('All plots are full.');
    expect(await page.evaluate((i) => window.__PK__!.kids().some((c) => c.id === i), id)).toBe(true);
    expect(await page.evaluate(() => window.__PK__!.plots()[0]!.kids)).toBe(5);
  });

  test('a view change just before release restarts the dwell (Codex review, PR #50)', async ({ page }) => {
    const { id } = await setup(page);
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    const t = await page.evaluate(() => window.__PK__!.worldToScreen(2160, 3308));
    await page.mouse.move(k.x, k.y - 20);
    await page.mouse.down();
    await page.mouse.move(t.x, t.y, { steps: 8 });
    await expect.poll(() => page.evaluate(() => window.__PK__!.home().state)).toBe('ready');
    // In one task, with no frame between: the camera moves a world unit, then release.
    // Sideways: vertically the view is clamped at the world's top edge here.
    await page.evaluate(([x, y]) => {
      window.__PK__!.centerOn(2161, 3640);
      document.querySelector('canvas')!.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, bubbles: true }));
    }, [t.x, t.y] as const);
    await page.waitForTimeout(300);
    expect(await page.evaluate((i) => window.__PK__!.kids().some((c) => c.id === i), id)).toBe(true);
  });

  test('a drop by the spawn outlet, below the target, is an ordinary drop', async ({ page }) => {
    const { id } = await setup(page);
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    // Just below the target's bottom edge (world y 556): outside, however long it is held.
    const below = await page.evaluate(() => window.__PK__!.worldToScreen(2160, 3520));
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

test.describe("The Dex opens a live kid's card (GUI_MVP §15.6, §18.1)", () => {
  const dialog = (page: Page) => page.getByRole('dialog', { name: 'Potato-Dex' });
  const sheet = (page: Page) => page.getByRole('dialog');

  /** Every plot unlocked, so several kids can be planted in a row (D-054). */
  async function allPlots(page: Page): Promise<void> {
    await page.evaluate(() => {
      window.__PK__!.debugGive!({ materials: 1e7 });
      for (let i = 0; i < 3; i++) window.__PK__!.debugCommand!({ type: 'unlockPlot' });
    });
    await page.evaluate(() => window.__PK__!.debugAway!(0)); // one step: the unlocks apply
  }

  /** Two Fire Kids on the map, every plot unlocked, the Dex open on Fire's detail. */
  async function fireDetail(page: Page): Promise<number[]> {
    await boot(page, '?seed=3&debug=1&calm=1');
    await allPlots(page);
    const ids = await page.evaluate(() => [window.__PK__!.debugAdd!('fire', 1380, 4380), window.__PK__!.debugAdd!('fire', 1880, 4380)]);
    await page.locator('[data-nav=dex]').click();
    await dialog(page).getByRole('button', { name: 'Fire Kid, Tier 1' }).click();
    return ids;
  }

  test("a row opens that kid's card; Back returns to the detail with its row focused; closing returns to the Dex button", async ({ page }) => {
    await fireDetail(page);
    await expect(dialog(page).locator('.dex-home-heading')).toHaveText('On your map · 2');
    await dialog(page).getByRole('button', { name: 'Fire Kid, kid 2 on your map' }).click();
    await expect(sheet(page).locator('.sheet-title')).toHaveText('Fire Kid');
    await expect(sheet(page).locator('.sheet-subtitle')).toHaveText('On your map · Kid 2');
    await sheet(page).getByRole('button', { name: 'Back to Fire Kid' }).click();
    await expect(dialog(page).locator('.dex-detail-name')).toHaveText('Fire Kid');
    await expect(dialog(page).getByRole('button', { name: 'Fire Kid, kid 2 on your map' })).toBeFocused();
    await dialog(page).getByRole('button', { name: 'Fire Kid, kid 1 on your map' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('[data-nav=dex]')).toBeFocused();
  });

  test('a named copy leads with its name, its type and number beside it, and follows a new name at once (Codex review, FEED-NAME)', async ({ page }) => {
    const ids = await fireDetail(page);
    await page.evaluate((id) => window.__PK__!.debugCommand!({ type: 'name', kidId: id, name: 'Sir Spud' }), ids[0]!);
    const row = dialog(page).getByRole('button', { name: 'Sir Spud, Fire Kid, kid 1 on your map' });
    await expect(row).toContainText('Sir Spud');
    await expect(row).toContainText('Fire Kid · Kid 1');
    await page.evaluate((id) => window.__PK__!.debugCommand!({ type: 'name', kidId: id, name: null }), ids[0]!);
    await expect(dialog(page).getByRole('button', { name: 'Fire Kid, kid 1 on your map' })).toContainText('Kid 1');
  });

  test('from the card, a growing plot cannot be chosen, and a chosen plot that starts meanwhile is never swapped (GUI_MVP §15.3, §15.6)', async ({ page }) => {
    await fireDetail(page);
    // Plot 1 growing, Plot 2 holding three kids, not started.
    await page.evaluate(() => {
      const pk = window.__PK__!;
      const plant = (plot: number) => pk.debugCommand!({ type: 'plant', kidIds: [0, 1, 2].map((i) => pk.debugAdd!('plain', 2480 + i * 250, 5480 + plot * 250)), plot });
      plant(0);
      plant(1);
      pk.debugCommand!({ type: 'startGrowing', plot: 0 });
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.plots().map((p) => p.state))).toEqual(['growing', 'filling', 'empty', 'empty']);
    await dialog(page).getByRole('button', { name: /kid 1 on your map/ }).click();
    await sheet(page).getByRole('button', { name: 'Choose a plot' }).click();
    const growing = sheet(page).getByRole('button', { name: /^Plot 1 ·/ });
    await expect(growing).toHaveText('Plot 1 · 3 / 5Growing.');
    await expect(growing).toHaveAttribute('aria-disabled', 'true');
    await growing.click({ force: true });
    await expect(sheet(page).locator('.dex-home-confirm-title', { hasText: /^Add / })).toHaveCount(0);
    await sheet(page).getByRole('button', { name: /^Plot 2 ·/ }).click();
    await expect(sheet(page)).toContainText('Plot 2: 3 → 4 / 5');
    await expect(sheet(page)).toContainText('Special roll: 10% → 12.5%');
    await page.evaluate(() => window.__PK__!.debugCommand!({ type: 'startGrowing', plot: 1 }));
    await expect(sheet(page)).toContainText('This plot is already growing. Choose another plot.');
    const add = sheet(page).getByRole('button', { name: 'Add this kid' });
    await expect(add).toHaveAttribute('aria-disabled', 'true');
    await add.click({ force: true });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__PK__!.plots().map((p) => p.kids))).toEqual([3, 3, 0, 0]);
  });

  test('a type with no copies on the map says so (Codex review round 2, FEED-NAME)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    // Discovered, then planted away: none left on the map.
    await page.evaluate(() => {
      const pk = window.__PK__!;
      pk.debugCommand!({ type: 'plant', kidIds: [pk.debugAdd!('fire', 1880, 4380)], plot: 0 });
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.kids().length)).toBe(0);
    await page.locator('[data-nav=dex]').click();
    await dialog(page).locator('[data-kid="fire"]').click();
    await expect(dialog(page).locator('.dex-home-heading')).toHaveText('On your map · 0');
    await expect(dialog(page).locator('.dex-home')).toContainText('None on your map.');
  });

  test('planting from a card opened in the Dex: closing the plot detail returns focus to the Dex button (Codex review round 2, FEED-NAME)', async ({ page }) => {
    await fireDetail(page);
    await dialog(page).getByRole('button', { name: /kid 1 on your map/ }).click();
    await sheet(page).getByRole('button', { name: 'Choose a plot' }).click();
    await sheet(page).getByRole('button', { name: /^Plot 1 ·/ }).click();
    await sheet(page).getByRole('button', { name: 'Add this kid' }).click();
    await expect(sheet(page).locator('.sheet-title')).toHaveText('Plot 1');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('[data-nav=dex]')).toBeFocused();
  });

  test('a 24-letter name wraps inside the Dex row and the picker row (Codex review round 4, FEED-NAME)', async ({ page }) => {
    // A phone: 24 W's are wider than a row's text column.
    await page.setViewportSize({ width: 390, height: 844 });
    const ids = await fireDetail(page);
    await page.evaluate((id) => window.__PK__!.debugCommand!({ type: 'name', kidId: id, name: 'W'.repeat(24) }), ids[0]!);
    const row = dialog(page).getByRole('button', { name: new RegExp(`^${'W'.repeat(24)}, Fire Kid`) });
    await expect(row).toBeVisible();
    // The name itself stays inside the row (a button would just clip it).
    expect(
      await row.evaluate((r) => {
        const name = r.querySelector('.dex-home-row-name')!.getBoundingClientRect();
        return name.right <= r.getBoundingClientRect().right + 0.5 && r.getBoundingClientRect().right <= r.closest('.sheet')!.getBoundingClientRect().right;
      }),
    ).toBe(true);
    await page.keyboard.press('Escape');
    await page.locator('[data-nav=garden]').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Add kids' }).first().click();
    const picker = page.getByRole('dialog').locator('.picker-row').nth(0);
    await expect(picker.locator('.picker-row-name')).toHaveText('W'.repeat(24));
    expect(
      await picker.evaluate((r) => {
        const box = r.querySelector('.picker-check')!.getBoundingClientRect();
        const row = r.getBoundingClientRect();
        return box.right <= row.right + 0.5 && r.scrollWidth <= r.clientWidth + 1;
      }),
    ).toBe(true);
  });

  test('a card whose kid has left comes back after the return summary too, read-only, draft kept (Codex review round 4, FEED-NAME)', async ({ page }) => {
    await fireDetail(page);
    await dialog(page).getByRole('button', { name: /kid 1 on your map/ }).click();
    await sheet(page).getByRole('button', { name: 'Name', exact: true }).click();
    await sheet(page).getByLabel('Kid name').fill('Sir Sp');
    // Fire + Water make Steam: the kid fuses away, then the app is away a while.
    await page.evaluate(() => window.__PK__!.debugAdd!('water', 1380, 4380));
    await expect(sheet(page).locator('.kid-status')).toContainText('This kid has already left the map.');
    await page.evaluate(() => window.__PK__!.debugAway!(60_000));
    await page.getByRole('dialog', { name: 'Welcome back' }).getByRole('button', { name: 'Back to the garden' }).click();
    await expect(sheet(page).locator('.sheet-title')).toHaveText('Name this kid');
    await expect(sheet(page).getByLabel('Kid name')).toHaveValue('Sir Sp');
    await expect(sheet(page).locator('.kid-status')).toContainText('This kid has already left the map.');
    await expect(sheet(page).getByLabel('Kid name')).toBeDisabled();
  });

  test("an open card keeps its kid's number when a lower copy leaves (Codex review round 8, FEED-NAME)", async ({ page }) => {
    await fireDetail(page);
    await dialog(page).getByRole('button', { name: 'Fire Kid, kid 2 on your map' }).click();
    await expect(sheet(page).locator('.sheet-subtitle')).toHaveText('On your map · Kid 2');
    // Kid 1 fuses away (Fire + Water make Steam).
    await page.evaluate(() => window.__PK__!.debugAdd!('water', 1380, 4380));
    await expect.poll(() => page.evaluate(() => window.__PK__!.kids().filter((k) => k.type === 'fire').length)).toBe(1);
    await page.waitForTimeout(200);
    await expect(sheet(page).locator('.sheet-subtitle')).toHaveText('On your map · Kid 2');
  });

  test("a Dex row's number carries into the card it opens, even after a lower copy left (Codex review round 9, FEED-NAME)", async ({ page }) => {
    await fireDetail(page);
    // Kid 1 fuses away while the detail is open; the row for kid 2 keeps its number.
    await page.evaluate(() => window.__PK__!.debugAdd!('water', 1380, 4380));
    await expect(dialog(page).getByRole('button', { name: /kid 1 on your map/ })).toHaveCount(0);
    await dialog(page).getByRole('button', { name: 'Fire Kid, kid 2 on your map' }).click();
    await expect(sheet(page).locator('.sheet-subtitle')).toHaveText('On your map · Kid 2');
    await sheet(page).getByRole('button', { name: 'Choose a plot' }).click();
    await sheet(page).getByRole('button', { name: /^Plot 1 ·/ }).click();
    await expect(sheet(page).locator('.dex-home-who')).toContainText('Kid 2');
  });

  test('an add refused because its plot filled says so about that plot (Codex review round 8, FEED-NAME)', async ({ page }) => {
    await fireDetail(page);
    await dialog(page).getByRole('button', { name: /kid 1 on your map/ }).click();
    await sheet(page).getByRole('button', { name: 'Choose a plot' }).click();
    await sheet(page).getByRole('button', { name: /^Plot 1 ·/ }).click();
    // In one task: Plot 1 fills, then Add, before any frame redraws it.
    await page.evaluate(() => {
      const pk = window.__PK__!;
      pk.debugCommand!({ type: 'plant', kidIds: [0, 1, 2, 3, 4].map((i) => pk.debugAdd!('plain', 2480 + i * 200, 5580)), plot: 0 });
      [...document.querySelectorAll<HTMLButtonElement>('.sheet button')].find((b) => b.textContent === 'Add this kid')!.click();
    });
    await expect(sheet(page).locator('.kid-status')).toContainText('This plot is full. Review it to Start growing.');
    await expect(sheet(page).locator('.kid-status')).not.toContainText('All plots');
  });

  test('the return summary hands back a kid card on its Name page, with the draft (Codex review, FEED-NAME)', async ({ page }) => {
    await fireDetail(page);
    await dialog(page).getByRole('button', { name: /kid 1 on your map/ }).click();
    await sheet(page).getByRole('button', { name: 'Name', exact: true }).click();
    await sheet(page).getByLabel('Kid name').fill('Sir Sp');
    await page.evaluate(() => window.__PK__!.debugAway!(60_000));
    await page.getByRole('dialog', { name: 'Welcome back' }).getByRole('button', { name: 'Back to the garden' }).click();
    await expect(sheet(page).locator('.sheet-title')).toHaveText('Name this kid');
    await expect(sheet(page).getByLabel('Kid name')).toHaveValue('Sir Sp');
    // And still the way back to the Dex.
    await sheet(page).getByRole('button', { name: 'Back', exact: true }).click();
    await expect(sheet(page).getByRole('button', { name: 'Back to Fire Kid' })).toBeVisible();
  });

  test('focus on a copy that fuses away moves to the section heading (Codex review, PR #54)', async ({ page }) => {
    await fireDetail(page);
    await dialog(page).getByRole('button', { name: /kid 1 on your map/ }).focus();
    await page.evaluate(() => window.__PK__!.debugAdd!('water', 1380, 4380));
    await expect(dialog(page).locator('.dex-home-heading')).toBeFocused();
  });

  test('a drag send gets a world card: the first explains, later ones are short', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await allPlots(page);
    await page.evaluate(() => window.__PK__!.centerOn(2160, 3640));
    const send = async (x: number) => {
      const id = await page.evaluate((px) => window.__PK__!.debugAdd!('fire', px, 3880), x);
      await page.waitForTimeout(200);
      const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
      const t = await page.evaluate(() => window.__PK__!.worldToScreen(2160, 3308));
      await page.mouse.move(k.x, k.y - 20);
      await page.mouse.down();
      await page.mouse.move(t.x, t.y, { steps: 8 });
      await page.waitForTimeout(450);
      await page.mouse.up();
    };
    await send(1840);
    const card = page.locator('.feedback .toast-home');
    await expect(card).toContainText('Fire Kid added to Plot 1.');
    await expect(card).toContainText('Their types stay in your Potato-Dex.');
    await expect(card).toContainText('Add 3–5 kids, then press Start growing.');
    expect(await page.evaluate(() => window.__PK__!.settings().plantV2Explained)).toBe(true);
    await card.getByRole('button', { name: 'Dismiss' }).click();
    await expect(card).toHaveCount(0);
    await send(2480);
    await expect(card).toContainText('Start growing at 3–5.');
    await expect(card.getByRole('button', { name: 'Dismiss' })).toHaveCount(0);
  });

});

test.describe("Planting, the Garden's plots (GUI_MVP §15.3-15.4)", () => {
  const sheet = (page: Page) => page.getByRole('dialog');
  const row = (page: Page, n: number) => page.locator('.plot-row').nth(n - 1);

  /** The Garden open on its overview, with Tier 1 kids of these types on the map. */
  async function garden(page: Page, kids: string[] = []): Promise<number[]> {
    await boot(page, '?seed=3&debug=1&calm=1');
    const ids = await page.evaluate((types) => types.map((t, i) => window.__PK__!.debugAdd!(t, 1380 + (i % 4) * 300, 4380 + Math.floor(i / 4) * 300)), kids);
    await page.locator('[data-nav=garden]').click();
    return ids;
  }

  /** Puts `n` new Potato Kids straight into plot `plot` (0-based), as a drag would. */
  async function plantPlain(page: Page, n: number, plot = 0): Promise<void> {
    const before = await page.evaluate((i) => window.__PK__!.plots()[i]!.kids, plot);
    await page.evaluate(
      ([n, plot]) => {
        const pk = window.__PK__!;
        pk.debugCommand!({ type: 'plant', kidIds: Array.from({ length: n }, (_, i) => pk.debugAdd!('plain', 2480 + i * 200, 5580 + plot * 200)), plot });
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
    await expect(footer).toContainText('Added kids leave now. No refund.');
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
    await page.evaluate(() => window.__PK__!.debugAdd!('water', 1380, 4380));
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
    await expect(sheet(page).locator('.plot-review')).toContainText('These kids have already left your map. No refund.');
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
    await page.evaluate(() => window.__PK__!.debugAdd!('water', 2480, 5280));
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
      pk.debugCommand!({ type: 'plant', kidIds: [0, 1, 2].map((i) => pk.debugAdd!('chef', 2480 + i * 200, 5580)), plot: 0 });
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.plots()[0]!.kids)).toBe(3);
    await page.evaluate((id) => window.__PK__!.debugCommand!({ type: 'feed', kidId: id, food: 'apple' }), chef!);
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
    await page.evaluate((id) => window.__PK__!.debugCommand!({ type: 'feed', kidId: id, food: 'apple' }), a!);
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

  test('a plot that sprouts while away shows in the return summary; one with no planting has no such rows (§15.5)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugAway!(60_000));
    const summary = page.getByRole('dialog', { name: 'Welcome back' });
    await expect(summary).toBeVisible();
    await expect(summary).not.toContainText('Kids sprouted');
    await summary.getByRole('button', { name: 'Back to the garden' }).click();
    await plantPlain(page, 3);
    await page.evaluate(() => window.__PK__!.debugCommand!({ type: 'startGrowing', plot: 0 }));
    await expect.poll(() => page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('growing');
    await page.evaluate((s) => window.__PK__!.debugAway!((s + 60) * 1000), balance.planting.growSeconds);
    await expect(summary).toBeVisible();
    const report = (await page.evaluate(() => window.__PK__!.lastOffline()))!;
    expect(report.sprouted).toHaveLength(1);
    await expect(summary.locator('.stat-row', { hasText: 'Kids sprouted' })).toContainText('Kids sprouted1');
    await expect(summary.locator('.stat-row', { hasText: 'Plots ready' })).toContainText('Plots ready0');
    expect(await page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('empty');
  });
});

test.describe('Planting, tapping a plot on the map (GUI_MVP §15.2)', () => {
  // Plot n's soil centre: the Garden's ground (2160, 3500, map v3) plus its offset, then the soil's middle.
  const offsets = [
    [-96, 88],
    [96, 88],
  ] as const;
  const soil = (n: number) => ({ x: 2160 + offsets[n - 1]![0], y: 3500 + offsets[n - 1]![1] - 37.5 });

  async function setup(page: Page): Promise<{ x: number; y: number }> {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.centerOn(2160, 3640));
    await page.waitForTimeout(100);
    return page.evaluate((p) => window.__PK__!.worldToScreen(p.x, p.y), soil(1));
  }

  /**
   * Pointer events on the canvas, all in one task, so a busy test machine can't stretch a
   * tap past its 220 ms. Returns the map's screen point for plot 1 after the last move.
   */
  function press(page: Page, steps: ['pointerdown' | 'pointermove' | 'pointerup', number, number][]) {
    return page.evaluate(
      ([steps, plot]) => {
        const canvas = document.querySelector('canvas')!;
        let held: { x: number; y: number } | null = null;
        for (const [type, x, y] of steps) {
          canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1, bubbles: true }));
          if (type === 'pointermove') held = window.__PK__!.worldToScreen(plot.x, plot.y);
        }
        return held;
      },
      [steps, soil(1)] as const,
    );
  }
  const tap = (page: Page, p: { x: number; y: number }) => press(page, [['pointerdown', p.x, p.y], ['pointerup', p.x, p.y]]);

  test('a tap on an empty plot opens its picker; on a growing plot, its detail', async ({ page }) => {
    const at = await setup(page);
    await tap(page, at);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').locator('.sheet-title')).toHaveText('Pick kids for Plot 1');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.evaluate(() => {
      const pk = window.__PK__!;
      pk.debugCommand!({ type: 'plant', kidIds: [0, 1, 2].map((i) => pk.debugAdd!('plain', 1380 + i * 250, 5480)), plot: 0 });
      pk.debugCommand!({ type: 'startGrowing', plot: 0 });
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('growing');
    await tap(page, at);
    await expect(page.getByRole('dialog').locator('.sheet-title')).toHaveText('Plot 1');
    await expect(page.getByRole('dialog').locator('.sheet-subtitle')).toHaveText('3 / 5 kids · Growing');
  });

  test('a long press or a pan opens nothing; a jitter within 8 px is still a tap, and the map holds', async ({ page }) => {
    const at = await setup(page);
    // Held past 220 ms.
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.waitForTimeout(350);
    await page.mouse.up();
    await page.waitForTimeout(200);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Moved 30 px: a pan, which moves the map.
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + 30, at.y, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Wait out the fling: a press on a moving map is never a tap.
    let was = '';
    await expect
      .poll(
        async () => {
          const now = JSON.stringify(await page.evaluate((p) => window.__PK__!.worldToScreen(p.x, p.y), soil(1)));
          const still = now === was;
          was = now;
          return still;
        },
        { intervals: [150] },
      )
      .toBe(true);
    const moved = await page.evaluate((p) => window.__PK__!.worldToScreen(p.x, p.y), soil(1));
    expect(moved.x).toBeGreaterThan(at.x + 10);
    // Within 8 px the map holds still, and the tap opens the plot.
    const during = await press(page, [
      ['pointerdown', moved.x, moved.y],
      ['pointermove', moved.x + 3, moved.y + 1],
      ['pointermove', moved.x + 5, moved.y + 3],
      ['pointerup', moved.x + 5, moved.y + 3],
    ]);
    expect(during).toEqual(moved);
    await expect(page.getByRole('dialog').locator('.sheet-title')).toHaveText('Pick kids for Plot 1');
  });

  test('a locked plot is no target, and a tap on bare ground opens nothing', async ({ page }) => {
    await setup(page);
    const locked = await page.evaluate((p) => window.__PK__!.worldToScreen(p.x, p.y), soil(2));
    await tap(page, locked);
    await page.waitForTimeout(300);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const bare = await page.evaluate(() => window.__PK__!.worldToScreen(2160, 3880));
    await tap(page, bare);
    await page.waitForTimeout(300);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('a second finger on a kid cancels a tap on a plot (Codex review, PR #72)', async ({ page }) => {
    const at = await setup(page);
    const kid = await page.evaluate(() => window.__PK__!.debugAdd!('plain', 2160, 3880));
    await page.waitForTimeout(200);
    const k = await page.evaluate((id) => window.__PK__!.screenPointOf(id)!, kid);
    // Touch 1 on the plot, touch 2 on the kid, touch 1 lifts at once: no tap.
    await page.evaluate(
      ([at, k]) => {
        const canvas = document.querySelector('canvas')!;
        const fire = (type: string, id: number, p: { x: number; y: number }) =>
          canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: p.x, clientY: p.y, bubbles: true }));
        fire('pointerdown', 1, at);
        fire('pointerdown', 2, { x: k.x, y: k.y - 20 });
        fire('pointerup', 1, at);
        fire('pointerup', 2, { x: k.x, y: k.y - 20 });
      },
      [at, k] as const,
    );
    await page.waitForTimeout(300);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // The same touch alone is a tap.
    await page.evaluate((at) => {
      const canvas = document.querySelector('canvas')!;
      const fire = (type: string) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: at.x, clientY: at.y, bubbles: true }));
      fire('pointerdown');
      fire('pointerup');
    }, at);
    await expect(page.getByRole('dialog').locator('.sheet-title')).toHaveText('Pick kids for Plot 1');
  });
});

test.describe('Rare kids on the map (D-072, GUI_MVP §16.2, §15.5)', () => {
  // The rare kids' art and content come with WILD-ART: until then Hero and Lantern stand in.
  const RARE = '?seed=3&debug=1&calm=1&rare=hero,lantern';

  /** Two rare Hero Kids and an ordinary Fire Kid, spaced apart, in view. Returns their ids (ordinary last). */
  async function rares(page: Page): Promise<number[]> {
    await boot(page, RARE);
    const ids = await page.evaluate(() => {
      const pk = window.__PK__!;
      const out = [pk.debugAdd!('hero', 1640, 4130, { body: 'round', scale: 1 }), pk.debugAdd!('hero', 1870, 4130, { body: 'round', scale: 1 })];
      out.push(pk.debugAdd!('fire', 2100, 4130, { body: 'round', scale: 1 }));
      pk.centerOn(1880, 4180);
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
      window.__PK__!.debugAdd!('hero', 1680, 4280);
      window.__PK__!.debugAdd!('fire', 1980, 4280);
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
    await dex.locator('[data-kid="hero"]').click();
    await expect(dex.locator('.dex-detail-name')).toHaveText(/Hero/);
    await expect(dex.getByText('Rare variants')).toHaveCount(0);
  });

  test('a rare type new to the Dex reads as Rare found; the next one just sprouts, as a rare kid (§15.5)', async ({ page }) => {
    await boot(page, RARE);
    await page.evaluate(() => window.__PK__!.debugReadySeed!(0, 'hero'));
    const found = page.locator('.feedback').getByRole('button', { name: /Rare found/ });
    await expect(found).toContainText('Hero');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.mouse.move(5, 5);
    await expect(page.locator('.feedback')).toBeEmpty({ timeout: 8000 });
    await page.evaluate(() => window.__PK__!.debugReadySeed!(0, 'hero'));
    const card = page.locator('.feedback .toast-short');
    await expect(card).toContainText('sprouted!');
    await expect(card).toContainText('Rare kid · From Plot 1.');
  });

  test("a press just outside a small kid's body, within 44 CSS px, picks it up (§16.1, any kid; Codex review, PR #77)", async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    const id = await page.evaluate(() => {
      window.__PK__!.centerOn(1880, 4380);
      // Smaller than any rolled look (test only), so the target reaches well past its sprites.
      return window.__PK__!.debugAdd!('fire', 1880, 4380, { scale: 0.36 });
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

  test('turning reduced motion on mid-game stills the sleeves at once (Codex review, PR #77)', async ({ page }) => {
    const ids = await rares(page);
    const alphas = () => page.evaluate((id) => window.__PK__!.rares().find((r) => r.id === id)!.sleeveAlpha, ids[0]!);
    // Pulsing: some frame below full opacity within a cycle.
    const seen: number[] = [];
    for (let i = 0; i < 12; i++) {
      seen.push(await alphas());
      await page.waitForTimeout(200);
    }
    expect(Math.min(...seen)).toBeLessThan(0.99);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(100);
    for (let i = 0; i < 12; i++) {
      expect(await alphas()).toBe(1);
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

test.describe('The kid card: feeding and naming (D-056, D-057, GUI_MVP §17-18)', () => {
  const card = (page: Page) => page.getByRole('dialog');
  const personality = JSON.parse(readFileSync('assets/data/personality_v1.json', 'utf8')).types as Record<string, { description: string; favouriteFood: string; hatedFood: string }>;
  const foods = JSON.parse(readFileSync('src/content/balance.json', 'utf8')).feeding as { foods: { id: string; name: string; price: number }[]; favouriteSeconds: number };
  const foodName = (id: string) => foods.foods.find((f) => f.id === id)!.name;
  const fire = personality.fire!;

  /** A Fire Kid in view, Materials to spend, and its card open by a tap. */
  async function open(page: Page, materials = 1000): Promise<number> {
    await boot(page, '?seed=3&debug=1&calm=1');
    const id = await page.evaluate((m) => {
      window.__PK__!.debugGive!({ materials: m });
      window.__PK__!.centerOn(1880, 4380);
      return window.__PK__!.debugAdd!('fire', 1880, 4380);
    }, materials);
    await page.waitForTimeout(200);
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    await page.mouse.click(k.x, k.y - 20);
    await expect(card(page).locator('.sheet-title')).toHaveText('Fire Kid');
    return id;
  }

  test('a tap opens the card: who the kid is, its personality, and its two foods; a drag does not', async ({ page }) => {
    const id = await open(page);
    await expect(card(page).locator('.sheet-subtitle')).toHaveText('On your map · Kid 1');
    await expect(card(page)).toContainText(fire.description);
    await expect(card(page).locator('.kid-card-food').first()).toContainText(foodName(fire.favouriteFood));
    await expect(card(page).locator('.kid-card-food').nth(1)).toContainText(foodName(fire.hatedFood));
    await expect(card(page)).toContainText('Not happy right now.');
    // The tap left the kid where it was.
    expect(await page.evaluate((i) => window.__PK__!.kids().some((k) => k.id === i), id)).toBe(true);
    // Closed, focus goes to the Dex button.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('[data-nav=dex]')).toBeFocused();
    // A drag moves the kid and opens nothing.
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    await page.mouse.move(k.x, k.y - 20);
    await page.mouse.down();
    await page.mouse.move(k.x + 120, k.y - 20, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('its favourite: charged, happy for longer, the sun at its foot; the hated food is refused for free', async ({ page }) => {
    const id = await open(page);
    await card(page).getByRole('button', { name: 'Feed', exact: true }).click();
    await expect(card(page).locator('.sheet-title')).toHaveText('Feed Fire Kid');
    const fav = foods.foods.find((f) => f.id === fire.favouriteFood)!;
    // The favourite comes first, marked; the hated food last, refused.
    await expect(card(page).locator('.feed-row').first()).toContainText(`${fav.name}Favourite`);
    const refused = card(page).locator('.feed-row').last();
    await expect(refused).toContainText(`This kid won’t eat ${foodName(fire.hatedFood)}. Nothing charged.`);
    await expect(refused.getByRole('button')).toHaveAttribute('aria-disabled', 'true');
    await expect(card(page).locator('.feed-row')).toHaveCount(12);
    await card(page).getByRole('button', { name: `Feed ${fav.name}, ${fav.price} Materials` }).click();
    await expect(card(page).locator('.kid-status')).toContainText(`${fav.name} is Fire Kid’s favourite!`);
    expect(await page.evaluate(() => window.__PK__!.wallet().materials)).toBeLessThanOrEqual(1000 - fav.price + 1);
    await expect.poll(() => page.evaluate((i) => window.__PK__!.rares().find((r) => r.id === i)?.happy ?? false, id)).toBe(true);
    await card(page).getByRole('button', { name: 'Back' }).click();
    await expect(card(page).locator('.kid-card-happy')).toContainText(/Happy · (1:00:00|59:5\d)/);
    await expect(card(page).locator('.kid-card-happy')).toContainText('Counts as Tier 2 when added to a plot; odds stay capped.');
  });

  test("the Dex detail shows the type's personality too, before the live copies (§18.1)", async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugAdd!('fire', 1880, 4380));
    await page.locator('[data-nav=dex]').click();
    const dex = page.getByRole('dialog', { name: 'Potato-Dex' });
    await dex.locator('[data-kid="fire"]').click();
    const blocks = dex.locator('.dex-personality');
    await expect(blocks).toContainText(fire.description);
    await expect(blocks.locator('.kid-card-food').first()).toContainText(foodName(fire.favouriteFood));
    // Order: personality, then the live copies.
    const order = await dex.evaluate((d) => ['.dex-personality', '.dex-home'].map((s) => d.querySelector(s)!.getBoundingClientRect().top));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  test('short of Materials, a food says how many more, and nothing is sent', async ({ page }) => {
    await open(page, 40);
    await card(page).getByRole('button', { name: 'Feed', exact: true }).click();
    const row = card(page).locator('.feed-row').nth(1);
    await expect(row).toContainText(/Need \d+ more Materials\./);
    await expect(row.getByRole('button')).toHaveAttribute('aria-disabled', 'true');
  });

  test('naming: saved for its price, unchanged is free, a bad name says why, and the name can go back free', async ({ page }) => {
    await open(page);
    await card(page).getByRole('button', { name: 'Name', exact: true }).click();
    const input = card(page).getByLabel('Kid name');
    const save = card(page).locator('.name-save');
    await input.fill('Spud 🥔');
    await expect(card(page).locator('.name-error')).toHaveText('Use letters, numbers, spaces, apostrophes or hyphens.');
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await input.fill('   ');
    await expect(card(page).locator('.name-error')).toHaveText('Enter a name, or keep the type name.');
    await input.fill('  Sir   Spud ');
    await expect(card(page).locator('.name-count')).toHaveText('8 / 24 characters');
    await expect(save).toHaveText('Save name · 50 Materials');
    await input.press('Enter');
    await expect(card(page).locator('.sheet-title')).toHaveText('Sir Spud');
    await expect(card(page).locator('.sheet-subtitle')).toHaveText('Fire Kid');
    await expect(card(page).locator('.kid-status')).toContainText('Named Sir Spud.');
    const after = await page.evaluate(() => window.__PK__!.wallet().materials);
    await card(page).getByRole('button', { name: 'Name', exact: true }).click();
    await expect(input).toHaveValue('Sir Spud');
    await expect(save).toHaveText('Name unchanged');
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await card(page).getByRole('button', { name: 'Use type name · free' }).click();
    // Its acceptance plays the one tap: no click tap first (Codex review round 4).
    await expect(card(page).getByRole('button', { name: 'Remove name' })).toHaveAttribute('data-cue', 'success');
    await expect(card(page)).toContainText('This kid will be called Fire Kid.');
    await card(page).getByRole('button', { name: 'Remove name' }).click();
    await expect(card(page).locator('.sheet-title')).toHaveText('Fire Kid');
    expect(await page.evaluate(() => window.__PK__!.wallet().materials)).toBeGreaterThanOrEqual(after);
  });

  test('a read-only save lets the card be browsed, says why, and changes nothing (§10, §18.2)', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: false, recovery: false, readOnly: true }));
    await expect(card(page).locator('.kid-status')).toContainText('Update the game to continue.');
    await expect(card(page).getByRole('button', { name: 'Feed', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await expect(card(page).getByRole('button', { name: 'Name', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await expect(card(page)).toContainText(fire.description);
  });

  test('a kid that leaves while its card is open: the card stays, read-only, and says so (§18.3)', async ({ page }) => {
    await open(page);
    // Fire + Water make Steam: the kid fuses away.
    await page.evaluate(() => window.__PK__!.debugAdd!('water', 1880, 4380));
    await expect(card(page).locator('.kid-status')).toContainText('This kid has already left the map.');
    await expect(card(page).locator('.sheet-title')).toHaveText('Fire Kid');
    await expect(card(page).getByRole('button', { name: 'Feed', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await expect(card(page).getByRole('button', { name: 'Name', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await expect(card(page).getByRole('button', { name: 'Choose a plot' })).toHaveAttribute('aria-disabled', 'true');
  });

  test('on a 320 px phone every food row keeps its button inside it (Codex review round 3, FEED-NAME)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page);
    await card(page).getByRole('button', { name: 'Feed', exact: true }).click();
    const fits = await card(page).locator('.feed-row').evaluateAll((rows) =>
      rows.map((r) => {
        const row = r.getBoundingClientRect();
        const b = r.querySelector('.feed-button')!.getBoundingClientRect();
        const name = r.querySelector('.feed-text')!.getBoundingClientRect();
        // Beside the name at its 160 px, or below it at the row's full width (§17.2).
        const beside = Math.abs(b.top - name.top) < 12 && Math.abs(b.width - 160) < 1;
        // The row's content width: inside its border and 8 px padding.
        const below = b.top >= name.bottom - 1 && b.width >= r.clientWidth - 16 - 1;
        // The name keeps its room: at most two 24 px lines, never squeezed letter by letter.
        const nameFits = r.querySelector('.feed-name')!.getBoundingClientRect().height <= 2 * 24 + 1;
        return b.left >= row.left - 0.5 && b.right <= row.right + 0.5 && r.scrollWidth <= r.clientWidth + 1 && (beside || below) && nameFits;
      }),
    );
    expect(fits).toHaveLength(12);
    expect(fits.every(Boolean)).toBe(true);
  });

  test('a 24-letter name wraps in the header, clear of the close button (Codex review round 3, FEED-NAME)', async ({ page }) => {
    await open(page);
    await card(page).getByRole('button', { name: 'Name', exact: true }).click();
    await card(page).getByLabel('Kid name').fill('W'.repeat(24));
    await card(page).locator('.name-save').click();
    await expect(card(page).locator('.sheet-title')).toHaveText('W'.repeat(24));
    const box = await card(page).evaluate((s) => {
      const t = s.querySelector('.sheet-title')!.getBoundingClientRect();
      const x = s.querySelector('.sheet-close')!.getBoundingClientRect();
      return { right: t.right, close: x.left, sheet: s.scrollWidth <= s.clientWidth + 1 };
    });
    expect(box.right).toBeLessThanOrEqual(box.close + 0.5);
    expect(box.sheet).toBe(true);
  });

  test('closing the card before a bite is accepted: the world still says so (Codex review round 3, FEED-NAME)', async ({ page }) => {
    await open(page);
    await card(page).getByRole('button', { name: 'Feed', exact: true }).click();
    const fav = foods.foods.find((f) => f.id === fire.favouriteFood)!;
    // In one task, before the sim's next step: feed, then close.
    await page.evaluate((label) => {
      document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click();
      document.querySelector<HTMLButtonElement>('.sheet-close')!.click();
    }, `Feed ${fav.name}, ${fav.price} Materials`);
    await expect(page.locator('.feedback')).toContainText(`${fav.name} is Fire Kid’s favourite!`);
  });

  test('Back from Feed returns to the card as it was: its scroll and the plot being chosen (Codex review round 5, FEED-NAME)', async ({ page }) => {
    await open(page);
    await card(page).getByRole('button', { name: 'Choose a plot' }).click();
    await card(page).getByRole('button', { name: /^Plot 1 ·/ }).click();
    await expect(card(page).getByText('Add Fire Kid to Plot 1?')).toBeVisible();
    const scroller = await card(page).evaluate((s) => (s.dataset.tight === 'true' ? 'sheet' : 'body'));
    const scrollTop = () => card(page).evaluate((s, which) => (which === 'sheet' ? s : s.querySelector('.sheet-body')!).scrollTop, scroller);
    const before = await scrollTop();
    expect(before).toBeGreaterThan(0);
    await card(page).getByRole('button', { name: 'Feed', exact: true }).click();
    await card(page).getByRole('button', { name: 'Back', exact: true }).click();
    await expect(card(page).getByText('Add Fire Kid to Plot 1?')).toBeVisible();
    expect(Math.abs((await scrollTop()) - before)).toBeLessThan(2);
    await expect(card(page).getByRole('button', { name: 'Feed', exact: true })).toBeFocused();
  });

  test('a press whose view changes before release is no tap (Codex review round 10, FEED-NAME)', async ({ page }) => {
    const id = await open(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    // Down on the kid, the camera moves, up at the same screen point: all in one task.
    await page.evaluate((p) => {
      const canvas = document.querySelector('canvas')!;
      const fire = (type: string) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', isPrimary: true, clientX: p.x, clientY: p.y - 20, buttons: type === 'pointerup' ? 0 : 1, bubbles: true }));
      fire('pointerdown');
      window.__PK__!.centerOn(1900, 4380);
      fire('pointerup');
    }, k);
    await page.waitForTimeout(300);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('the return summary keeps where the card was scrolled under an open page (Codex review round 10, FEED-NAME)', async ({ page }) => {
    await open(page);
    const scroller = await card(page).evaluate((s) => (s.dataset.tight === 'true' ? 'sheet' : 'body'));
    const scrollTop = () => card(page).evaluate((s, which) => (which === 'sheet' ? s : s.querySelector('.sheet-body')!).scrollTop, scroller);
    await card(page).evaluate((s, which) => ((which === 'sheet' ? s : s.querySelector('.sheet-body')!).scrollTop = 300), scroller);
    const before = await scrollTop();
    expect(before).toBeGreaterThan(100);
    await card(page).getByRole('button', { name: 'Feed', exact: true }).click();
    await page.evaluate(() => window.__PK__!.debugAway!(60_000));
    await page.getByRole('dialog', { name: 'Welcome back' }).getByRole('button', { name: 'Back to the garden' }).click();
    await expect(card(page).locator('.sheet-title')).toHaveText('Feed Fire Kid');
    await card(page).getByRole('button', { name: 'Back', exact: true }).click();
    await expect(card(page).locator('.sheet-title')).toHaveText('Fire Kid');
    expect(Math.abs((await scrollTop()) - before)).toBeLessThan(2);
  });

  test('the return summary hands back the plot being chosen, under the page that was open (Codex review round 7, FEED-NAME)', async ({ page }) => {
    await open(page);
    await card(page).getByRole('button', { name: 'Choose a plot' }).click();
    await card(page).getByRole('button', { name: /^Plot 1 ·/ }).click();
    await card(page).getByRole('button', { name: 'Name', exact: true }).click();
    await page.evaluate(() => window.__PK__!.debugAway!(60_000));
    await page.getByRole('dialog', { name: 'Welcome back' }).getByRole('button', { name: 'Back to the garden' }).click();
    await expect(card(page).locator('.sheet-title')).toHaveText('Name this kid');
    await card(page).getByRole('button', { name: 'Back', exact: true }).click();
    await expect(card(page).getByText('Add Fire Kid to Plot 1?')).toBeVisible();
    await expect(card(page).getByRole('button', { name: /^Plot 1 ·/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('a rename while a plot is being chosen shows in its confirmation (Codex review round 6, FEED-NAME)', async ({ page }) => {
    await open(page);
    await card(page).getByRole('button', { name: 'Choose a plot' }).click();
    await card(page).getByRole('button', { name: /^Plot 1 ·/ }).click();
    await expect(card(page).getByText('Add Fire Kid to Plot 1?')).toBeVisible();
    await card(page).getByRole('button', { name: 'Name', exact: true }).click();
    await card(page).getByLabel('Kid name').fill('Spud');
    await card(page).locator('.name-save').click();
    await expect(card(page).getByText('Add Spud to Plot 1?')).toBeVisible();
    await expect(card(page).locator('.dex-home-who .dex-home-row-name')).toHaveText('Spud');
  });

  test('a tap on a kid near the edge never moves the map (Codex review round 6, FEED-NAME)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 1880, 4380));
    // The kid just below the HUD: a held kid there sits in the top edge zone.
    const top = await page.locator('.hud').evaluate((e) => e.getBoundingClientRect().bottom);
    await page.evaluate(([y]) => {
      const pk = window.__PK__!;
      pk.centerOn(1880, 4380);
      const at = pk.worldToScreen(1880, 4380);
      const zoom = (pk.worldToScreen(1080, 2980).y - pk.worldToScreen(1080, 2880).y) / 100;
      pk.centerOn(1880, 4380 + (at.y - (y! + 70)) / zoom);
    }, [top] as const);
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => window.__PK__!.worldToScreen(1880, 4380));
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    // Down, two frames (edge scrolling would act in them), up: in the page, so a slow
    // runner can't stretch the press past the 220 ms a tap allows.
    const during = await page.evaluate(
      (p) =>
        new Promise<{ x: number; y: number }>((done) => {
          const canvas = document.querySelector('canvas')!;
          const fire = (type: string) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', isPrimary: true, clientX: p.x, clientY: p.y - 10, buttons: type === 'pointerup' ? 0 : 1, bubbles: true }));
          fire('pointerdown');
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const at = window.__PK__!.worldToScreen(1880, 4380);
              fire('pointerup');
              done(at);
            }),
          );
        }),
      k,
    );
    expect(during).toEqual(before);
    await expect(page.getByRole('dialog').locator('.sheet-title')).toHaveText('Fire Kid');
    expect(await page.evaluate(() => window.__PK__!.worldToScreen(1880, 4380))).toEqual(before);
  });

  test('a refusal stays until the player moves on; a success goes after 2.5 s (Codex review round 5, FEED-NAME)', async ({ page }) => {
    await open(page);
    await card(page).getByRole('button', { name: 'Feed', exact: true }).click();
    const fav = foods.foods.find((f) => f.id === fire.favouriteFood)!;
    // Feed, and lose the Materials before the sim applies it: refused for cost.
    await page.evaluate((label) => {
      document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click();
      window.__PK__!.debugGive!({ materials: -1e6 });
    }, `Feed ${fav.name}, ${fav.price} Materials`);
    const status = card(page).locator('.kid-status');
    await expect(status).toContainText('Not enough Materials.');
    await page.waitForTimeout(3500);
    await expect(status).toContainText('Not enough Materials.');
    // Moving on clears it.
    await card(page).getByRole('button', { name: 'Back', exact: true }).click();
    await expect(status).toBeHidden();
  });

  test('Enter right after typing a valid name saves it, with no frame in between (Codex review round 2, FEED-NAME)', async ({ page }) => {
    await open(page);
    await card(page).getByRole('button', { name: 'Name', exact: true }).click();
    // Type an invalid draft, let a frame draw it, then fix it and press Enter in one task.
    await card(page).getByLabel('Kid name').fill('Spud!');
    await expect(card(page).locator('.name-save')).toHaveAttribute('aria-disabled', 'true');
    await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('#kid-name')!;
      input.value = 'Spud';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    await expect(card(page).locator('.sheet-title')).toHaveText('Spud');
  });

  test('a bite or a name is saved at once, not at the next autosave (Codex review round 2, FEED-NAME)', async ({ page }) => {
    const id = await open(page);
    await page.evaluate((i) => {
      window.__PK__!.debugCommand!({ type: 'feed', kidId: i, food: 'apple' });
      window.__PK__!.debugCommand!({ type: 'name', kidId: i, name: 'Spud' });
    }, id);
    // Well inside the 10 s autosave: the newest slot already holds both.
    await expect
      .poll(
        () =>
          page.evaluate((i) => {
            const slots = ['A', 'B'].map((s) => localStorage.getItem(`CapacitorStorage.potato-kid/slot${s}`)).filter((x): x is string => !!x).map((x) => JSON.parse(x));
            const newest = slots.sort((a, b) => b.revision - a.revision)[0];
            const kid = newest?.state?.world?.kids?.find((k: { id: number }) => k.id === i);
            return kid ? `${kid.name ?? ''}|${!!kid.happy}` : '';
          }, id),
        { timeout: 2000 },
      )
      .toBe('Spud|true');
  });

  test('typing a name when the kid fuses away: focus stays in the sheet, on the notice (Codex review, FEED-NAME)', async ({ page }) => {
    await open(page);
    await card(page).getByRole('button', { name: 'Name', exact: true }).click();
    const input = card(page).getByLabel('Kid name');
    await input.fill('Spud');
    await expect(input).toBeFocused();
    await page.evaluate(() => window.__PK__!.debugAdd!('water', 1880, 4380));
    await expect(card(page).locator('.kid-status')).toBeFocused();
    await expect(card(page).locator('.kid-status')).toContainText('This kid has already left the map.');
    await expect(input).toBeDisabled();
    await expect(input).toHaveValue('Spud');
  });

  test('planting from the card: one plot, Add, then the plot detail explains (§15.6, §18.3)', async ({ page }) => {
    const id = await open(page);
    await card(page).getByRole('button', { name: 'Choose a plot' }).click();
    await card(page).getByRole('button', { name: /^Plot 1 ·/ }).click();
    await card(page).getByRole('button', { name: 'Add this kid' }).click();
    await expect.poll(() => page.evaluate((i) => window.__PK__!.kids().some((k) => k.id === i), id)).toBe(false);
    await expect(page.getByRole('dialog').locator('.sheet-title')).toHaveText('Plot 1');
    await expect(page.getByRole('dialog').locator('.plot-note')).toContainText('Fire Kid added to Plot 1.');
    expect(await page.evaluate(() => window.__PK__!.plots()[0]!.kids)).toBe(1);
  });
});

test.describe('forgiving drop (D-051)', () => {
  /**
   * A crowded map: `centre` (water) inside a tight ring of eight kids that fuse with
   * neither it, `held` (plain) nor each other. The ring leaves no free spot that touches
   * the centre, so a drop can only fuse with it through the kid under the finger.
   */
  async function crowd(page: Page, held = 'plain', centre = 'water'): Promise<{ plain: number; water: number; ring: number[] }> {
    await boot(page, '?seed=3&debug=1&calm=1');
    return page.evaluate(([held, centre]) => {
      const pk = window.__PK__!;
      const look = { body: 'round', scale: 1 };
      const water = pk.debugAdd!(centre, 1620, 3980, look);
      const w = pk.kids().find((k) => k.id === water)!;
      const dx = w.box.right - w.box.left + 6;
      const dy = w.box.bottom - w.box.top + 6;
      const types = ['blizzard', 'kite', 'hero'];
      const ring: number[] = [];
      let i = 0;
      for (const sx of [-1, 0, 1])
        for (const sy of [-1, 0, 1]) if (sx || sy) ring.push(pk.debugAdd!(types[i++ % 3]!, w.x + sx * dx, w.y + sy * dy, look));
      const plain = pk.debugAdd!(held, 1330, 4380, look);
      return { plain, water, ring };
    }, [held, centre] as const);
  }

  /**
   * Picks `a` up and puts the finger just inside the top of `b`'s box, then waits for the
   * target to settle. The held body floats 70 units higher, over the kid above `b`, so
   * this tells the finger's point from the lifted body's (Codex review, PR #63).
   */
  async function holdOver(page: Page, a: number, b: number): Promise<void> {
    const from = await page.evaluate((id) => window.__PK__!.screenPointOf(id)!, a);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    const to = await page.evaluate((id) => {
      const k = window.__PK__!.kids().find((kid) => kid.id === id)!;
      return window.__PK__!.worldToScreen(k.x, k.y + k.box.top + 10);
    }, b);
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await frames(page, 3);
  }

  const ids = (page: Page) => page.evaluate(() => window.__PK__!.kids().map((k) => k.id));

  test('dropping onto a partner in a crowd fuses it, though the bodies never touch', async ({ page }) => {
    const { plain, water, ring } = await crowd(page);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__PK__!.dropTarget())).toBeNull();
    await holdOver(page, plain, water);
    expect(await page.evaluate(() => window.__PK__!.dropTarget())).toBe(water);
    await page.mouse.up();
    await expect
      .poll(() => page.evaluate(() => window.__PK__!.kids().map((k) => k.type)), { timeout: 3000 })
      .toContain('firefighter');
    const left = await ids(page);
    expect(left).not.toContain(plain);
    expect(left).not.toContain(water);
    for (const id of ring) expect(left).toContain(id);
    expect(await page.evaluate(() => window.__PK__!.dropTarget())).toBeNull();
  });

  test('dropping onto a non-partner in a crowd lands it apart, with no fusion', async ({ page }) => {
    const { plain, water, ring } = await crowd(page);
    await page.waitForTimeout(200);
    const right = ring[6]!; // the blizzard directly right of water
    await holdOver(page, plain, right);
    expect(await page.evaluate(() => window.__PK__!.dropTarget())).toBe(right);
    await page.mouse.up();
    await page.waitForTimeout(500);
    const kids = await page.evaluate(() => window.__PK__!.kids());
    expect(kids.map((k) => k.id).sort((p, q) => p - q)).toEqual([plain, water, ...ring].sort((p, q) => p - q));
    // It slid to a free spot (D-039): no box overlaps another.
    const rect = (k: (typeof kids)[number]) => ({ l: k.x + k.box.left, t: k.y + k.box.top, r: k.x + k.box.right, b: k.y + k.box.bottom });
    const me = rect(kids.find((k) => k.id === plain)!);
    for (const o of kids.filter((k) => k.id !== plain).map(rect)) expect(me.l < o.r && o.l < me.r && me.t < o.b && o.t < me.b).toBe(false);
  });

  test('a partner still waiting for its costume is invisible, so it is no target (Codex review, PR #66)', async ({ page }) => {
    // Lantern's costume never arrives during the test; picnic + lantern is a recipe.
    await page.route('**/kid_lantern_*', async (route) => {
      await new Promise((r) => setTimeout(r, 60_000));
      await route.continue().catch(() => {});
    });
    const { plain: picnic, water: lantern, ring } = await crowd(page, 'picnic', 'lantern');
    await expect.poll(() => page.evaluate((k) => !!window.__PK__!.screenPointOf(k), picnic)).toBe(true);
    for (const id of ring) await expect.poll(() => page.evaluate((k) => !!window.__PK__!.screenPointOf(k), id)).toBe(true);
    expect(await page.evaluate((k) => window.__PK__!.screenPointOf(k), lantern)).toBeUndefined();
    await holdOver(page, picnic, lantern);
    expect(await page.evaluate(() => window.__PK__!.dropTarget())).toBeNull();
    await page.mouse.up();
    await page.waitForTimeout(500);
    const kids = await page.evaluate(() => window.__PK__!.kids().map((k) => k.type));
    expect(kids).not.toContain('festival');
    expect(kids).toContain('lantern');
    expect(kids).toContain('picnic');
  });
});

test.describe('the world lives on while away (D-053)', () => {
  const recipes = new Set(
    (JSON.parse(readFileSync('src/content/recipes.json', 'utf8')) as { a: string; b: string }[]).flatMap((r) => [`${r.a}+${r.b}`, `${r.b}+${r.a}`]),
  );
  const slack = (JSON.parse(readFileSync('src/content/balance.json', 'utf8')) as { body: { touchSlack: number } }).body.touchSlack;

  test('after three hours away, kids are found elsewhere, drawn where they are, and no recipe pair touches', async ({ page }) => {
    const errors = await boot(page, '?seed=3&debug=1');
    // A tight block of recipe partners (plain, water, fire, snow), touching. They're placed
    // and the app leaves in one go, before any frame: online they would fuse at once.
    const { placed, before, out } = await page.evaluate(async () => {
      const pk = window.__PK__!;
      const look = { body: 'round', scale: 1 };
      const first = pk.debugAdd!('plain', 1380, 3880, look);
      const box = pk.kids().find((k) => k.id === first)!.box;
      const ids = [first];
      for (let i = 1; i < 12; i++) {
        const [x, y] = [1380 + (i % 4) * (box.right - box.left + 4), 3880 + Math.floor(i / 4) * (box.bottom - box.top + 4)];
        ids.push(pk.debugAdd!(['plain', 'water', 'fire', 'snow'][i % 4]!, x, y, look));
      }
      const before = pk.kids();
      await pk.debugAway!(3 * 3600 * 1000);
      // The first frames after the return (two, so the renderer's own tick has run): every
      // kid is drawn where the sim has it.
      for (let i = 0; i < 2; i++) await new Promise((r) => requestAnimationFrame(() => r(null)));
      const kids = pk.kids();
      const off = kids.map((k) => {
        const drawn = pk.screenPointOf(k.id);
        const at = pk.worldToScreen(k.x, k.y);
        return drawn ? Math.hypot(drawn.x - at.x, drawn.y - at.y) : 0;
      });
      return { placed: ids, before, out: { kids, off, spawned: pk.lastOffline()!.spawned.length } };
    });
    // Nobody fused on the way back: everyone is still here, plus the arrivals.
    expect(out.kids).toHaveLength(before.length + out.spawned);
    for (const id of placed) expect(out.kids.some((k) => k.id === id)).toBe(true);
    // They wandered: on average far from where they were left.
    const moved = placed.map((id) => {
      const [a, b] = [before.find((k) => k.id === id)!, out.kids.find((k) => k.id === id)!];
      return Math.hypot(a.x - b.x, a.y - b.y);
    });
    expect(moved.reduce((s, d) => s + d, 0) / moved.length).toBeGreaterThan(300);
    // Drawn where they are, not sliding over from where they were (a frame of walking aside).
    expect(Math.max(...out.off)).toBeLessThan(5);
    // No recipe pair touching (the sim's rule: overlapping, or within slack on one axis).
    const rect = (k: (typeof out.kids)[number]) => ({ l: k.x + k.box.left, t: k.y + k.box.top, r: k.x + k.box.right, b: k.y + k.box.bottom });
    for (let i = 0; i < out.kids.length; i++) {
      for (let j = i + 1; j < out.kids.length; j++) {
        const [a, b] = [out.kids[i]!, out.kids[j]!];
        if (!recipes.has(`${a.type}+${b.type}`)) continue;
        const [p, q] = [rect(a), rect(b)];
        const dx = Math.max(p.l - q.r, q.l - p.r);
        const dy = Math.max(p.t - q.b, q.t - p.b);
        const touches = (dx < 0 && dy < 0) || (dx <= slack && dy <= 0) || (dy <= slack && dx <= 0);
        expect(touches, `${a.type} ${a.id} touches ${b.type} ${b.id}`).toBe(false);
      }
    }
    expect(errors).toEqual([]);
  });
});

test('a sprout that comes up while away is drawn like any arrival (Codex review, PR #72)', async ({ page }) => {
  const errors = await boot(page, '?seed=3&debug=1&calm=1');
  const sprouted = await page.evaluate(async () => {
    const pk = window.__PK__!;
    const ids = [pk.debugAdd!('plain', 1330, 4380), pk.debugAdd!('fire', 1680, 4380), pk.debugAdd!('snow', 2030, 4380)];
    for (const id of ids) pk.debugCommand!({ type: 'plant', kidIds: [id] });
    await pk.debugAway!(0); // a step: the three are planted
    pk.debugCommand!({ type: 'startGrowing', plot: 0 });
    await pk.debugAway!(0); // a step: it starts growing
    await pk.debugAway!(2 * 3600 * 1000); // long enough to ripen
    for (let i = 0; i < 2; i++) await new Promise((r) => requestAnimationFrame(() => r(null)));
    return pk.lastOffline()!.sprouted.map((k) => ({ id: k.id, drawn: !!pk.screenPointOf(k.id) }));
  });
  expect(sprouted).toHaveLength(1);
  expect(sprouted[0]!.drawn).toBe(true);
  expect(errors).toEqual([]);
});

test('starting a plot growing is saved at once, with its decided sprout (Codex review, PR #72)', async ({ page }) => {
  const errors = await boot(page, '?seed=3&debug=1&calm=1');
  /** The newest save's plot 0, as stored. */
  const savedPlot = () =>
    page.evaluate(() => {
      const recs = ['slotA', 'slotB'].map((s) => localStorage.getItem(`CapacitorStorage.potato-kid/${s}`)).flatMap((r) => (r ? [JSON.parse(r)] : []));
      const newest = recs.sort((a, b) => b.revision - a.revision)[0];
      return newest?.state?.plots?.[0]?.seed ?? null;
    });
  await page.evaluate(() => {
    const pk = window.__PK__!;
    for (const [t, x] of [['plain', 1330], ['fire', 1680], ['snow', 2030]] as const) pk.debugCommand!({ type: 'plant', kidIds: [pk.debugAdd!(t, x, 4380)] });
  });
  // Planting saves at once too, with the sprout still undecided.
  await expect.poll(async () => (await savedPlot())?.planted?.length, { timeout: 3000 }).toBe(3);
  expect((await savedPlot()).sprout).toBeNull();
  await page.evaluate(() => window.__PK__!.debugCommand!({ type: 'startGrowing', plot: 0 }));
  // Well inside the 10 s periodic save: only the immediate save can have stored it.
  await expect.poll(async () => (await savedPlot())?.sprout?.type ?? null, { timeout: 1500 }).not.toBeNull();
  // Cancelling it is saved at once too, or a crash could bring the growing back (Codex review, PR #82).
  await page.evaluate(() => window.__PK__!.debugCommand!({ type: 'emptyPlot', plot: 0 }));
  await expect.poll(savedPlot, { timeout: 1500 }).toBeNull();
  expect(errors).toEqual([]);
});

test.describe('plots on the map (D-061, GUI_MVP §15.2)', () => {
  const plot0 = (page: Page) => page.evaluate(() => window.__PK__!.plots()[0]!);

  test('a plot fills with a stamp per kid, then shows its stages, then the waiting sign when the map is full', async ({ page }) => {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    await expect.poll(async () => (await plot0(page)).shown).toEqual(['fx_plant_plot', 'fx_plant_filling']);
    // Fill the map but for three places, then plant three (from the far side of the map).
    await page.evaluate(() => {
      const pk = window.__PK__!;
      const ids: number[] = [];
      for (let i = 0; i < 12; i++) ids.push(pk.debugAdd!(['plain', 'plain', 'plain', 'fire'][i % 4]!, 1280 + (i % 4) * 260, 4580 + Math.floor(i / 4) * 300));
      pk.debugCommand!({ type: 'plant', kidIds: ids.slice(0, 3) });
    });
    await expect.poll(async () => (await plot0(page)).shown).toEqual(['fx_plant_plot', 'fx_plant_filling', 'fx_plant_slot_filled', 'fx_plant_slot_filled', 'fx_plant_slot_filled']);
    expect((await plot0(page)).state).toBe('filling');
    await page.evaluate(() => window.__PK__!.debugCommand!({ type: 'startGrowing', plot: 0 }));
    await expect.poll(async () => (await plot0(page)).shown).toEqual(['fx_plant_plot', 'fx_plant_seed']);
    const grow = balance.planting.growSeconds;
    await page.evaluate((s) => window.__PK__!.debugAway!(s * 1000), grow * 0.4);
    await expect.poll(async () => (await plot0(page)).shown).toEqual(['fx_plant_plot', 'fx_plant_shoot']);
    await page.evaluate((s) => window.__PK__!.debugAway!(s * 1000), grow * 0.4);
    await expect.poll(async () => (await plot0(page)).shown).toEqual(['fx_plant_plot', 'fx_plant_leaves']);
    // Fill the three free places, so the ripe seed has to wait.
    await page.evaluate(() => {
      for (let i = 0; i < 3; i++) window.__PK__!.debugAdd!('plain', 1380 + i * 260, 5580);
    });
    await page.evaluate((s) => window.__PK__!.debugAway!(s * 1000), grow * 0.3);
    await expect.poll(async () => (await plot0(page)).waiting).toBe('full');
    await expect.poll(async () => (await plot0(page)).shown).toEqual(['fx_plant_plot', 'fx_plant_waiting']);
    expect(errors).toEqual([]);
  });
});

test.describe('pinch-to-zoom (D-071)', () => {
  type Pt = { x: number; y: number };
  /** Sends touch pointer events to the canvas in one page task: [type, pointerId, x, y]. */
  function touches(page: Page, steps: ['pointerdown' | 'pointermove' | 'pointerup', number, number, number][]) {
    return page.evaluate((steps) => {
      const canvas = document.querySelector('canvas')!;
      for (const [type, id, x, y] of steps) {
        canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1, bubbles: true }));
      }
    }, steps);
  }

  async function setup(page: Page): Promise<{ errors: string[]; anchor: Pt; at: Pt }> {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    // An open stretch of map, away from the edges, with no kid under the fingers.
    const anchor = { x: 2160, y: 5080 };
    await page.evaluate((a) => window.__PK__!.centerOn(a.x, a.y), anchor);
    await page.waitForTimeout(100);
    const at = await page.evaluate((a) => window.__PK__!.worldToScreen(a.x, a.y), anchor);
    return { errors, anchor, at };
  }

  const near = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y) < 1.5;

  test('spreading two fingers zooms in about their midpoint, which stays on the same spot of the map', async ({ page }) => {
    const { errors, anchor, at } = await setup(page);
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBe(1);
    await touches(page, [
      ['pointerdown', 1, at.x - 40, at.y],
      ['pointerdown', 2, at.x + 40, at.y],
      ['pointermove', 1, at.x - 60, at.y],
      ['pointermove', 2, at.x + 60, at.y],
    ]);
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBeCloseTo(1.5, 5);
    // The map point that was between the fingers is still between them.
    expect(near(await page.evaluate((a) => window.__PK__!.worldToScreen(a.x, a.y), anchor), at)).toBe(true);
    // Both fingers moving together pan the map with them.
    await touches(page, [
      ['pointermove', 1, at.x - 60, at.y + 30],
      ['pointermove', 2, at.x + 60, at.y + 30],
      ['pointerup', 1, at.x - 60, at.y + 30],
      ['pointerup', 2, at.x + 60, at.y + 30],
    ]);
    expect(near(await page.evaluate((a) => window.__PK__!.worldToScreen(a.x, a.y), anchor), { x: at.x, y: at.y + 30 })).toBe(true);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('zoom stops at half and at twice the fitted zoom', async ({ page }) => {
    const { at } = await setup(page);
    await touches(page, [
      ['pointerdown', 1, at.x - 100, at.y],
      ['pointerdown', 2, at.x + 100, at.y],
      ['pointermove', 1, at.x - 5, at.y],
      ['pointermove', 2, at.x + 5, at.y],
    ]);
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBe(0.5);
    await touches(page, [
      // The pinch scales from its start (200 px at zoom 1): 440 px would be 2.2.
      ['pointermove', 1, at.x - 220, at.y],
      ['pointermove', 2, at.x + 220, at.y],
      ['pointerup', 1, at.x - 220, at.y],
      ['pointerup', 2, at.x + 220, at.y],
    ]);
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBe(2);
  });

  test('after one finger lifts, the other pans on from where it is, with no jump', async ({ page }) => {
    const { anchor, at } = await setup(page);
    await touches(page, [
      ['pointerdown', 1, at.x - 40, at.y],
      ['pointerdown', 2, at.x + 40, at.y],
      ['pointermove', 2, at.x + 80, at.y],
      ['pointerup', 1, at.x - 40, at.y],
    ]);
    const before = await page.evaluate((a) => window.__PK__!.worldToScreen(a.x, a.y), anchor);
    // The first move only follows the finger from where it is: nothing jumps.
    await touches(page, [['pointermove', 2, at.x + 80, at.y + 30]]);
    const after = await page.evaluate((a) => window.__PK__!.worldToScreen(a.x, a.y), anchor);
    expect(near(after, { x: before.x, y: before.y + 30 })).toBe(true);
    await touches(page, [['pointerup', 2, at.x + 80, at.y + 30]]);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('a second finger on a kid just pressed pinches instead: the kid is put back, with no card and no drag', async ({ page }) => {
    await setup(page);
    const id = await page.evaluate((a) => window.__PK__!.debugAdd!('plain', a.x, a.y), { x: 2160, y: 5080 });
    await page.waitForTimeout(200);
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    const before = await page.evaluate((i) => window.__PK__!.kids().find((x) => x.id === i)!, id);
    await touches(page, [
      ['pointerdown', 1, k.x, k.y - 20],
      ['pointerdown', 2, k.x + 120, k.y - 20],
      ['pointermove', 2, k.x + 180, k.y - 20],
      ['pointerup', 1, k.x, k.y - 20],
      ['pointerup', 2, k.x + 180, k.y - 20],
    ]);
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBeGreaterThan(1);
    await page.waitForTimeout(300);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const after = await page.evaluate((i) => window.__PK__!.kids().find((x) => x.id === i)!, id);
    expect({ x: after.x, y: after.y, held: after.held }).toEqual({ x: before.x, y: before.y, held: false });
  });

  test('a second finger landing on a kid while the first pans pinches too, and picks nothing up', async ({ page }) => {
    await setup(page);
    const id = await page.evaluate(() => window.__PK__!.debugAdd!('plain', 2160, 5080));
    await page.waitForTimeout(200);
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    const ground = { x: k.x - 150, y: k.y + 150 };
    await touches(page, [
      ['pointerdown', 1, ground.x, ground.y],
      ['pointerdown', 2, k.x, k.y - 20],
      ['pointermove', 2, k.x + 60, k.y - 20],
      ['pointerup', 2, k.x + 60, k.y - 20],
      ['pointerup', 1, ground.x, ground.y],
    ]);
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBeGreaterThan(1);
    expect(await page.evaluate((i) => window.__PK__!.kids().find((x) => x.id === i)!.held, id)).toBe(false);
  });

  test('a second finger after the 220 ms tap window, before any frame has seen it pass, leaves the kid dragged', async ({ page }) => {
    await setup(page);
    const id = await page.evaluate(() => window.__PK__!.debugAdd!('plain', 2160, 5080));
    await page.waitForTimeout(200);
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    // One page task: no frame runs between the press and the second finger (Codex review, PR #83).
    await page.evaluate((k) => {
      const canvas = document.querySelector('canvas')!;
      const send = (type: string, id: number, x: number, y: number) =>
        canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, buttons: 1, bubbles: true }));
      send('pointerdown', 1, k.x, k.y - 20);
      const t = performance.now();
      while (performance.now() - t < 260) {
        // Held past the tap window.
      }
      send('pointerdown', 2, k.x + 120, k.y - 20);
      send('pointermove', 2, k.x + 180, k.y - 20);
    }, k);
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBe(1);
    expect(await page.evaluate((i) => window.__PK__!.kids().find((x) => x.id === i)!.held, id)).toBe(true);
    await touches(page, [
      ['pointermove', 1, k.x + 60, k.y - 20],
      ['pointerup', 1, k.x + 60, k.y - 20],
      ['pointerup', 2, k.x + 180, k.y - 20],
    ]);
  });

  test('a second finger while a kid is being dragged is ignored: the drag goes on and nothing zooms', async ({ page }) => {
    await setup(page);
    const id = await page.evaluate(() => window.__PK__!.debugAdd!('plain', 2160, 5080));
    await page.waitForTimeout(200);
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    await touches(page, [
      ['pointerdown', 1, k.x, k.y - 20],
      ['pointermove', 1, k.x + 40, k.y - 20], // past 8 px: a drag
      ['pointerdown', 2, k.x - 150, k.y + 100],
      ['pointermove', 2, k.x - 250, k.y + 100],
      ['pointerup', 2, k.x - 250, k.y + 100],
      ['pointermove', 1, k.x + 80, k.y - 20],
      ['pointerup', 1, k.x + 80, k.y - 20],
    ]);
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBe(1);
    await expect.poll(() => page.evaluate((i) => window.__PK__!.kids().find((x) => x.id === i)!.x, id)).toBeGreaterThan(1100);
  });

  test('the zoom stays the same when the screen changes size', async ({ page }) => {
    const { at } = await setup(page);
    const span = () => page.evaluate(() => { const pk = window.__PK__!; return pk.worldToScreen(2380, 5080).x - pk.worldToScreen(2080, 5080).x; });
    const fitted = await span();
    await touches(page, [
      ['pointerdown', 1, at.x - 40, at.y],
      ['pointerdown', 2, at.x + 40, at.y],
      ['pointermove', 2, at.x + 120, at.y],
      ['pointerup', 1, at.x - 40, at.y],
      ['pointerup', 2, at.x + 120, at.y],
    ]);
    expect(await span()).toBeCloseTo(fitted * 2, 3);
    // Taller: the fitted zoom (1080 units across) is unchanged, so the map is drawn as before.
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: size.width, height: size.height + 60 });
    await expect.poll(span).toBeCloseTo(fitted * 2, 3);
  });

  test('a mouse wheel zooms about the pointer', async ({ page }) => {
    const { anchor, at } = await setup(page);
    // The project emulates a phone, where Playwright's wheel isn't delivered: send one.
    await page.evaluate((at) => document.querySelector('canvas')!.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, clientX: at.x, clientY: at.y, bubbles: true, cancelable: true })), at);
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBeCloseTo(Math.exp(0.3), 5);
    expect(near(await page.evaluate((a) => window.__PK__!.worldToScreen(a.x, a.y), anchor), at)).toBe(true);
  });

  test('a wheel counting lines or pages zooms as much as one counting pixels', async ({ page }) => {
    const { at } = await setup(page);
    const wheel = (deltaY: number, deltaMode: number) =>
      page.evaluate(([at, deltaY, deltaMode]) => document.querySelector('canvas')!.dispatchEvent(new WheelEvent('wheel', { deltaY, deltaMode, clientX: at.x, clientY: at.y, bubbles: true, cancelable: true })), [at, deltaY, deltaMode] as const);
    // Firefox's mouse wheel: three lines a notch, a line taken as 16 px (Codex review, PR #83).
    await wheel(-3, 1); // DOM_DELTA_LINE
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBeCloseTo(Math.exp(48 * 0.0015), 5);
    // A page zooms out a long way: clamped at the farthest zoom.
    await wheel(1, 2); // DOM_DELTA_PAGE
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBe(0.5);
  });

  test('a pinch cut short by the app going away leaves no gesture behind: one finger pans and the wheel zooms after', async ({ page }) => {
    const { anchor, at } = await setup(page);
    // Two fingers down, then the app is backgrounded; their pointerups never arrive.
    await touches(page, [
      ['pointerdown', 1, at.x - 40, at.y],
      ['pointerdown', 2, at.x + 40, at.y],
      ['pointermove', 2, at.x + 50, at.y],
    ]);
    await page.evaluate(() => window.__PK__!.debugAway!(1000));
    const zoomed = await page.evaluate(() => window.__PK__!.zoom());
    const before = await page.evaluate((a) => window.__PK__!.worldToScreen(a.x, a.y), anchor);
    await touches(page, [
      ['pointerdown', 3, at.x, at.y],
      ['pointermove', 3, at.x, at.y + 30],
    ]);
    expect(near(await page.evaluate((a) => window.__PK__!.worldToScreen(a.x, a.y), anchor), { x: before.x, y: before.y + 30 })).toBe(true);
    await touches(page, [['pointerup', 3, at.x, at.y + 30]]);
    await page.waitForTimeout(500);
    await page.evaluate((at) => document.querySelector('canvas')!.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, clientX: at.x, clientY: at.y, bubbles: true, cancelable: true })), at);
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBeCloseTo(zoomed * Math.exp(0.3), 5);
  });
});

test.describe('the HUD, navigation and Notebook (GUI_MVP §§19.1-19.2, 20.1)', () => {
  test('an engine refusal of Spawn now is said in the Garden, and nowhere else (Codex review, PR #87)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.locator('[data-nav=garden]').click();
    // In one task: the tap is valid when sent, then the Potatokens vanish before the engine answers.
    await page.evaluate(() => {
      (document.querySelector('.arrivals-spawn') as HTMLButtonElement).click();
      window.__PK__!.debugGive!({ potatokens: -window.__PK__!.wallet().potatokens });
    });
    await expect(page.locator('.arrivals-reason')).toContainText('Not enough Potatokens');
    // Announced, and describing the button (Codex review round 2, PR #87).
    await expect(page.locator('.arrivals-reason')).toHaveAttribute('role', 'status');
    await expect(page.locator('.arrivals-spawn')).toHaveAttribute('aria-describedby', 'arrivals-reason');
    // Let the engine answer first (its step runs in a frame): that text could be the prediction.
    await frames(page, 5);
    // The engine's answer stands until the next tap, even once the button could work again.
    await page.evaluate(() => window.__PK__!.debugGive!({ potatokens: 5 }));
    await page.waitForTimeout(200);
    await expect(page.locator('.arrivals-reason')).toContainText('Not enough Potatokens');
    await page.keyboard.press('Escape');
    // Sampled: the world never repeats it.
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(150);
      expect(await page.locator('.feedback').textContent()).not.toContain('Not enough');
    }
  });

  test('page mode: Back to Notebook returns to the Notebook where it was, its row in view (Codex review, PR #87)', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 200 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false }));
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.hudFit)).toBe('page');
    await page.locator('[data-nav=notebook]').scrollIntoViewIfNeeded();
    await page.locator('[data-nav=notebook]').click();
    const settings = page.getByRole('dialog', { name: 'Notebook' }).getByRole('button', { name: 'Settings', exact: true });
    await settings.scrollIntoViewIfNeeded();
    const scrolled = await page.evaluate(() => (document.scrollingElement ?? document.documentElement).scrollTop);
    expect(scrolled).toBeGreaterThan(0);
    await settings.click();
    await page.getByRole('button', { name: 'Back to Notebook' }).click();
    const row = page.getByRole('dialog', { name: 'Notebook' }).getByRole('button', { name: 'Settings', exact: true });
    await expect(row).toBeFocused();
    await expect(row).toBeInViewport();
    // Exactly where the page was, not merely scrolled to the row.
    expect(await page.evaluate(() => (document.scrollingElement ?? document.documentElement).scrollTop)).toBe(scrolled);
  });

  test('page mode: a tool restored after the return summary goes back to the Notebook where it was (Codex review round 2, PR #87)', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 200 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false }));
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.hudFit)).toBe('page');
    await page.locator('[data-nav=notebook]').scrollIntoViewIfNeeded();
    await page.locator('[data-nav=notebook]').click();
    const settings = page.getByRole('dialog', { name: 'Notebook' }).getByRole('button', { name: 'Settings', exact: true });
    await settings.scrollIntoViewIfNeeded();
    const scrolled = await page.evaluate(() => (document.scrollingElement ?? document.documentElement).scrollTop);
    expect(scrolled).toBeGreaterThan(0);
    await settings.click();
    await page.evaluate(() => window.__PK__!.debugAway!(120_000));
    await page.getByRole('dialog', { name: 'Welcome back' }).getByRole('button', { name: 'Back to the garden' }).click();
    await page.getByRole('button', { name: 'Back to Notebook' }).click();
    await expect(page.getByRole('dialog', { name: 'Notebook' }).getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
    expect(await page.evaluate(() => (document.scrollingElement ?? document.documentElement).scrollTop)).toBe(scrolled);
  });

  test('a Notebook tool interrupted by the return summary comes back as a Notebook page (Codex review, PR #87)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    for (const [row, title] of [['Capacity', 'Capacity'], ['Map view', 'Map view'], ['Settings', 'Settings']] as const) {
      await openTool(page, row);
      await page.evaluate(() => window.__PK__!.debugAway!(120_000));
      await page.getByRole('dialog', { name: 'Welcome back' }).getByRole('button', { name: 'Back to the garden' }).click();
      await expect(page.getByRole('dialog', { name: title })).toBeVisible();
      await page.getByRole('button', { name: 'Back to Notebook' }).click();
      await expect(page.getByRole('dialog', { name: 'Notebook' }).getByRole('button', { name: row, exact: true })).toBeFocused();
      await page.keyboard.press('Escape');
    }
  });

  for (const [w, h] of [[640, 360], [390, 844]] as const) {
    test(`${w}x${h}: Find Garden frames the whole building down to its outlet, at 100 % and at 200 % the building first (Codex review, PR #87)`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await boot(page, '?seed=3&debug=1&calm=1');
      const frame = await page.evaluate(() => window.__PK__!.gardenFrame());
      const band = await page.evaluate(() => ({ top: document.querySelector('.top-stack')!.getBoundingClientRect().bottom, bottom: document.querySelector('.tray')!.getBoundingClientRect().top }));
      const y = (wy: number) => page.evaluate(([x, wy]) => window.__PK__!.worldToScreen(x, wy).y, [frame.x, wy] as const);
      await page.evaluate(() => window.__PK__!.centerOn(99999, 99999));
      await openTool(page, 'Map view');
      await page.getByRole('button', { name: 'Find Garden' }).click();
      expect(await y(frame.top)).toBeGreaterThanOrEqual(band.top - 0.5);
      // The whole frame when it fits the band (portrait); else the building first, its top
      // at the band's top (a compact landscape at its fitted zoom, §20.1).
      if ((await y(frame.bottom)) - (await y(frame.top)) <= band.bottom - band.top) expect(await y(frame.bottom)).toBeLessThanOrEqual(band.bottom + 0.5);
      else expect(await y(frame.top)).toBeLessThan(band.top + 2);
      // At 200 % the frame no longer fits: the building's top is at the band's top.
      await page.evaluate(() => window.__PK__!.centerOn(99999, 99999));
      await openTool(page, 'Map view');
      const sheet = page.getByRole('dialog', { name: 'Map view' });
      await sheet.getByRole('button', { name: 'Zoom in' }).click();
      await sheet.getByRole('button', { name: 'Zoom in' }).click();
      await sheet.getByRole('button', { name: 'Find Garden' }).click();
      const top = await y(frame.top);
      expect(top).toBeGreaterThanOrEqual(band.top - 0.5);
      expect(top).toBeLessThan(band.top + 2);
    });
  }

  test('the strip shows Materials, Potatokens and population; a full map swaps in a warning', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    const pop = page.locator('.hud-population');
    const n = await page.evaluate(() => window.__PK__!.kids().length);
    await expect(pop).toHaveAttribute('aria-label', `${n} of 12 kids on the map`);
    await expect(pop.locator('img')).toHaveAttribute('src', /icon%20kids/);
    // Nothing in the strip is a control (§19.1).
    await expect(page.locator('.hud button')).toHaveCount(0);
    await page.evaluate((n) => {
      for (let i = n; i < 12; i++) window.__PK__!.debugAdd!('plain', 1280 + (i % 6) * 280, 4380 + Math.floor(i / 6) * 300);
    }, n);
    await expect(pop).toHaveAttribute('aria-label', 'Map is full: 12 of 12 kids');
    await expect(pop.locator('img')).toHaveAttribute('src', /title%3eAttention/);
    await expect(pop).toContainText('12/12');
  });

  test('the Garden opens on Arrivals, then Plots, then Spawn rate', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.locator('[data-nav=garden]').click();
    const order = await page.evaluate(() =>
      [...document.querySelectorAll('.sheet[role=dialog] .sheet-body > *')].map((e) => e.className.split(' ')[0]).filter((c) => c !== 'garden-plot-helpers'),
    );
    expect(order.indexOf('garden-arrivals')).toBeLessThan(order.indexOf('garden-plots'));
    expect(order.indexOf('garden-plots')).toBeLessThan(order.indexOf('garden-rate'));
    await expect(page.getByRole('navigation', { name: 'Garden sections' }).getByRole('button')).toHaveText(['Arrivals', 'Plots', 'Spawn rate']);
    await expect(page.locator('[data-nav=garden]')).toHaveClass(/is-selected/);
  });

  test('a Notebook tool replaces the Notebook in place; Back to Notebook returns with its row focused', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.locator('[data-nav=notebook]').click();
    const nb = page.getByRole('dialog', { name: 'Notebook' });
    await expect(nb).toContainText('Tools for your garden.');
    await expect(nb.locator('.notebook-row')).toHaveText(['Capacity', 'Spawn bias', 'Compendium', 'Map view', 'Settings']);
    for (const [row, title] of [
      ['Capacity', 'Capacity'],
      ['Spawn bias', 'Spawn bias'],
      ['Compendium', 'Compendium'],
      ['Map view', 'Map view'],
      ['Settings', 'Settings'],
    ] as const) {
      await page.getByRole('dialog', { name: 'Notebook' }).getByRole('button', { name: row, exact: true }).click();
      // A page swaps in at once: the Notebook doesn't linger fading out (§19.2).
      expect(await page.locator('.sheet').count()).toBe(1);
      await expect(page.getByRole('dialog', { name: title })).toBeVisible();
      await expect(page.locator('[data-nav=notebook]')).toHaveClass(/is-selected/);
      await page.getByRole('button', { name: 'Back to Notebook' }).click();
      expect(await page.locator('.sheet').count()).toBe(1);
      await expect(page.getByRole('dialog', { name: 'Notebook' }).getByRole('button', { name: row, exact: true })).toBeFocused();
    }
    // Closing returns focus to the Notebook control.
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-nav=notebook]')).toBeFocused();
  });

  test('Map view zooms in √2 steps about the play band, stops at its limits, resets, and finds the Garden', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.centerOn(2160, 5280));
    await openTool(page, 'Map view');
    const sheet = page.getByRole('dialog', { name: 'Map view' });
    await expect(sheet).toContainText('Pinch the map with two fingers.');
    const level = sheet.locator('.mapview-level');
    await expect(level).toHaveText('Zoom 100%');
    const zin = sheet.getByRole('button', { name: 'Zoom in' });
    const out = sheet.getByRole('button', { name: 'Zoom out' });
    await zin.click();
    await expect(level).toHaveText('Zoom 141%');
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBeCloseTo(Math.SQRT2, 9);
    await zin.click();
    await expect(level).toHaveText('Zoom 200%');
    await expect(zin).toHaveAttribute('aria-disabled', 'true');
    await expect(zin).toHaveAttribute('aria-describedby', 'mapview-near');
    await zin.click({ force: true }); // a deliberate tap on the disabled control
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBeCloseTo(2, 9);
    await sheet.getByRole('button', { name: 'Reset · 100%' }).click();
    await expect(level).toHaveText('Zoom 100%');
    await out.click();
    await out.click();
    await expect(level).toHaveText('Zoom 50%');
    await expect(out).toHaveAttribute('aria-disabled', 'true');
    await expect(zin).toHaveAttribute('aria-disabled', 'false');
    // Find Garden keeps the zoom, brings the Garden (off screen at 100 % from here) into the
    // play band, and closes.
    await sheet.getByRole('button', { name: 'Reset · 100%' }).click();
    const garden = () => page.evaluate(() => window.__PK__!.worldToScreen(2160, 3750));
    const band = await page.evaluate(() => ({
      top: document.querySelector('.top-stack')!.getBoundingClientRect().bottom,
      bottom: document.querySelector('.tray')!.getBoundingClientRect().top,
    }));
    expect((await garden()).y).toBeLessThan(band.top);
    await sheet.getByRole('button', { name: 'Find Garden' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => window.__PK__!.zoom())).toBe(1);
    const at = await garden();
    expect(at.y).toBeGreaterThan(band.top);
    expect(at.y).toBeLessThan(band.bottom);
  });
});
