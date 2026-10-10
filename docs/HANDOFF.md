# Session handoff (2026-10-10, evening, for the next Claude session)

**To start:** tell Claude "Resume from docs/HANDOFF.md". Read this first, then `CLAUDE.md`, `docs/PROJECT_BRIEF.md` ("Current arrangement"), `docs/DECISIONS.md` (especially **D-050..D-074**), `docs/TASKS.md`, and `docs/GUI_MVP.md` §§19–22 (Codex's LAYOUT-DESIGN and FARM-DESIGN).

## Where we are

- **`main` has all of the owner's second gate-4 round (D-068..D-074).** Its save schema is 9. Merged since the last handoff:
  - **FARMING (#90, Codex review in 16 rounds):** fields, farming kids, the pantry, every farming sheet, the working kid's card, drag-to-assign, the offline "Food grown" lines, and the balance bot farming.
  - **Codex's scenery relocations out of the Garden block (#92).**
  - **WILD-KIDS (#93):** the twenty specials and ten rares, drawn from their own bodies, plus tier-6 text with no invented badge.
  - **DEX-SEGMENTS (#94):** Ordinary, Specials and Rares in the Dex.
  - **RARE-TIER (#95):** rares stay at tier 6, and the simulator counts rares apart.
- **Codex has no open design task.** TROPHY-MAP (D-064) waits until after gate 4.
- **Full access, no permission questions** (memory file `no-permission-asks`), but still stop at owner gates and real design choices.

## Open work at handoff

1. **The gate-4 build goes to the owner.** `main`'s CI run publishes `potato-kid-debug-apk`; send the link and what to try (below), then wait for feedback. Turn each point into a decision in `DECISIONS.md` and a `TASKS.md` row before building. What to try:
   - **Farming:** Garden → Fields → unlock, choose a food, assign kids (by dragging a kid onto a field, or Assign kids); take them back; the pantry (Notebook → Pantry); feed a kid from its card.
   - **Map and zoom:** the less busy screen, the 4 × 4 map, pinch to zoom.
   - **Plants:** taking a kid back out of a filling plot; cancelling a growing plot.
   - **New kids:** the ten rares and twenty specials (sparkle for rares, profiles, the Dex's three segments).
2. **For the owner** (with the build):
   - **HOME-RANGE:** kids wander the whole 4 × 4 map. After #92 a casual player completes the 64-kid roster on day 6.4 without farming and day 6.0 with it, no slower than the old map, so the soft home range is less pressing. Keep whole-map wandering, or try it?
   - **D-067:** the happiness durations and the name price are still "proposed".
   - **Farming numbers (Claude's, tunable):** 4 fields at 300 / 3,000 / 15,000 / 60,000 Materials; 4 kids a field; a bite an hour per kid, two on its favourite. In the simulator growth roughly matches feeding (casual: 4,559 grown, 4,295 fed, at most 327 stored), so there's no pantry cap.
   - **The Dex's long tail:** in 14 casual days the bot finds 7 of the 20 special types and a few of the 10 rares. Completing all 94 takes much longer, as D-063 intends.
3. **Small follow-ups (not blocking):**
   - The 96 px rare card portrait's sparkle envelope (GUI_MVP §16.2). The card shows the body without the sleeve today.
   - The drawn-position obstacle source and the drag's captured food have no killing tests (explained in #90).
4. **Polish notes** (owner's polish pass, not now): Seashell Kid reads closer to a teapot at 55 px; the farm and map paths are quite rectilinear.

## Decisions I made this session (engine and tuning rules are Claude's)

- **Farming (#90):**
  - A release over a field that doesn't take the kid (early, refused, or no label room) puts it down clear of partners, with newborn grace.
  - A second finger, a change of food or of places, or a cancel restarts or ends a field's dwell.
  - Commands carry what was reviewed (`farm.food`, `emptyField.kidIds`, `setFieldFood.from` and `kidIds`); anything stale is refused with `changed`.
  - Farming kids draw above the rare marks. Field results not shown on a page become world cards.
  - `biteSeconds` 3600, so there's no hoarding.
- **Wild kids (#93):** a wild kid's collision box is its type's lifetime bounds. Newborns are Classic; saved faces stay. A fallback clip borrows its alias's frames. Tier marks show a badge only if its art exists.
- **Rares at tier 6 (#95):** level with the tier-6 specials, since the rare roll is half as likely. Pacing barely moves.

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

## Housekeeping

- **Worktrees:**
  - `potato-kid-claude`: Claude's main checkout, on `claude/rare-tier` (#95) at handoff; switch to `main`.
  - `potato-kid-hud`: a second checkout with `node_modules`, on the handoff branch; its untracked `pw4174.config.ts` serves e2e on port 4174.
  - `potato-kid-chatgpt`: Codex's worktree, on `chatgpt/farm-relocations` (merged as #92).
  - `potato-kid-review-50` (with `node_modules`) and `potato-kid-review-82`, `-83`, `-84`: Codex review worktrees; check one out per review with `git fetch origin && git checkout --detach origin/<branch>`.
  - `potato-kid-docs`: docs branches.
- **Leftover folders** of old worktrees are still locked by stale Codex processes from 2026-10-02; the owner was told how to end them.
- **Merged remote branches** were never deleted. That's harmless.
- **Gate captures** live outside the repo, in `C:\Users\Adria\potato-kid-gate2\` and `-gate3\`.
- **GitHub:** `gh` (authenticated) for PRs and comments; it sometimes returns HTTP 503, so retry a merge after a few seconds.
