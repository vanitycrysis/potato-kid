# Session handoff (2026-10-04, for the next Claude session)

**To start:** tell Claude "Resume from docs/HANDOFF.md". Read this first, then `CLAUDE.md`, `docs/PROJECT_BRIEF.md` ("Current arrangement"), `docs/DECISIONS.md` (especially **D-050..D-066**: gate-4 feedback, then the planting rework) and `docs/TASKS.md`. Pull `main` first.

## Where we are

- **Gate 4 came back with feedback** (D-050..D-059). Most of it is now built and merged; planting is being reworked with the owner.
- **Merged this session:**
  - WAVE-WIGGLE (#62)
  - MUSIC-LOOP (#61)
  - FUSE-DROP's engine side (#66: the kid under the finger)
  - GATE4-DESIGN (#67, Codex's design)
  - PACING (#68: 60 s × 10 tutorial, then 20 min → 8 min, ~100× slower Materials, save schema 2)
  - PERSONALITY (#69, Codex's text in `art/data/personality_v1.json`)
  - OFFLINE-WANDER (#70)
  - the planting decisions (#71: D-061..D-065)
- **Planting was reworked with the owner (2026-10-04).** The simulator showed D-054 (one kid in, one out) clogs the map: casual players were stuck on 77 % of turns. The owner chose:
  - **D-061:** plant **3–5 kids for one sprout**, by drag or by tapping a plot and picking. **Start growing** is never automatic and sparkles at 5. A sprout is a random Garden kid, with independent rolls for a **special** (10→20 %) and a **rare** (5→10 %) by count and tier.
  - **D-062:** **ten rare variants** that sparkle and earn more.
  - **D-063:** **20 apex special kids**, tier 5–6: in no recipe, plantable, in the Dex, never sold.
  - **D-064:** a **trophy map** for dedicated players (later).
  - **D-065:** **expeditions**, parked.
  - **D-066:** the owner approved all 20 special concepts (12 at T5, 8 at T6), and two rules: a happy kid counts one tier higher in the odds; a planted special counts by its tier.
  - Simulator with these rules: nobody is ever stuck; casual players finish the roster on day ~6.4–7.1; daily players have 0–2 specials after two weeks.
- **The owner reached this session through another session** ("session 03", relaying word for word over cross-session messages). Replies to the owner went back that way. If no relay is around, ask the owner directly.
- **Full access, no permission questions** (memory file `no-permission-asks`), but still stop at owner gates. Auto mode blocked merging a PR the owner hadn't named until the owner said "Merge whatever you need".

## Open work at handoff (check each first)

1. **PR #72, PLANTING (draft), branch `claude/planting`.** The sim and save for D-061..D-063 are done, reviewed by Codex twice, and every finding fixed:
   - plots and `plant {kidIds, plot?}` (atomic batch), `startGrowing {plot}`, `unlockPlot`;
   - odds by count and tier (`oddsFor`); independent special and rare rolls;
   - rare kids' `variant` and income multiplier; snapshots of planted kids;
   - growth online and offline on one timeline with Garden spawns; waiting `full` / `noRoom`;
   - schema 3, and a save round-trip test.
   - **Still to do on the same branch** (Codex asked that planting never reach `main` without its controls): the **engine and UI** from GUI_MVP §15/§16 as revised in #73. Then rerun Codex's review on the whole and un-draft.
   - Notes:
     - The happy-kid rule (+1 tier) arrives with FEED-NAME.
     - The UI still shows Send home's copy and farewell until then.
     - The refusal copy for `plotFull` / `tooFewKids` is a placeholder in `ui/feedback.ts`.
2. **PR #73, PLANT-V2-DESIGN (Codex): approved in round 2.** Claude merged `main` into it (the board conflict was resolved to done). **Merge it when CI is green** (CI was running at handoff).
3. **PR #74 (D-066): merged.**
4. **Then, in order:**
   - PLANTING's engine and UI (above).
   - **SPECIALS (Codex), next for Codex** once #73 merges (start `chatgpt/specials` from `main`); the brief is in `docs/briefs/codex-specials.md`: the costume round for the 20 approved kids, plus names, personalities and foods in the existing format. The four riskiest (Music Box, Puppet Theatre, Paper Town, Marble Run) come back with simpler alternatives if they fail at 55 px.
   - **VARIANTS (Claude):** rendering the ten rares and their Dex rows.
   - **FEED-NAME (Claude):** loading `personality_v1.json`, feeding, happiness (+1 tier in planting odds), naming, the kid card.
   - Then the gate-4 build for the owner.

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
  - `potato-kid-claude`: Claude's main checkout, on `claude/planting` (PR #72).
  - `potato-kid-chatgpt`: Codex's worktree, on `chatgpt/plant-v2-design` (PR #73).
  - `potato-kid-review-50`: the Codex review worktree, with `node_modules` (detached; check it out per review).
  - `potato-kid-docs`: docs branches.
- **Leftover folders** of old worktrees are still locked by stale Codex processes from 2026-10-02; the owner was told how to end them.
- **Merged remote branches** were never deleted. That's harmless.
- **Gate captures** live outside the repo, in `C:\Users\Adria\potato-kid-gate2\` and `-gate3\`.
- **GitHub:** `gh` (authenticated) for PRs and comments; it sometimes returns HTTP 503, so retry a merge after a few seconds.
