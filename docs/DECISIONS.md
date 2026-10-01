# Decisions

Consolidated on 2026-10-01 from Claude's PR #1 and ChatGPT's PR #2; both collaborators' entries are kept. **Status:**
- **Required:** from the brief or the design doc.
- **Approved:** by the owner.
- **Agreed:** by both AIs.
- **Proposed:** awaiting review.

| ID | Status | Decision | Reason / authority |
|---|---|---|---|
| D-001 | Required | Planning first. Engineering scaffolding began after the owner approved the stack (D-014); no production game systems or production assets before the plan is consolidated | Brief, first task. Owner, 2026-10-01: "go for it" |
| D-002 | Required | ChatGPT owns art and audio and reviews engineering; Claude owns engineering and integration and reviews art and audio | Brief, Roles |
| D-003 | Required | Keep consume-two/make-one, free wandering with no grid, hidden recipes, offline progress | Design doc |
| D-004 | Observed | The 22 references are transparent black-line WebPs (base, cook, sleep, snow) on varying canvases; three base files are byte-identical | Inspected by both AIs |
| D-005 | Agreed | Editable SVG source for body, face and costume; aligned body/face/overlay PNG layers at runtime; flattened previews for review | ChatGPT's proposal, built on Claude's layering (D-016) |
| D-006 | Proposed; decided at the art gate | Warm flat body fill, one dark outline, costume silhouette plus a restrained accent colour per type | Transparent interiors would show the map behind them; the owner approves the actual samples |
| D-007 | Agreed | Art-gate samples: base, Fire, Water, Firefighter, garden map | Covers the design example pairing and the first-playable recipe R1 |
| D-008 | Agreed | Kid layers 256 × 256, ground anchor (128, 224), ≥ 8 px padding; procedural motion moves layers together; 10 types / 6 recipes | ChatGPT's spec; Claude confirms in `ENGINEERING_PLAN.md` §5 |
| D-009 | Proposed (Claude revision) | World is 1080 units wide, fit to screen width; background 1080 × 2400 with a 1080 × 1920 safe band; decoded textures ≤ 32 MiB | ChatGPT asked for camera and safe areas; 2400 tall covers 20:9 phones |
| D-010 | Agreed | No music-generation tool: original note/MIDI composition plus scripted synthesis for one loop and 8 cues; judged by listening | ChatGPT states the limit honestly |
| D-011 | Proposed (Claude revision) | ChatGPT delivers WAV masters (48 kHz / 16-bit); the build encodes Ogg + M4A with ffmpeg; separate music and SFX volumes; peak and listening checks for SFX | One reproducible encoding step; ChatGPT's LUFS correction accepted |
| D-012 | Required | All exchange and review happens through GitHub PRs; one combined plan goes to the owner | Brief |
| D-013 | Agreed | Fix offline spawn progress and income, save recovery order, the content contract, device and audio acceptance, and the platform rationale | ChatGPT review on PR #1; answered in `ENGINEERING_PLAN.md` rev. 2 |
| D-014 | Approved (owner) | TypeScript + PixiJS v8 + Vite + Capacitor (was Claude D1) | Text-only and diff-friendly, testable without a human, same build in a browser and on Android |
| D-015 | Agreed | Pure simulation core separate from rendering; fixed 10 Hz step; offline is a deliberately simplified rule set (was D2) | Testable rules; ChatGPT's correction on offline accepted |
| D-016 | Agreed | Kids composited from body + face + overlay with procedural wander animation (was D3) | One overlay per new type; roster scales cheaply |
| D-017 | Agreed | Kids, recipes, buildings and balance in JSON, validated in CI: result tier above both parents, reachability, valid weights (was D4) | Design doc §8; ChatGPT added checks |
| D-018 | Approved (owner) | Offline: closed-form catch-up capped at 8 h (excess discarded and shown); no offline fusions; persisted spawn progress; idempotent reconcile (was D5) | Owner, 2026-10-01; details in the plan §3 |
| D-019 | Approved (owner) | Potatokens: instant spawn and an alternative payment for compendium respawns; earned from discoveries and milestones; no IAP and no construction timers in the MVP (was D6) | Owner, 2026-10-01 |
| D-020 | Approved (owner) | Materials faucet: passive income per kid, `0.5 · 2^(tier-1)` per second (was D7) | Owner, 2026-10-01 |
| D-021 | Approved (owner) | Android first; iOS later (needs a Mac with Xcode; distribution needs a paid membership) | Owner, 2026-10-01; ChatGPT's platform correction |
| D-022 | Proposed (Claude) | HUD and panels are a DOM overlay; the world is drawn in Pixi | Live text, accessible touch targets |
| D-023 | Proposed (Claude) | Starter roster and recipes as in `ENGINEERING_PLAN.md` §2; first-playable recipe R1 `plain + water → firefighter` | ChatGPT asked for a concrete roster; ChatGPT owns names and theming |
| D-024 | Proposed (Claude) | Only the Garden is a map sprite; Capacity, Bias and Compendium are reached through bottom-tray UI with icons | Keeps the play area clear; smaller art budget |
| D-025 | Approved (owner) | Repo stays private for now; playable builds go out as CI artifacts (web zip, then a debug APK) | Pages API returned 422 for a private repo; owner, 2026-10-01: "Don't make it public yet" |
| D-026 | Approved (owner) | Test device: Pixel 10 profile in the Android Studio emulator. The emulator is used for functional and visual checks; its frame rate is indicative only, because it runs on PC hardware | Owner, 2026-10-01 |

## Open questions

| ID | For | Question |
|---|---|---|
| O-001 | Owner | Resolved → D-026 (Pixel 10 emulator). A physical Android phone, if one is ever available, gives the real performance figure. |
| O-002 | Owner | Resolved → D-025 (stay private). |
| O-003 | ChatGPT | Accept D-009, D-011, D-022 to D-024, or argue in PR #1? |

## Sub-agents and tools

| Agent | Used by | Purpose |
|---|---|---|
| Codex CLI (Claude Code `codex` plugin) | Claude | Installed for optional second-opinion code reviews or diagnosis. It does **not** stand in for ChatGPT, which works independently through its own PRs. |
