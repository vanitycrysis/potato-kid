# Task board

Status: `todo` · `doing` · `review` · `blocked` · `done`. PR review is not owner approval. Since D-027, ChatGPT's role is run as Codex (`gpt-6.1-sol`, high effort) by Claude; Claude does no art (D-036).

## Where things stand (Claude, 2026-10-02)

**Gate 2 approved** (D-044). The owner liked the style ("matches the potato kid energy really well") and set two directions:
- **D-045:** the face is only two dot eyes and the smirk; no eyebrows, noses, chins or other features unless they come from the costume. The dreamy face's lid strokes go.
- **D-046:** about **500 kid types** long term. The MVP ships roughly 50–80; the pipeline scales to 500; the rest arrives in waves after gate 4.

**ASSET-PLAYABLE is done** (Codex; Claude's reviews: #21 in 3 rounds, #23 in 2 rounds):
- final art for all 16 kids, with the D-045 face fix;
- the remaining poses and clips, effects and landmarks;
- the map and GUI art, now final.

**PLAYABLE-INTEGRATION is done** (#24). **Gate 3 approved** (D-047): the first playable passes on the S26 Ultra. Animation polish is noted for the polish phase after gate 4. The owner likes the font.

**Now: M3 / BUILD-MVP** (Claude), with **ROSTER-PLAN** (Codex) in parallel.

The v2 work merged before gate 2 (PRs #8, #10–#17) is listed in git history and in `docs/HANDOFF.md`.

## Board

| ID | Owner | Task | Status | Done when |
|---|---|---|---|---|
| PLAN-* | Both | Project plan | **done** (PRs #1, #2, #7) | — |
| GATE-1 | Owner | Approve the project plan | **done** (stack, rules, device, private repo; roster expanded with owner leave, D-038) | — |
| SCAFFOLD, COMPOSITE | Claude | Scaffold, CI, layered kids | **done** (#3, #4) | — |
| BUILD-PLAYABLE | Claude | Spawn, drag and drop, R1 fusion, debug APK | **done** (#5) | — |
| ART-STYLE / ART-V2 | ChatGPT | Art style, then v2 per owner feedback | **done** (#8, #16; gate 2 approved) | — |
| ENGINE-V2 | Claude | Rig renderer, appearance, box collision, map v2, scrolling, no overlap | **done** (#11, #14, #17) | — |
| GUI-V2 | Claude (impl) / ChatGPT (art) | HUD, tray, Dex button, toast | **done** (#15) | — |
| GATE-2 | Owner | Approve the art style | **done** (D-044, 2026-10-02) | — |
| ASSET-PLAYABLE | ChatGPT | A: D-045 face fix + final art for the 12 placeholder costumes. B: deferred poses and clips, FX, landmarks, font | **done** (#21, #23) | — |
| ROSTER-PLAN | ChatGPT (names, themes, combinations) / Claude (IDs, validation, balance) | Roster plan toward ~500 types (D-046): themes, tiers, recipe graph, and the 50–80 that ship in the MVP | **doing** | Both agree; reachability and tier checks pass on the full graph |
| ROSTER-SCALE | Claude | Engine and pipeline for ~500 types: per-type texture loading and unloading, Dex thumbnails, content validation at scale, art-export throughput | todo (part of BUILD-MVP) | Texture budget and frame time hold with 500 types in the data; tests pass; Codex review |
| PLAYABLE-INTEGRATION | Claude | Play part B's clips, FX and shadow; wave ambient; reduced motion; bundle the font | **done** (#24) | — |
| GATE-3 | Owner | Approve the first playable (on the S26 Ultra) | **done** (D-047, 2026-10-02) | — |
| BUILD-MVP | Claude | Currencies, buildings, Dex, compendium, offline + lifecycle, save, balance simulator, audio | **doing** | Tests pass; Codex review |
| ASSET-MVP | ChatGPT | Full roster polish, icons, font, 8 cues, music loop, launcher/splash | todo | Claude review passes; device listening check |
| GATE-4 | Owner | Approve the MVP | todo | Explicit approval before polish |
| ANIM-POLISH | ChatGPT (art) / Claude (engine) | Polish animations (owner, D-047): richer motion and effects | todo (polish phase, after gate 4) | Owner is happy on device |
