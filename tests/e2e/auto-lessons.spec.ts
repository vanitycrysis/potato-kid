import { expect, test, type Page } from '@playwright/test';
import { boot, frames } from './helpers';

test.describe('automatic lessons (D-086, GUI_MVP §27.2-27.3)', () => {
  const note = (page: Page) => page.locator('#lesson-note');
  const lessons = (page: Page) => page.evaluate(() => window.__PK__!.lessons() as { intro: string; introPage: number; seen: string[]; pending: string[]; firstFusion: boolean });
  /** A new save, the introduction behind it. */
  async function start(page: Page, query = '?seed=3&debug=1&calm=1&lessons=1') {
    await boot(page, query);
    await page.evaluate(() => window.__PK__!.debugLessons!({ intro: 'skipped' }));
  }
  async function fuseFirst(page: Page) {
    await page.evaluate(() => {
      const pk = window.__PK__!;
      pk.centerOn(1256, 3228);
      pk.debugAdd!('plain', 1236, 3228);
      pk.debugAdd!('water', 1276, 3228);
    });
    await expect.poll(async () => (await lessons(page)).firstFusion).toBe(true);
  }

  test('nothing before the first fusion discovery, however rich; then the relevant lessons queue in table order', async ({ page }) => {
    await start(page);
    await page.evaluate(() => window.__PK__!.debugGive!({ materials: 100 }));
    await page.waitForTimeout(1500);
    await expect(note(page)).toBeHidden();
    expect((await lessons(page)).pending).toEqual([]);
    await fuseFirst(page);
    // All relevant at once: in the table's order (planting, potatokens, garden, …, naming).
    const table = ['planting', 'potatokens', 'garden', 'capacity', 'naming', 'bias', 'fields', 'feeding', 'plot-space', 'field-space', 'compendium', 'returns'];
    const l = await lessons(page);
    expect(l.pending).toEqual([...l.pending].sort((a, b) => table.indexOf(a) - table.indexOf(b)));
    expect(l.pending).toEqual(expect.arrayContaining(['potatokens', 'garden', 'capacity']));
  });

  test('the first note after 1 s idle: a region that takes no focus, announced once; Got it marks it seen', async ({ page }) => {
    await start(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await fuseFirst(page);
    const first = (await lessons(page)).pending[0]!;
    await expect(note(page)).toBeVisible({ timeout: 3000 });
    expect(await page.evaluate(() => window.__PK__!.lessonShown())).toBe(first);
    await expect(note(page)).toHaveAttribute('role', 'region');
    expect(await page.evaluate(() => !!document.activeElement?.closest('#lesson-note'))).toBe(false);
    await expect(page.locator('[aria-live="polite"]', { hasText: /^Tip: / })).toHaveCount(1);
    // Above the tray, inside the band.
    const n = (await note(page).boundingBox())!;
    const tray = (await page.locator('.tray').boundingBox())!;
    expect(n.y + n.height).toBeLessThanOrEqual(tray.y - 8 + 1);
    await note(page).getByRole('button', { name: 'Got it' }).click();
    await expect(note(page)).toBeHidden();
    const l = await lessons(page);
    expect(l.seen).toContain(first);
    expect(l.pending).not.toContain(first);
  });

  test('the next waits for a deliberate action and 5 s idle', async ({ page }) => {
    await start(page);
    await page.evaluate(() => window.__PK__!.debugGive!({ materials: 100 }));
    await fuseFirst(page);
    await expect(note(page)).toBeVisible({ timeout: 3000 });
    await note(page).getByRole('button', { name: 'Got it' }).click();
    // Idle only: no next note.
    await page.waitForTimeout(6000);
    await expect(note(page)).toBeHidden();
    // An action (a tap on empty ground), then 5 s idle.
    const ground = await page.evaluate(() => window.__PK__!.worldToScreen(1256, 3500));
    await page.mouse.click(ground.x, ground.y);
    await page.waitForTimeout(3500);
    await expect(note(page)).toBeHidden();
    await expect(note(page)).toBeVisible({ timeout: 4000 });
  });

  test('a note gets out of the way of a gesture and a sheet, and comes back, still first', async ({ page }) => {
    await start(page);
    await fuseFirst(page);
    await expect(note(page)).toBeVisible({ timeout: 3000 });
    const shown = await page.evaluate(() => window.__PK__!.lessonShown());
    await page.mouse.move(200, 500);
    await page.mouse.down();
    await expect(note(page)).toBeHidden();
    await page.mouse.move(220, 480, { steps: 4 });
    await page.mouse.up();
    await expect(note(page)).toBeVisible({ timeout: 3000 });
    expect(await page.evaluate(() => window.__PK__!.lessonShown())).toBe(shown);
    await page.locator('[data-nav=garden]').click();
    await expect(note(page)).toBeHidden();
    await page.waitForTimeout(1500);
    await expect(note(page)).toBeHidden();
  });

  test('the keyboard can reach the note: Tab does not hide it', async ({ page }) => {
    await start(page);
    await fuseFirst(page);
    await expect(note(page)).toBeVisible({ timeout: 3000 });
    for (let i = 0; i < 40 && !(await page.evaluate(() => !!document.activeElement?.closest('#lesson-note'))); i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('#lesson-note'))).toBe(true);
    await expect(note(page)).toBeVisible();
  });

  test('a finger held down anywhere holds the note back; it waits a full idle second after the release (Codex review, #120)', async ({ page }) => {
    await start(page);
    // Pressed on the tray's own paper (no control), and held.
    const tray = (await page.locator('.tray').boundingBox())!;
    await page.mouse.move(tray.x + 3, tray.y + tray.height / 2);
    await page.mouse.down();
    await fuseFirst(page);
    await page.waitForTimeout(1600);
    await expect(note(page)).toBeHidden();
    await page.mouse.up();
    await page.waitForTimeout(500);
    await expect(note(page)).toBeHidden();
    await expect(note(page)).toBeVisible({ timeout: 3000 });
  });

  test('handling feedback is no deliberate action: after Got it, a popup acknowledged lets no next note through (Codex review, #120)', async ({ page }) => {
    await start(page, '?seed=3&debug=1&calm=1&lessons=1&arrivals=1');
    await page.evaluate(() => window.__PK__!.debugGive!({ materials: 100 }));
    await fuseFirst(page);
    // The fusion's own popup first.
    await page.getByRole('dialog').getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(note(page)).toBeVisible({ timeout: 3000 });
    await note(page).getByRole('button', { name: 'Got it' }).click();
    // Only feedback handled since: another popup, acknowledged.
    await page.evaluate(() => window.__PK__!.debugMeet!('plain', { body: 'round', face: 'classic' }));
    await page.getByRole('dialog').getByRole('button', { name: 'Continue', exact: true }).click();
    await page.waitForTimeout(6000);
    await expect(note(page)).toBeHidden();
    // A deliberate action, then 5 s: the next note.
    const ground = await page.evaluate(() => window.__PK__!.worldToScreen(1256, 3500));
    await page.mouse.click(ground.x, ground.y);
    await expect(note(page)).toBeVisible({ timeout: 7000 });
  });

  test('Got it is saved at once: after a crash the lesson is seen (Codex review round 2, #120)', async ({ page }) => {
    await start(page);
    await fuseFirst(page);
    await expect(note(page)).toBeVisible({ timeout: 3000 });
    const first = await page.evaluate(() => window.__PK__!.lessonShown());
    await page.waitForTimeout(400);
    await note(page).getByRole('button', { name: 'Got it' }).click();
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {};
    });
    await page.reload();
    await page.waitForFunction(() => window.__PK__?.ready === true);
    expect((await lessons(page)).seen).toContain(first);
  });

  test('back in front is a fresh session: a visible note waits again, and the next needs only 1 s idle (Codex review round 2, #120)', async ({ page }) => {
    await start(page);
    await page.evaluate(() => window.__PK__!.debugGive!({ materials: 100 }));
    await fuseFirst(page);
    await expect(note(page)).toBeVisible({ timeout: 3000 });
    const hide = (hidden: boolean) =>
      page.evaluate((h) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    await hide(true);
    await expect(note(page)).toBeHidden();
    await hide(false);
    await expect(note(page)).toBeVisible({ timeout: 3000 });
    await note(page).getByRole('button', { name: 'Got it' }).click();
    // No deliberate action, but a new session: the next note after 1 s idle.
    await hide(true);
    await hide(false);
    await expect(note(page)).toBeVisible({ timeout: 3000 });
  });

  test('an expanded note too tall for the band scrolls as a whole, its parts never squeezed over each other (Codex review round 3, #120)', async ({ page }) => {
    await start(page);
    await fuseFirst(page);
    await expect(note(page)).toBeVisible({ timeout: 3000 });
    const title = await note(page).locator('.lesson-title').textContent();
    await note(page).getByRole('button', { name: `Where is ${title}?` }).click();
    // A route far too tall for the band (large text, or a short screen).
    await page.addStyleTag({ content: '.lesson-route { font-size: 40px !important; line-height: 900px !important; }' });
    await frames(page, 3);
    const r = await note(page).evaluate((n) => {
      const kids = [...n.children].filter((c) => !(c as HTMLElement).hidden) as HTMLElement[];
      return {
        scrolls: n.scrollHeight > n.clientHeight + 1,
        squeezed: kids.some((c) => c.scrollHeight > c.clientHeight + 1),
        overlap: kids.some((c, i) => i > 0 && c.getBoundingClientRect().top < kids[i - 1]!.getBoundingClientRect().bottom - 1),
      };
    });
    expect(r).toEqual({ scrolls: true, squeezed: false, overlap: false });
    // Scrolled to its end, it stays there frame after frame, Got it in reach (Codex review round 5, #120).
    await note(page).evaluate((n) => (n.scrollTop = n.scrollHeight));
    await frames(page, 6);
    expect(await note(page).evaluate((n) => n.scrollTop)).toBeGreaterThan(100);
    await note(page).getByRole('button', { name: 'Got it' }).scrollIntoViewIfNeeded();
    await note(page).getByRole('button', { name: 'Got it' }).click();
    await expect(note(page)).toBeHidden();
  });

  test('the tip announcement stays hidden in the fallback layouts too (Codex review round 4, #120)', async ({ page }) => {
    await start(page);
    await fuseFirst(page);
    await expect(note(page)).toBeVisible({ timeout: 3000 });
    await note(page).getByRole('button', { name: 'Got it' }).click();
    // A layout where the tray's labels show: the announcement must not.
    await page.setViewportSize({ width: 300, height: 200 });
    await page.evaluate(() => window.__PK__!.debugSaveStatus!({ unsaved: true, recovery: false, readOnly: false }));
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.hudFit)).toBe('page');
    const tip = page.locator('[aria-live="polite"]', { hasText: /^Tip: / });
    await expect(tip).toHaveCount(1);
    expect(await tip.evaluate((e) => { const r = e.getBoundingClientRect(); return r.width <= 1 && r.height <= 1; })).toBe(true);
  });

  test('Where is…? shows the route in place; Escape inside the note acknowledges it', async ({ page }) => {
    await start(page);
    await fuseFirst(page);
    await expect(note(page)).toBeVisible({ timeout: 3000 });
    const title = await note(page).locator('.lesson-title').textContent();
    const where = note(page).getByRole('button', { name: `Where is ${title}?` });
    await expect(note(page).locator('.lesson-route')).toBeHidden();
    await where.click();
    await expect(note(page).locator('.lesson-route')).toBeVisible();
    await expect(where).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(note(page)).toBeHidden();
    expect((await lessons(page)).seen.length).toBe(1);
  });

  test('a lesson whose mechanic is used meanwhile is seen without showing', async ({ page }) => {
    await start(page);
    await fuseFirst(page);
    await page.evaluate(() => window.__PK__!.debugGive!({ materials: 1000 }));
    await expect.poll(async () => (await lessons(page)).pending).toContain('garden');
    await page.evaluate(() => window.__PK__!.debugCommand!({ type: 'upgrade', building: 'garden' }));
    await expect.poll(async () => (await lessons(page)).seen).toContain('garden');
    expect((await lessons(page)).pending).not.toContain('garden');
  });

  test('lessons wait while the introduction is not behind the player', async ({ page }) => {
    await boot(page, '?seed=3&debug=1&calm=1&lessons=1');
    await fuseFirst(page);
    await page.waitForTimeout(1500);
    await expect(note(page)).toBeHidden();
    expect((await lessons(page)).pending.length).toBeGreaterThan(0);
  });

  test('pending lessons are saved with the game', async ({ page }) => {
    await start(page);
    await fuseFirst(page);
    const before = (await lessons(page)).pending;
    await page.waitForTimeout(400);
    await page.reload();
    await page.waitForFunction(() => window.__PK__?.ready === true);
    expect((await lessons(page)).pending.slice(0, before.length)).toEqual(before);
    expect((await lessons(page)).firstFusion).toBe(true);
  });
});
