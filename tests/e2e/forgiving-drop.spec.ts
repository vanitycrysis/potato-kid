import { expect, test, type Page } from '@playwright/test';
import { boot, frames } from './helpers';

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
      const water = pk.debugAdd!(centre, 996, 2828, look);
      const w = pk.kids().find((k) => k.id === water)!;
      const dx = w.box.right - w.box.left + 6;
      const dy = w.box.bottom - w.box.top + 6;
      const types = ['blizzard', 'kite', 'hero'];
      const ring: number[] = [];
      let i = 0;
      for (const sx of [-1, 0, 1])
        for (const sy of [-1, 0, 1]) if (sx || sy) ring.push(pk.debugAdd!(types[i++ % 3]!, w.x + sx * dx, w.y + sy * dy, look));
      const plain = pk.debugAdd!(held, 706, 3228, look);
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

  const recipe = (page: Page) => page.evaluate(() => window.__PK__!.recipe());
  const boxesMeet = (a: { left: number; top: number; right: number; bottom: number }, b: typeof a) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

  test('held over a partner: it floats over the kids, moving nobody; the partner is marked; the window shows the dark result (D-083)', async ({ page }) => {
    const { plain, water, ring } = await crowd(page);
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => window.__PK__!.kids().map((k) => [k.id, k.x, k.y]));
    await holdOver(page, plain, water);
    const r = await recipe(page);
    expect(r.mark).toBe(true);
    expect(r.view).toMatchObject({ result: 'firefighter', found: false, parents: [{ type: 'plain' }, { type: 'water' }] });
    // Floating, not snapped to a free spot: the held body, lifted above the finger, is drawn
    // over the kid above the partner (§25.1). A free-spot preview never overlaps anyone.
    const others = await page.evaluate(() =>
      window.__PK__!.kids()
        .filter((k) => !k.held)
        .map((k) => {
          const a = window.__PK__!.worldToScreen(k.x + k.box.left, k.y + k.box.top);
          const b = window.__PK__!.worldToScreen(k.x + k.box.right, k.y + k.box.bottom);
          return { left: a.x, top: a.y, right: b.x, bottom: b.y };
        }),
    );
    expect(others.some((o) => boxesMeet(r.view!.held, o))).toBe(true);
    // And nobody moved for it, in the sim or on screen.
    expect(await page.evaluate(() => window.__PK__!.kids().filter((k) => !k.held).map((k) => [k.id, k.x, k.y]))).toEqual(before.filter(([id]) => id !== plain));
    const win = page.locator('.recipe-window');
    await expect(win).toBeVisible();
    await expect(win.locator('.recipe-heading')).toHaveText('Release to fuse');
    await expect(win.locator('.recipe-name')).toHaveText('Not found yet');
    await expect(win.locator('.recipe-sprite')).toHaveCount(3);
    await expect(win.locator('.recipe-unfound')).toHaveCount(1);
    // The hidden result's name is nowhere: not shown, not announced (§25.2).
    const status = page.getByRole('status', { name: 'Fusion preview' });
    await expect(status).toHaveText("Potato Kid plus Water Kid makes a kid you haven't found. Release on the marked partner to fuse.");
    expect(await page.evaluate(() => document.body.innerHTML)).not.toContain('Firefighter');
    // Clear of the finger: the window never covers the pointer (§25.3).
    const box = (await win.boundingBox())!;
    const pointer = r.view!.pointer;
    const nx = Math.min(Math.max(pointer.x, box.x), box.x + box.width);
    const ny = Math.min(Math.max(pointer.y, box.y), box.y + box.height);
    expect(Math.hypot(nx - pointer.x, ny - pointer.y)).toBeGreaterThanOrEqual(48);
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.__PK__!.kids().map((k) => k.type)), { timeout: 3000 }).toContain('firefighter');
    await expect(win).toBeHidden();
    expect(await recipe(page)).toEqual({ view: null, mark: false });
    await expect(status).toHaveText('');
    for (const id of ring) expect(await ids(page)).toContain(id);
  });

  test('a panel taller with enlarged text is placed by its real height: no flicker with the rail (Codex review, #103)', async ({ page }) => {
    const { plain, water } = await crowd(page);
    // Enlarged text makes the panel taller than its 112 px minimum.
    await page.addStyleTag({ content: '.recipe-heading, .recipe-name { font-size: 48px !important; line-height: 56px !important; }' });
    await page.waitForTimeout(200);
    await holdOver(page, plain, water);
    // Sampled in the page, one state per frame: the panel or the rail, never alternating.
    const states = await page.evaluate(async () => {
      const out: string[] = [];
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const panel = document.querySelector<HTMLElement>('.recipe-window')!;
        const rail = document.querySelector<HTMLElement>('.recipe-rail')!;
        out.push(`${panel.hidden ? '-' : 'P'}${rail.hidden ? '-' : 'R'}`);
      }
      return out;
    });
    expect(new Set(states).size, states.join(' ')).toBe(1);
    expect(states[0]).not.toBe('--');
    // Wherever it is, the whole panel clears the finger.
    if (states[0] === 'P-') {
      const box = (await page.locator('.recipe-window').boundingBox())!;
      const pointer = (await recipe(page)).view!.pointer;
      const nx = Math.min(Math.max(pointer.x, box.x), box.x + box.width);
      const ny = Math.min(Math.max(pointer.y, box.y), box.y + box.height);
      expect(Math.hypot(nx - pointer.x, ny - pointer.y)).toBeGreaterThanOrEqual(48);
    }
    await page.mouse.up();
  });

  test('text enlarged while the same pair is held: the panel is measured again and still clears the finger (Codex review, #103)', async ({ page }) => {
    const { plain, water } = await crowd(page);
    await page.waitForTimeout(200);
    await holdOver(page, plain, water);
    await expect(page.locator('.recipe-window')).toBeVisible();
    await page.addStyleTag({ content: '.recipe-heading, .recipe-name { font-size: 48px !important; line-height: 56px !important; }' });
    await frames(page, 4);
    const pointer = (await recipe(page)).view!.pointer;
    const win = page.locator('.recipe-window');
    if (await win.isVisible()) {
      const box = (await win.boundingBox())!;
      const nx = Math.min(Math.max(pointer.x, box.x), box.x + box.width);
      const ny = Math.min(Math.max(pointer.y, box.y), box.y + box.height);
      expect(Math.hypot(nx - pointer.x, ny - pointer.y)).toBeGreaterThanOrEqual(48);
    } else await expect(page.locator('.recipe-rail')).toBeVisible();
    await page.mouse.up();
  });

  test('suspending clears the window, the mark and the announcement at once, before any frame (Codex review, #103)', async ({ page }) => {
    const { plain, water } = await crowd(page);
    await page.waitForTimeout(200);
    await holdOver(page, plain, water);
    await expect(page.locator('.recipe-window')).toBeVisible();
    // Read in the same task as the suspend: no frame has run since.
    const after = await page.evaluate(async () => {
      const pk = window.__PK__!;
      const done = pk.debugAway!(1000);
      const now = { hidden: document.querySelector<HTMLElement>('.recipe-window')!.hidden, status: document.querySelector('[aria-label="Fusion preview"]')!.textContent, recipe: pk.recipe() };
      await done;
      return now;
    });
    expect(after).toEqual({ hidden: true, status: '', recipe: { view: null, mark: false } });
    await page.mouse.up();
  });

  test('let go near the bottom edge over a crowd, the kid lands where it can be seen, never behind the tray (Codex review, #103)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page, '?seed=3&debug=1&calm=1');
    // World y of a screen y, from the origin (absolute).
    const worldY = (sy: number) => page.evaluate((sy) => {
      const pk = window.__PK__!;
      const y0 = pk.worldToScreen(0, 0).y;
      return (sy - y0) / ((pk.worldToScreen(0, 100).y - y0) / 100);
    }, sy);
    const trayTop = await page.locator('.tray').evaluate((e) => e.getBoundingClientRect().top);
    const bottom = await worldY(trayTop - 8);
    // A wall of kids filling the band's bottom, three rows deep, across the screen.
    const ids = await page.evaluate((bottom) => {
      const pk = window.__PK__!;
      const out: number[] = [];
      const look = { body: 'round', scale: 1 };
      const first = pk.debugAdd!('hero', 996, bottom - 20, look);
      const k = pk.kids().find((c) => c.id === first)!;
      const w = k.box.right - k.box.left + 2;
      const h = k.box.bottom - k.box.top + 2;
      out.push(first);
      for (let row = 0; row < 3; row++)
        for (let col = -5; col <= 5; col++) if (row || col) out.push(pk.debugAdd!('hero', 996 + col * w, bottom - k.box.bottom - 2 - row * h, look));
      return out;
    }, bottom);
    await page.waitForTimeout(200);
    const held = await page.evaluate(() => window.__PK__!.debugAdd!('kite', 996, 2548));
    await page.waitForTimeout(200);
    const from = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, held);
    await page.mouse.move(from.x, from.y - 20);
    await page.mouse.down();
    await page.mouse.move(195, trayTop - 30, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const kid = await page.evaluate((k) => window.__PK__!.kids().find((c) => c.id === k)!, held);
    const feet = await page.evaluate((k) => window.__PK__!.worldToScreen(k.x, k.y + k.box.bottom).y, kid);
    const trayNow = await page.locator('.tray').evaluate((e) => e.getBoundingClientRect().top);
    expect(feet).toBeLessThanOrEqual(trayNow + 1);
    expect(ids.length).toBe(33);
  });

  test('let go with no free place in sight and no partner, the kid goes back where it came from (Codex review, #103)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page, '?seed=3&debug=1&calm=1');
    // An open stretch of map, with free ground above the band (the pinch tests' anchor).
    await page.evaluate(() => window.__PK__!.centerOn(1536, 3928));
    // Zoomed in, the visible band is small enough to fill.
    await page.evaluate(() => {
      const c = document.querySelector('canvas')!;
      const r = c.getBoundingClientRect();
      c.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, deltaMode: 2, clientX: r.width / 2, clientY: r.height / 2, bubbles: true, cancelable: true }));
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.zoom())).toBe(2);
    // The band filled with heroes, top row flush with the HUD (nothing above it), bottom row
    // half behind the tray. The held kid is one of that bottom row: its own spot is out of sight.
    const { held, rows } = await page.evaluate(() => {
      const pk = window.__PK__!;
      const look = { body: 'round', scale: 1 };
      const trayTop = document.querySelector('.tray')!.getBoundingClientRect().top;
      const hudBottom = document.querySelector('.top-stack')!.getBoundingClientRect().bottom;
      const o = pk.worldToScreen(0, 0);
      const per = (pk.worldToScreen(100, 0).x - o.x) / 100;
      const wx = (sx: number) => (sx - o.x) / per;
      const wy = (sy: number) => (sy - o.y) / per;
      const probe = pk.debugAdd!('hero', wx(195), wy(400), look);
      const k = pk.kids().find((c) => c.id === probe)!;
      const w = k.box.right - k.box.left + 1;
      const h = k.box.bottom - k.box.top + 1;
      const rows: number[][] = [];
      for (let y = wy(hudBottom) - k.box.top; y - h / 2 + k.box.top < wy(trayTop); y += h) {
        const row: number[] = [];
        for (let x = wx(0) - k.box.left - w; x < wx(390) + w; x += w) {
          row.push(pk.debugAdd!('hero', x, y, look));
        }
        rows.push(row);
      }
      const last = rows[rows.length - 1]!;
      return { held: last[Math.floor(last.length / 2)]!, rows: rows.length };
    });
    expect(rows).toBeGreaterThan(3);
    await page.waitForTimeout(300);
    const start = await page.evaluate((i) => window.__PK__!.kids().find((k) => k.id === i)!, held);
    const from = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, held);
    const trayTop = await page.locator('.tray').evaluate((e) => e.getBoundingClientRect().top);
    // Grab it by its visible top, carry it to just under the HUD, let go over a hero there.
    await page.mouse.move(from.x, Math.min(from.y, trayTop) - 20);
    await page.mouse.down();
    await page.mouse.move(195, 200, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const end = await page.evaluate((i) => window.__PK__!.kids().find((k) => k.id === i)!, held);
    // Back where it came from (hero + hero is no recipe), not above the HUD out of sight.
    expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeLessThan(1);
  });

  test('a found result shows its name, in the window and the announcement (D-083)', async ({ page }) => {
    const { plain, water } = await crowd(page);
    await page.waitForTimeout(200);
    await holdOver(page, plain, water);
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.__PK__!.kids().map((k) => k.type)), { timeout: 3000 }).toContain('firefighter');
    // Another pair, now that Firefighter Kid is found.
    // On the open stretch the pinch tests use, in view.
    const again = await page.evaluate(() => {
      const pk = window.__PK__!;
      pk.centerOn(1536, 3928);
      return { plain: pk.debugAdd!('plain', 1386, 3928), water: pk.debugAdd!('water', 1686, 3928) };
    });
    await page.waitForTimeout(200);
    await holdOver(page, again.plain, again.water);
    expect((await recipe(page)).view).toMatchObject({ result: 'firefighter', found: true });
    const win = page.locator('.recipe-window');
    await expect(win.locator('.recipe-name')).toHaveText('Firefighter Kid');
    await expect(win.locator('.recipe-unfound')).toHaveCount(0);
    await expect(page.getByRole('status', { name: 'Fusion preview' })).toHaveText('Potato Kid plus Water Kid makes Firefighter Kid. Release on the marked partner to fuse.');
    await page.mouse.up();
  });

  test('held over a kid it can\'t fuse with: no mark and no window, though it is the drop target (D-083)', async ({ page }) => {
    const { plain, ring } = await crowd(page);
    await page.waitForTimeout(200);
    const right = ring[6]!;
    await holdOver(page, plain, right);
    expect(await page.evaluate(() => window.__PK__!.dropTarget())).toBe(right);
    expect(await recipe(page)).toEqual({ view: null, mark: false });
    await expect(page.locator('.recipe-window')).toBeHidden();
    await expect(page.locator('.recipe-rail')).toBeHidden();
    await page.mouse.up();
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
