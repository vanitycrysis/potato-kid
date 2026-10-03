# Session handoff (2026-10-02 evening, for the next Claude session)

Read this first, then `CLAUDE.md`, `docs/PROJECT_BRIEF.md` ("Current arrangement"), `docs/DECISIONS.md` and `docs/TASKS.md`.

## Where we are

- **Gates 1–3 are approved.** We're in **M3 / BUILD-MVP**, heading to **gate 4**: the complete MVP on the owner's Galaxy S26 Ultra.
- **The GUI-MVP is fully built** to Codex's `docs/GUI_MVP.md`:
  - HUD, feedback and save banners (#33); short viewports (#37);
  - the Garden, Capacity and Bias sheets (#39);
  - Compendium, offline summary and Settings (#41);
  - the Potato-Dex (#43).
- **Content:** 52 kids and 46 recipes are imported (batches 1 and 2: #38, #42). Batch 3 (the 12 tier-5 kids, #44) is approved by Claude's art review. Its import brings the game to the full **64-kid** MVP roster.
- **The balance simulator** (#45) found a soft-lock:
  - 17 of 64 types are parents in no recipe, and nothing removed kids, so the map clogged after about 25 minutes.
  - **The owner chose Send home (D-048):** drop a kid on the Garden and it leaves the map; no refund.
  - The sim command is in #45. The interaction design is with Codex (brief: "Send home" below). The engine and UI side follow.
- **D-049:** the offline summary shows only after 60 s away (#46, Codex's recommendation).
- **Tests:** about 160 unit and 80 e2e (Playwright), all mutation-checked as they were added.

## Open PRs and jobs at handoff

Check each with `gh pr list` and `gh pr checks`.

- **#44** batch 3 art: approved; merge once CI is green. Then import it: run the import script pattern from #42 (tier 5 plus its 12 recipes), add a Dex milestone at 64, and regenerate the previews. There will be 4 pages; the preview grid already checks placements.
- **#45** balance simulator plus the `sendHome` sim command: waiting on Codex's review.
- **#46** D-049 summary threshold: waiting on Codex's review.
- **#47-ish** docs (this file, TASKS, DECISIONS D-048/D-049): needs a Codex review like any PR.
- **Codex Send-home design task:** the brief is in the session scratchpad as `codex-sendhome.md`. If it's lost, re-brief from D-048: drop target, armed state, departure, copy, accessibility, reduced motion; a §13 in GUI_MVP. Run it on a `chatgpt/send-home-design` branch once #44 has merged and the ChatGPT worktree is free.

## Next, in order

1. Merge #44; import batch 3 (64 kids).
2. Codex designs Send home; Claude implements the drag-to-Garden gesture, the target and the departure, with e2e tests. Then the simulator bot already uses `sendHome`.
3. **Balance:**
   - `npm run balance` reports pacing (8 seeds takes about 10 minutes).
   - Today's bot finds all 52 kids in about 2 h of active play, and 75 % within 13–23 minutes. That's fast, but the bot is an idealised player.
   - **How long the MVP should last is a product question for the owner at gate 4.** Bring the numbers; don't retune blindly.
4. **Audio:** Codex delivers the 8 cues and the music loop as WAVs (ASSET-MVP; no music tool, D-010). Claude builds the runtime. Settings already stores On/Off and the volumes (`src/save/settings.ts`).
5. **Codex still owes** icons and launcher/splash.
6. **Gate 4:** an APK on the S26 Ultra, plus the D-034 performance pass (and 4× CPU throttle) and real texture allocations.

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

## Housekeeping

- The old review worktrees `../potato-kid-review-20` to `-39` could not be deleted from this session ("Permission denied"; probably locked by finished Codex processes or the sandbox). Remove them with `git worktree prune` and delete the folders when they unlock. Keep `../potato-kid-chatgpt`.
- Gate captures live outside the repo, in `C:\Users\Adria\potato-kid-gate2\` and `C:\Users\Adria\potato-kid-gate3\`.
