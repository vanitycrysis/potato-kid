# Testing

How the tests are laid out, how to run them, how CI runs them, and what has gone wrong before.

## The suites

| Suite | Where | Run with | What it covers |
|---|---|---|---|
| Unit | `src/**/*.test.ts` (Vitest) | `npm test` | The sim, content, save, render helpers and UI logic |
| End to end | `tests/e2e/*.spec.ts` (Playwright, Pixel 7 profile) | `npm run e2e` | The built app in Chromium, driven through the `?debug=1` hooks (`window.__PK__`) |
| Art checks | `scripts/export-art.mjs` | `npm run art:check` | Every art source against the asset contract |
| Costume checks | `scripts/check-kids.mjs` | `npm run art:kids` | Each checked costume in every body and pose: inside the lifetime box, held props on the arm, joined parts touching, the face clear (`-- --all` reports on the whole roster). And for every kid, always: each frame of the clips it lives in stays inside its box plus the motion margin |
| Motion data | `scripts/build-motion.mjs` | `npm run motion:check` | `art/data/kid_motion_v1.json` is what `art/motion/*.mjs` bake to (`npm run motion:build` writes it) |
| Art previews | `tests/preview/` | see `docs/ART.md` | Review captures through the real engine. Not part of CI |

## End-to-end layout

One spec file per area, with shared helpers in `tests/e2e/helpers.ts` (`boot`, `openTool`, `frames`, `dropOnto`, and prices computed from `balance.json`).

- A file's tests run in order in one worker. Files run side by side.
- Locally the suite uses four workers and takes about six minutes. If a test fails only in a full run, re-run its file alone, and repeat it (`--repeat-each=5`), before treating the failure as real: a few tests are sensitive to a loaded machine.
- `npm run e2e` builds first. `npx playwright test` does not: it tests whatever is in `dist/`.
- Put a new test in the file for its area. Start a new file only for a new area, and keep files under about 700 lines so the CI shards stay even.

## CI

`.github/workflows/ci.yml` runs five kinds of job side by side on every pull request and on every push to `main`. A run takes about eight minutes.

- `check`: typecheck, lint, unit tests, build.
- `e2e`: six runners, each taking one sixth of the spec files (`--shard=N/6`) with one worker.
- `art`: `npm run motion:check`, `npm run art:check` and `npm run art:kids`.
- `android`: the debug APK.
- `ci`: passes only when all of the above passed.

`ci` is the required check on `main` (branch protection, with "branch must be up to date", admins included). A pull request cannot merge until `ci` is green on a commit that contains the current `main`. Merge with `gh pr merge <number> --merge`; a direct push to `main` is refused. If only `android` fails with Maven "Could not find" errors, that has been transient: `gh run rerun <id> --failed`.

## Writing an end-to-end test

**Where kids stand.** With `?debug=1&calm=1` nothing wanders and no kid starts on the map; `debugAdd(type, x, y, look)` places one. Scenery moves a kid as it is placed if its box does not fit, sometimes onto a recipe partner, which then fuses.

- A patch of the map is clear of scenery: x from 1100 to about 2000, y from 2800 to about 4400. A 5 × 4 grid at 216 × 260 fits anywhere in it. Stand grids and crowds there, and check that every kid is where it was put.
- `boot` centres the camera on (996, 2828), beside the Garden. Re-centre with `centerOn` when the test stands kids elsewhere.
- Boxes come from the art. When the art's boxes change (the motion margin made them wider), tests that pack kids tightly near scenery are the ones that break.

**Timing.** CI runs about three times slower than a desktop, and the sim steps on its own 10 Hz clock, not every frame.

- Anything timed against a short window (a 220 ms tap, a half-second clip, a fusion's ghosts) is sampled inside the page, in a `requestAnimationFrame` loop within one `page.evaluate`. Clicks and waits from the test runner stretch.
- Wait for the state to change (`expect.poll` on `kids()`), never for "two frames".
- `debugHoldSteps(true)` stops sim steps while frames go on, to see only the scene's preview. Release it after.
- `debugPose(kidId, clip, seconds)` holds a kid on a clip frame; `drawnOf(kidId)` reports what its view draws (offset, scale, rotation, body and face frames, marks); `ghosts()` counts fusion parents still on screen.

**Dragging.** A drag that ends within 56 CSS px of the screen's edge scrolls the map for as long as it lasts (`EDGE_ZONE` in `scene.ts`), so later screen positions depend on timing. Keep drags in the middle. A held kid floats above the finger: aim the finger below the target's feet (`dropOnto` does).

**Locators.** A closing sheet stays in the DOM while it fades: scope to `getByRole('dialog')`. `toContainText` ignores visibility, and retrying assertions (`toBeHidden`) pass on something that shows briefly: for "never shown", sample `isVisible()` in the page.

**Touch.** The profile is a touch device. Multi-touch is tested by dispatching `PointerEvent`s with different `pointerId`s in one `page.evaluate`.

**Saves in tests.** A `SaveManager` saves only after it has loaded. Reloading a page keeps its save in localStorage, so state leaks between iterations of a probe: use a fresh page.

## Mutation-checking

Every new test is checked by breaking the code it guards: the test must fail. Each session writes a small runner (Python, in the scratchpad) that, for each mutant, applies one text replacement, runs `tsc`, then the test (`vitest run <file>`, or `npm run build` and `playwright test <file>`), and restores the file in a `finally`.

- A mutant must compile, or it tests nothing. TypeScript narrows `|| true` and `&& false` into errors: mutate with something it cannot see through.
- Restore the file even when the mutant fails to build, and rebuild after the last end-to-end mutant, or `dist/` keeps the mutant.
- A mutant that survives may be equivalent (it changes nothing observable). Then the guarded line is redundant: remove it, or say so.
- Never rebuild, or edit `src/`, while an end-to-end run or the balance simulator is using this checkout.

## Known soft spots

- Pinch-to-zoom and a few layout tests can fail under full-suite load and pass alone.
- `away.spec.ts` ("after three hours away…") failed once with six local workers and passes with four.
- Headless Chromium starts an `AudioContext` without a user gesture, so audio unlock cannot be tested there.
