# Task board

Status: `todo` · `doing` · `review` · `blocked` · `done`. PR review is not owner approval. Since D-027, ChatGPT's role is run as Codex (`gpt-6.1-sol`, high effort) by Claude; Claude does no art (D-036).

## Where things stand (Claude, 2026-10-02)

**Waiting on the owner: check-in 2 (art style).** It was presented once (r2 art). The owner asked for body and face variation, poses, animations, new kids, a bigger Fire flame, a scrollable map, no overlaps and GUI art (D-036 to D-042). All of that is now built and is going back to the owner for approval.

Merged since the gate-2 feedback:

| PR | What | Review |
|---|---|---|
| #10 | Owner feedback recorded (D-036 to D-042) | Codex |
| #11 | No overlap + scrollable 2160 × 3840 world | Codex, 2 rounds |
| #12 | Roster expansion: 16 kids, 12 recipes (incl. tier 4) | Codex |
| #13 | Exporter v2: new families, native SVG GUI, sidecar validation | Codex, 4 rounds |
| #8 | Art v2 spec + sample slice (bodies, faces, poses, costumes, map, GUI SVGs) | Claude, 4 rounds |
| #14 | v2 engine: rig renderer, appearance, box collision (D-043), map v2, art coverage | Codex, 6 rounds |
| #16 | Faces v2: visibly wider / lopsided / dreamy faces | Claude |
| #17 | Render perf (no MSAA, no stencil mask): fixed red `main`, 15 → 60 fps on software GL | Codex |

In review: **#15 GUI v2** (Codex's paper HUD, tray, Dex button, toast; compact short-screen layout). Six Codex rounds so far.

Known limits, honestly stated:
- Placeholder costumes for 12 types (by Codex, marked `placeholder`).
- Deferred art: wave/held/settle poses, FX, landmarks.
- Buildings, currencies, Dex and save arrive with M3.
- The GUI shows those controls disabled.

## Board

| ID | Owner | Task | Status | Done when |
|---|---|---|---|---|
| PLAN-* | Both | Project plan | **done** (PRs #1, #2, #7) | — |
| GATE-1 | Owner | Approve the project plan | **done** (stack, rules, device, private repo; roster expanded with owner leave, D-038) | — |
| SCAFFOLD, COMPOSITE | Claude | Scaffold, CI, layered kids | **done** (#3, #4) | — |
| BUILD-PLAYABLE | Claude | Spawn, drag and drop, R1 fusion, debug APK | **done** (#5) | — |
| ART-STYLE / ART-V2 | ChatGPT | Art style, then v2 per owner feedback | **review → owner** (#8, #16 merged) | Owner approves gate 2 |
| ENGINE-V2 | Claude | Rig renderer, appearance, box collision, map v2, scrolling, no overlap | **done** (#11, #14, #17) | — |
| GUI-V2 | Claude (impl) / ChatGPT (art) | HUD, tray, Dex button, toast | review (#15) | Codex approves; merged |
| GATE-2 | Owner | Approve the art style | **waiting on owner** | Explicit approval |
| ASSET-PLAYABLE | ChatGPT | Final art for placeholder types, FX, deferred poses, landmarks | todo (after gate 2) | Claude review passes |
| GATE-3 | Owner | Approve the first playable (on the S26 Ultra) | todo | Explicit approval |
| BUILD-MVP | Claude | Currencies, buildings, Dex, compendium, offline + lifecycle, save, balance simulator, audio | todo | Tests pass; Codex review |
| ASSET-MVP | ChatGPT | Full roster polish, icons, font, 8 cues, music loop, launcher/splash | todo | Claude review passes; device listening check |
| GATE-4 | Owner | Approve the MVP | todo | Explicit approval before polish |
