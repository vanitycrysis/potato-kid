# Session handoff (2026-10-03, end of session, for the next Claude session)

**To start:** tell Claude "Resume from docs/HANDOFF.md". Read this first, then `CLAUDE.md`, `docs/PROJECT_BRIEF.md` ("Current arrangement"), `docs/DECISIONS.md` and `docs/TASKS.md`.

## Where we are

- **Gates 1–3 are approved. The MVP is built, and gate 4 has been put to the owner** (2026-10-03). **We are waiting on the owner's verdict.** Don't start new feature work before it, except the items under "When the owner answers" once the owner has asked for them.
- **`main` is at 9edf86c and there are no open PRs.** Everything is merged: Send home's Dex path (#54, after 11 Codex rounds), the gate-4 docs (#57) and the web-build fix (#58).
- **Content:** 64 kids, 58 recipes. **GUI:** every GUI-MVP screen. **Audio** (8 cues and a music loop) and the **Android** icon and splash are done.
- **Send home** (D-048) is done end to end: drag a kid onto the Garden and hold 400 ms, or use the Dex detail's per-kid path.
- **Tests:** 179 unit and 112 e2e (Playwright), mutation-checked as they were added. CI is green on `main`.
- **The gate-4 build** is CI's `potato-kid-debug-apk` artifact. The run given to the owner is https://github.com/vanitycrysis/potato-kid/actions/runs/37114541688 (`main` at e141907). Later `main` runs (#57, #58) are docs-only and build the same app. CI also uploads the web build as `potato-kid-web`. GitHub Pages is not available for this private repo (ENGINEERING_PLAN.md).

## What the owner was asked (gate 4)

1. **Play the APK** on the S26 Ultra: feel and performance (dragging, fusing, scrolling), audio by ear (does sound start after the first tap; are volumes right; does the music loop without a click), and the icon on the home screen.
2. **Pacing:** how long should the MVP last? In the simulator, an idealized player finds half the 64 kids in about 10 min of play, 75 % in about 1 h, and 63 of 64 in 3 h. A casual player (10 min every 3 h) finds 62 in 3 days. Real players are slower.
3. **A Send-home sound:** may Claude ask Codex for one? (Claude does no audio design, D-036.)
4. **Approve gate 4,** or send feedback.

## When the owner answers

- **Gate 4 approved:** record it in `DECISIONS.md` (the next number after D-049) and mark GATE-4 done in `TASKS.md`, in a docs PR. Then **ANIM-POLISH** (D-047) and content waves toward about 500 kids (D-046), starting from the ROSTER-SCALE plan.
- **Feedback from the device:** turn each item into a task on the board. Bugs are Claude's; anything visual or audible goes to Codex (D-036).
- **Pacing target:** BALANCE-SIM. Retune seed weights, prices and milestones in `src/content/balance.json` until `npm run balance` matches the target (4 seeds, about 15 min a run). Then a PR with the before and after numbers, and a Codex review.
- **Send-home sound, yes:** a Codex task (ASSET-MVP audio follow-up) for one cue in the existing style (`art/audio`, `npm run audio:build`). Review it by ear against the other eight. Claude then maps `sentHome` in `src/audio/cues.ts`, choosing its priority alongside the existing cues, and plays it for both paths. The Dex confirm button then needs `data-cue="success"` so its tap doesn't play first.

**Known gaps** (not testable in headless CI; only the device shows them):
- the audio unlock on a real touch screen;
- the `<audio loop>` seam once encoded;
- the icon under the S26's own launcher mask;
- the D-034 performance pass (and 4× CPU throttle) and real texture allocations.

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
- `debugSaveStatus` now persists across saves (it used to be cleared by the next save).
- **Watch for flakes under parallel load:** run the full suite two or three times before calling a fix done. Two real bugs (a lazy-portrait race, the page-mode scroll clamp) showed up only that way.
- **Never chain a commit after a test run with `&&` plus pipes:** a piped `grep` succeeds even when the tests fail. Twice this session a broken or failing state was committed that way. Check results first, then commit.
- **Locators that match a hidden element's text pass** (`toContainText` ignores visibility). Sample `isVisible()` when what matters is whether something is shown.
- Headless Chromium starts an `AudioContext` without any user gesture, whatever the autoplay flag, so audio unlock can't be tested there.
- **CI runs about 3× slower than this machine,** and the Garden keeps spawning during tests. Anything timed against a short window (the 650 ms farewell, a row count) belongs in the page, inside a `requestAnimationFrame` loop, not in clicks from the test (PR #54). To stage frames below 10 fps, busy-wait in each frame (`slowFrames` in `smoke.spec.ts`).
- `a view change just before release restarts the dwell` (PR #50) timed out once in about 80 local runs and has never failed on CI. If it shows up again, look at it.

## Housekeeping

- **Worktrees:**
  - `potato-kid-claude`: Claude's main checkout; it was left on the merged `claude/send-home-dex`, so check out `main` and pull first.
  - `potato-kid-chatgpt`: Codex's worktree; keep it.
  - `potato-kid-review-50`: the Codex review worktree; keep it.
  - `potato-kid-docs`: docs branches.
  - The rest (`potato-kid-import3`, `potato-kid-review-41` to `-57` except `-50`, `potato-kid-fix51`) are finished and can be removed with `git worktree remove --force <dir>`. If that fails with "Permission denied" (locked by finished Codex processes) or "Filename too long", delete the folder by hand later and run `git worktree prune`.
- Merged remote branches (`claude/*` and `chatgpt/*`) were never deleted. That's harmless; prune them only if the owner wants a tidy branch list.
- Gate captures live outside the repo, in `C:\Users\Adria\potato-kid-gate2\` and `C:\Users\Adria\potato-kid-gate3\`.
