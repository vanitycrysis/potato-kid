# Session handoff (2026-10-05, for the next Claude session)

**To start:** tell Claude "Resume from docs/HANDOFF.md". Read this first, then `CLAUDE.md`, `docs/PROJECT_BRIEF.md` ("Current arrangement"), `docs/DECISIONS.md` (especially **D-050..D-074**) and `docs/TASKS.md`. Pull `main` first.

## Where we are

- **Everything gate 4 asked for is on `main`** (D-050..D-067), ready for the owner's device:
  - PLANTING (#72): plots, the drag target, plot taps, the picker, Start growing with its review, the Dex and card route, offline growth.
  - VARIANTS (#77): ten rare looks, their map marks and six-glint sleeve, the birth burst, Mini's size and pickup target, the Dex's rare rows, rare list portraits.
  - FEED-NAME (#78): feeding, happiness (+1 tier in planting odds), naming, the kid card (a tap on a kid, or a Dex row), the happy sun, personality in the card and the Dex.
  - **D-067 (proposed, tunable):** 100 Materials a bite; 20 min at ×1.5 for an ordinary food, 60 min at ×2 for a favourite; names cost 50. The owner hasn't confirmed these.
- **Save schema is 5** (4: found variants; 5: names and happiness), with migrations from 1.
- **The owner reached this session through another session** ("session 03", over cross-session messages; its pipe is in the transcript). If no relay is around, ask the owner directly.
- **Full access, no permission questions** (memory file `no-permission-asks`), but still stop at owner gates.

## Open work at handoff

1. **The owner's second gate-4 feedback came in on 2026-10-05: D-068..D-074** (farming instead of buying food, a less busy screen, a 4 x 4 map with pinch-zoom, ten rare kids instead of variants, wild specials, taking kids out of plots). The order of work is in `TASKS.md` ("Where things stand"). D-067's happiness numbers and name price stay proposed; its food price is gone with farming.
2. **PR #76, SPECIALS:** the owner settled both open questions with D-073 (specials go wild too). Codex redesigns the held and plain-looking specials as part of WILD-ART, with Claude's third round-1 finding (box-shaped props). After the art is settled: the 20 `kids.json` entries (`"special": true`, 12 at T5, 8 at T6), the Dex's Ordinary/Specials segments (Sec. 16.4), the T6 tier text (no badge past T5), and a check that the specials' personalities load.
3. The variant-glyph question from #77 is moot: D-072 retires the variants.
4. **TROPHY-MAP (D-064)** comes after SPECIALS; expeditions (D-065) stay parked.

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
- **Codex reviews are rigorous:** most rounds find real edge cases. **Mutation-check every regression test** (break the fix; the test must fail). The scratchpad has a small `mutate_c1.py` runner.
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
## Housekeeping

- **Worktrees:**
  - `potato-kid-claude`: Claude's main checkout (on `claude/handoff-2026-10-05b` at handoff; switch to `main`).
  - `potato-kid-chatgpt`: Codex's worktree, on `chatgpt/specials` (PR #76).
  - `potato-kid-review-50`: the Codex review worktree, with `node_modules` (detached; check it out per review).
  - `potato-kid-docs`: docs branches.
- **Leftover folders** of old worktrees are still locked by stale Codex processes from 2026-10-02; the owner was told how to end them.
- **Merged remote branches** were never deleted. That's harmless.
- **Gate captures** live outside the repo, in `C:\Users\Adria\potato-kid-gate2\` and `-gate3\`.
- **GitHub:** `gh` (authenticated) for PRs and comments; it sometimes returns HTTP 503, so retry a merge after a few seconds.
