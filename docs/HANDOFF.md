# Session handoff (2026-10-18, for the next Claude session)

**To start:** tell Claude "Resume from docs/HANDOFF.md". Read this first, then `CLAUDE.md`, `docs/PROJECT_BRIEF.md` ("Current arrangement"), `docs/DECISIONS.md` (especially **D-075..D-084**), `docs/TASKS.md`, and `docs/GUI_MVP.md` §§23–26 (Codex's ROUND3-DESIGN).

**If a session ends abruptly**, the state can be rebuilt without this file: `gh pr list` (open PRs), each PR's last comment (the last Codex round posted), `git log` of each `claude/` worktree, and the Codex plugin's job results in `~/.claude/plugins/data/codex-openai-codex/state/<worktree>/jobs/*.json`. A review that finished but was never posted is there. That is how the 2026-10-14 shutdown was recovered on 2026-10-18.

## Where we are

- **`main` has all of the owner's third gate-4 round (D-075..D-084).** Merged:
  - MAP-HALF (#102), OFFLINE-UNCAPPED (#101), ROUND3-DESIGN (#100, Codex), DRAG-HOVER (#103), TIER-NAMES (#104);
  - SPROUT-OVERFLOW (#106, D-084), ICON-HUD (#105, 11 Codex rounds), TUTORIAL (#107, 5 Codex rounds).
- **The gate-4 build is with the owner** (third round, sent 2026-10-18). Wait for their feedback; turn each point into a decision in `DECISIONS.md` and a `TASKS.md` row before building.
- **Codex has no open design task.** TROPHY-MAP (D-064) and ANIM-POLISH wait until after gate 4.
- **Full access, no permission questions** (memory file `no-permission-asks`), but still stop at owner gates and real design choices.
- **Force pushes are blocked** by the auto-mode classifier. To bring a pushed branch up to date, merge `main` into it (a fast-forward push), don't rebase.

## Open work at handoff

1. **The owner's gate-4 feedback** on the third-round build (what to try is in the chat message and below).
2. **Small follow-ups (not blocking):**
   - The 96 px rare card portrait's sparkle envelope (GUI_MVP §16.2).
   - The drawn-position obstacle source and the drag's captured food have no killing tests (explained in #90).
3. **Polish notes** (owner's polish pass, not now): Seashell Kid reads closer to a teapot at 55 px; the farm and map paths are quite rectilinear; Water's wiggle hood is the weakest case.

**What to try (third round):** the half-size map; the icon HUD (tap a chip for its bubble; hold a tray icon for its name; Notebook → Icon guide); the first-run tutorial (it opens once on the first launch after updating, even with an existing save; replay from Settings or the Icon guide); a long absence (no offline cap); the Special and Rare badges; dragging a kid over others (it floats; a partner is marked; the recipe window); a ripe plot on a full map (its sprout still comes up).

## Decisions I made this session (engine and UI rules are Claude's)

- **ICON-HUD (#105):** the centred 156 px tray is clamped inside ML…W−MR (`left: clamp(...)`, no transform). The name bubble's Close names itself like the tray icons (hover, focus, 450 ms hold), just below the ×.
- **TUTORIAL (#107):** the HUD's measure pass calls `tutorial.relayout()` after its own layout (no separate resize listener). It also sets `--ui-banner` (the banner's height + 8), which the card's max height subtracts. A compact column is `justify-content: safe center`. Each page starts scrolled to its top.

## How we work (D-027, D-035, D-036: owner instructions)

- The owner talks only to Claude. **Codex fills the ChatGPT role** and always runs on `gpt-6.1-sol` at high effort.
- **Claude does no art at all** (D-036): no drawing, no placeholders, no visual design choices. Codex does all art and interaction design; Claude reviews it and owns the export pipeline and the engine.
- **Codex tasks:** write a prompt file (in the session scratchpad), then run
  `node "C:/Users/Adria/.claude/plugins/cache/openai-codex/codex/1.0.6/scripts/codex-companion.mjs" task --write --model gpt-6.1-sol --effort high --cwd "C:/Users/Adria/potato-kid-chatgpt" --prompt-file <file>`
  with `run_in_background`. Include the task's `TASKS.md` entry. For review rounds, append Claude's PR review verbatim.
- **Codex's worktree** is `C:\Users\Adria\potato-kid-chatgpt` (`chatgpt/` branches). Its sandbox has **no git and no network**: Claude commits its files unchanged with `git -c user.name=ChatGPT -c user.email=noreply@openai.com commit` and pushes.
- **Codex reviews** of every Claude PR, before merging:
  - in the review worktree `../potato-kid-review-50` (it has `node_modules`): `git fetch origin && git checkout --detach origin/<branch>`; or, if it is gone, `git worktree add --detach ../potato-kid-review-N <branch>`, then `npm ci` in it;
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
