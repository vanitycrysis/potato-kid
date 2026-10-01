# Task board

Consolidated on 2026-10-01 from PR #1 and PR #2. Status: `todo` · `doing` · `review` · `blocked` · `done`. PR review is not owner approval.

## Where things stand (Claude, 2026-10-01 ~20:55 UTC)

All of Claude's work is committed and pushed. **Claude is paused, waiting on ChatGPT.** Nothing of Claude's is merged to `main`; every PR needs ChatGPT's review first.

| PR | Branch | Head | State | Waiting on |
|---|---|---|---|---|
| #1 Engineering plan | `claude/project-plan` | this commit | rev. 2 answers all six points of ChatGPT's review; shared `DECISIONS.md` and `TASKS.md` consolidated; owner answers recorded (D-018 to D-021, D-025, D-026) | ChatGPT's round-2 review, and its accept/argue on D-009, D-011, D-022 to D-025 (O-003) |
| #2 Art/audio plan (ChatGPT) | `chatgpt/art-audio-plan` | `65ddb31` | Claude requested changes: back/front overlay layers, 7–8 px stroke at 256, 1080 × 2400 map with safe band, Garden-only building sprite, generated manifest + `PROVENANCE.md`, WAV-only delivery, add font/app icon/splash | ChatGPT's revisions; rebase after #1 merges, dropping its `DECISIONS.md`/`TASKS.md` |
| #3 Scaffold | `claude/scaffold` | `fe073bc` | CI green. Vite + TS + Pixi, Vitest, Playwright, CI web-build artifact, Pages deploy manual-only | ChatGPT code review |
| #4 Composite | `claude/composite` | `9d58d16` | Stacked on #3 (retarget to `main` after #3 merges). Content JSON + validator, 10 Hz wander sim, layered KidView, MapScene, placeholder art. Local: unit 13/13, e2e 2/2 | ChatGPT code review |

**Merge order:** #1 → #2 (rebased) → #3 → #4 (retargeted). After #1 and #2, Claude finalizes `PROJECT_PLAN.md`.

**Resume here (Claude):**
1. Read new ChatGPT comments and commits on PRs #1–#4. Answer each point once; anything still disputed after that round goes to the owner.
2. Merge what ChatGPT approves, in the order above.
3. Finalize `PROJECT_PLAN.md` (PLAN-JOINT).
4. Start BUILD-PLAYABLE groundwork with placeholder art: spawn timer, drag and drop, fusion resolution, R1.
5. Review ChatGPT's art-style samples when they arrive, then send the owner the gate-2 summary.

**Owner:** nothing pending. The owner's answers are recorded: test device Galaxy S26 Ultra (D-026), repo stays private (D-025). ChatGPT only acts when the owner starts a session, so the owner may need to prompt it.

## Board

| ID | Owner | Task | Status | Done when |
|---|---|---|---|---|
| PLAN-ENG | Claude | Stack, architecture, milestones, roster/recipes | review (PR #1 rev. 2) | ChatGPT's review concerns resolved or escalated |
| PLAN-ART | ChatGPT | Art and audio pipeline + asset list | review (PR #2): changes requested by Claude | Claude's review concerns resolved or escalated |
| REVIEW-ENG | ChatGPT | Critical review of PR #1 | round 1 done; round 2 pending | Concerns resolved or escalated after one round |
| REVIEW-ART | Claude | Critical review of PR #2 | done (round 1, posted 20:36 UTC) | Concerns resolved or escalated after one round |
| PLAN-JOINT | Claude | Finalize `PROJECT_PLAN.md` once PRs #1 and #2 merge | blocked on PR #1, #2 | One combined plan with review links |
| GATE-1 | Owner | Approve the project plan | mostly done: stack, rules, Android first, test device, private repo all approved 2026-10-01 | Final roster and asset list acknowledged in the gate-2 summary |
| SCAFFOLD | Claude | Repo scaffold, tests, CI | review (PR #3), CI green | ChatGPT review, merged |
| COMPOSITE | Claude | Layered kid compositing + procedural wander, placeholder art; content validator | review (PR #4) | ChatGPT review, merged |
| ART-STYLE | ChatGPT | Base, Fire, Water, Firefighter, garden map; small-scale and crowded previews | todo (after PR #2 settles) | Claude review passes |
| GATE-2 | Owner | Approve the art style | todo | Explicit approval |
| BUILD-PLAYABLE | Claude | Spawn, wander, drag and drop, R1 `plain + water → firefighter`, debug APK | todo | E2E drag-to-fuse test passes; ChatGPT review |
| ASSET-PLAYABLE | ChatGPT | R1 kids, Garden, basic UI, shared effects, essential cues | todo | Claude review passes |
| GATE-3 | Owner | Approve the first playable (on the S26 Ultra) | todo | Explicit approval |
| BUILD-MVP | Claude | Currencies, buildings, Dex, compendium, offline, save, balance simulator, audio | todo | Tests pass; ChatGPT review |
| ASSET-MVP | ChatGPT | Full roster, building and UI art, 8 cues, music loop | todo | Claude review passes; device listening check |
| GATE-4 | Owner | Approve the MVP | todo | Explicit approval before polish |
