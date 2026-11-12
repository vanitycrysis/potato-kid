import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

test.describe('Nicknames on the map (D-091, GUI_MVP §27.7)', () => {
  /** Two kids mid-map, the first named `name`; returns their ids. */
  async function named(page: Page, name: string, gap = 400): Promise<[number, number]> {
    await boot(page, '?seed=3&debug=1&calm=1');
    const ids = await page.evaluate(([name, gap]) => {
      const pk = window.__PK__!;
      pk.debugGive!({ materials: 1000 });
      pk.centerOn(1256, 3300);
      const a = pk.debugAdd!('fire', 1256 - gap / 2, 3228);
      const b = pk.debugAdd!('snow', 1256 + gap / 2, 3228);
      pk.debugCommand!({ type: 'name', kidId: a, name });
      return [a, b] as [number, number];
    }, [name, gap] as const);
    await expect.poll(() => page.evaluate(() => window.__PK__!.nameplates().length)).toBe(1);
    return ids;
  }

  test('a named kid has its name in a pill under its feet; an unnamed kid has none', async ({ page }) => {
    const [a] = await named(page, 'Moss');
    const [pill] = await page.evaluate(() => window.__PK__!.nameplates());
    expect(pill!.id).toBe(a);
    expect(pill!.text).toBe('Moss');
    const feet = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, a);
    // Centred under the feet, 4 px below them at least, 26 px tall, no wider than 120 px.
    expect(pill!.left + pill!.width / 2).toBeCloseTo(feet.x, -0.5);
    expect(pill!.top).toBeGreaterThanOrEqual(feet.y + 4 - 0.5);
    expect(pill!.height).toBeCloseTo(26, 0);
    expect(pill!.width).toBeLessThanOrEqual(120);
    // Decorative: it takes no taps, so a tap on it reaches the map.
    const node = page.locator('.nameplate:not(.nameplate-probe)');
    await expect(node).toHaveCSS('pointer-events', 'none');
    await expect(page.locator('.nameplates')).toHaveAttribute('aria-hidden', 'true');
  });

  test('no pill covers a kid, named or not (Codex review, #114)', async ({ page }) => {
    const [a] = await named(page, 'Moss');
    // An unnamed kid just below the named one, where its pill would go.
    const below = await page.evaluate((a) => {
      const pk = window.__PK__!;
      const k = pk.kids().find((x) => x.id === a)!;
      return pk.debugAdd!('snow', k.x, k.y + 175);
    }, a);
    await page.waitForTimeout(400);
    const box = await page.evaluate((i) => {
      const pk = window.__PK__!;
      const k = pk.kids().find((x) => x.id === i)!;
      return { a: pk.worldToScreen(k.x + k.box.left, k.y + k.box.top), b: pk.worldToScreen(k.x + k.box.right, k.y + k.box.bottom) };
    }, below);
    for (const p of await page.evaluate(() => window.__PK__!.nameplates())) {
      const clear = p.left + p.width <= box.a.x || box.b.x <= p.left || p.top + p.height <= box.a.y || box.b.y <= p.top;
      expect(clear).toBe(true);
    }
  });

  test("a ready plot's sign is something no pill may cover (Codex review round 2, #114)", async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.centerOn(1440, 2400));
    // Nothing to avoid while no plot is ready.
    expect(await page.evaluate(() => window.__PK__!.nameExclusions())).toEqual([]);
    await page.evaluate(() => window.__PK__!.debugReadySeed!(0, 'hero', true));
    await expect.poll(() => page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('ready');
    // Plot 1's checked sign, where it is drawn (its paper centred about (1440, 2383) in the world).
    const [r] = await page.evaluate(() => window.__PK__!.nameExclusions());
    const c = await page.evaluate(() => window.__PK__!.worldToScreen(1440, 2383));
    expect(Math.abs((r!.left + r!.right) / 2 - c.x)).toBeLessThan(2);
    expect(Math.abs((r!.top + r!.bottom) / 2 - c.y)).toBeLessThan(2);
    // At least 96 CSS px of sign canvas across means a paper wider than 40 px.
    expect(r!.right - r!.left).toBeGreaterThan(40);
  });

  test('with enlarged text the pill grows taller, never clipped, still 120 px at most, and names are fitted again (Codex review round 3, #114)', async ({ page }) => {
    await named(page, 'Meadowsweetly');
    const before = (await page.evaluate(() => window.__PK__!.nameplates()))[0]!;
    expect(before.text).toBe('Meadowsweetly');
    expect(before.height).toBeCloseTo(26, 0);
    // The player's text size, enlarged one and a half times.
    await page.addStyleTag({ content: '.nameplate { font-size: 24px; }' });
    await expect.poll(async () => (await page.evaluate(() => window.__PK__!.nameplates()))[0]?.height ?? 0).toBeGreaterThan(34);
    // Fitted again at the new size, a frame later (its size is observed): now it needs an ellipsis.
    await expect.poll(async () => (await page.evaluate(() => window.__PK__!.nameplates()))[0]?.text ?? '').toMatch(/…$/);
    const after = (await page.evaluate(() => window.__PK__!.nameplates()))[0]!;
    expect(after.width).toBeLessThanOrEqual(120.5);
    // Nothing clipped inside.
    const clipped = await page.locator('.nameplate:not(.nameplate-probe)').evaluate((e) => e.scrollHeight > e.clientHeight + 1);
    expect(clipped).toBe(false);
  });

  test('while a kid is held over the Garden, its drop target and label are things no pill may cover (Codex review round 4, #114)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.centerOn(1536, 2488));
    const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 1216, 2728));
    await page.waitForTimeout(200);
    const k = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    const t = await page.evaluate(() => window.__PK__!.worldToScreen(1536, 2156));
    await page.mouse.move(k.x, k.y - 20);
    await page.mouse.down();
    await page.mouse.move(t.x, t.y, { steps: 6 });
    const label = page.locator('.home-label:not(.home-probe)');
    await expect(label).toBeVisible();
    const box = (await label.boundingBox())!;
    const ex = await page.evaluate(() => window.__PK__!.nameExclusions());
    expect(ex.some((r) => Math.abs(r.left - box.x) < 1 && Math.abs(r.top - box.y) < 1 && Math.abs(r.right - (box.x + box.width)) < 1)).toBe(true);
    await page.mouse.up();
    // Let go: nothing of the target is left to avoid.
    await expect.poll(() => page.evaluate(() => window.__PK__!.nameExclusions().length)).toBe(0);
  });

  test('a long name is cut at whole letters with an ellipsis, and the pill stays 120 px', async ({ page }) => {
    await named(page, 'Wwwwwwwwwwwwwwwwwwwwwwww');
    const [pill] = await page.evaluate(() => window.__PK__!.nameplates());
    expect(pill!.text.endsWith('…')).toBe(true);
    expect(pill!.text.length).toBeLessThan(24);
    expect(pill!.width).toBeLessThanOrEqual(120.5);
  });

  test('the Settings switch hides every pill at once and shows them again, and is kept', async ({ page }) => {
    await named(page, 'Moss');
    const openSettings = async () => {
      await page.locator('[data-nav=notebook]').click();
      await page.getByRole('dialog', { name: 'Notebook' }).getByRole('button', { name: 'Settings', exact: true }).click();
    };
    await openSettings();
    const toggle = page.getByRole('switch', { name: 'Show nicknames on the map' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect.poll(() => page.evaluate(() => window.__PK__!.nameplates().length)).toBe(0);
    // Kept across a reload; the card still names the kid.
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForFunction(() => window.__PK__?.ready === true);
    await page.evaluate(() => window.__PK__!.centerOn(1256, 3300));
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__PK__!.nameplates().length)).toBe(0);
    await openSettings();
    await page.getByRole('switch', { name: 'Show nicknames on the map' }).click();
    await expect.poll(() => page.evaluate(() => window.__PK__!.nameplates().length)).toBe(1);
  });

  test('pills never crowd: far apart both show; side by side only the frontmost', async ({ page }) => {
    const [, b] = await named(page, 'Meadowsweet', 400);
    await page.evaluate((b) => window.__PK__!.debugCommand!({ type: 'name', kidId: b, name: 'Bramblewood' }), b);
    await expect.poll(() => page.evaluate(() => window.__PK__!.nameplates().length)).toBe(2);
    // Two more, side by side, the second a little lower (in front).
    const [c, d] = await page.evaluate(() => {
      const pk = window.__PK__!;
      const c = pk.debugAdd!('fire', 1180, 3428);
      const d = pk.debugAdd!('snow', 1350, 3448);
      pk.debugCommand!({ type: 'name', kidId: c, name: 'Meadowsweet' });
      pk.debugCommand!({ type: 'name', kidId: d, name: 'Bramblewood' });
      return [c, d];
    });
    await page.waitForTimeout(500);
    const pills = await page.evaluate(() => window.__PK__!.nameplates());
    const ids = pills.map((p) => p.id);
    expect(ids).toContain(d);
    expect(ids).not.toContain(c);
    // No two pills overlap.
    for (const p of pills) for (const q of pills) if (p !== q) expect(p.left + p.width <= q.left || q.left + q.width <= p.left || p.top + p.height <= q.top || q.top + q.height <= p.top).toBe(true);
  });
});

