# Session handoff (2026-10-05, second session, for the next Claude session)

**To start:** tell Claude "Resume from docs/HANDOFF.md". Read this first, then `CLAUDE.md`, `docs/PROJECT_BRIEF.md` ("Current arrangement"), `docs/DECISIONS.md` (especially **D-050..D-074**) and `docs/TASKS.md`.

**Until PR #81 merges, this handoff and the current `DECISIONS.md` / `TASKS.md` live on the branch `claude/gate4-feedback-2`, not on `main`** (`main` still has the previous session's handoff). Run `git fetch && git checkout claude/gate4-feedback-2 && git pull` and read the docs there. Once #81 is merged, pull `main` as usual.

## Where we are

- **`main`** has everything from the first gate-4 round (D-050..D-067): planting (#72), rare variants (#77), feeding and naming (#78). Its save schema is 5.
- **The owner's second round (D-068..D-074)** is recorded in #81, not yet merged. The engine work for it is in #82, #83 and #84, which take the save schema to 6 and then 7. All four wait for Codex's review.
- **The owner now talks to Claude directly** (this session); the earlier relay through "session 03" is no longer used.
- **Full access, no permission questions** (memory file `no-permission-asks`), but still stop at owner gates and real design choices.

## Open work at handoff

1. **Codex is out of usage until 2026-10-09 17:13** (its error, 2026-10-05). The owner chose to wait rather than buy credits or switch back to ChatGPT sessions. Until then nothing merges and no Codex task can start. **At the reset, in this order:**
   - **Run Codex's reviews** on #81 (docs: D-068..D-074 and this board), #82 (PLOT-REMOVE), #83 (MAP-ZOOM) and #84 (RARE-KIDS, stacked on #82: merge #82 first, then retarget #84 to `main`). Each PR notes the limit in a comment.
   - **Hand Codex LAYOUT-DESIGN** (D-070's less busy screen, D-071's 4 × 4 map composition and how zoom looks, D-074's take-out and cancel controls), then FARM-DESIGN (D-069), then WILD-ART (D-072's ten rare kids and D-073's special redesigns, on PR #76 with Claude's third round-1 finding). The `TASKS.md` rows say what "done" means.
2. **The owner's second gate-4 feedback is D-068..D-074** (2026-10-05). They also said the build "looks alright for an early build", and that visual polish waits for the polish phase. The owner picked the recommended option on all four questions: fields on the map; two sets that both go wild; take kids out any time; a 4 × 4 map.
3. **Built on branches this session** (each fully tested and mutation-checked; details in the PRs):
   - **#82 PLOT-REMOVE**: `unplant` and `emptyPlot`, schema 6 (planted kids keep ids). Kids come back clear of recipe partners.
   - **#83 MAP-ZOOM**: pinch 0.5×–2×, wheel zoom, the zoom survives resizes. Still open: whether far zoom wants more (LAYOUT-DESIGN).
   - **#84 RARE-KIDS**: `rare: true` types, the rare roll wins over the special roll, schema 7 retires the variants. It also adds `?debug=1&rare=a,b` stand-ins for tests, fixes the Compendium to list ordinary kids only, and gives every small kid the 44 px pickup target.
4. **Still to build after the designs:**
   - the plot take-out UI and the layout (LAYOUT);
   - FARMING (sim, save, balance, UI; the food shop goes);
   - the 20 specials' and the ten rares' content entries;
   - the Dex's Ordinary/Specials segments (§16.4);
   - the T6 tier text;
   - the simulator on the 4 × 4 world, with rares (their tier).
5. **Open question for the owner (not urgent):** D-067's happiness durations (20 min ordinary food, 60 min favourite) and the name price (50 Materials). They stay proposed until the owner confirms or changes them. The food price is gone with farming (D-069).
6. **TROPHY-MAP (D-064)** comes after SPECIALS; expeditions (D-065) stay parked.

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

## Housekeeping

- **Worktrees:**
  - `potato-kid-claude`: Claude's main checkout (on `main` at handoff; the session's branches are `claude/gate4-feedback-2` (#81), `claude/plot-remove` (#82), `claude/map-zoom` (#83), `claude/rare-kids` (#84)).
  - `potato-kid-chatgpt`: Codex's worktree, on `chatgpt/specials` (PR #76).
  - `potato-kid-review-50`: the Codex review worktree, with `node_modules` (detached at #81's first commit; check it out per review).
  - `potato-kid-docs`: docs branches.
- **Leftover folders** of old worktrees are still locked by stale Codex processes from 2026-10-02; the owner was told how to end them.
- **Merged remote branches** were never deleted. That's harmless.
- **Gate captures** live outside the repo, in `C:\Users\Adria\potato-kid-gate2\` and `-gate3\`.
- **GitHub:** `gh` (authenticated) for PRs and comments; it sometimes returns HTTP 503, so retry a merge after a few seconds.
