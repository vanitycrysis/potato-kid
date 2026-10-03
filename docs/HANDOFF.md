# Session handoff (2026-10-03, second session, for the next Claude session)

**To start:** tell Claude "Resume from docs/HANDOFF.md". Read this first, then `CLAUDE.md`, `docs/PROJECT_BRIEF.md` ("Current arrangement"), `docs/DECISIONS.md` (especially **D-050..D-059**) and `docs/TASKS.md`. Pull `main` first.

## Where we are

- **Gate 4 came back with feedback** (2026-10-03), not approval. The owner's answers are recorded as **D-050..D-059** (PR #60, merged), and every item is a task on the board in `TASKS.md`, with an order of work. After those tasks, the MVP goes back to the owner as gate 4.
- In brief:
  - The **icon is approved**.
  - **Forgiving drop** (D-051): drop a kid onto another to try the pair; the kid under the finger is highlighted. No fusing screen.
  - **Pacing** (D-052): a tutorial at 1 kid/min, then 20 min per kid, falling to about 8 min with Garden upgrades; much slower Materials.
  - **Offline** (D-053): kids keep spawning and are found where they wandered; still no offline fusions.
  - **Planting replaces Send home** (D-054): grows over time in plots, then sprouts a random kid, sometimes a variant. A planting sound is wanted.
  - **Rainbow and Mini variants** of any kid (D-055).
  - **Feeding** (D-056): a happy kid earns more and sprouts better variants; each type has a favourite food and a hated one, which it refuses.
  - **Naming** (D-057) and **personalities** (D-058): a description, likes, hates and hobbies per type.
  - **The wave becomes a fast stubby-arm wiggle** (D-059).
  - **Music loop bug.**
