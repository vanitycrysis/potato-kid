# Session handoff (2026-10-29, for the next Claude session)

**To start:** tell Claude "Resume from docs/HANDOFF.md". Read this first, then `CLAUDE.md`, `docs/PROJECT_BRIEF.md` ("Current arrangement"), `docs/DECISIONS.md` (especially **D-085..D-095**), `docs/TASKS.md`, and `docs/GUI_MVP.md` §27 (Codex's ROUND4-DESIGN).

**If a session ends abruptly**, the state can be rebuilt without this file: `gh pr list` (open PRs), each PR's last comment (the last Codex round posted), `git log` of each `claude/` worktree, and the Codex plugin's job results in `~/.claude/plugins/data/codex-openai-codex/state/<worktree>/jobs/*.json`. A review that finished but was never posted is there.

## Where we are

- **`main` has all of the owner's fourth gate-4 round (D-085..D-095).** Merged:
  - TOP-EDGE-TAP (#110), HAPPY-SUN (#111), ROUND4-ART (#112, Codex), ROUND4-DESIGN (#113, Codex);
  - NAME-TOGGLE (#114), TAP-HARVEST (#115), FARM-ANIM (#118);
  - SPARKLE-ANIM (#116: portraits, 6 Codex rounds) and SPARKLE-MAP (#119: the map too, D-095, the owner's call);
  - NEW-KID-POPUP (#117, 7 rounds), TUTORIAL-SPLIT (#120, 6 rounds), DECORATIONS (#121, 8 rounds);
  - CI-POPUP-TIMING (#122): two popup tests timed in the page, since CI was red on `main` after #117.
  - CI-BENCH-EDGE (#124): the full-bench decorations test (#121) dropped a kid inside the 56 px edge-scroll zone, so the map panned by timing and the next drop missed the bench (a timeout on #123's CI).
- **Next: the fourth gate-4 build for the owner**, once `main`'s CI is green. Builds go out as CI artifacts (D-060): the web zip and the debug APK from the run on `main`.
- **Codex has no open design task.** TROPHY-MAP (D-064) and ANIM-POLISH wait until after gate 4.
- **Full access, no permission questions** (memory file `no-permission-asks`), but still stop at owner gates and real design choices.
- **Force-pushing `claude/` branches is approved** (D-093, `--force-with-lease`), never `main` or `chatgpt/`.

## Open work at handoff

1. **The owner's feedback on the fourth gate-4 build.**
2. **Notes for Codex (art, minor):** the picnic blanket's bottom-edge marks read a little like legs. The kid card's line for a decoration's happiness ("From a decoration: no planting bonus.") is Claude's wording; Codex may want its own.
3. **Earlier polish notes** (owner's polish pass, not now): Seashell Kid reads closer to a teapot at 55 px; the farm and map paths are quite rectilinear; Water's wiggle hood is the weakest case.

**What to try (fourth round):**

- A new save: three welcome cards. Then, after the first fusion discovery, one quiet lesson note at a time as each mechanic becomes affordable. Replay any of them from Notebook → Settings or the Icon guide → Replay tutorial.
- New kinds: a big waving popup ("… wandered in!", "… sprouted!"); after a long absence, one per new kind before the summary.
- A ripe plot glows; tap it to meet the sprout (popup).
- Farming kids stomp.
- Settings → Show nicknames on the map.
- The Happy sun sits top right.
- Rare sparkles move on cards, lists and the map.
- Drop a kid on a bench, the bird bath, the pond, the sitting log or the picnic blanket; kids also go there on their own.
- A kid at the very top of the screen opens its card.

## Decisions I made this session (engine and UI rules are Claude's)

- **Presentation queue (#117):** arrivals and return summaries waiting live in the game state (`presentation`, schema 11), saved with the births they show. Acknowledging one saves. The save after a fusion/purchase runs as a step listener after the HUD's.
- **Lessons (#120):** `GameState.lessons` (schema 12). A save from before adopts them from the old tutorial record and its own evidence. Notes are evaluated after each step, at load, and four times a second.
- **Decorations (#121, rules in D-090):** a visit is the kid's activity (schema 13). The numbers:
  - ×1.25 happiness for 10 min, never over a food's, no planting bonus (`plantsHappy`);
  - one walker in five that stops sets off for a slot within 700 units;
  - 20 s to get there, a stay of 30–75 s, then a 180 s cooldown;
  - a slot is offered only if the kid's box there clears every grounded kid (`seatClear`).
- **Map sparkle (#119, D-095):** the map sleeve plays the portrait's §27.7 loop in place of its old opacity breathing.

## How we work (D-027, D-035, D-036: owner instructions)

- The owner talks only to Claude. **Codex fills the ChatGPT role** and always runs on `gpt-6.1-sol` at high effort.
- **Claude does no art at all** (D-036): no drawing, no placeholders, no visual design choices. Codex does all art and interaction design; Claude reviews it and owns the export pipeline and the engine.
- **Codex tasks:** write a prompt file (in the session scratchpad), then run
  `node "C:/Users/Adria/.claude/plugins/cache/openai-codex/codex/1.0.6/scripts/codex-companion.mjs" task --write --model gpt-6.1-sol --effort high --cwd "C:/Users/Adria/potato-kid-chatgpt" --prompt-file <file>`
  with `run_in_background`. Include the task's `TASKS.md` entry. For review rounds, append Claude's PR review verbatim.
- **Codex's worktree** is `C:\Users\Adria\potato-kid-chatgpt` (`chatgpt/` branches). Its sandbox has **no git and no network**: Claude commits its files unchanged with `git -c user.name=ChatGPT -c user.email=noreply@openai.com commit` and pushes.
- **Codex reviews** of every Claude PR, before merging:
  - in a review worktree (`../potato-kid-review-82`, `-83` or `-84`; each has `node_modules`): `git fetch origin && git checkout --detach origin/<branch>`; or, if it is gone, `git worktree add --detach ../potato-kid-review-N <branch>`, then `npm ci` in it;
  - `node .../codex-companion.mjs review --wait --model gpt-6.1-sol --cwd <that dir> --base origin/main --scope branch`;
  - post the output to the PR verbatim, labelled as Codex's, then a reply per finding;
  - merge only after a clean Codex round **and** green CI.
- **Codex reviews are rigorous:** most rounds find real edge cases. **Mutation-check every regression test** (break the fix; the test must fail). Each session's scratchpad is new: write a small Python runner that applies each mutant, runs `tsc` and then `vitest` (or `npm run build` and a `playwright test -g` filter), restores the file in `finally`, and reports KILLED or SURVIVED. Run subprocesses with `encoding='utf-8', errors='replace'`, or Windows' cp1252 decoding crashes the reader threads.
- **Art review:** judge at true game size (about 55 CSS px) in colour and grayscale, and in-engine after import (`npm run art:preview`).
  - Batch lessons so far: no shared torso mark as the main read; nothing on or under the mouth line; no kid-in-a-vessel; no faint cues; no stereotype-adjacent shapes; no medical or weapon reads; check against everyday objects too.
  - Codex's art PRs are gated by Claude's review.

## The balance simulator (`npm run balance [seeds]`)

- It runs every scenario × seed in its own process, in parallel: 3 seeds take about 7 minutes.
- Scenarios: the first hour; casual (10 min every 3 h, 14 days); daily (30 min a day, 14 days).
- It reports wall-clock milestones, levels, income by day, plots, plantings and sprouts, and specials on the map against capacity.
- **Tuning runs side by side:** `PK_BALANCE='{"planting":{...}}'` merges over the balance one level deep, and `PK_SPECIALS=20` adds stand-in special kids (tier 5, in no recipe). Run each variant as **its own background command** with full paths; never share shell variables across `&`.
- **Never edit `src/`, or run mutation tests, while it runs.** Its worker processes load `src/` as they start, so a mutant can silently corrupt some seeds.

## Testing gotchas learned in the fourth round

- **Keep e2e drags out of the edge-scroll zone** (56 CSS px, `EDGE_ZONE` in `scene.ts`). A drag that ends there pans the map for as long as it lasts, so later screen positions depend on timing (#124). At the decorations tests' zoom, 500 world units from the screen's centre is already inside it.
- **CI's slower runners miss half-second animations.** Anything checked against a short clip (the popup's 500 ms wave) is sampled every frame inside the page, and a layout change is forced from the page (`debugArrivalLayout`), not with `setViewportSize` from the runner (#122).
- **A frame "while a command is pending" can be staged:** `debugHoldSteps(true)` stops sim steps while frames go on, so a test sees only the scene's preview (#121). Release it after.
- **Mutation-check with the real timing.** A test that sampled frames after a real tap passed with the bug too (the one wrong step fell between frames); and a tap held 150 ms didn't always reach the sim under 4 parallel workers. Wait for the sim state (`kids()[…].held`) rather than a fixed delay.
- **A closing sheet that is put aside must leave at once** (`Sheets.close(…, instant)`): one still fading when the return brings it back doubles every locator in it (#117).
- **TypeScript narrows `|| true` / `&& false` mutants** into compile errors. Mutate with something it can't see through (`kid.id < 0`, `box ? x : x`).
- Pinch-to-zoom and some layout tests flake under full-suite load; rerun and repeat them (`--repeat-each`) before suspecting a change.

## Testing gotchas learned this session

- **Codex's model can be "at capacity".** Retry with the same model (the owner's instruction is `gpt-6.1-sol`): a background loop that reruns the review every 5 minutes until the log has no "at capacity" works.
- **A tap is timed, so time it in the page.** Tests of 220 ms taps send their pointer events from `page.evaluate` (and wait for frames with `requestAnimationFrame`), never with Playwright's mouse and wall-clock waits, which CI stretches.
- **A closing sheet stays in the DOM while it fades.** Scope locators to `getByRole('dialog')`, or they match two titles.
- **Python heredocs and the Edit tool both turn `\uXXXX` into the character.** For code points in source, build them with `String.fromCodePoint(...)`.

- **The e2e preview server** (port 4173) is reused if running: it serves **this worktree's `dist/`**. Rebuild before every run, and don't test another worktree's code against it.
- A failing `tsc` makes `npm run build` fail and leaves a **stale `dist/`**. Read the build output before trusting test results.
- **Retrying assertions** (`toBeHidden`, `toBeEmpty`) pass on transient UI by waiting it out. Use sampled checks for "never shown".
- **Chrome makes a scrollable container with no focusable children a Tab stop.** Focus-trap tests must press Tab more than once.
- **Mutation harness:** restore the file even when the mutant fails to build. A harness that returns early stacks mutants (it happened this session). Each mutant must compile, or it tests nothing.
- `debugSaveStatus` now persists across saves (it used to be cleared by the next save).
- **Watch for flakes under parallel load:** run the full suite two or three times before calling a fix done. Two real bugs (a lazy-portrait race, the page-mode scroll clamp) showed up only that way.
- **Never chain a commit after a test run with `&&` plus pipes:** a piped `grep` succeeds even when the tests fail. Twice this session a broken or failing state was committed that way. Check results first, then commit.
- **Locators that match a hidden element's text pass** (`toContainText` ignores visibility). Sample `isVisible()` when what matters is whether something is shown.
- Headless Chromium starts an `AudioContext` without any user gesture, whatever the autoplay flag, so audio unlock can't be tested there.
- **CI runs about 3× slower than this machine,** and the Garden keeps spawning during tests. Anything timed against a short window (the 650 ms farewell, a row count) belongs in the page, inside a `requestAnimationFrame` loop, not in clicks from the test (PR #54). To stage frames below 10 fps, busy-wait in each frame (`slowFrames` in `smoke.spec.ts`).
- `a view change just before release restarts the dwell` (PR #50) timed out once in about 80 local runs and has never failed on CI. If it shows up again, look at it.

- **Reproduce a reported bug before fixing it.** A regression test that passes on the unfixed code tests nothing. It happened twice this session: the scenery case first needed the shipped body bounds; the crowd case first needed touching spacing (box 120 + gap ≤ 8).
- **Mutation runner** (`mutate.py` in the scratchpad):
  - open files with `newline=''`, or Windows rewrites LF as CRLF;
  - run build-plus-e2e mutants through a small bash script, not `cmd.exe` (which mangles quoted paths);
  - a surviving mutant can be *equivalent* (it changes nothing observable): say so rather than chase it.
- **Commit messages with double quotes** break `git commit -m "…"` in a chain. Use `git commit -F - <<'EOF'`.
- **A `SaveManager` saves only after it has loaded**, in tests too.
- **Codex's reviews can't see PR replies.** When a finding is resolved by process (for example "this PR won't merge alone"), make it structural (a draft, one combined PR), or the next round repeats the finding.
### Learned this session (2026-10-05, second)

- **The Bash tool fails on some heredocs with apostrophes** ("unexpected EOF while looking for matching `''`"). For multi-line patches, write a Python script or a TS fragment to the scratchpad with the Write tool, then run it.
- **Playwright emulates a Pixel 7** (mobile, touch), so `page.mouse.wheel` isn't delivered: dispatch a `WheelEvent` on the canvas. Multi-touch is tested by dispatching `PointerEvent`s with different `pointerId`s and `pointerType: 'touch'` in one `page.evaluate`.
- **A mutant must compile.** Replacing a line with a bare `continue;` can make the rest unreachable, which fails `tsc`, so the mutant tests nothing. Use an always-true condition instead.
- **No rare or special kids exist in the shipped content yet.** Tests use `?debug=1&rare=hero,lantern` (#84) to stand types in as rares. Unit tests add `{ id, tier, rare: true }` kids to a cloned content.
- **The kid card's tap is timing-sensitive in e2e.** Prefer sim-level checks (unit tests) or debug hooks, such as `kids()`, which now includes `held`.

### Learned this session (2026-10-09/10)

- **Two worktrees, two ports.** `potato-kid-claude` serves e2e on 4173; a second worktree (`potato-kid-hud`, with `node_modules`) runs at the same time with a temporary `pw4174.config.ts` (the same config, port 4174, `reuseExistingServer: false`). Never commit that file.
- **A failing `tsc` in a test file also fails `npm run build`, leaving a stale `dist/`.** It happened twice: "element not found" for new classes means rebuild first.
- **Shifting e2e coordinates:** literal positions moved with the Garden are fine, but an origin reference (`worldToScreen(0, 0)` used to convert to absolute world y) must not move. Codex caught one. Differences (lift, scale) are unaffected.
- **Bash heredocs turn `\n` into a real newline inside Python strings,** which breaks a script. Write mutation runners and multi-line patches with the Write tool.
- **A PR that removes an old path must ship its replacement** (Codex's P1 on #90: pantry feeding with no way to farm). Make it structural: a draft that carries the rest.
- **The sim answers a command before the next HUD frame,** so "a frame while pending" can't be staged in e2e. Design so it doesn't matter (update in place rather than rebuild on pending).
- **Codex reviews in rounds:** #87 took 6 rounds, #89 two, #88 two. Each found real things: a11y live regions, focus across rebuilds, page-mode scroll, content-sized observers.

### Learned this session (2026-10-10)

- **Codex finds a long tail on big UI PRs.** #90 took 16 rounds of one to five findings each, mostly stale-state and navigation edge cases. Expect it, and mutation-check every fix.
- **A test that passes without its fix tests nothing.** Twice this session a new e2e test passed with the bug in place. Revert the fix (or apply the mutant) and confirm the test fails before trusting it.
- **The sim steps on its own clock,** not every animation frame. A test that changes state and checks the result "two frames later" must wait for the state to change.
- **The balance run's children load `src/` as they start.** Do UI work in the second worktree while a balance run uses this one, or run the balance there.
- **The probe pitfall:** reloading in one page keeps the save in localStorage, so state from earlier iterations leaks into later ones.

### Learned this session (2026-10-18)

- **The mutation runner must rebuild after restoring.** It restored `src/` but left `dist/` built from the last mutant, so the next e2e run tested mutant code. `mutate.py` now runs `npm run build` in its `finally`. It also takes several `old|||old2` / `new|||new2` edits for a mutant that needs two changes.
- **Never rebuild a worktree while its e2e suite runs:** the preview server serves that `dist/`, so the running suite's results are void. It happened once this session.
- **Resolving a CSS conflict as "keep both" can cut a block open.** A merge left the tutorial's `@media` block unclosed, which swallowed main's recipe-window styles. After any CSS conflict, check the brace balance (strip comments, count `{` and `}`).
- **`scrollIntoViewIfNeeded` scrolls even an `overflow: hidden` box,** so "Next is reachable" passes on a clipped card. Check `overflowY` and `scrollHeight > clientHeight` for user scrollability.
- **Quick taps belong in one page task.** Down, up and click as three `evaluate` calls took longer than the 450 ms hold on CI, so the tap named an icon instead of opening it.
- **A mutant that survives may be equivalent through the browser:** hiding a bubble blurs its focused Close, which already hid the name, so the extra hiding line was removed rather than tested.

## Housekeeping

- **Worktrees** (each with `node_modules` unless noted; each has an untracked `pw41xx.config.ts` for its own e2e port, never committed):
  - `potato-kid-claude`: Claude's main checkout (port 4173); switch to `main`.
  - `potato-kid-hud` (4174), `potato-kid-tut` (4176), `potato-kid-tier` (4175): second checkouts, on the merged `claude/icon-hud`, `claude/tutorial` and `claude/drag-hover`.
  - `potato-kid-chatgpt` and `potato-kid-chatgpt-map`: Codex's worktrees (`chatgpt/round3-design`, `chatgpt/map-half`, both merged).
  - `potato-kid-review-50`, `-82`, `-83`, `-84`: Codex review worktrees (no `node_modules` except `-50`); check one out per review with `git fetch origin && git checkout --detach origin/<branch>`.
  - `potato-kid-docs`: docs branches.
- **Leftover folders** of old worktrees are still locked by stale Codex processes from 2026-10-02; the owner was told how to end them.
- **Merged remote branches** were never deleted. That's harmless.
- **Gate captures** live outside the repo, in `C:\Users\Adria\potato-kid-gate2\` and `-gate3\`.
- **GitHub:** `gh` (authenticated) for PRs and comments; it sometimes returns HTTP 503, so retry a merge after a few seconds.