test('reduced motion: a rare portrait\'s sleeve holds still (D-094, §27.7)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page, '?seed=3&debug=1&calm=1');
  const id = await page.evaluate(() => {
    const pk = window.__PK__!;
    const id = pk.debugAdd!('rainbow', 1076, 3048);
    pk.centerOn(1076, 2998);
    return id;
  });
  await page.waitForTimeout(300);
  const at = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
  await page.mouse.click(at.x, at.y - 20);
  const sleeve = page.getByRole('dialog', { name: 'Rainbow Kid' }).locator('.portrait-sleeve');
  await expect(sleeve).toHaveCount(1);
  await expect(sleeve).toHaveCSS('animation-name', 'none');
});

test("every discovered rare's portrait moves in its sleeve, in lists too; hidden, it pauses (D-094, §27.7; Codex review, #116)", async ({ page }) => {
  await boot(page, '?seed=3&debug=1&calm=1');
  await page.evaluate(() => {
    const pk = window.__PK__!;
    pk.debugAdd!('rainbow', 1076, 3048);
    pk.debugAdd!('gift', 1476, 3048);
  });
  await page.locator('[data-nav=dex]').click();
  await page.getByRole('button', { name: /^Kids on map \(\d+\)$/ }).click();
  const list = page.getByRole('dialog', { name: 'Kids on map' });
  const row = (type: string) => list.locator('.kids-row').filter({ has: page.locator(`[data-asset^="kid_body_wild${type}"]`) });
  // The rare's row has the sleeve, behind the words; the special's has none.
  await expect(row('rainbow').locator('.portrait-sleeve')).toHaveCount(1);
  await expect(row('rainbow').locator('.portrait-sleeve')).toHaveCSS('animation-name', 'portrait-sleeve');
  await expect(row('gift').locator('.portrait-sleeve')).toHaveCount(0);
  // The row keeps its height: a list's sleeve takes no room.
  const wrap = row('rainbow').locator('.portrait-wrap');
  await expect(wrap).toHaveCSS('margin-top', '0px');
  // The words paint above the sleeve where it reaches into them (Codex review round 4, #116):
  // moved over the name, made hit-testable, the sleeve is still under it.
  const top = await row('rainbow').evaluate((r) => {
    const sleeve = r.querySelector<HTMLElement>('.portrait-sleeve')!;
    const text = r.querySelector<HTMLElement>('.dex-home-row-text')!;
    const was = sleeve.getAttribute('style') ?? '';
    sleeve.style.animation = 'none';
    sleeve.querySelectorAll<HTMLElement>('*').forEach((e) => (e.style.pointerEvents = 'auto'));
    sleeve.style.pointerEvents = 'auto';
    const t = text.getBoundingClientRect();
    const art = sleeve.querySelector('img')!.getBoundingClientRect();
    const x = t.left + 6;
    const y = t.top + t.height / 2;
    sleeve.style.transform = `translate(${x - (art.left + art.width / 2)}px, ${y - (art.top + art.height / 2)}px)`;
    const hit = document.elementFromPoint(x, y);
    const under = document.elementsFromPoint(x, y).some((e) => sleeve.contains(e));
    sleeve.setAttribute('style', was);
    sleeve.querySelectorAll<HTMLElement>('*').forEach((e) => (e.style.pointerEvents = ''));
    return { text: !!hit && text.contains(hit), under };
  });
  expect(top).toEqual({ text: true, under: true });
  // The app hidden: paused where it is.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(row('rainbow').locator('.portrait-sleeve')).toHaveCSS('animation-play-state', 'paused');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(row('rainbow').locator('.portrait-sleeve')).toHaveCSS('animation-play-state', 'running');
});