- **The repo is public now** (D-060, PR #64: the decision record plus a read-only CI token; the Codex review is clean). Merge #64 once CI is green. Public repos don't use the owner's Actions minutes.
- **At handoff, CI was still running on PRs #61, #63 (this file) and #64.** Each has a clean Codex review posted, so merge each one when its CI is green.
- **The owner has given full access and doesn't want permission questions** (see the memory file `no-permission-asks`). Still stop at the owner gates. Claude Code's auto-mode classifier blocked two actions anyway: turning on GitHub Pages, and stopping the stale Codex processes. Both are left to the owner.
- The owner said this session needed no permission prompts. That was **for that session only**; don't assume it carries over.

## Open work at handoff (check each first)

1. **PR #61, MUSIC-LOOP (Claude):** `claude/music-loop`.
   - **What it does:** the music now loops on a decoded Web Audio buffer; the loop survives hide/show; a gesture wakes a context the system suspended; Off/On resumes from the same offset.
   - **Tests:** `npm test` and all 113 e2e passed locally (first full run). The new test is mutation-checked.
   - **Still to do:**
     - **The Codex review is clean and posted on the PR.** Merge once CI is green (it was pending at handoff).
     - Run the full local e2e suite two or three more times for flakes first.
2. **PR #62, WAVE-WIGGLE (Codex art):** `chatgpt/wave-wiggle`.
   - **Round 1:** Claude committed Codex's round 1 unchanged and merged `main` into the branch (TASKS.md conflict resolved to main's board).
   - **Claude's review, round 1 (posted on the PR):** the nubs are stubby now, but the wiggle is **invisible at 55 px** (about 2 CSS px of travel), and many costumes hide the left nub. The review asks for a bigger angular sweep and a costume-agnostic fix, perhaps both nubs.
   - **Round 2:** **Codex round 2 was running** in `../potato-kid-chatgpt` when the session ended. Check that worktree: `git status`, and `.codex-out/wave-wiggle-notes.md` for a "Round 2" section.
     - If round 2 finished: commit it unchanged as ChatGPT, push, and review it critically at 55 px (colour and grayscale; the all-64 sheets).
     - If round 2 is incomplete: discard the partial edits (`git checkout -- .`; `.codex-out` is git-ignored) and rerun it.
   - **The round-2 prompt:** the round-1 task (below) plus "round 2: address every blocking point of Claude's review" and the PR #62 review pasted verbatim. Round 1's task asked for:
     - stubby nubs (stand's size, never a limb) and a really fast wiggle;
     - the existing sidecar format, within the D-043 reserves, with all 64 costumes still fitting;
     - a complete reduced-motion mapping and a short clip;
     - D-045 and D-046 respected, `art:export` and `npm test` green, and 55 px checks in `.codex-out/`;
     - no `src/` edits.
   - **Engine side, after the art passes:** `waveSeconds` derives from the clip (0.5 s now); Send home's farewell uses the same clip.
3. **FUSE-DROP (Claude), next up.** Nothing written yet. The design worked out:
   - **The target:** the kid whose drawn box overlaps the held kid's box at the *intended* position (`drag.x/y`, before `landingSpot` moves it to a free spot). If several, the one with the largest overlap area.
   - **The scene** computes the target each frame in `resolveHeld()` (`src/render/scene.ts`), stores it on the `Drag`, and exposes it to tests (for example `__PK__.dropTarget()`).
   - **The command:** `endDrag` sends `{ type: 'drop', ..., target }`.
   - **The sim:** in `src/sim/game.ts`, `applyCommands` returns the targeted pair, and `resolveFusions` gives it priority (`d = -1`) ahead of the `seen` contacts. A non-recipe target just lands at the free spot (D-039). Kids in newborn grace stay ineligible.
   - **Unless the drop is over the Garden**, where the home/plant target keeps priority.
   - **The highlight's look is Codex's** (GATE4-DESIGN). Claude draws nothing (D-036), so ship the logic first and render the highlight once the design lands.
   - **Tests:** unit tests for target choice and priority; e2e for a crowded drop onto a partner and onto a non-partner; mutation-check both.
4. **Then, in the board's order:**
   - **Claude:** PACING (`src/content/balance.json`, `npm run balance`; spawn is 12 s today, so the target is 60 s for a tutorial of about 10 spawns, then 1200 s falling to about 480 s at Garden level 10, a factor of about 0.903 per level) and OFFLINE-WANDER (`Game.reconcile` in `src/sim/game.ts`).
   - **Codex:** GATE4-DESIGN, one big interaction-design and art task: the highlight, plots/seed/sprout, the Rainbow and Mini looks, foods, the kid card, feeding, naming, and the planting cue. Also PERSONALITY (text for 64 types plus liked and hated foods). Codex's worktree takes **one task at a time**, so queue them after WAVE-WIGGLE.
   - **Claude, after those designs:** PLANTING (reuse Send home's 400 ms hold gesture), VARIANTS, FEED-NAME.
   - Numbers that D-052..D-056 leave open (tutorial length, growing time, odds, prices, happiness duration) are Claude's to tune with the simulator, review with Codex, and show the owner at gate 4.

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

## Housekeeping

- **Worktrees:**
  - `potato-kid-claude`: Claude's main checkout, left on `main`.
  - `potato-kid-chatgpt`: Codex's worktree, on `chatgpt/wave-wiggle`.
  - `potato-kid-review-50`: the Codex review worktree, with `node_modules`.
  - `potato-kid-docs`: docs branches.
- **Finished worktrees removed:** the old `potato-kid-import3` and `-review-41..57` worktrees were removed from git this session. Their **empty folders** remain, locked by about 26 stale Codex processes (and their `node` helpers) from 2026-10-02. The owner hasn't said whether to stop those processes; the owner was told how to end them in Task Manager; once they're gone, delete the folders.
- **Merged remote branches** (`claude/*`, `chatgpt/*`) were never deleted. That's harmless.
- **Gate captures** live outside the repo, in `C:\Users\Adria\potato-kid-gate2\` and `-gate3\`.
- **GitHub:** `gh` (authenticated) is used for PRs and comments.
