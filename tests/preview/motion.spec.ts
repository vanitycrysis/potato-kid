import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

// Animation review strips through the real engine (docs/ART.md): each clip named in PK_MOTION
// laid out frame by frame, left to right and top to bottom, on one kind of kid.
//   PK_MOTION=walk,drop PK_TYPE=wizard PK_BODY=round npx playwright test -c playwright.preview.config.ts motion.spec
// A name of the form habit:<type> shows that kid's own habit on that kid. Clips longer than
// twenty frames are sampled evenly. Output: PK_REVIEW_OUT, or .review/ (not tracked).
const OUT = process.env.PK_REVIEW_OUT ?? '.review';
const clips = (process.env.PK_MOTION ?? '').split(',').map((t) => t.trim()).filter(Boolean);
const TYPE = process.env.PK_TYPE ?? 'plain';
const BODY = process.env.PK_BODY ?? 'round';
const motion = JSON.parse(readFileSync('assets/data/kid_motion_v1.json', 'utf8')) as { fps: number; clips: Record<string, { frames: unknown[] }>; habits: Record<string, string> };
/** A patch of the v5 map where a 5 x 4 grid stands clear of scenery (as in ingame.spec.ts). */
const GRID = { x: 1100, y: 3000 };
const CELLS = 20;

test.skip(clips.length === 0, 'set PK_MOTION to the clip names to capture');

for (const name of clips) {
  const habitOf = name.startsWith('habit:') ? name.slice(6) : undefined;
  const type = habitOf ?? TYPE;
  const clip = habitOf ? motion.habits[habitOf] : name;
  test(`motion: ${name}, frame by frame`, async ({ browser }) => {
    expect(clip, `no clip for ${name}`).toBeTruthy();
    const total = motion.clips[clip!]!.frames.length;
    const shown = Math.min(CELLS, total);
    // Evenly through the clip, first and last frames included.
    const frames = Array.from({ length: shown }, (_, i) => (shown === total ? i : Math.round((i * (total - 1)) / (shown - 1))));
    mkdirSync(OUT, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 3 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?seed=34&debug=1&calm=1');
    await page.waitForFunction(() => window.__PK__?.ready === true);
    await page.evaluate(
      ({ type, body, clip, frames, fps, g }) => {
        const pk = window.__PK__!;
        pk.centerOn(g.x + 432, g.y + 300);
        frames.forEach((f, i) => {
          const id = pk.debugAdd!(type, g.x + (i % 5) * 216, g.y + Math.floor(i / 5) * 260, { body, face: 'classic', scale: 1 });
          pk.debugPose!(id, clip, f / fps);
        });
      },
      { type, body: BODY, clip: clip!, frames, fps: motion.fps, g: GRID },
    );
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/motion-${name.replace(':', '-')}-${type}-${BODY}.png` });
    expect(errors).toEqual([]);
  });
}
