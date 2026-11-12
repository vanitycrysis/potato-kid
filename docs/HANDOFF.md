# Handoff (2026-11-12)

For the next session, on any model. **To start:** read `CLAUDE.md`, `docs/README.md` (the reading order), then this page.

This session ran on Claude Fable 5.2 on 11 and 12 November 2026. The owner asked for a review of the project and an art trial, then answered both. Everything below follows from those answers (D-096 to D-105 in `docs/DECISIONS.md`).

## What the owner said (2026-11-11), in short

1. "I like all of your suggestions. Feel free to implement them."
2. Remove the stem on every kid's head (D-097).
3. Claude's kid designs are liked, but had attachment errors (wand, pillow, umbrella handle; arms that "just get thicker"). Such errors must be caught in review by Claude or Codex before the owner sees them (D-098).
4. "You can take the reins for now on the art" (D-096). Codex reviews it.
5. Every kid gets a habit; "take your time", "unique and polished" (D-099).
6. Motion marks are fine if the map does not get busy; show them only when zoomed in enough (D-100).
7. Outline shimmer: wait and see, with a plan ready (D-103).
8. Fix CI as proposed. Clean up the docs "so Opus 5.5 can have proper documentation to resume from". Potatokens: a rewarded ad for 10 (D-102).
9. Write a fresh handoff covering every change (this page).

## What was done

| # | Pull request | What | State |
|---|---|---|---|
| 1 | #125 CI-SHARD | The 7,758-line end-to-end file split into one spec per area; CI runs check, six end-to-end shards and Android side by side (about 8 minutes, was 24 to 40); one required check, `ci`, on a protected `main` | merged |
| 2 | #126 NO-STEM | The stem removed from all 44 body frames, the launcher icon and the splash; D-096 to D-103 recorded; `CLAUDE.md` and the brief updated for the art handover | merged |
| 3 | #127 NEW-KIDS | Bee, Sleepy, Umbrella, Wizard (shared rig) and Star (an eleventh rare): art, recipes, personalities. Codex's art review took three rounds and accepted all five. `scripts/check-kids.mjs` (`npm run art:kids`) and an `art` job in CI | merged |
| 4 | #128 MOTION-V1 | The animation engine (squash and stretch, marks, part pivots, fusion ghosts, greetings, the `habit` activity, save schema 14), 14 shared clips, a habit for each of the 99 kids, `docs/ART.md`, `docs/RENDERING.md` | **open.** All local checks passed (446 unit, 355 end to end, `art:kids`, `motion:check`). Codex's code review and its animation art review were started and had not come back when the session ended |
| 5 | branch `claude/docs-cleanup` DOCS | The documentation rebuilt around the current state (this set of pages), the old documents archived | **pushed, no pull request yet.** It is stacked on #128: rebase it on `main` after #128 merges, then open the pull request and have Codex review it |

The roster is now **99 kids and 62 recipes**. Tests: 446 unit, 355 end to end.

### A page for the owner

https://claude.ai/artifact/BGkD74nEWNhgvkZwckkLyD ("Potato Kid Motion Study", second version; the first, a mock-up, is https://claude.ai/artifact/RtXrVb4ZMtRufyHvQxBrJq) plays the game's real art and baked animation data in a browser: the five kids, the shared motion, and all 99 habits. It is rebuilt by two scratch scripts that are **not in the repository**; their logic is simple (inline the SVG sources and `kid_motion_v1.json`, compose as `rigView.ts` does). If the owner wants it kept current, move a builder into `scripts/`.

## What to do next

In this order unless the owner says otherwise.

