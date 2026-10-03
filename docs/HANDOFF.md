# Session handoff (2026-10-03, for the next Claude session)

Read this first, then `CLAUDE.md`, `docs/PROJECT_BRIEF.md` ("Current arrangement"), `docs/DECISIONS.md` and `docs/TASKS.md`.

## Where we are

- **Gates 1–3 are approved. The MVP is built; gate 4 is next.** See TASKS.md "Where things stand" for what's in it and what to bring the owner.
- **Content:** 64 kids, 58 recipes. **GUI:** every GUI-MVP screen. **Audio** and **Android** icon and splash are done.
- **Send home** (D-048) is done end to end: drag a kid onto the Garden and hold 400 ms, or use the Dex detail's per-kid path.
- **Tests:** about 180 unit and 110 e2e (Playwright), mutation-checked as they were added.
- **The gate-4 build** is CI's `potato-kid-debug-apk` artifact from the latest `main` run (Actions → the `check` workflow → Artifacts). There is also a GitHub Pages build.

## Next, in order

1. **Gate 4:** the owner plays the APK on the S26 Ultra. Collect feedback on feel, performance, audio by ear, and the launcher icon.
2. **Pacing:** ask the owner how long the MVP should last. `npm run balance` (4 seeds, about 15 min) on 64 kids: half the roster in about 10 min of idealized play, 75 % in about 1 h, 63 of 64 in 3 h. Then retune seed weights, prices and milestones in `balance.json` and rerun the simulator.
3. **After gate 4:** ANIM-POLISH (D-047) and content waves toward about 500 kids (D-046).

**Known gaps** (not testable in headless CI; check on the device):
- the audio unlock on a real touch screen;
- the `<audio loop>` seam once encoded;
- the icon under the S26's own launcher mask;
- the D-034 performance pass (and 4× CPU throttle) and real texture allocations.

**Open for Codex:** sending a kid home has no sound. The eight MVP cues don't include one, so the drag path is silent and the Dex path plays only the button tap. Whether it needs its own cue, or should reuse one, is Codex's call (D-036); the runtime would map `sentHome` in `src/audio/cues.ts`.

## How we work (D-027, D-035, D-036: owner instructions)

- The owner talks only to Claude. **Codex fills the ChatGPT role** and always runs on `gpt-6.1-sol` at high effort.
- **Claude does no art at all** (D-036): no drawing, no placeholders, no visual design choices. Codex does all art and interaction design; Claude reviews it and owns the export pipeline and the engine.
- **Codex tasks:** write a prompt file (in the session scratchpad), then run
  `node "C:/Users/Adria/.claude/plugins/cache/openai-codex/codex/1.0.6/scripts/codex-companion.mjs" task --write --model gpt-6.1-sol --effort high --cwd "C:/Users/Adria/potato-kid-chatgpt" --prompt-file <file>`
  with `run_in_background`. Include the task's `TASKS.md` entry. For review rounds, append Claude's PR review verbatim.
- **Codex's worktree** is `C:\Users\Adria\potato-kid-chatgpt` (`chatgpt/` branches). Its sandbox has **no git and no network**: Claude commits its files unchanged with `git -c user.name=ChatGPT -c user.email=noreply@openai.com commit` and pushes.
- **Codex reviews** of every Claude PR, before merging:
  - `git worktree add --detach ../potato-kid-review-N <branch>`, then `npm ci` in it;
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
- `debugSaveStatus` now persists across saves (it used to be cleared by the next save).
- **Watch for flakes under parallel load:** run the full suite two or three times before calling a fix done. Two real bugs (a lazy-portrait race, the page-mode scroll clamp) showed up only that way.
- **Never chain a commit after a test run with `&&` plus pipes:** a piped `grep` succeeds even when the tests fail. Twice this session a broken or failing state was committed that way. Check results first, then commit.
- **Locators that match a hidden element's text pass** (`toContainText` ignores visibility). Sample `isVisible()` when what matters is whether something is shown.
- Headless Chromium starts an `AudioContext` without any user gesture, whatever the autoplay flag, so audio unlock can't be tested there.
- **CI runs about 3× slower than this machine,** and the Garden keeps spawning during tests. Anything timed against a short window (the 650 ms farewell, a row count) belongs in the page, inside a `requestAnimationFrame` loop, not in clicks from the test (PR #54). To stage frames below 10 fps, busy-wait in each frame (`slowFrames` in `smoke.spec.ts`).
- `a view change just before release restarts the dwell` (PR #50) timed out once in about 80 local runs and has never failed on CI. If it shows up again, look at it.

## Housekeeping

- The old review worktrees `../potato-kid-review-20` to `-39` could not be deleted from this session ("Permission denied"; probably locked by finished Codex processes or the sandbox). Remove them with `git worktree prune` and delete the folders when they unlock. Keep `../potato-kid-chatgpt`. `../potato-kid-fix51` (a temporary worktree with a copied `node_modules`) failed to delete with "Filename too long"; remove it with a long-path-aware tool.
- Gate captures live outside the repo, in `C:\Users\Adria\potato-kid-gate2\` and `C:\Users\Adria\potato-kid-gate3\`.
