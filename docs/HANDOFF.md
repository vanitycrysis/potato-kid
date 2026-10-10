# Session handoff (2026-10-10, for the next Claude session)

**To start:** tell Claude "Resume from docs/HANDOFF.md". Read this first, then `CLAUDE.md`, `docs/PROJECT_BRIEF.md` ("Current arrangement"), `docs/DECISIONS.md` (especially **D-050..D-074**), `docs/TASKS.md`, and `docs/GUI_MVP.md` §§19–22 (Codex's LAYOUT-DESIGN and FARM-DESIGN).

## Where we are

- **`main`** has everything from both gate-4 rounds except what's listed under open work: the owner's second round (#81), PLOT-REMOVE's sim (#82), MAP-ZOOM (#83), RARE-KIDS' rules (#84), Codex's LAYOUT-DESIGN (#85), FARM-DESIGN (#86) and WILD-ART with the specials (#76), and LAYOUT parts 1 and 2 (#87, #88). Its save schema is 8.
- **Codex has no open design task.** Its art and designs for this round are all merged. TROPHY-MAP (D-064) waits until after gate 4.
- **Full access, no permission questions** (memory file `no-permission-asks`), but still stop at owner gates and real design choices.

## Open work at handoff

1. **#89, LAYOUT part 3** (Kids on map, Which kid?, taking kids out of plots, §21): Codex's round 2 was clean. **Merge it when CI is green** (it was running at handoff). It's on `claude/layout-plots`, built in the `potato-kid-hud` worktree.
2. **#90, FARMING, a draft that carries all of it.** Codex's P1: the sim alone would leave feeding with nothing to feed (the pantry fills only by farming), so the PR merges only when a player can farm through the shipped UI. Done on `claude/farming-sim`: the sim (fields, farming kids, the pantry, food changes, offline growth), save schema 9, the field bays from `farm_v1.json`, and the kid card's pantry feeding page (§22.6). **Next on the same branch:**
   - **The map:** beds, two crop stamps and working kids on their pads (Codex's step loop; static in reduced motion), with the twenty scenery relocations in `farm_v1.json` applied; a tap on a field; drag a kid onto a field with the 400 ms dwell and labels (§22.4).
   - **The sheets:** Garden → Fields (unlock, rows, Find fields), field detail, Choose food with its change review, Pick kids, Take back and Take all back, Pantry first in the Notebook, and the working kid's card (§§22.2–22.7).
   - **e2e that farm through the UI**, then Codex's review, then the balance bot farming and the numbers tuned (first estimates: 4 fields at 300 / 3,000 / 15,000 / 60,000; 4 kids a field; a bite every 600 s; favourite ×2).
3. **Then:** the twenty specials' and ten rares' content entries and the wild-body renderer (`art/data/kid_wild_v1.json`: one body frame per type, the shared face at its anchor, bob clips with recorded fallbacks, collision from the type's bounds); the rare tiers (simulator); the Dex's segments (§16.4); the T6 tier text; then the gate-4 build to the owner.
4. **For the owner** (ask when the build is ready, or sooner if they're around):
   - **HOME-RANGE:** on the 4 × 4 map, kids wander everywhere. The simulator (#88) shows a casual player completing the roster on day 8.6 instead of 6.4, the first-hour worst seed 9 % deadlocked, and the casual tutorial ending at 3 h instead of 10 min. Codex proposes a soft home range (LAYOUT-DESIGN notes). The owner chooses: keep whole-map wandering, or try the home range in the simulator first.
   - D-067's happiness durations and the name price are still "proposed".
5. **Polish notes** (owner's polish pass, not now): Seashell Kid reads closer to a teapot at 55 px; the farm and map paths are quite rectilinear.

## Decisions I made in reviews (engine rules are Claude's)

- **FARM-DESIGN (#86):** farmers are off the map's count, don't wander or fuse, earn no Materials, and need room to come back. Partial progress is kept when workers leave, and reset on a reviewed food change. Haters return all or none. A farming kid can be fed (its happiness timer runs; the income boost waits for the map). No pantry cap for now. At most four workers a field. **Unlocking moves kids out of the bay** (I rejected Codex's "refuse while a kid stands there").
- **LAYOUT (#87):** Notebook tools are pages of the Notebook (`Sheets.asPage`, no fade, Back to Notebook). The Notebook stays usable in read-only mode (Settings, Map view), with its building rows disabled.
- **Map v3 (#88):** save schema 8 moves kids by the Garden's offset (+1080, +2880). Loading moves any kid overlapping scenery, clear of partners. Compact-landscape fit floor: 65 CSS px per 180 world units.

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

## Housekeeping

- **Worktrees:**
  - `potato-kid-claude`: Claude's main checkout, on `claude/farming-sim` (#90) at handoff.
  - `potato-kid-hud`: a second checkout with `node_modules`, on `claude/layout-plots` (#89).
  - `potato-kid-chatgpt`: Codex's worktree, on `chatgpt/specials` (merged as #76).
  - `potato-kid-review-50` (with `node_modules`) and `potato-kid-review-82`, `-83`, `-84`: Codex review worktrees; check one out per review with `git fetch origin && git checkout --detach origin/<branch>`.
  - `potato-kid-docs`: docs branches.
- **Leftover folders** of old worktrees are still locked by stale Codex processes from 2026-10-02; the owner was told how to end them.
- **Merged remote branches** were never deleted. That's harmless.
- **Gate captures** live outside the repo, in `C:\Users\Adria\potato-kid-gate2\` and `-gate3\`.
- **GitHub:** `gh` (authenticated) for PRs and comments; it sometimes returns HTTP 503, so retry a merge after a few seconds.