1. **Finish MOTION-V1** if it is not merged: see "State of the open pull requests" below.
2. **Give the owner a build.** The artifacts of the latest `main` run (`potato-kid-debug-apk`, `potato-kid-web`). Ask them to look at, on the S26 Ultra: the waddle and idle; a fusion; pick up and put down; habits (zoom in to see marks); whether marks at the opening zoom make the map busy (D-100: one number, `marksMinZoom`); whether outlines shimmer when zoomed out (D-103, `docs/RENDERING.md`).
3. **Ask the owner the three open questions** (`DECISIONS.md`): O-004 (does a non-Fable Claude draw?), O-005 (the ad network for D-102), O-006 (the Dex icon's ticks).
4. **The approved work not yet started** (`docs/TASKS.md`): COSTUME-READ, COSTUME-SPLIT, LEGACY-ART, SPLIT-GAME, SPLIT-SCENE, FRAME-ALLOC, PREVIEWS-OUT, DEBUG-HOOKS, DEX-MILESTONES.

**If this session is not on Fable 5.2:** until the owner answers O-004, do not draw new art. Finishing, fixing and integrating art that is already drawn and reviewed is fine; new drawing goes to Codex with Claude reviewing, as before D-096.

## State of the open pull requests

**#128 MOTION-V1** (`claude/anim-engine`). Next steps, in order:

1. Read Codex's two results. They were run from the review worktrees `potato-kid-review-82` (code review) and `potato-kid-review-83` (animation art review, prompt: the art-review task described in `docs/ART.md`, "Review"). If the session that started them is gone, the results are in `~/.claude/plugins/data/codex-openai-codex/state/<worktree>/jobs/*.json`. If they cannot be found, run both again (`docs/WORKFLOW.md`, "Running Codex").
2. Post each on the pull request verbatim, answer every finding, fix, and review again until a round is clean. After any change to `art/motion/`: `npm run motion:build`, `npm run art:export`, `npm run art:kids`, then rebuild and re-capture the strips of the habits that changed into `art/review/motion/`.
3. Check `gh pr checks 128`, then merge.

**`claude/docs-cleanup`** (this documentation). After #128 merges: `git rebase origin/main`, open the pull request, Codex review, merge. `docs/HANDOFF.md` and `docs/TASKS.md` on that branch are the current ones.

**`claude/previews-out`** (worktree `../potato-kid-work2`): created from `main`, nothing done yet. The plan is in `docs/TASKS.md` (PREVIEWS-OUT): remove the 1,047 PNG captures under `art/previews/` (about 400 MB), keep the 569 SVG and 318 HTML mock-ups that `art/data/ui_v2.json` cites, and point `tests/preview/ingame.spec.ts` at `.review/`.

## Things this session learned

**About the rig and drawing for it** (all in `docs/ART.md`):

- A costume must fit the lifetime box in every pose. Hand props get about 37 px to the right of the hand, so they are small; the large shape of a costume has to be on the head or behind the body.
- Only the right hand holds props. In the wave frames the arm strokes sit up to 40 px from where they rest, so a thin prop needs something at its grip.
- The torso attachment squashes to 0.7 when a kid sits; anything that must keep its shape goes on the head attachment.
- A mark placed "above the torso" lands on the face. Three habits shipped to my own review with steam across the face before the checker had a rule for it.
- Hand props cannot swing far: toward the body they cross the eyes, away from it they leave the box.

**About process:**

- Codex's art reviews are worth the rounds. Round 1 of #127 found the wand missing the waving arm, which no still image showed. Ask it to check the geometry itself and to open the rendered sheets.
- Every rule the owner or Codex states can usually be turned into a check. `check-kids.mjs` grew from four rules to nine that way, and each new rule found real faults the first time it ran.
- With the motion margin, kid boxes are about 5 % wider. Tests that packed kids tightly beside the Garden broke: stand test crowds on the clear patch of the map (`docs/TESTING.md`).
- Preview captures run in parallel now (`fullyParallel` in `playwright.preview.config.ts`); serial, 80 captures took 21 minutes.

## Housekeeping

- Worktrees beside the repo: `potato-kid-claude` (this one), `potato-kid-chatgpt` (Codex, for `--write` tasks), `potato-kid-review-82`, `-83`, `-84` (reviews; no `node_modules`). The others (`-hud`, `-tut`, `-tier`, `-docs`, `-chatgpt-map`, `-review-50`, and older folders) are from earlier rounds and can be removed.
- `.review/` in the repo root is untracked scratch output from the preview captures.
- Branch protection on `main`: required check `ci`, branch must be up to date, admins included. To change it: `gh api -X PUT repos/vanitycrysis/potato-kid/branches/main/protection`.
