import { expect, test, type Locator } from '@playwright/test';
import { boot, openTool, frames } from './helpers';

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

  test('a Spawn now refusal that arrives as the Garden closes is shown on the map (Codex review round 3, PR #87)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.locator('[data-nav=garden]').click();
    // In one task: a valid tap, the sheet closes (it fades out, still in the DOM), then the
    // Potatokens vanish before the engine answers.
    await page.evaluate(() => {
      (document.querySelector('.arrivals-spawn') as HTMLButtonElement).click();
      (document.querySelector('.sheet[role=dialog] .sheet-close') as HTMLButtonElement).click();
      window.__PK__!.debugGive!({ potatokens: -window.__PK__!.wallet().potatokens });
    });
    await expect(page.locator('.feedback')).toContainText('Not enough');
  });

  test('the Arrivals status changes only when its message does (Codex review round 3, PR #87)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugGive!({ potatokens: -window.__PK__!.wallet().potatokens }));
    await page.locator('[data-nav=garden]').click();
    await expect(page.locator('.arrivals-reason')).toContainText('Not enough Potatokens');
    // Thirty frames with the same message: the live region is not touched once.
    const mutations = await page.evaluate(async () => {
      let n = 0;
      const obs = new MutationObserver((list) => (n += list.length));
      obs.observe(document.querySelector('.arrivals-reason')!, { childList: true, characterData: true, subtree: true });
      for (let i = 0; i < 30; i++) await new Promise((r) => requestAnimationFrame(() => r(null)));
      obs.disconnect();
      return n;
    });
    expect(mutations).toBe(0);
  });

  test('a short screen: a new Spawn now refusal is brought into view (Codex review round 3, PR #87)', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 320 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false }));
    await page.locator('[data-nav=garden]').click();
    // Scroll so Spawn now sits at the bottom of what scrolls, its status below, out of view.
    await page.evaluate(() => {
      const button = document.querySelector('.arrivals-spawn') as HTMLElement;
      button.scrollIntoView({ block: 'end' });
    });
    await expect(page.locator('.arrivals-spawn')).toBeInViewport({ ratio: 1 });
    await page.evaluate(() => {
      (document.querySelector('.arrivals-spawn') as HTMLButtonElement).click();
      window.__PK__!.debugGive!({ potatokens: -window.__PK__!.wallet().potatokens });
    });
    await frames(page, 5);
    await expect(page.locator('.arrivals-reason')).toBeInViewport();
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
      // At 200 %, the same rule: the whole frame if it fits (the icon HUD's taller band fits it
      // on a 390 x 844 phone, §23.1), else the building's top at the band's top.
      await page.evaluate(() => window.__PK__!.centerOn(99999, 99999));
      await openTool(page, 'Map view');
      const sheet = page.getByRole('dialog', { name: 'Map view' });
      await sheet.getByRole('button', { name: 'Zoom in' }).click();
      await sheet.getByRole('button', { name: 'Zoom in' }).click();
      await sheet.getByRole('button', { name: 'Find Garden' }).click();
      const top = await y(frame.top);
      expect(top).toBeGreaterThanOrEqual(band.top - 0.5);
      if ((await y(frame.bottom)) - top <= band.bottom - band.top) {
        expect(await y(frame.bottom)).toBeLessThanOrEqual(band.bottom + 0.5);
        // Centred in the band.
        expect(Math.abs((top + (await y(frame.bottom))) / 2 - (band.top + band.bottom) / 2)).toBeLessThan(1);
      } else expect(top).toBeLessThan(band.top + 2);
    });
  }

  test('three stat chips name themselves on a tap: name, full value and use; a full map keeps the kids glyph (D-077)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugGive!({ materials: 12345 }));
    const pop = page.locator('.hud-population');
    const n = await page.evaluate(() => window.__PK__!.kids().length);
    await expect(pop).toHaveAttribute('aria-label', `Kids on map: ${n} of 12. About map space`);
    await expect(page.locator('.hud-materials')).toHaveAttribute('aria-label', /^Materials: 12,345. About Materials$/);
    const bubble = page.locator('#name-bubble');
    await page.locator('.hud-materials').click();
    await expect(bubble).toBeVisible();
    await expect(bubble.locator('.name-bubble-title')).toHaveText('Materials');
    await expect(bubble.locator('.name-bubble-value')).toHaveText('12,345 Materials');
    await expect(bubble.locator('.name-bubble-line')).toHaveText(['Kids on the map earn these. Spend them on buildings, plots, fields, names or Compendium returns.']);
    await expect(page.locator('.hud-materials')).toHaveAttribute('aria-expanded', 'true');
    // Only one bubble: another stat replaces it.
    await page.locator('.hud-potatokens').click();
    await expect(bubble.locator('.name-bubble-title')).toHaveText('Potatokens');
    await expect(page.locator('.hud-materials')).toHaveAttribute('aria-expanded', 'false');
    // The same stat again closes it.
    await page.locator('.hud-potatokens').click();
    await expect(bubble).toBeHidden();
    // A full map: the kids glyph stays; the bubble says so.
    await page.evaluate((n) => {
      for (let i = n; i < 12; i++) window.__PK__!.debugAdd!('plain', 656 + (i % 6) * 280, 3228 + Math.floor(i / 6) * 300);
    }, n);
    await expect(pop).toHaveAttribute('aria-label', 'Kids on map: 12 of 12. About map space');
    await expect(pop.locator('img')).toHaveAttribute('src', /icon%20kids/);
    await expect(pop).toContainText('12/12');
    await pop.click();
    await expect(bubble.locator('.name-bubble-value')).toHaveText('12 / 12 on the map');
    await expect(bubble.locator('.name-bubble-line')).toHaveText(['Plot kids and farming kids are counted in their own pages. Capacity upgrades add map space.', 'The map is full. Make room for another kid.']);
  });

  test('a name bubble closes on Escape (focus back on its stat), on Close, on a world tap that does nothing else, and when a sheet opens (D-077)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    const bubble = page.locator('#name-bubble');
    const chip = page.locator('.hud-materials');
    await chip.focus();
    await page.keyboard.press('Enter');
    await expect(bubble).toBeVisible();
    await expect(chip).toBeFocused();
    // From inside the bubble too, Escape returns focus to its stat.
    await bubble.getByRole('button', { name: 'Close' }).focus();
    await page.keyboard.press('Escape');
    await expect(bubble).toBeHidden();
    await expect(chip).toBeFocused();
    // Close.
    await chip.click();
    await bubble.getByRole('button', { name: 'Close' }).click();
    await expect(bubble).toBeHidden();
    // A tap on the world closes it and neither picks up a kid nor pans.
    const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 996, 2828));
    await page.waitForTimeout(150);
    await chip.click();
    const at = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
    const before = await page.evaluate(() => window.__PK__!.worldToScreen(996, 2828));
    await page.mouse.move(at.x, at.y - 20);
    await page.mouse.down();
    await page.mouse.move(at.x + 120, at.y - 20, { steps: 6 });
    await expect(bubble).toBeHidden();
    expect(await page.evaluate((k) => window.__PK__!.kids().find((c) => c.id === k)!.held, id)).toBe(false);
    await page.mouse.up();
    expect(await page.evaluate(() => window.__PK__!.worldToScreen(996, 2828))).toEqual(before);
    // A sheet opening closes it (opened from the keyboard: no tap outside to close it first).
    await chip.click();
    await expect(bubble).toBeVisible();
    await page.locator('[data-nav=garden]').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Garden' })).toBeVisible();
    await expect(bubble).toBeHidden();
  });

  test('a bubble that cannot fit below the HUD opens as a help sheet instead (Codex review, #105)', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 230 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.locator('.hud-materials').click();
    const help = page.getByRole('dialog', { name: 'Materials' });
    await expect(help).toBeVisible();
    await expect(help).toContainText('Kids on the map earn these.');
    await expect(page.locator('#name-bubble')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(help).toBeHidden();
    await expect(page.locator('.hud-materials')).toBeFocused();
  });

  test('enlarged text stacks a chip’s glyph over its count, keeping three equal chips in one row (Codex review, #105)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugGive!({ materials: 123456789 }));
    await page.addStyleTag({ content: '.hud { font-size: 30px !important; line-height: 34px !important; }' });
    await frames(page, 3);
    const chips = await page.locator('.hud-stat').evaluateAll((cs) => cs.map((c) => c.getBoundingClientRect()).map((r) => ({ top: r.top, width: r.width, height: r.height })));
    expect(new Set(chips.map((c) => Math.round(c.top))).size).toBe(1);
    expect(Math.max(...chips.map((c) => c.width)) - Math.min(...chips.map((c) => c.width))).toBeLessThan(1);
    expect(Math.max(...chips.map((c) => c.height))).toBeGreaterThan(44);
  });

  test('a delayed hide from one held icon never hides the next icon’s name (Codex review, #105)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page, '?seed=3&debug=1&calm=1');
    const touch = (key: string, type: string) =>
      page.locator(`[data-nav=${key}]`).evaluate((b, type) => {
        const r = b.getBoundingClientRect();
        b.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: r.left + 22, clientY: r.top + 22, bubbles: true }));
      }, type);
    await touch('garden', 'pointerdown');
    await page.waitForTimeout(550);
    await touch('garden', 'pointerup');
    // Within the first name's 900 ms delayed hide, hold the next icon past 450 ms.
    await touch('notebook', 'pointerdown');
    await page.waitForTimeout(1200);
    const tip = page.locator('.name-tip');
    await expect(tip).toBeVisible();
    await expect(tip).toHaveText('Notebook');
    await touch('notebook', 'pointerup');
  });

  test('a cancelled hold leaves nothing armed: the next keyboard activation opens (Codex review round 2, #105)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page, '?seed=3&debug=1&calm=1');
    const dex = page.locator('[data-nav=dex]');
    const touch = (type: string) =>
      dex.evaluate((b, type) => {
        const r = b.getBoundingClientRect();
        b.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: r.left + 22, clientY: r.top + 22, bubbles: true }));
      }, type);
    await touch('pointerdown');
    await page.waitForTimeout(600);
    await expect(page.locator('.name-tip')).toHaveText('Potato-Dex');
    await touch('pointercancel');
    await dex.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Potato-Dex' })).toBeVisible();
  });

  test('too narrow for the tray or three chips: the labelled scroll windows, every control reachable (Codex review round 2, #105)', async ({ page }) => {
    await page.setViewportSize({ width: 160, height: 700 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.hudFit)).toBe('window');
    // The tray is full width with its labels, and scrolls from its first control.
    const tray = page.locator('.tray');
    await tray.evaluate((e) => (e.scrollTop = 0));
    const first = await page.locator('[data-nav=garden]').evaluate((b) => b.getBoundingClientRect().top - b.closest('.tray')!.getBoundingClientRect().top);
    expect(first).toBeGreaterThanOrEqual(0);
    for (const key of ['garden', 'dex', 'notebook']) {
      await page.locator(`[data-nav=${key}]`).scrollIntoViewIfNeeded();
      await expect(page.locator(`[data-nav=${key}]`)).toBeInViewport({ ratio: 1 });
      expect((await page.locator(`[data-nav=${key}]`).boundingBox())!.width).toBeGreaterThanOrEqual(44);
    }
    for (const chip of await page.locator('.hud-stat').all()) expect((await chip.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  });

  /** A quick touch tap, sent in one page task: CI can stretch separate calls past the 450 ms hold. */
  const quickTap = (target: Locator) =>
    target.evaluate((b) => {
      const r = b.getBoundingClientRect();
      const init = { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: r.left + 22, clientY: r.top + 22, bubbles: true };
      b.dispatchEvent(new PointerEvent('pointerdown', init));
      b.dispatchEvent(new PointerEvent('pointerup', init));
      b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    });

  test('a touch that moves off before it is named neither names nor activates on release (Codex review round 3, #105)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page, '?seed=3&debug=1&calm=1');
    const dex = page.locator('[data-nav=dex]');
    const touch = (type: string, dx = 0) =>
      dex.evaluate((b, [type, dx]) => {
        const r = b.getBoundingClientRect();
        if (type === 'click') b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
        else b.dispatchEvent(new PointerEvent(type as string, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: r.left + 12 + (dx as number), clientY: r.top + 22, bubbles: true }));
      }, [type, dx] as const);
    await touch('pointerdown');
    await touch('pointermove', 12); // still inside the 44 px control
    await page.waitForTimeout(600);
    await expect(page.locator('.name-tip')).toBeHidden();
    await touch('pointerup', 12);
    await touch('click');
    await page.waitForTimeout(200);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // The next ordinary tap opens.
    await quickTap(dex);
    await expect(page.getByRole('dialog', { name: 'Potato-Dex' })).toBeVisible();
  });

  test('a stat help sheet keeps its value current, and comes back after the return summary (Codex review round 3, #105)', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 230 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.locator('.hud-materials').click();
    const help = page.getByRole('dialog', { name: 'Materials' });
    await expect(help).toBeVisible();
    await page.evaluate(() => window.__PK__!.debugGive!({ materials: 4321 }));
    await expect(help.locator('.sheet-subtitle')).toHaveText(/^4,3\d\d Materials$/);
    await page.evaluate(() => window.__PK__!.debugAway!(120_000));
    await page.getByRole('dialog', { name: 'Welcome back' }).getByRole('button', { name: 'Back to the garden' }).click();
    await expect(page.getByRole('dialog', { name: 'Materials' })).toBeVisible();
  });

  test('a leave after a held release still swallows its click; a move then cancel leaves keyboard activation working (Codex review round 4, #105)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page, '?seed=3&debug=1&calm=1');
    const dex = page.locator('[data-nav=dex]');
    const send = (type: string, dx = 0) =>
      dex.evaluate((b, [type, dx]) => {
        const r = b.getBoundingClientRect();
        if (type === 'click') b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
        else b.dispatchEvent(new PointerEvent(type as string, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: r.left + 12 + (dx as number), clientY: r.top + 22, bubbles: true }));
      }, [type, dx] as const);
    // Hold, release, then the browser's pointerleave before its click: still only named.
    await send('pointerdown');
    await page.waitForTimeout(600);
    await expect(page.locator('.name-tip')).toHaveText('Potato-Dex');
    await send('pointerup');
    await send('pointerleave');
    await send('click');
    await page.waitForTimeout(200);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Move off, then the gesture is cancelled: a keyboard Enter afterwards opens.
    await send('pointerdown');
    await send('pointermove', 12);
    await send('pointercancel', 12);
    await dex.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Potato-Dex' })).toBeVisible();
  });

  test('a count too wide for its chip even stacked takes the full-width scroll windows (Codex review round 5, #105)', async ({ page }) => {
    await page.setViewportSize({ width: 300, height: 900 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.addStyleTag({ content: '.hud { font-size: 32px !important; line-height: 38px !important; }' });
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.hudFit)).toBe('usual');
    // The amount grows during play: the layout follows it, with no resize at all.
    await page.evaluate(() => window.__PK__!.debugGive!({ materials: 123_400_000 }));
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.hudFit)).toBe('window');
    // Every count fits its chip there.
    for (const chip of await page.locator('.hud-stat').all()) expect(await chip.evaluate((c) => c.scrollWidth <= c.clientWidth + 1)).toBe(true);
  });

  test('page mode stacks the chips full width; a long balance wraps inside its bubble (Codex review round 6, #105)', async ({ page }) => {
    await page.setViewportSize({ width: 160, height: 150 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.hudFit)).toBe('page');
    for (const chip of await page.locator('.hud-stat').all()) expect((await chip.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    // A narrow window with room below the HUD: the bubble opens, and its value wraps clear of Close.
    await page.setViewportSize({ width: 160, height: 900 });
    await page.evaluate(() => window.__PK__!.debugGive!({ materials: 123_456_789_012_345 }));
    await page.locator('.hud-materials').click();
    const bubble = page.locator('#name-bubble');
    if (await bubble.isVisible()) {
      const value = (await bubble.locator('.name-bubble-value').boundingBox())!;
      const close = (await bubble.getByRole('button', { name: 'Close' }).boundingBox())!;
      expect(await bubble.locator('.name-bubble-value').evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
      expect(value.x + value.width).toBeLessThanOrEqual(close.x + 1);
    } else await expect(page.getByRole('dialog', { name: 'Materials' })).toBeVisible();
  });

  test('the fallback help sheet wraps a long balance inside its header (Codex review round 7, #105)', async ({ page }) => {
    await page.setViewportSize({ width: 160, height: 300 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugGive!({ materials: 123_456_789_012_345 }));
    await page.locator('.hud-materials').click();
    const help = page.getByRole('dialog', { name: 'Materials' });
    await expect(help).toBeVisible();
    const subtitle = help.locator('.sheet-subtitle');
    await expect(subtitle).toHaveText(/^123,456,789,012,3\d\d Materials$/);
    expect(await subtitle.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    const sheet = (await help.boundingBox())!;
    const box = (await subtitle.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(sheet.x + sheet.width + 1);
  });

  test('tiny screens: a help sheet whose header fills it still shows its explanation; the Icon guide never scrolls sideways; a shown name follows a resize (Codex review round 8, #105)', async ({ page }) => {
    await page.setViewportSize({ width: 160, height: 200 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugGive!({ materials: 123_456_789_012_345 }));
    await page.locator('.hud-materials').click();
    const help = page.getByRole('dialog', { name: 'Materials' });
    const line = help.getByText('Kids on the map earn these.', { exact: false });
    await line.scrollIntoViewIfNeeded();
    // All of it, inside the sheet, not spilling past it.
    await expect(line).toBeInViewport({ ratio: 1 });
    const sheetBox = (await help.boundingBox())!;
    const lineBox = (await line.boundingBox())!;
    expect(lineBox.y + lineBox.height).toBeLessThanOrEqual(sheetBox.y + sheetBox.height + 1);
    expect(lineBox.y).toBeGreaterThanOrEqual(sheetBox.y - 1);
    // Not covered by a pinned header: it is what a tap at its centre reaches.
    expect(await line.evaluate((e) => {
      const r = e.getBoundingClientRect();
      return e.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
    })).toBe(true);
    await page.keyboard.press('Escape');
    // The Icon guide at 160 px: no sideways scrolling.
    await page.setViewportSize({ width: 160, height: 700 });
    await page.locator('[data-nav=notebook]').click();
    await page.getByRole('dialog', { name: 'Notebook' }).getByRole('button', { name: 'Icon guide', exact: true }).click();
    const guide = page.getByRole('dialog', { name: 'Icon guide' });
    await expect(guide).toBeVisible();
    expect(await guide.evaluate((e) => [...e.querySelectorAll('.icon-guide-row')].every((r) => r.scrollWidth <= r.clientWidth + 1))).toBe(true);
    expect(await guide.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    // A keyboard-focused tray control's name, then a resize: it stays above the tray, in view.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press('Tab');
    await page.locator('[data-nav=dex]').focus();
    const tip = page.locator('.name-tip');
    await expect(tip).toHaveText('Potato-Dex');
    await page.setViewportSize({ width: 640, height: 360 });
    await page.waitForTimeout(200);
    const tray = (await page.locator('.tray').boundingBox())!;
    const box = (await tip.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(tray.y + 1);
    expect(box.y).toBeGreaterThanOrEqual(0);
  });

  test('feedback waits, out of sight, while a name bubble is open (§23.2)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.locator('.hud-materials').click();
    await expect(page.locator('#name-bubble')).toBeVisible();
    await page.evaluate(() => window.__PK__!.debugCommand!({ type: 'upgrade', building: 'garden' })); // no Materials
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(150);
      // Not shown and not playing out unseen: no card is mounted until the bubble closes.
      expect(await page.locator('.feedback').textContent()).toBe('');
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('.feedback')).toContainText('Not enough');
  });

  test('the tray is three named icons: a tap opens, a 450 ms hold only names it (D-077)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page, '?seed=3&debug=1&calm=1');
    for (const [key, name] of [['garden', 'Garden'], ['dex', 'Potato-Dex'], ['notebook', 'Notebook']] as const) {
      await expect(page.locator(`[data-nav=${key}]`)).toHaveAttribute('aria-label', name);
      const box = (await page.locator(`[data-nav=${key}]`).boundingBox())!;
      expect([Math.round(box.width), Math.round(box.height)]).toEqual([44, 44]);
    }
    const tray = (await page.locator('.tray').boundingBox())!;
    expect([Math.round(tray.width), Math.round(tray.height)]).toEqual([156, 52]);
    expect(Math.round(tray.x + tray.width / 2)).toBe(195);
    // A touch hold names Potato-Dex, above the tray, and its release opens nothing.
    const dex = page.locator('[data-nav=dex]');
    const touch = (type: string) =>
      dex.evaluate((b, type) => {
        const r = b.getBoundingClientRect();
        const init = { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: r.left + 22, clientY: r.top + 22, bubbles: true };
        if (type === 'click') b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
        else b.dispatchEvent(new PointerEvent(type, init));
      }, type);
    await touch('pointerdown');
    await page.waitForTimeout(600);
    const tip = page.locator('.name-tip');
    await expect(tip).toBeVisible();
    await expect(tip).toHaveText('Potato-Dex');
    expect((await tip.boundingBox())!.y + (await tip.boundingBox())!.height).toBeLessThanOrEqual(tray.y);
    await touch('pointerup');
    await touch('click');
    await page.waitForTimeout(200);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // A quick tap (no hold) is no naming: its click opens.
    await quickTap(dex);
    await expect(page.getByRole('dialog', { name: 'Potato-Dex' })).toBeVisible();
    await page.keyboard.press('Escape');
    // An ordinary tap opens it.
    await page.locator('[data-nav=dex]').click();
    await expect(page.getByRole('dialog', { name: 'Potato-Dex' })).toBeVisible();
  });

  test('the bubble\'s Close names itself: a hold shows Close and keeps the bubble; a tap closes (Codex review round 10, #105)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.locator('.hud-materials').click();
    const bubble = page.locator('.name-bubble');
    await expect(bubble).toBeVisible();
    const close = bubble.getByRole('button', { name: 'Close' });
    const touch = (type: string) =>
      close.evaluate((b, type) => {
        const r = b.getBoundingClientRect();
        const init = { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: r.left + 22, clientY: r.top + 22, bubbles: true };
        if (type === 'click') b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
        else b.dispatchEvent(new PointerEvent(type, init));
      }, type);
    await touch('pointerdown');
    await page.waitForTimeout(600);
    const tip = page.locator('.name-tip');
    await expect(tip).toBeVisible();
    await expect(tip).toHaveText('Close');
    // In the screen, just below the control.
    const t = (await tip.boundingBox())!;
    const c = (await close.boundingBox())!;
    expect(t.y).toBeGreaterThanOrEqual(c.y + c.height);
    expect(t.x).toBeGreaterThanOrEqual(8 - 0.5);
    expect(t.x + t.width).toBeLessThanOrEqual(390 - 8 + 0.5);
    await touch('pointerup');
    await touch('click');
    await page.waitForTimeout(200);
    await expect(bubble).toBeVisible();
    // A quick tap closes the bubble, and its name goes with it.
    await quickTap(close);
    await expect(bubble).toBeHidden();
    await expect(tip).toBeHidden();
    // Keyboard focus names it at once; a tap outside closes the bubble and its name with it.
    await page.locator('.hud-materials').click();
    await expect(bubble).toBeVisible();
    await page.keyboard.press('Shift');
    await close.focus();
    await expect(tip).toBeVisible();
    await expect(tip).toHaveText('Close');
    await page.locator('canvas').evaluate((c) => {
      const r = c.getBoundingClientRect();
      const init = { pointerId: 9, pointerType: 'touch', isPrimary: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true };
      c.dispatchEvent(new PointerEvent('pointerdown', init));
      c.dispatchEvent(new PointerEvent('pointerup', init));
    });
    await expect(bubble).toBeHidden();
    await expect(tip).toBeHidden();
  });

  test('uneven side insets: the centred tray stays inside the safe area (Codex review round 9, #105)', async ({ page }) => {
    await page.setViewportSize({ width: 240, height: 700 });
    await boot(page, '?seed=3&debug=1&calm=1');
    // Stand in a 64 px left and 8 px right inset: 168 px of safe width, room for the 156 px tray.
    await page.addStyleTag({ content: ':root { --ui-ml: 64px !important; --ui-mr: 8px !important; }' });
    await page.setViewportSize({ width: 241, height: 700 });
    await page.setViewportSize({ width: 240, height: 700 });
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.hudFit)).toBe('usual');
    const tray = (await page.locator('.tray').boundingBox())!;
    expect(Math.round(tray.width)).toBe(156);
    expect(tray.x).toBeGreaterThanOrEqual(64 - 0.5);
    expect(tray.x + tray.width).toBeLessThanOrEqual(240 - 8 + 0.5);
    const garden = (await page.locator('[data-nav=garden]').boundingBox())!;
    expect(garden.x).toBeGreaterThanOrEqual(64 - 0.5);
  });

  test('390 x 844: the world band is 684 px tall, 81 % of the screen (§23.1)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page, '?seed=3&debug=1&calm=1');
    const hud = (await page.locator('.hud').boundingBox())!;
    const tray = (await page.locator('.tray').boundingBox())!;
    expect(Math.round(hud.height)).toBe(44);
    const band = tray.y - 8 - (hud.y + hud.height + 8);
    expect(Math.round(band)).toBe(684);
  });

  test('the Notebook has an Icon guide naming every HUD and tray icon (§23.3)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.locator('[data-nav=notebook]').click();
    const rows = await page.getByRole('dialog', { name: 'Notebook' }).locator('.notebook-row').allTextContents();
    expect(rows).toEqual(['Pantry', 'Capacity', 'Spawn bias', 'Compendium', 'Map view', 'Icon guide', 'Settings']);
    await page.getByRole('dialog', { name: 'Notebook' }).getByRole('button', { name: 'Icon guide', exact: true }).click();
    const guide = page.getByRole('dialog', { name: 'Icon guide' });
    await expect(guide.locator('.icon-guide-title')).toHaveText(['Materials', 'Potatokens', 'Kids on map', 'Garden', 'Potato-Dex', 'Notebook']);
    await expect(guide.locator('.icon-guide-line').nth(3)).toHaveText('Arrivals, planting plots, food fields and spawn-rate upgrades.');
    await page.getByRole('button', { name: 'Back to Notebook' }).click();
    await expect(page.getByRole('dialog', { name: 'Notebook' }).getByRole('button', { name: 'Icon guide', exact: true })).toBeFocused();
  });

  test('the Garden opens on Arrivals, then Plots, then Spawn rate', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.locator('[data-nav=garden]').click();
    const order = await page.evaluate(() =>
      [...document.querySelectorAll('.sheet[role=dialog] .sheet-body > *')].map((e) => e.className.split(' ')[0]).filter((c) => c !== 'garden-plot-helpers'),
    );
    expect(order.indexOf('garden-arrivals')).toBeLessThan(order.indexOf('garden-plots'));
    expect(order.indexOf('garden-plots')).toBeLessThan(order.indexOf('garden-rate'));
    await expect(page.getByRole('navigation', { name: 'Garden sections' }).getByRole('button')).toHaveText(['Arrivals', 'Plots', 'Fields', 'Spawn rate']);
    await expect(page.locator('[data-nav=garden]')).toHaveClass(/is-selected/);
  });

  test('a Notebook tool replaces the Notebook in place; Back to Notebook returns with its row focused', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.locator('[data-nav=notebook]').click();
    const nb = page.getByRole('dialog', { name: 'Notebook' });
    await expect(nb).toContainText('Tools for your garden.');
    await expect(nb.locator('.notebook-row')).toHaveText(['Pantry', 'Capacity', 'Spawn bias', 'Compendium', 'Map view', 'Icon guide', 'Settings']);
    for (const [row, title] of [
      ['Pantry', 'Pantry'],
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
    await page.evaluate(() => window.__PK__!.centerOn(1536, 4128));
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
    const garden = () => page.evaluate(() => window.__PK__!.worldToScreen(1536, 2598));
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
