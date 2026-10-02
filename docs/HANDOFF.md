# Session handoff (end of 2026-10-01, for the next Claude session)

Read this first, then `CLAUDE.md`, `docs/PROJECT_BRIEF.md` ("Current arrangement"), `docs/DECISIONS.md` and `docs/TASKS.md`.

## Where we are

- **Waiting on the owner for check-in 2 (art style).** It was presented at the end of the session with screenshots in `C:\Users\Adria\potato-kid-gate2\`, plus a debug APK in `...\gate2\apk\`. The owner was about to install it on the Galaxy S26 Ultra. **Start the session by asking for the owner's gate-2 verdict.** The three open questions:
  1. Approve the art style (body shapes, faces, poses, map, GUI)?
  2. Do the 6 new kids and recipes fit?
  3. Any changes before Codex polishes everything in this style?
- `main` is green (`1fc4ed4`) and **no PRs are open.** Merged today: PRs #1–#18. `docs/TASKS.md` lists them.
- Tests: unit 59, e2e 18. CI builds a debug APK (`potato-kid-debug-apk` artifact).

## How we work (D-027, D-035, D-036: owner instructions)

- The owner talks only to Claude. **Codex fills the ChatGPT role** and always runs on `gpt-6.1-sol` at high effort.
- **Claude does no art at all** (D-036): no drawing, no placeholders, no visual design choices. Codex does all art; Claude reviews it and owns the export pipeline and the engine.
- **Codex tasks:** write a prompt file, then run
  `node "C:/Users/Adria/.claude/plugins/cache/openai-codex/codex/1.0.6/scripts/codex-companion.mjs" task --write --model gpt-6.1-sol --effort high --cwd "C:/Users/Adria/potato-kid-chatgpt" --prompt-file <file>`
  Include the task's `TASKS.md` entry. `/codex:rescue` can't target the worktree, so call the runtime directly as above.
- **Codex's worktree** is `C:\Users\Adria\potato-kid-chatgpt` (identity `ChatGPT`, `chatgpt/` branches). Its sandbox **can't run git**, so Claude commits its files unchanged as `ChatGPT` and pushes.
  - Check `git branch -vv` there before pushing. A branch's upstream once silently pointed at `main` and pushes went nowhere.
- **Codex reviews** of every Claude PR, before merging, use a detached review worktree:
  `git worktree add --detach ../potato-kid-review-N origin/<branch>`, then
  `node .../codex-companion.mjs review --wait --model gpt-6.1-sol --cwd <that dir> --base origin/main --scope branch`
  Post the output to the PR verbatim, labelled as Codex's. Fix, re-review, and merge only after Codex reports no findings **and** CI is green.
- **Codex reviews are rigorous.** Most rounds found real edge cases. **Verify that every regression test fails without its fix.** Twice this session a test passed with or without the fix and had to be dropped.
- **Art review:** `npm run art:export`, which validates and exports Codex's SVG sources and sidecars from `art/`, then `npm run art:preview`, which renders real-engine captures into `art/previews/ingame/`. Judge art at true game size, about 55 CSS px per kid.
- **Cancelling Codex jobs:** Git Bash mangles `taskkill`, so use PowerShell.
- Disagreements go in the PR; if one round doesn't settle them, take both positions to the owner. So far none needed escalating.

## Architecture in one breath

TypeScript + PixiJS 8 + Vite + Capacitor (Android).

- **Sim:** a pure sim in `src/sim/`:
  - 10 Hz steps;
  - separate random streams for gameplay, spawn type and cosmetics;
  - axis-aligned silhouette boxes so kids never overlap (D-043);
  - scenery obstacles;
  - ambient rests.
- **Art data:** Codex's sidecars (`assets/data/kid_rig_v2.json`, `map_garden_v2.json`, `ui_v2.json`) drive:
  - the rig renderer (`src/render/rigView.ts`);
  - the map (`mapView.ts`);
  - the DOM GUI (`src/ui/hud.ts` + `hud.css`).
- **Boot:** refuses to start if art coverage is incomplete (`artRules.ts`).
- **Camera:** scrolls a 2160 × 3840 world, respects the GUI insets, and edge-scrolls while dragging.
- **Render-time separation:** `resolveDrawn` keeps drawn kids from overlapping too.
- **Plan:** `docs/ENGINEERING_PLAN.md` (rev. 4) has the offline, save and lifecycle contracts. Those aren't built yet.

## Next, after gate 2 approval

1. **Codex: ASSET-PLAYABLE.**
   - Final art for the 12 placeholder costumes.
   - The deferred poses (wave, held, settle) and clips (pick-up, held, drop, spawn, fusion, discovery).
   - FX (shadow, spawn, fusion, discovery) and the two landmarks.
   - The Patrick Hand font, bundled.
   - Minor notes from Claude's review: the Snow beanie reads as a lid; the Snowman and Sundae placeholders read as plates.
2. **Claude: integrate those, then gate 3** (first playable on the S26 Ultra).
3. **Then M3 / BUILD-MVP:**
   - currencies and passive Materials;
   - the four buildings, with the tray buttons wired up (now shown disabled);
   - the Dex and compendium;
   - offline catch-up, the lifecycle coordinator and save/recovery, per plan rev. 4;
   - the balance simulator;
   - audio (Codex: 8 cues + music loop, delivered as WAVs).

If the owner asks for art changes instead, hand them to Codex. Don't draw anything.

## Housekeeping

- Many review worktrees (`../potato-kid-review-*`) are left over. They're safe to remove with `git worktree remove`; keep `../potato-kid-chatgpt`.
- Uncommitted gate-2 captures live outside the repo, in `C:\Users\Adria\potato-kid-gate2\`.
