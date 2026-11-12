import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

test.describe('The kid card: feeding and naming (D-056, D-057, GUI_MVP §17-18)', () => {
  const card = (page: Page) => page.getByRole('dialog');
  const personality = JSON.parse(readFileSync('assets/data/personality_v1.json', 'utf8')).types as Record<string, { description: string; favouriteFood: string; hatedFood: string }>;
  const foods = JSON.parse(readFileSync('src/content/balance.json', 'utf8')).feeding as { foods: { id: string; name: string; price: number }[]; favouriteSeconds: number };
  const foodName = (id: string) => foods.foods.find((f) => f.id === id)!.name;
  const fire = personality.fire!;

  /** A Fire Kid in view, Materials to spend, and its card open by a tap. */
  /** Opens a Fire Kid's card, with Materials and `stock` bites of every food in the pantry (D-069). */
  async function open(page: Page, materials = 1000, stock = 2): Promise<number> {
    await boot(page, '?seed=3&debug=1&calm=1');
    const id = await page.evaluate(([m, n]) => {
      window.__PK__!.debugGive!({ materials: m, pantry: Object.fromEntries(['toast', 'berry_jam', 'berries', 'apple', 'carrot', 'corn', 'mushroom', 'pickle', 'cheese', 'soup', 'cocoa', 'cracker'].map((f) => [f, n])) });
      window.__PK__!.centerOn(1256, 3228);
      return window.__PK__!.debugAdd!('fire', 1256, 3228);
    }, [materials, stock] as const);
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

  test('its favourite: one bite from the pantry, happy for longer, the sun at its top right (D-092); the hated food is refused, nothing used', async ({ page }) => {
    const id = await open(page);
    await card(page).getByRole('button', { name: 'Feed', exact: true }).click();
    await expect(card(page).locator('.sheet-title')).toHaveText('Feed Fire Kid');
    const fav = foods.foods.find((f) => f.id === fire.favouriteFood)!;
    // The favourite comes first, marked; the hated food last, refused.
    await expect(card(page).locator('.feed-row').first()).toContainText(`${fav.name}2 bites storedFavourite`);
    const refused = card(page).locator('.feed-row').last();
    await expect(refused).toContainText(`Fire Kid won’t eat ${foodName(fire.hatedFood)}. No food is used.`);
    await expect(refused.getByRole('button')).toHaveAttribute('aria-disabled', 'true');
    await expect(card(page).locator('.feed-row')).toHaveCount(12);
    await expect(card(page).locator('.feed-row').first()).toContainText('2 bites stored');
    await card(page).getByRole('button', { name: `Feed ${fav.name} to Fire Kid, uses 1 pantry bite` }).click();
    await expect(card(page).locator('.kid-status')).toContainText(`${fav.name} is Fire Kid’s favourite!`);
    await expect(card(page).locator('.kid-status')).toContainText('1 bite used from the pantry.');
    expect(await page.evaluate((f) => window.__PK__!.pantry()[f], fav.id)).toBe(1);
    // Feeding costs no Materials (D-069).
    expect(await page.evaluate(() => window.__PK__!.wallet().materials)).toBeGreaterThanOrEqual(1000);
    await expect.poll(() => page.evaluate((i) => window.__PK__!.rares().find((r) => r.id === i)?.happy ?? false, id)).toBe(true);
    // The sun sits by its head on the right (D-092): right of its middle, above most of its body.
    const marks = await page.evaluate((i) => {
      const pk = window.__PK__!;
      const sun = pk.rares().find((r) => r.id === i)!.sun!;
      return { sun: pk.worldToScreen(sun.x, sun.y), feet: pk.screenPointOf(i)! };
    }, id);
    expect(marks.sun.x).toBeGreaterThan(marks.feet.x + 10);
    expect(marks.sun.y).toBeLessThan(marks.feet.y - 30);
    await card(page).getByRole('button', { name: 'Back' }).click();
    await expect(card(page).locator('.kid-card-happy')).toContainText(/Happy · (1:00:00|59:5\d)/);
    await expect(card(page).locator('.kid-card-happy')).toContainText('Counts as Tier 2 when added to a plot; odds stay capped.');
  });

  test("the Dex detail shows the type's personality too, before the live copies (§18.1)", async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate(() => window.__PK__!.debugAdd!('fire', 1256, 3228));
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

  test('an empty pantry: every food says Empty, the favourite how to grow it, and nothing is sent (D-069)', async ({ page }) => {
    await open(page, 1000, 0);
    await card(page).getByRole('button', { name: 'Feed', exact: true }).click();
    await expect(card(page).locator('.feed-empty')).toBeVisible();
    const fav = card(page).locator('.feed-row').first();
    await expect(fav.getByRole('button')).toHaveText('Empty0 bites stored');
    await expect(fav.getByRole('button')).toHaveAttribute('aria-disabled', 'true');
    await expect(fav).toContainText(`Grow ${foodName(fire.favouriteFood)} in a field to feed it.`);
    await expect(card(page).locator('.feed-row').nth(1).getByRole('button')).toHaveAttribute('aria-disabled', 'true');
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
    await page.evaluate(() => window.__PK__!.debugAdd!('water', 1256, 3228));
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
    }, `Feed ${fav.name} to Fire Kid, uses 1 pantry bite`);
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
      window.__PK__!.centerOn(1276, 3228);
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
    const id = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 1256, 3228));
    // The kid just below the HUD: a held kid there sits in the top edge zone.
    const top = await page.locator('.hud').evaluate((e) => e.getBoundingClientRect().bottom);
    await page.evaluate(([y]) => {
      const pk = window.__PK__!;
      pk.centerOn(1256, 3228);
      const at = pk.worldToScreen(1256, 3228);
      const zoom = (pk.worldToScreen(456, 1828).y - pk.worldToScreen(456, 1728).y) / 100;
      pk.centerOn(1256, 3228 + (at.y - (y! + 70)) / zoom);
    }, [top] as const);
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => window.__PK__!.worldToScreen(1256, 3228));
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
              const at = window.__PK__!.worldToScreen(1256, 3228);
              fire('pointerup');
              done(at);
            }),
          );
        }),
      k,
    );
    expect(during).toEqual(before);
    await expect(page.getByRole('dialog').locator('.sheet-title')).toHaveText('Fire Kid');
    expect(await page.evaluate(() => window.__PK__!.worldToScreen(1256, 3228))).toEqual(before);
  });

  test('a refusal stays until the player moves on; a success goes after 2.5 s (Codex review round 5, FEED-NAME)', async ({ page }) => {
    await open(page);
    await card(page).getByRole('button', { name: 'Feed', exact: true }).click();
    const fav = foods.foods.find((f) => f.id === fire.favouriteFood)!;
    // Feed, and the pantry runs out before the sim applies it: refused, none left (D-069).
    await page.evaluate(([label, food]) => {
      document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click();
      window.__PK__!.debugGive!({ pantry: { [food]: -2 } });
    }, [`Feed ${fav.name} to Fire Kid, uses 1 pantry bite`, fav.id] as const);
    const status = card(page).locator('.kid-status');
    const none = `There are no ${fav.name} bites left. Grow more in a field.`;
    await expect(status).toContainText(none);
    await page.waitForTimeout(3500);
    await expect(status).toContainText(none);
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
      window.__PK__!.debugGive!({ pantry: { apple: 1 } });
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
    await page.evaluate(() => window.__PK__!.debugAdd!('water', 1256, 3228));
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