test('a cached Dex tile put back is watched again; a list closed lets its sleeves go at once (Codex review round 5, #116)', async ({ page }) => {
  await boot(page, '?seed=3&debug=1&calm=1');
  await page.evaluate(() => window.__PK__!.debugAdd!('rainbow', 1076, 3048));
  await page.locator('[data-nav=dex]').click();
  const dex = page.getByRole('dialog', { name: 'Potato-Dex' });
  await dex.getByRole('button', { name: 'Rares', exact: true }).click();
  const sleeve = dex.locator('[data-kid="rainbow"] .portrait-sleeve');
  await expect(sleeve).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.__PK__!.watchedSleeves())).toBe(1);
  const cached = (await sleeve.elementHandle())!;
  // Another segment: the rare tile is off the page, and let go.
  await dex.getByRole('button', { name: 'Ordinary', exact: true }).click();
  await expect(sleeve).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__PK__!.watchedSleeves())).toBe(0);
  // Marked offscreen while away: only a fresh observation, back on screen, clears it.
  await cached.evaluate((e) => e.classList.add('is-offscreen'));
  // Back: the same cached tile, observed again, so it pauses when scrolled away.
  await dex.getByRole('button', { name: 'Rares', exact: true }).click();
  await expect(sleeve).toHaveCount(1);
  expect(await cached.evaluate((e) => e.isConnected)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__PK__!.watchedSleeves())).toBe(1);
  await expect(sleeve).not.toHaveClass(/is-offscreen/);
  // Closing the Dex, with nothing opened after: nothing stays watched.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__PK__!.watchedSleeves())).toBe(0);
});

test('opening and closing rare cards never piles up watched sleeves (Codex review round 3, #116)', async ({ page }) => {
  await boot(page, '?seed=3&debug=1&calm=1');
  const id = await page.evaluate(() => {
    const pk = window.__PK__!;
    const id = pk.debugAdd!('rainbow', 1076, 3048);
    pk.centerOn(1076, 2998);
    return id;
  });
  await page.waitForTimeout(300);
  for (let i = 0; i < 6; i++) {
    const at = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    await page.mouse.click(at.x, at.y - 20);
    await expect(page.getByRole('dialog', { name: 'Rainbow Kid' }).locator('.portrait-sleeve')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  // Only what is on screen now (nothing) stays watched, once a frame has passed.
  await page.waitForTimeout(100);
  const at = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
  await page.mouse.click(at.x, at.y - 20);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__PK__!.watchedSleeves())).toBe(1);
});
