import { expect, test } from '@playwright/test';
import { boot } from './helpers';

// Motion v1 on the map (D-099..D-101): the fusion's moment, marks and their zoom gate, the
// squash of a kid put down. Timings are sampled in the page, frame by frame (docs/TESTING.md).
test.describe('motion on the map (D-099, D-100, D-101)', () => {
  test('a fusion: the parents stay on screen a moment as ghosts, then only the child is left (D-101)', async ({ page }) => {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate((t) => window.__PK__!.debugKnow!(t), 'firefighter');
    const seen = await page.evaluate(async () => {
      const pk = window.__PK__!;
      // Side by side and touching: they fuse on the next step.
      const plain = pk.debugAdd!('plain', 1300, 3300, { body: 'round', scale: 1 });
      const box = pk.kids().find((k) => k.id === plain)!.box;
      const water = pk.debugAdd!('water', 1300 + (box.right - box.left) + 2, 3300, { body: 'round', scale: 1 });
      const frames: { ms: number; ghosts: number; types: string[]; clip?: string | undefined; childScaleY?: number | undefined }[] = [];
      const start = performance.now();
      while (performance.now() - start < 2200) {
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        const kids = pk.kids();
        const child = kids.find((k) => k.type === 'firefighter');
        frames.push({
          ms: performance.now() - start,
          ghosts: pk.ghosts!(),
          types: kids.map((k) => k.type),
          ...(child ? { clip: pk.presentationOf(child.id)?.clip, childScaleY: pk.drawnOf!(child.id)?.scale[1] } : {}),
        });
      }
      return { frames, plain, water, ids: pk.kids().map((k) => k.id) };
    });
    // The sim took the parents at once: from the first frame with the child, they are not kids.
    const born = seen.frames.findIndex((f) => f.types.includes('firefighter'));
    expect(born).toBeGreaterThanOrEqual(0);
    for (const f of seen.frames.slice(born)) expect(f.types).toEqual(['firefighter']);
    expect(seen.ids).not.toContain(seen.plain);
    expect(seen.ids).not.toContain(seen.water);
    // On screen both parents stayed, for about the rig's 5/12 s, and then were gone for good.
    const withGhosts = seen.frames.filter((f) => f.ghosts > 0);
    expect(withGhosts.length).toBeGreaterThan(2);
    expect(Math.max(...seen.frames.map((f) => f.ghosts))).toBe(2);
    const lasted = withGhosts.at(-1)!.ms - withGhosts[0]!.ms;
    expect(lasted).toBeGreaterThan(150);
    expect(lasted).toBeLessThan(900);
    expect(seen.frames.at(-1)!.ghosts).toBe(0);
    // The child played its fusion birth (not the Garden's spawn), stretched as it came up,
    // and then went about its day at its own size.
    const clips = seen.frames.map((f) => f.clip).filter(Boolean);
    expect(clips[0]).toBe('fusion_child');
    expect(clips).not.toContain('spawn');
    expect(Math.max(...seen.frames.map((f) => f.childScaleY ?? 1))).toBeGreaterThan(1.1);
    expect(seen.frames.at(-1)!.clip).not.toBe('fusion_child');
    expect(seen.frames.at(-1)!.childScaleY).toBeCloseTo(1, 1);
    expect(errors).toEqual([]);
  });

  test('reduced motion: a fusion’s parents vanish at once and the child is simply there', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    await page.evaluate((t) => window.__PK__!.debugKnow!(t), 'firefighter');
    const seen = await page.evaluate(async () => {
      const pk = window.__PK__!;
      const plain = pk.debugAdd!('plain', 1300, 3300, { body: 'round', scale: 1 });
      const box = pk.kids().find((k) => k.id === plain)!.box;
      pk.debugAdd!('water', 1300 + (box.right - box.left) + 2, 3300, { body: 'round', scale: 1 });
      let ghosts = 0;
      const scales: number[] = [];
      const start = performance.now();
      while (performance.now() - start < 1200) {
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        ghosts = Math.max(ghosts, pk.ghosts!());
        const child = pk.kids().find((k) => k.type === 'firefighter');
        if (child) scales.push(pk.drawnOf!(child.id)?.scale[1] ?? 1);
      }
      return { ghosts, scales, types: pk.kids().map((k) => k.type) };
    });
    expect(seen.types).toEqual(['firefighter']);
    expect(seen.ghosts).toBe(0);
    expect(seen.scales.length).toBeGreaterThan(0);
    for (const s of seen.scales) expect(s).toBe(1);
    expect(errors).toEqual([]);
  });

  test('motion marks show at the zoom the map opens at and closer, and hide when zoomed out (D-100)', async ({ page }) => {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    const id = await page.evaluate(() => {
      const pk = window.__PK__!;
      const kid = pk.debugAdd!('plain', 1300, 3300, { body: 'round', scale: 1 });
      pk.centerOn(1300, 3200);
      // Held on a frame of sleep with all three z's showing.
      pk.debugPose!(kid, 'sleep', 2);
      return kid;
    });
    const marks = () => page.evaluate((k) => window.__PK__!.drawnOf!(k)?.marks ?? -1, id);
    await expect.poll(marks).toBe(3);
    const zoom = () => page.evaluate(() => window.__PK__!.zoom());
    const opened = await zoom();
    const at = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
    // Zoom out a step (the wheel, over the map): the marks go.
    await page.mouse.move(at.x, at.y + 120);
    await page.mouse.wheel(0, 300);
    await expect.poll(zoom).toBeLessThan(opened);
    await expect.poll(marks).toBe(0);
    // Back in, past where it opened: they return.
    await page.mouse.wheel(0, -600);
    await expect.poll(zoom).toBeGreaterThan(opened);
    await expect.poll(marks).toBe(3);
    expect(errors).toEqual([]);
  });

  test('a kid put down squashes as it lands and settles at its own size; the walk rocks it', async ({ page }) => {
    const errors = await boot(page, '?seed=3&debug=1&calm=1');
    const id = await page.evaluate(() => {
      const pk = window.__PK__!;
      const kid = pk.debugAdd!('plain', 1300, 3300, { body: 'round', scale: 1 });
      pk.centerOn(1300, 3200);
      return kid;
    });
    await page.waitForTimeout(200);
    const from = await page.evaluate((k) => window.__PK__!.screenPointOf(k)!, id);
    await page.mouse.move(from.x, from.y - 20);
    await page.mouse.down();
    await page.mouse.move(from.x + 60, from.y + 40, { steps: 6 });
    // Sample from before the release, in the page, so no frame of the landing is missed.
    const sampling = page.evaluate(async (k) => {
      const pk = window.__PK__!;
      const out: { clip: string | undefined; sy: number; sx: number }[] = [];
      const start = performance.now();
      while (performance.now() - start < 1600) {
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        const d = pk.drawnOf!(k);
        if (d) out.push({ clip: pk.presentationOf(k)?.clip, sy: d.scale[1], sx: d.scale[0] });
      }
      return out;
    }, id);
    await page.waitForTimeout(250);
    await page.mouse.up();
    const frames = await sampling;
    const drop = frames.filter((f) => f.clip === 'drop');
    expect(drop.length).toBeGreaterThan(2);
    expect(Math.min(...drop.map((f) => f.sy))).toBeLessThan(0.9);
    expect(Math.max(...drop.map((f) => f.sx))).toBeGreaterThan(1.05);
    // Afterwards it is back to its own proportions (the idle breathes by under 2 %).
    const after = frames.at(-1)!;
    expect(after.clip).not.toBe('drop');
    expect(Math.abs(after.sy - 1)).toBeLessThan(0.03);
    // Posed on a walk frame, the body leans: the waddle, not a foot swap alone.
    const lean = await page.evaluate(async (k) => {
      const pk = window.__PK__!;
      pk.debugPose!(k, 'walk', 1 / 12);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
      const d = pk.drawnOf!(k)!;
      pk.debugPose!(k, null);
      return { rotation: d.rotation, body: d.body };
    }, id);
    expect(Math.abs(lean.rotation)).toBeGreaterThan(2);
    expect(lean.body).toBe('kid_body_round_step_left');
    expect(errors).toEqual([]);
  });
});
