import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

test.describe('a farming kid’s card (GUI_MVP §22.6)', () => {
  /** Field 1 grows `food`; a Potato Kid farms it; `pantry` stocked; the camera on the field. */
  async function setup(page: Page, food = 'apple', pantry: Record<string, number> = { apple: 3 }): Promise<number> {
    await boot(page, '?seed=3&debug=1&calm=1');
    const id = await page.evaluate(
      ([food, pantry]) => {
        const pk = window.__PK__!;
        pk.debugGive!({ materials: 5000, pantry });
        pk.debugCommand!({ type: 'unlockField' });
        pk.debugCommand!({ type: 'setFieldFood', field: 0, food });
        const id = pk.debugAdd!('plain', 1576, 3548);
        pk.debugCommand!({ type: 'farm', field: 0, kidIds: [id] });
        pk.centerOn(1166, 3498);
        return id;
      },
      [food, pantry] as const,
    );
    await expect.poll(() => page.evaluate(() => window.__PK__!.fields()[0]?.kids.length ?? -1)).toBe(1);
    // Drawn in its field only: no map figure left behind.
    expect(await page.evaluate((i) => window.__PK__!.presentationOf(i), id)).toBeUndefined();
    return id;
  }

  async function openFromRoster(page: Page): Promise<void> {
    await page.locator('[data-nav=garden]').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Fields', exact: true }).click();
    await page.locator('.field-view[data-field="0"]').click();
    await page.getByRole('dialog', { name: 'Field 1' }).getByRole('button', { name: 'View kid: Potato Kid' }).click();
  }

  test('from its field’s roster: what it farms and how fast, no Materials, View field in place of planting; fed from the pantry', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await setup(page);
    await page.locator('[data-nav=garden]').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Fields', exact: true }).click();
    await page.locator('.field-view[data-field="0"]').click();
    const field = page.getByRole('dialog', { name: 'Field 1' });
    // Codex's roster row: who, its number and what it farms; View kid and Take back.
    await expect(field.locator('.field-worker')).toContainText('Tier 1 · Kid 1');
    await expect(field.locator('.field-worker')).toContainText('Farming Apple');
    await field.getByRole('button', { name: 'View kid: Potato Kid' }).click();
    const card = page.getByRole('dialog', { name: 'Potato Kid' });
    await expect(card.locator('.sheet-subtitle')).toHaveText('Farming Apple · Field 1 · Kid 1');
    await expect(card.locator('.kid-card-income')).toHaveText('0 Materials while farming.');
    await expect(card.locator('.kid-card-farming-lines')).toHaveText('Farms Apple · 1 bite per hour.');
    await expect(card.getByRole('button', { name: 'Choose a plot' })).toBeHidden();
    await expect(card.getByRole('button', { name: 'View field' })).toBeVisible();
    // Fed while farming: its happiness counts down; the boost waits for the map.
    await card.getByRole('button', { name: 'Feed', exact: true }).click();
    await page.getByRole('button', { name: 'Feed Apple to Potato Kid, uses 1 pantry bite' }).click();
    await expect(page.getByRole('dialog').locator('.kid-status')).toContainText('1 bite used from the pantry.');
    expect(await page.evaluate(() => window.__PK__!.pantry().apple)).toBe(2);
    await page.getByRole('dialog').getByRole('button', { name: 'Back', exact: true }).click();
    await expect(card.locator('.kid-card-happy')).toContainText('Happy income applies after this kid returns to the map. Farming still earns no Materials.');
    // Field soil under the marks; farming kids over them, as map kids are (Codex review, #90).
    const layers = await page.evaluate(() => window.__PK__!.layers());
    expect(layers.indexOf('fieldBeds')).toBeLessThan(layers.indexOf('rareMarks'));
    expect(layers.indexOf('rareMarks')).toBeLessThan(layers.indexOf('fieldWorkers'));
    expect(layers.indexOf('fieldWorkers')).toBeLessThan(layers.indexOf('kids'));
    // Its happy sun shows in the field, where it stands (Codex review, #90).
    const id = await page.evaluate(() => window.__PK__!.fields()[0]!.kids[0]!.id);
    await expect.poll(() => page.evaluate((i) => window.__PK__!.rares().some((r) => r.id === i && r.happy), id)).toBe(true);
    // View field: the field's page, where taking back is done.
    await card.getByRole('button', { name: 'View field' }).click();
    await expect(page.getByRole('dialog', { name: 'Field 1' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('View kid keeps the number its row showed, even after an earlier copy left (Codex review, #90)', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1');
    const [earlier, worker] = await page.evaluate(() => {
      const pk = window.__PK__!;
      pk.debugGive!({ materials: 5000 });
      pk.debugCommand!({ type: 'unlockField' });
      pk.debugCommand!({ type: 'setFieldFood', field: 0, food: 'apple' });
      const earlier = pk.debugAdd!('plain', 1676, 3148);
      const worker = pk.debugAdd!('plain', 1876, 3148);
      pk.debugCommand!({ type: 'farm', field: 0, kidIds: [worker] });
      return [earlier, worker];
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.fields()[0]?.kids.length ?? -1)).toBe(1);
    await page.locator('[data-nav=garden]').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Fields', exact: true }).click();
    await page.locator('.field-view[data-field="0"]').click();
    const field = page.getByRole('dialog', { name: 'Field 1' });
    await expect(field.locator('.field-worker')).toContainText('Tier 1 · Kid 2');
    // The earlier copy leaves the map (planted) while this page is open.
    await page.evaluate((i) => window.__PK__!.debugCommand!({ type: 'plant', kidIds: [i] }), earlier);
    await expect.poll(() => page.evaluate((i) => window.__PK__!.kids().some((k) => k.id === i), earlier)).toBe(false);
    await field.locator(`.field-view-kid[data-kid="${worker}"]`).click();
    await expect(page.getByRole('dialog', { name: 'Potato Kid' }).locator('.sheet-subtitle')).toHaveText('Farming Apple · Field 1 · Kid 2');
  });

  test('a tap on the soil just below a farming kid opens the field, not the kid (Codex review, #90)', async ({ page }) => {
    const id = await setup(page);
    await page.waitForTimeout(300);
    const feet = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    const perUnit = await page.evaluate(() => window.__PK__!.worldToScreen(100, 0).x - window.__PK__!.worldToScreen(0, 0).x) / 100;
    // 15 world units below its feet: its shadow and canvas padding, not the kid.
    await page.mouse.click(feet.x, feet.y + 15 * perUnit);
    await expect(page.getByRole('dialog', { name: 'Field 1' })).toBeVisible();
  });

  test('back from a kid’s card, the field is where it was, on that kid’s View kid (Codex review, #90)', async ({ page }) => {
    await setup(page);
    const second = await page.evaluate(() => {
      const pk = window.__PK__!;
      const id = pk.debugAdd!('plain', 1676, 3148);
      pk.debugCommand!({ type: 'farm', field: 0, kidIds: [id] });
      return id;
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.fields()[0]!.kids.length)).toBe(2);
    await page.locator('[data-nav=garden]').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Fields', exact: true }).click();
    await page.locator('.field-view[data-field="0"]').click();
    const field = page.getByRole('dialog', { name: 'Field 1' });
    const view = field.locator(`.field-view-kid[data-kid="${second}"]`);
    await view.scrollIntoViewIfNeeded();
    const scrolled = await field.locator('.sheet-body').evaluate((e) => e.scrollTop);
    expect(scrolled).toBeGreaterThan(0);
    await view.click();
    await page.getByRole('button', { name: 'Back to Field 1' }).click();
    await expect(field.locator(`.field-view-kid[data-kid="${second}"]`)).toBeFocused();
    expect(await field.locator('.sheet-body').evaluate((e) => e.scrollTop)).toBe(scrolled);
  });

  test('a tap on a farming kid opens its card; its favourite says so', async ({ page }) => {
    const id = await setup(page, 'toast', {});
    await page.waitForTimeout(300);
    const feet = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    await page.mouse.click(feet.x, feet.y - 25);
    const card = page.getByRole('dialog', { name: 'Potato Kid' });
    await expect(card.locator('.sheet-subtitle')).toHaveText('Farming Toast · Field 1 · Kid 1');
    await expect(card.locator('.kid-card-farming-lines')).toHaveText('Favourite · Farms Toast faster · 2 bites per hour.');
  });

  test('taken back while its card is open, the card becomes a map kid’s again', async ({ page }) => {
    const id = await setup(page);
    await openFromRoster(page);
    const card = page.getByRole('dialog', { name: 'Potato Kid' });
    await expect(card.getByRole('button', { name: 'View field' })).toBeVisible();
    await page.evaluate((i) => window.__PK__!.debugCommand!({ type: 'unfarm', field: 0, kidId: i }), id);
    await expect(card.locator('.sheet-subtitle')).toHaveText(/^On your map · Kid \d+$/);
    // Drawn on the map again, by the Garden.
    expect(await page.evaluate((i) => window.__PK__!.presentationOf(i), id)).toBeDefined();
    await expect(card.locator('.kid-card-income')).toContainText('Materials / h');
    await expect(card.getByRole('button', { name: 'Choose a plot' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'View field' })).toBeHidden();
  });

  test('feeding: Open pantry and back, View fields when it is empty and back; Pantry → View fields and back (Codex review, #90)', async ({ page }) => {
    await setup(page);
    await page.locator('[data-nav=garden]').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Fields', exact: true }).click();
    await page.locator('.field-view[data-field="0"]').click();
    await page.getByRole('dialog', { name: 'Field 1' }).getByRole('button', { name: 'View kid: Potato Kid' }).click();
    await page.getByRole('dialog', { name: 'Potato Kid' }).getByRole('button', { name: 'Feed', exact: true }).click();
    const feeding = page.getByRole('dialog', { name: 'Feed Potato Kid' });
    // Stock: no View fields here.
    await expect(feeding.getByRole('button', { name: 'View fields' })).toBeHidden();
    await feeding.getByRole('button', { name: 'Open pantry' }).click();
    const pantry = page.getByRole('dialog', { name: 'Pantry' });
    await expect(pantry.locator('.pantry-row[data-food="apple"]')).toContainText('3 bites');
    // Pantry, scrolled down → View fields → Back to Pantry, where it was.
    await pantry.locator('.sheet-body').evaluate((e) => (e.scrollTop = 200));
    const scrolled = await pantry.locator('.sheet-body').evaluate((e) => e.scrollTop);
    expect(scrolled).toBeGreaterThan(100);
    await pantry.locator('.pantry-view-fields').evaluate((b) => (b as HTMLButtonElement).click());
    await expect(page.getByRole('dialog', { name: 'Garden' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to Pantry' }).click();
    await expect(page.getByRole('dialog', { name: 'Pantry' })).toBeVisible();
    expect(await page.getByRole('dialog', { name: 'Pantry' }).locator('.sheet-body').evaluate((e) => e.scrollTop)).toBe(scrolled);
    // Back to feeding: the same kid's feeding page.
    await page.getByRole('button', { name: 'Back to feeding' }).click();
    await expect(page.getByRole('dialog', { name: 'Feed Potato Kid' })).toBeVisible();
    // Empty: View fields shows, and comes back here too.
    await page.evaluate(() => window.__PK__!.debugGive!({ pantry: { apple: -3 } }));
    await expect(feeding.getByRole('button', { name: 'View fields' })).toBeVisible();
    await feeding.getByRole('button', { name: 'View fields' }).click();
    await expect(page.getByRole('dialog', { name: 'Garden' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to feeding' }).click();
    await expect(page.getByRole('dialog', { name: 'Feed Potato Kid' })).toBeVisible();
  });

  test('Pantry → View fields → a field → Back to fields keeps Back to Pantry (Codex review, #90)', async ({ page }) => {
    await setup(page);
    await page.locator('[data-nav=notebook]').click();
    await page.getByRole('dialog', { name: 'Notebook' }).getByRole('button', { name: 'Pantry', exact: true }).click();
    await page.getByRole('dialog', { name: 'Pantry' }).getByRole('button', { name: 'View fields' }).click();
    await page.locator('.field-view[data-field="0"]').click();
    await expect(page.getByRole('dialog', { name: 'Field 1' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to fields' }).click();
    await expect(page.getByRole('dialog', { name: 'Garden' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to Pantry' }).click();
    await expect(page.getByRole('dialog', { name: 'Pantry' })).toBeVisible();
    // The Garden opened from its button has no such way back, nor do its fields' pages.
    await page.keyboard.press('Escape');
    await page.locator('[data-nav=garden]').click();
    await expect(page.getByRole('dialog', { name: 'Garden' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to Pantry' })).toHaveCount(0);
    await page.getByRole('dialog').getByRole('button', { name: 'Fields', exact: true }).click();
    await page.locator('.field-view[data-field="0"]').click();
    await page.getByRole('button', { name: 'Back to fields' }).click();
    await expect(page.getByRole('dialog', { name: 'Garden' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to Pantry' })).toHaveCount(0);
  });

  test('a farming kid’s card, Feed → Pantry → View fields and all the way back: the field keeps its own way back (Codex review, #90)', async ({ page }) => {
    await setup(page);
    await page.locator('[data-nav=garden]').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Fields', exact: true }).click();
    await page.locator('.field-view[data-field="0"]').click();
    await page.getByRole('dialog', { name: 'Field 1' }).getByRole('button', { name: 'View kid: Potato Kid' }).click();
    await page.getByRole('dialog', { name: 'Potato Kid' }).getByRole('button', { name: 'Feed', exact: true }).click();
    await page.getByRole('dialog', { name: 'Feed Potato Kid' }).getByRole('button', { name: 'Open pantry' }).click();
    await page.getByRole('dialog', { name: 'Pantry' }).getByRole('button', { name: 'View fields' }).click();
    // All the way back: Pantry, feeding, the card, its field, the fields.
    await page.getByRole('button', { name: 'Back to Pantry' }).click();
    await page.getByRole('button', { name: 'Back to feeding' }).click();
    await page.getByRole('dialog', { name: 'Feed Potato Kid' }).getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('dialog', { name: 'Potato Kid' }).getByRole('button', { name: 'Back to Field 1' }).click();
    await page.getByRole('dialog', { name: 'Field 1' }).getByRole('button', { name: 'Back to fields' }).click();
    // The Garden as first opened, from its button: no way back to a Pantry.
    await expect(page.getByRole('dialog', { name: 'Garden' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to Pantry' })).toHaveCount(0);
  });

  test('a field tapped on the map starts afresh: no way back to an earlier Pantry (Codex review, #90)', async ({ page }) => {
    await setup(page);
    await page.locator('[data-nav=notebook]').click();
    await page.getByRole('dialog', { name: 'Notebook' }).getByRole('button', { name: 'Pantry', exact: true }).click();
    await page.getByRole('dialog', { name: 'Pantry' }).getByRole('button', { name: 'View fields' }).click();
    await expect(page.getByRole('dialog', { name: 'Garden' })).toBeVisible();
    await page.keyboard.press('Escape');
    // Tap Field 1's soil on the map.
    const soil = await page.evaluate(() => window.__PK__!.worldToScreen(1076, 3348));
    await page.mouse.click(soil.x, soil.y);
    await expect(page.getByRole('dialog', { name: 'Field 1' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to fields' }).click();
    await expect(page.getByRole('dialog', { name: 'Garden' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to Pantry' })).toHaveCount(0);
    // The same from a farming kid's card, tapped on the map, after another Pantry visit.
    await page.keyboard.press('Escape');
    await page.locator('[data-nav=notebook]').click();
    await page.getByRole('dialog', { name: 'Notebook' }).getByRole('button', { name: 'Pantry', exact: true }).click();
    await page.getByRole('dialog', { name: 'Pantry' }).getByRole('button', { name: 'View fields' }).click();
    await page.keyboard.press('Escape');
    const id = await page.evaluate(() => window.__PK__!.fields()[0]!.kids[0]!.id);
    const feet = await page.evaluate((i) => window.__PK__!.screenPointOf(i)!, id);
    await page.mouse.click(feet.x, feet.y - 25);
    await page.getByRole('dialog', { name: 'Potato Kid' }).getByRole('button', { name: 'View field' }).click();
    await page.getByRole('dialog', { name: 'Field 1' }).getByRole('button', { name: 'Back to fields' }).click();
    await expect(page.getByRole('dialog', { name: 'Garden' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to Pantry' })).toHaveCount(0);
  });

  test('the Garden opened from the Pantry keeps Back to Pantry over the return summary (Codex review, #90)', async ({ page }) => {
    await setup(page);
    await page.locator('[data-nav=notebook]').click();
    await page.getByRole('dialog', { name: 'Notebook' }).getByRole('button', { name: 'Pantry', exact: true }).click();
    await page.getByRole('dialog', { name: 'Pantry' }).getByRole('button', { name: 'View fields' }).click();
    await expect(page.getByRole('dialog', { name: 'Garden' })).toBeVisible();
    await page.evaluate(() => window.__PK__!.debugAway!(120_000));
    await page.getByRole('dialog', { name: 'Welcome back' }).getByRole('button', { name: 'Back to the garden' }).click();
    await expect(page.getByRole('dialog', { name: 'Garden' })).toBeVisible();
    // Through a field and back, too.
    await page.locator('.field-view[data-field="0"]').click();
    await page.getByRole('button', { name: 'Back to fields' }).click();
    await page.getByRole('button', { name: 'Back to Pantry' }).click();
    await expect(page.getByRole('dialog', { name: 'Pantry' })).toBeVisible();
  });

  test('after the return summary, Pick kids comes back with its choices and search; the Pantry with Back to feeding (Codex review, #90)', async ({ page }) => {
    await setup(page);
    const ids = await page.evaluate(() => [window.__PK__!.debugAdd!('plain', 1676, 3148), window.__PK__!.debugAdd!('fire', 1876, 3148)]);
    await page.locator('[data-nav=garden]').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Fields', exact: true }).click();
    await page.locator('.field-view[data-field="0"]').click();
    await page.getByRole('button', { name: 'Assign kids' }).click();
    const pick = page.getByRole('dialog', { name: 'Pick kids for Field 1' });
    await pick.locator(`.picker-check[data-kid="${ids[1]}"]`).check();
    await pick.locator('.picker-search').fill('Kid');
    await page.evaluate(() => window.__PK__!.debugAway!(120_000));
    await page.getByRole('dialog', { name: 'Welcome back' }).getByRole('button', { name: 'Back to the garden' }).click();
    const back = page.getByRole('dialog', { name: 'Pick kids for Field 1' });
    await expect(back).toBeVisible();
    await expect(back.locator(`.picker-check[data-kid="${ids[1]}"]`)).toBeChecked();
    await expect(back.locator('.picker-search')).toHaveValue('Kid');
    await expect(back.locator('.field-pick-count')).toHaveText('1 selected · 3 spaces');
    // The Pantry, opened from a kid's feeding page, comes back with its way back there.
    await page.keyboard.press('Escape');
    await page.locator('[data-nav=garden]').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Fields', exact: true }).click();
    await page.locator('.field-view[data-field="0"]').click();
    await page.getByRole('dialog', { name: 'Field 1' }).getByRole('button', { name: 'View kid: Potato Kid' }).click();
    await page.getByRole('dialog', { name: 'Potato Kid' }).getByRole('button', { name: 'Feed', exact: true }).click();
    await page.getByRole('dialog', { name: 'Feed Potato Kid' }).getByRole('button', { name: 'Open pantry' }).click();
    await page.evaluate(() => window.__PK__!.debugAway!(120_000));
    await page.getByRole('dialog', { name: 'Welcome back' }).getByRole('button', { name: 'Back to the garden' }).click();
    await expect(page.getByRole('dialog', { name: 'Pantry' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to feeding' }).click();
    await expect(page.getByRole('dialog', { name: 'Feed Potato Kid' })).toBeVisible();
  });

  test('Assign sent, then the sheet closed before the answer: the world says the kid is farming (Codex review, #90)', async ({ page }) => {
    await setup(page);
    // Named, so its card can't be the setup's own farming card.
    const id = await page.evaluate(() => {
      const pk = window.__PK__!;
      const id = pk.debugAdd!('plain', 1676, 3148);
      pk.debugCommand!({ type: 'name', kidId: id, name: 'Spud' });
      return id;
    });
    await page.locator('[data-nav=garden]').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Fields', exact: true }).click();
    await page.locator('.field-view[data-field="0"]').click();
    await page.getByRole('button', { name: 'Assign kids' }).click();
    await page.locator(`.picker-check[data-kid="${id}"]`).check();
    // Assign, and close the sheet before any frame can answer.
    await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('.field-pick-go')!.click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // After the setup's own cards, one at a time.
    await expect(page.locator('.toast', { hasText: 'Spud is farming Apple in Field 1.' })).toBeVisible({ timeout: 20_000 });
  });

  test('the field changes under its pages: Pick kids freezes on a new food; Take all back’s review closes on a new roster (Codex review, #90)', async ({ page }) => {
    await setup(page);
    const other = await page.evaluate(() => window.__PK__!.debugAdd!('plain', 1676, 3148));
    await page.locator('[data-nav=garden]').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Fields', exact: true }).click();
    await page.locator('.field-view[data-field="0"]').click();
    // Take all back's review, then another kid joins: the review no longer confirms anything.
    const field = page.getByRole('dialog', { name: 'Field 1' });
    await field.getByRole('button', { name: 'Take all back' }).click();
    await expect(field.locator('.field-review-heading')).toBeVisible();
    await page.evaluate((i) => window.__PK__!.debugCommand!({ type: 'farm', field: 0, kidIds: [i] }), other);
    await expect(field.locator('.field-review-heading')).toBeHidden();
    await expect(field.locator('.plot-note')).toContainText('This field changed. Review it again before taking all kids back.');
    expect(await page.evaluate(() => window.__PK__!.fields()[0]!.kids.length)).toBe(2);
    // Pick kids for Apple, then the field changes to Corn: frozen.
    const spare = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 1876, 3148));
    await field.getByRole('button', { name: 'Assign kids' }).click();
    const pick = page.getByRole('dialog', { name: 'Pick kids for Field 1' });
    await pick.locator(`.picker-check[data-kid="${spare}"]`).check();
    await page.evaluate(() => window.__PK__!.debugCommand!({ type: 'setFieldFood', field: 0, food: 'corn' }));
    await expect(pick.locator('.field-pick-frozen')).toHaveText("This field's food changed. Review the field before assigning kids.");
    await expect(pick.locator('.field-pick-go')).toHaveAttribute('aria-disabled', 'true');
    await expect(pick.locator(`.picker-check[data-kid="${spare}"]`)).toBeDisabled();
  });

  test('Assign for Apple, answered after a change to Corn: refused, nobody farms Corn (Codex review, #90)', async ({ page }) => {
    await setup(page);
    const spare = await page.evaluate(() => window.__PK__!.debugAdd!('fire', 1876, 3148));
    await page.locator('[data-nav=garden]').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Fields', exact: true }).click();
    await page.locator('.field-view[data-field="0"]').click();
    await page.getByRole('dialog', { name: 'Field 1' }).getByRole('button', { name: 'Assign kids' }).click();
    const pick = page.getByRole('dialog', { name: 'Pick kids for Field 1' });
    await pick.locator(`.picker-check[data-kid="${spare}"]`).check();
    // The food change is queued first, in the same frame as Assign: the sim sees it first.
    await page.evaluate(() => {
      window.__PK__!.debugCommand!({ type: 'setFieldFood', field: 0, food: 'corn' });
      document.querySelector<HTMLButtonElement>('.field-pick-go')!.click();
    });
    await expect(pick.locator('.plot-note')).toContainText("This field's food changed. Review the field before assigning kids.");
    expect(await page.evaluate((i) => window.__PK__!.fields()[0]!.kids.some((k) => k.id === i), spare)).toBe(false);
  });

  test('Change food’s review closes when the field changes under it; Pick kids numbers each copy (Codex review, #90)', async ({ page }) => {
    await setup(page);
    const others = await page.evaluate(() => [window.__PK__!.debugAdd!('plain', 1676, 3148), window.__PK__!.debugAdd!('plain', 1876, 3148)]);
    await page.locator('[data-nav=garden]').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Fields', exact: true }).click();
    await page.locator('.field-view[data-field="0"]').click();
    await page.getByRole('dialog', { name: 'Field 1' }).getByRole('button', { name: 'Change food' }).click();
    const choose = page.getByRole('dialog', { name: 'Food for Field 1' });
    await choose.locator('.field-choose[data-food="corn"]').click();
    await expect(choose.locator('.field-review-heading')).toBeVisible();
    // A kid joins the field: the review no longer confirms anything.
    await page.evaluate((i) => window.__PK__!.debugCommand!({ type: 'farm', field: 0, kidIds: [i] }), others[0]!);
    await expect(choose.locator('.field-review-heading')).toBeHidden();
    await expect(choose.locator('.plot-note')).toContainText('This field changed. Review it again before changing food.');
    expect(await page.evaluate(() => window.__PK__!.fields()[0]!.food)).toBe('apple');
    // Pick kids: the unnamed Potato Kid left on the map shows its number.
    await page.getByRole('button', { name: 'Back to field' }).click();
    await page.getByRole('dialog', { name: 'Field 1' }).getByRole('button', { name: 'Assign kids' }).click();
    const pick = page.getByRole('dialog', { name: 'Pick kids for Field 1' });
    const row = pick.locator('.picker-row', { has: page.locator(`.picker-check[data-kid="${others[1]}"]`) });
    await expect(row).toContainText(/Tier 1 · Kid \d/);
  });

  test('a kid taken back is the same kid by the Garden: no birth animation (Codex review, #90)', async ({ page }) => {
    const id = await setup(page);
    await page.evaluate((i) => window.__PK__!.debugCommand!({ type: 'unfarm', field: 0, kidId: i }), id);
    await expect.poll(() => page.evaluate((i) => window.__PK__!.presentationOf(i) ?? null, id)).not.toBeNull();
    const shown = await page.evaluate((i) => window.__PK__!.presentationOf(i)!, id);
    expect(shown.clip).not.toBe('spawn');
    expect(shown.effects).not.toContain('spawn');
  });

  test('field changes are saved at once, not at the next autosave (Codex review, #90)', async ({ page }) => {
    const id = await setup(page);
    const newest = () =>
      page.evaluate(() => {
        const slots = ['A', 'B'].map((s) => localStorage.getItem(`CapacitorStorage.potato-kid/slot${s}`)).filter((x): x is string => !!x).map((x) => JSON.parse(x));
        const s = slots.sort((a, b) => b.revision - a.revision)[0]?.state;
        return s ? `${s.fields?.length ?? 0}|${s.fields?.[0]?.food ?? ''}|${(s.fields?.[0]?.workers ?? []).map((w: { id: number }) => w.id).join(',')}` : '';
      });
    // Bought, given a food and farmed in setup: all saved well inside the 10 s autosave.
    await expect.poll(newest, { timeout: 2000 }).toBe(`1|apple|${id}`);
    await page.evaluate((i) => window.__PK__!.debugCommand!({ type: 'unfarm', field: 0, kidId: i }), id);
    await expect.poll(newest, { timeout: 2000 }).toBe('1|apple|');
  });

  test('taking a kid back from the keyboard: focus moves to the next Take back (Codex review, #90)', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => {
      const pk = window.__PK__!;
      pk.debugCommand!({ type: 'farm', field: 0, kidIds: [pk.debugAdd!('plain', 1676, 3748)] });
    });
    await expect.poll(() => page.evaluate(() => window.__PK__!.fields()[0]!.kids.length)).toBe(2);
    await page.locator('[data-nav=garden]').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Fields', exact: true }).click();
    await page.locator('.field-view[data-field="0"]').click();
    const field = page.getByRole('dialog', { name: 'Field 1' });
    await field.locator('.field-take-back').first().focus();
    await page.keyboard.press('Enter');
    await expect(field.locator('.field-take-back')).toHaveCount(1);
    await expect(field.locator('.field-take-back')).toBeFocused();
    // The last one: focus goes to Assign kids.
    await page.keyboard.press('Enter');
    await expect(field.locator('.field-take-back')).toHaveCount(0);
    await expect(field.getByRole('button', { name: 'Assign kids' })).toBeFocused();
  });

  test('the return summary says how much food grew, and of what', async ({ page }) => {
    await setup(page, 'apple', {});
    await page.evaluate(() => window.__PK__!.debugAway!(4 * 3600_000));
    const summary = page.getByRole('dialog', { name: 'Welcome back' });
    await expect(summary.locator('.offline-food')).toHaveText(/^Food grown: \d+ bites?\.$/);
    const bites = await page.evaluate(() => window.__PK__!.pantry().apple ?? 0);
    expect(bites).toBeGreaterThanOrEqual(3);
    await expect(summary.locator('.offline-food')).toHaveText(`Food grown: ${bites} bites.`);
    await expect(summary.locator('.offline-food-lines .stat-row')).toHaveCount(1);
    await expect(summary.locator('.offline-food-lines')).toContainText('Apple');
    await expect(summary.locator('.offline-food-lines')).toContainText(`+${bites} bites`);
  });
});
