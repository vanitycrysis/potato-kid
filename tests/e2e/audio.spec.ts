import { expect, test, type Page } from '@playwright/test';
import { boot, openTool } from './helpers';

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
      window.__PK__!.debugAdd!('plain', 1176, 3148);
      window.__PK__!.debugAdd!('water', 1176, 3148);
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
      window.__PK__!.centerOn(1256, 3228);
      return window.__PK__!.debugAdd!('fire', 1256, 3228);
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
      window.__PK__!.centerOn(1256, 3228);
      return window.__PK__!.debugAdd!('fire', 1256, 3228);
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
