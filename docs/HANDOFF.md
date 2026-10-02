# Session handoff (2026-10-02, for the next Claude session)

Read this first, then `CLAUDE.md`, `docs/PROJECT_BRIEF.md` ("Current arrangement"), `docs/DECISIONS.md` and `docs/TASKS.md`.

## Where we are

- **Gate 3 approved** (D-047, 2026-10-02): the first playable passes on the S26 Ultra.
  - The animations are "good enough for how early we are"; polish comes after gate 4 (ANIM-POLISH).
  - The owner likes the font.
  - **Now: M3 / BUILD-MVP** (Claude) and **ROSTER-PLAN** (Codex). See "Next" below.
- **Gate 2 was approved this session** (D-044), with two owner directions:
  - **D-045:** faces are only two dot eyes and the smirk. No brows, noses, chins or other anatomy; anything else comes from the costume.
  - **D-046:** about 500 kid types long term. The MVP ships 50–80, and the pipeline must scale (ROSTER-PLAN and ROSTER-SCALE tasks; `ENGINEERING_PLAN.md` "Roster scale").
- **Merged this session:**
  - #20: the gate-2 decisions.
  - #21: ASSET-PLAYABLE part A, final costumes and the face fix (3 Claude art rounds).
  - #22: the engine owns no colours.
  - #23: part B, poses, clips, FX and landmarks (2 rounds).
  - #24: the integration, which plays them and bundles Patrick Hand (3 Codex rounds).
- `main` is green.
- **Tests:** unit 73, e2e 19.
- **CI note:** once, the Android job failed fetching standard Maven artifacts. It was transient; the next run passed.
- **The owner asked** whether Codex handles ALL art and audio. Yes: Claude makes no visual choices at all. PR #22 removed the last leftovers, accent colours Claude had picked.

## How we work (D-027, D-035, D-036: owner instructions)

- The owner talks only to Claude. **Codex fills the ChatGPT role** and always runs on `gpt-6.1-sol` at high effort.
- **Claude does no art at all** (D-036): no drawing, no placeholders, no visual design choices. Codex does all art; Claude reviews it and owns the export pipeline and the engine.
- **Codex tasks:** write a prompt file, then run
  `node "C:/Users/Adria/.claude/plugins/cache/openai-codex/codex/1.0.6/scripts/codex-companion.mjs" task --write --model gpt-6.1-sol --effort high --cwd "C:/Users/Adria/potato-kid-chatgpt" --prompt-file <file>`
  - Include the task's `TASKS.md` entry. `/codex:rescue` can't target the worktree, so call the runtime directly as above.
  - For review rounds, append Claude's PR review verbatim to the prompt.
- **Codex's worktree** is `C:\Users\Adria\potato-kid-chatgpt` (identity `ChatGPT`, `chatgpt/` branches). Its sandbox **can't run git**, so Claude commits its files unchanged as `ChatGPT` and pushes.
  - Check `git branch -vv` there before pushing. A branch's upstream once silently pointed at `main` and pushes went nowhere.
  - Its sandbox has no network either, so it can't fetch third-party files (the font). Claude fetches those from the official source, pins them and records them in `assets/PROVENANCE.md`.
- **Codex reviews** of every Claude PR, before merging, use a detached review worktree:
  - `git worktree add --detach ../potato-kid-review-N origin/<branch>`, then `npm ci` in it, so Codex can run the tests;
  - then `node .../codex-companion.mjs review --wait --model gpt-6.1-sol --cwd <that dir> --base origin/main --scope branch`.
  - Post the output to the PR verbatim, labelled as Codex's. Fix, re-review, and merge only after Codex reports no findings **and** CI is green.
