import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

// Art review captures through the real engine (docs/ART.md): each type named in PK_REVIEW
// (comma-separated ids) on every body with every face, at game size, in colour and grey.
//   PK_REVIEW=wizard,bee npx playwright test -c playwright.preview.config.ts review.spec
// Output: PK_REVIEW_OUT, or .review/ (not tracked).
const OUT = process.env.PK_REVIEW_OUT ?? '.review';
const types = (process.env.PK_REVIEW ?? '').split(',').map((t) => t.trim()).filter(Boolean);
const rig = JSON.parse(readFileSync('assets/data/kid_rig_v2.json', 'utf8')) as {
  appearance: { bodyWeights: Record<string, number>; faceWeights: Record<string, number> };
};
const bodies = Object.keys(rig.appearance.bodyWeights);
const faces = Object.keys(rig.appearance.faceWeights);

/** A patch of the v5 map where the grid stands clear of scenery (as in ingame.spec.ts). */
const GRID = { x: 1100, y: 3000 };

test.skip(types.length === 0, 'set PK_REVIEW to the type ids to capture');

for (const type of types) {
  test(`review: ${type} on every body with every face`, async ({ browser }) => {
    mkdirSync(OUT, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 3 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?seed=34&debug=1&calm=1');
    await page.waitForFunction(() => window.__PK__?.ready === true);
    // One type per capture: two different types side by side could be a recipe and fuse.
    const placed = await page.evaluate(
      ([t, b, f, g]) => {
        window.__PK__!.centerOn(g.x + 315, g.y + 300);
        const ids: number[] = [];
        f.forEach((face, row) => b.forEach((body, col) => ids.push(window.__PK__!.debugAdd!(t, g.x + col * 210, g.y + row * 260, { body, face, scale: 1 }))));
        return ids.length;
      },
      [type, bodies, faces, GRID] as const,
    );
    expect(placed).toBe(bodies.length * faces.length);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/${type}.png` });
    await page.addStyleTag({ content: 'html{filter:grayscale(1)}' });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${OUT}/${type}-gray.png` });
    expect(errors).toEqual([]);
  });
}
