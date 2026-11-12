import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { boot } from './helpers';

test.describe('the world lives on while away (D-053)', () => {
  const recipes = new Set(
    (JSON.parse(readFileSync('src/content/recipes.json', 'utf8')) as { a: string; b: string }[]).flatMap((r) => [`${r.a}+${r.b}`, `${r.b}+${r.a}`]),
  );
  const slack = (JSON.parse(readFileSync('src/content/balance.json', 'utf8')) as { body: { touchSlack: number } }).body.touchSlack;

  test('after three hours away, kids are found elsewhere, drawn where they are, and no recipe pair touches', async ({ page }) => {
    const errors = await boot(page, '?seed=3&debug=1');
    // A tight block of recipe partners (plain, water, fire, snow), touching. They're placed
    // and the app leaves in one go, before any frame: online they would fuse at once.
    const { placed, before, out } = await page.evaluate(async () => {
      const pk = window.__PK__!;
      const look = { body: 'round', scale: 1 };
      const first = pk.debugAdd!('plain', 756, 2728, look);
      const box = pk.kids().find((k) => k.id === first)!.box;
      const ids = [first];
      for (let i = 1; i < 12; i++) {
        const [x, y] = [756 + (i % 4) * (box.right - box.left + 4), 2728 + Math.floor(i / 4) * (box.bottom - box.top + 4)];
        ids.push(pk.debugAdd!(['plain', 'water', 'fire', 'snow'][i % 4]!, x, y, look));
      }
      const before = pk.kids();
      await pk.debugAway!(3 * 3600 * 1000);
      // The first frames after the return (two, so the renderer's own tick has run): every
      // kid is drawn where the sim has it.
      for (let i = 0; i < 2; i++) await new Promise((r) => requestAnimationFrame(() => r(null)));
      const kids = pk.kids();
      const off = kids.map((k) => {
        const drawn = pk.screenPointOf(k.id);
        const at = pk.worldToScreen(k.x, k.y);
        return drawn ? Math.hypot(drawn.x - at.x, drawn.y - at.y) : 0;
      });
      return { placed: ids, before, out: { kids, off, spawned: pk.lastOffline()!.spawned.length } };
    });
    // Nobody fused on the way back: everyone is still here, plus the arrivals.
    expect(out.kids).toHaveLength(before.length + out.spawned);
    for (const id of placed) expect(out.kids.some((k) => k.id === id)).toBe(true);
    // They wandered: on average far from where they were left.
    const moved = placed.map((id) => {
      const [a, b] = [before.find((k) => k.id === id)!, out.kids.find((k) => k.id === id)!];
      return Math.hypot(a.x - b.x, a.y - b.y);
    });
    expect(moved.reduce((s, d) => s + d, 0) / moved.length).toBeGreaterThan(300);
    // Drawn where they are, not sliding over from where they were (a frame of walking aside).
    expect(Math.max(...out.off)).toBeLessThan(5);
    // No recipe pair touching (the sim's rule: overlapping, or within slack on one axis).
    const rect = (k: (typeof out.kids)[number]) => ({ l: k.x + k.box.left, t: k.y + k.box.top, r: k.x + k.box.right, b: k.y + k.box.bottom });
    for (let i = 0; i < out.kids.length; i++) {
      for (let j = i + 1; j < out.kids.length; j++) {
        const [a, b] = [out.kids[i]!, out.kids[j]!];
        if (!recipes.has(`${a.type}+${b.type}`)) continue;
        const [p, q] = [rect(a), rect(b)];
        const dx = Math.max(p.l - q.r, q.l - p.r);
        const dy = Math.max(p.t - q.b, q.t - p.b);
        const touches = (dx < 0 && dy < 0) || (dx <= slack && dy <= 0) || (dy <= slack && dx <= 0);
        expect(touches, `${a.type} ${a.id} touches ${b.type} ${b.id}`).toBe(false);
      }
    }
    expect(errors).toEqual([]);
  });
});

test('a plot that ripens while away waits; tapped on return, its kid is drawn like any arrival (Codex review, PR #72; D-088)', async ({ page }) => {
  const errors = await boot(page, '?seed=3&debug=1&calm=1');
  const sprouted = await page.evaluate(async () => {
    const pk = window.__PK__!;
    const ids = [pk.debugAdd!('plain', 706, 3228), pk.debugAdd!('fire', 1056, 3228), pk.debugAdd!('snow', 1406, 3228)];
    for (const id of ids) pk.debugCommand!({ type: 'plant', kidIds: [id] });
    await pk.debugAway!(0); // a step: the three are planted
    pk.debugCommand!({ type: 'startGrowing', plot: 0 });
    await pk.debugAway!(0); // a step: it starts growing
    await pk.debugAway!(2 * 3600 * 1000); // long enough to ripen
    return { waiting: pk.plots()[0]!.state, before: pk.kids().map((k) => k.id) };
  });
  expect(sprouted.waiting).toBe('ready');
  await page.evaluate(() => window.__PK__!.debugCommand!({ type: 'harvest', plot: 0 }));
  await expect.poll(() => page.evaluate(() => window.__PK__!.plots()[0]!.state)).toBe('empty');
  await page.waitForTimeout(100);
  const born = await page.evaluate((old) => window.__PK__!.kids().filter((k) => !old.includes(k.id)).map((k) => ({ id: k.id, drawn: !!window.__PK__!.screenPointOf(k.id) })), sprouted.before);
  expect(born).toHaveLength(1);
  expect(born[0]!.drawn).toBe(true);
  expect(errors).toEqual([]);
});

test('starting a plot growing is saved at once, with its decided sprout (Codex review, PR #72)', async ({ page }) => {
  const errors = await boot(page, '?seed=3&debug=1&calm=1');
  /** The newest save's plot 0, as stored. */
  const savedPlot = () =>
    page.evaluate(() => {
      const recs = ['slotA', 'slotB'].map((s) => localStorage.getItem(`CapacitorStorage.potato-kid/${s}`)).flatMap((r) => (r ? [JSON.parse(r)] : []));
      const newest = recs.sort((a, b) => b.revision - a.revision)[0];
      return newest?.state?.plots?.[0]?.seed ?? null;
    });
  await page.evaluate(() => {
    const pk = window.__PK__!;
    for (const [t, x] of [['plain', 706], ['fire', 1056], ['snow', 1406]] as const) pk.debugCommand!({ type: 'plant', kidIds: [pk.debugAdd!(t, x, 3228)] });
  });
  // Planting saves at once too, with the sprout still undecided.
  await expect.poll(async () => (await savedPlot())?.planted?.length, { timeout: 3000 }).toBe(3);
  expect((await savedPlot()).sprout).toBeNull();
  await page.evaluate(() => window.__PK__!.debugCommand!({ type: 'startGrowing', plot: 0 }));
  // Well inside the 10 s periodic save: only the immediate save can have stored it.
  await expect.poll(async () => (await savedPlot())?.sprout?.type ?? null, { timeout: 1500 }).not.toBeNull();
  // Cancelling it is saved at once too, or a crash could bring the growing back (Codex review, PR #82).
  await page.evaluate(() => window.__PK__!.debugCommand!({ type: 'emptyPlot', plot: 0 }));
  await expect.poll(savedPlot, { timeout: 1500 }).toBeNull();
  expect(errors).toEqual([]);
});