- **Codex reviews are rigorous.** Most rounds find real edge cases. **Verify that every regression test fails without its fix.**
- **Art review:** `npm run art:export`, which validates and exports Codex's SVG sources and sidecars from `art/`, then `npm run art:preview`, which renders real-engine captures into `art/previews/ingame/`.
  - Judge art at true game size, about 55 CSS px per kid, in colour and grayscale.
  - Clips and FX only show in motion: capture real playback with a throwaway Playwright spec (small `clip` screenshots in a loop), and don't rely on Codex's composites alone.
  - Codex's art PRs are gated by **Claude's** review (D-002), not by a Codex code review.
  - The preview crowd test can time out at 30 s on the headless software renderer, which runs at about 10 fps with 40 kids. Rerun with `--timeout 180000`.
- **Cancelling Codex jobs:** Git Bash mangles `taskkill`, so use PowerShell.
- Disagreements go in the PR; if one round doesn't settle them, take both positions to the owner. So far none needed escalating.

## Architecture in one breath

TypeScript + PixiJS 8 + Vite + Capacitor (Android).

- **Sim:** a pure sim in `src/sim/`:
  - 10 Hz steps;
  - separate random streams for gameplay, spawn type and cosmetics;
  - lifetime silhouette boxes, so kids never overlap (D-043);
  - scenery obstacles;
  - ambient rests (look, wave, sit, sleep).
- **Art data:** Codex's sidecars (`assets/data/kid_rig_v2.json`, `map_garden_v2.json`, `ui_v2.json`) drive:
  - the rig renderer (`src/render/rigView.ts`);
  - the map (`mapView.ts`);
  - the DOM GUI (`src/ui/hud.ts` + `hud.css`). Colours and font come from `ui_v2.json` tokens only.
- **Presentation** (`src/render/presentation.ts`, pure and tested):
  - `ClipPicker` chooses clips by the rig's `scheduler.priority`.
  - Pick-up and drop are gesture-driven.
  - `EffectTracks` runs spawn, fusion and discovery FX.
  - The shadow and FX are not press targets.
- **Boot:** refuses to start if art or GUI-token coverage is incomplete (`artRules.ts`).
- **Camera:** scrolls a 2160 × 3840 world, respects the GUI insets, and edge-scrolls while dragging.
- **Font:** Patrick Hand v1.003, from google/fonts `aeb9574`. A Vite plugin ships `OFL.txt` with every build.
- **Plan:** `docs/ENGINEERING_PLAN.md` (rev. 4 + roster-scale note) has the offline, save and lifecycle contracts. Those aren't built yet.

## Next (gate 3 is approved)

1. **M3 / BUILD-MVP (Claude):**
   - currencies and passive Materials;
   - the four buildings, with the tray buttons wired up (now shown disabled);
   - the Dex and compendium;
   - offline catch-up, the lifecycle coordinator and save/recovery, per plan rev. 4;
   - the balance simulator;
   - audio runtime.
   - **ROSTER-SCALE belongs here too:** per-type costume texture loading and unloading, Dex thumbnails, validation at scale, and a delivery/maturity convention for the rig (the root `status` is still `style_sample` while the components are final).
2. **Codex:**
   - **ROSTER-PLAN:** names, themes and the recipe graph toward about 500, plus the 50–80 for the MVP.
   - **ASSET-MVP:** the roster art for those, icons, and audio (8 cues + music loop as WAVs; no music tool, D-010).
3. **Device checks still open:**
   - the D-034 performance pass on the S26 Ultra and at 4× CPU throttle;
   - actual texture allocations (raw 29.16 MiB of a 32 MiB ceiling);
   - font glyphs and reflow.

If the owner asks for art changes, hand them to Codex. Don't draw anything.

## Housekeeping

- Review worktrees `../potato-kid-review-20` and `-22` may still be locked by finished Codex processes. Remove them with `git worktree prune` and then delete the folders. Keep `../potato-kid-chatgpt`.
- Gate captures live outside the repo, in `C:\Users\Adria\potato-kid-gate2\` and `C:\Users\Adria\potato-kid-gate3\`.
