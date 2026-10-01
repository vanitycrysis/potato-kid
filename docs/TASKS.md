# Task board

Consolidated from PRs #1 and #2; ChatGPT's newer handoff from `chatgpt/art-audio-plan` (`2a9e7b5`) is preserved below. Status: `todo` · `doing` · `review` · `blocked` · `done`. PR review is not owner approval. Since D-027, ChatGPT's role is run as Codex (`gpt-6.1-sol`, high effort) by Claude.

## Where things stand (Claude, 2026-10-01)

| PR | Branch | State |
|---|---|---|
| #1 Engineering plan | — | **Merged** (rev. 4, approved by Codex after four rounds). |
| #2 Art/audio plan | — | **Merged** (rev. 2, approved by Claude; rebased with content byte-identical). |
| #3 Scaffold | — | **Merged** (`b919bbb`) after Codex review on `gpt-6.1-sol` (one P2 fixed). |
| #4 Composite | — | **Merged** after Codex review (two P2s fixed: landscape fit, wander validation). |
| #5 First playable | `claude/playable` | Open, targets `main`. Spawn, drag and drop, R1 fusion, HUD, CI debug APK. Waiting for Codex review. |

**PR #1 status after round 3.** Codex confirmed points 1 and 4 and all the additional findings. Point 3 (save recovery) still had a real hole: a newer slot that fails migration could be overwritten by later alternating writes. Claude agrees and fixed it in rev. 4 with protected slots and a verified archive. Codex asked for point 3 to go to the owner after the discussion round. Claude's position: there's no disagreement on substance, since both collaborators support the same fix. So Claude will **report it to the owner as an informational item, not a decision request**, alongside Codex's two-sentence summary, while Codex confirms rev. 4.

### ChatGPT handoff preserved (from `chatgpt/art-audio-plan` TASKS.md)

- REVIEW-ENG round 2 was done and posted on PR #1. All six interface decisions were accepted, with no roster renames.
- PLAN-ART revision was done and posted on PR #2: back/front layers, 7–8 px stroke, 1080 × 2400 safe-band map, Garden-only map sprite, generated manifest + `PROVENANCE.md`, WAV-only handoff, Patrick Hand OFL font, M4 launcher/splash, non-spoiling procedural drag feedback.
- Proposed decision updates are recorded as D-005, D-008, D-016, D-028 to D-034.
- Still to do: finalize `PROJECT_PLAN.md`, record the owner's acknowledgement of the roster and asset list (at gate 2), then ART-STYLE.

## Board

| ID | Owner | Task | Status | Done when |
|---|---|---|---|---|
| PLAN-ENG | Claude | Stack, architecture, milestones, roster/recipes | **done** (PR #1 rev. 4, approved by Codex) | — |
| PLAN-ART | ChatGPT | Art and audio pipeline + asset list | **done** (PR #2) | — |
| REVIEW-ENG | ChatGPT | Critical review of PR #1 | **done**: rev. 4 confirmed; Codex approved PR #1 for merge | — |
| REVIEW-ART | Claude | Critical review of PR #2 | **done** (approved rev. 2) | — |
| PLAN-JOINT | Claude | Finalize `PROJECT_PLAN.md` after PRs #1 and #2 merge | review (this PR) | One combined plan with review links |
| GATE-1 | Owner | Approve the project plan | mostly done: stack, rules, Android, test device, private repo approved | Roster and asset list acknowledged in the gate-2 summary |
| SCAFFOLD | Claude | Repo scaffold, tests, CI | **done** (PR #3) | — |
| COMPOSITE | Claude | Layered kids, procedural wander, content validator | **done** (PR #4) | — |
| BUILD-PLAYABLE | Claude | Spawn, wander, drag and drop, R1 `plain + water → firefighter`, debug APK | review (PR #5) | Codex review; e2e drag-to-fuse passes (done locally) |
| ART-STYLE | ChatGPT | Plain, Fire, Water, Firefighter, garden map; 48/64/96 px and crowded previews | doing (Codex, `chatgpt/art-style`) | Claude review passes |
| GATE-2 | Owner | Approve the art style | todo | Explicit approval |
| ASSET-PLAYABLE | ChatGPT | R1 kids, Garden, basic UI, shared effects, essential cues | todo | Claude review passes |
| GATE-3 | Owner | Approve the first playable (on the S26 Ultra) | todo | Explicit approval |
| BUILD-MVP | Claude | Currencies, buildings, Dex, compendium, offline + lifecycle, save, balance simulator, audio | todo | Tests pass; Codex review |
| ASSET-MVP | ChatGPT | Full roster, icons and UI art, font, 8 cues, music loop, launcher/splash | todo | Claude review passes; device listening check |
| GATE-4 | Owner | Approve the MVP | todo | Explicit approval before polish |
