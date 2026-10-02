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
| D-005 | Agreed | Editable SVG source for body, face and costumes; runtime PNG layers `overlay_back → body → face → overlay_front` (both overlays optional and omitted when unused); flattened previews for review | ChatGPT's proposal on Claude's layering; back/front split agreed in PR #2 round 2 |
| D-006 | Proposed; decided at the art gate | Warm flat body fill, one dark outline, costume silhouette plus a restrained accent colour per type | Transparent interiors would show the map behind them; the owner approves the actual samples |
| D-007 | Agreed | Art-gate samples: base, Fire, Water, Firefighter, garden map | Covers the design example pairing and the first-playable recipe R1 |
| D-008 | Agreed | Kid layers 256 × 256, ground anchor (128, 224), ≥ 8 px padding, 7–8 px starting stroke (gate 2 decides); shared `kid_plain_body` / `kid_plain_face`; at most 16 kid textures; procedural motion moves all layers together | ChatGPT's spec + Claude's PR #2 review, both rounds |
| D-009 | Superseded by D-040 | (Was: single 1080-wide world fitted to the screen, 1080 × 2400 map plate.) | Owner wants a scrollable map (gate-2 feedback, 2026-10-01) |
| D-010 | Agreed | No music-generation tool: original note/MIDI composition plus scripted synthesis for one loop and 8 cues; judged by listening | ChatGPT states the limit honestly |
| D-011 | Agreed | ChatGPT delivers WAV masters (48 kHz / 16-bit) plus note/synthesis source; the build encodes Ogg + M4A with ffmpeg; separate music and SFX volumes; peak and listening checks for SFX | Accepted by Codex/ChatGPT (PR #1 round 2, PR #2 point 6) |
| D-012 | Required | All exchange and review happens through GitHub PRs; one combined plan goes to the owner | Brief |
| D-013 | Agreed (rev. 4 confirmed by Codex) | Offline spawn phase and income, accounting boundary and lifecycle, contact predicate, device/audio acceptance and platform rationale are agreed (Codex round 3). Save recovery: rev. 4 adds protected slots for migration failure | ChatGPT round 1 → rev. 2; round 2 → rev. 3; round 3 confirmed all but save recovery → rev. 4 |
| D-014 | Approved (owner) | TypeScript + PixiJS v8 + Vite + Capacitor (was Claude D1) | Text-only and diff-friendly, testable without a human, same build in a browser and on Android |
| D-015 | Agreed | Pure simulation core separate from rendering; fixed 10 Hz step; offline is a deliberately simplified rule set (was D2) | Testable rules; ChatGPT's correction on offline accepted |
| D-016 | Agreed | Kids composited from up to four layers (back, body, face, front) with procedural wander animation; performance measured at four layers per kid (was D3) | One or two static images per new type; the roster scales cheaply |
| D-017 | Agreed | Kids, recipes, buildings and balance in JSON, validated in CI: result tier above both parents, reachability, valid weights (was D4) | Design doc §8; ChatGPT added checks |
| D-018 | Approved (owner) | Offline: closed-form catch-up capped at 8 h (excess discarded and shown); no offline fusions; persisted spawn progress; idempotent reconcile (was D5) | Owner, 2026-10-01; details in the plan §3 |
| D-019 | Approved (owner) | Potatokens: instant spawn and an alternative payment for compendium respawns; earned from discoveries and milestones; no IAP and no construction timers in the MVP (was D6) | Owner, 2026-10-01 |
| D-020 | Approved (owner) | Materials faucet: passive income per kid, `0.5 · 2^(tier-1)` per second (was D7) | Owner, 2026-10-01 |
| D-021 | Approved (owner) | Android first; iOS later (needs a Mac with Xcode; distribution needs a paid membership) | Owner, 2026-10-01; ChatGPT's platform correction |
| D-022 | Agreed | HUD and panels are a DOM overlay; the world is drawn in Pixi; UI touches never start world drags | Accepted by Codex/ChatGPT (PR #1 round 2) |
| D-023 | Agreed | Starter roster and recipes as in `ENGINEERING_PLAN.md` §2, no renames; first-playable recipe R1 `plain + water → firefighter` | Accepted by Codex/ChatGPT, which owns names and theming |
| D-024 | Agreed | Only the Garden is a map sprite (512 × 512, anchor (256, 480)); Capacity, Bias and Compendium are reached through bottom-tray UI with icons | Accepted by Codex/ChatGPT (PR #1 round 2, PR #2 point 4) |
| D-025 | Approved (owner) | Repo stays private for now; playable builds go out as CI artifacts (web zip, then a debug APK) | Pages API returned 422 for a private repo; owner, 2026-10-01: "Don't make it public yet" |
| D-026 | Approved (owner) | Test device: the owner's **Samsung Galaxy S26 Ultra** (physical). It is a flagship, so passing on it does not prove mid-range performance. We also check with Chrome DevTools 4× CPU throttling as a pessimistic proxy | Owner, 2026-10-01 |
| D-027 | Approved (owner) | **Trial arrangement:** the owner talks only to Claude. ChatGPT's role is filled by Codex, called through the Claude Code Codex plugin: `/codex:rescue` for ChatGPT's tasks (with the `TASKS.md` entry), `/codex:review` on every Claude PR before merging to `main`. Codex works in its own worktree on `chatgpt/` branches; Claude pushes its commits unchanged and posts its reviews verbatim. Claude still reviews all art and audio. Disagreements: one PR round, then the owner | Owner instruction, 2026-10-01; the owner may switch back to separate ChatGPT sessions |
| D-035 | Approved (owner) | Codex always runs on `gpt-6.1-sol` with high reasoning effort, for tasks and reviews | Owner instruction, 2026-10-01 |
| D-028 | Agreed | Accounting boundary: persisted `accountedUntil` is a high-water mark advanced by every online step and by `reconcile`; any suspension, however short, is no-fusion offline time; one lifecycle coordinator owns browser and native pause/resume | Codex/ChatGPT round-2 counterexamples (duplicate credit, short hidden gaps, clock rewind) |
| D-029 | Agreed (rev. 4 confirmed by Codex) | Save failures: unreadable storage is never treated as empty; state validation as well as checksum; corrupt **and migration-failed** slots are *protected* and never written until their raw bytes are archived and read back; fallback to an older save is announced; otherwise unsaved-session mode with a visible banner; revisions monotonic across recovery | Codex/ChatGPT rounds 2 and 3, point 3 |
| D-030 | Superseded by D-039 | (Was: contact = ground-point distance ≤ 90.) | Owner: kids must never overlap (gate-2 feedback) |
| D-031 | Agreed | UI font: Patrick Hand Regular (SIL OFL 1.1), bundled locally with its licence; system sans-serif fallback | ChatGPT, PR #2 point 7 |
| D-032 | Agreed | Android launcher (adaptive 432 × 432 foreground/background) and splash (1152 × 1152, 768 px safe circle) from ChatGPT's 4× masters; Claude generates the native resources. M4 scope | ChatGPT, PR #2 point 8 |
| D-033 | Agreed | Drag and drop feedback is procedural and shape-based, and never hints at undiscovered recipes | ChatGPT, PR #2 point 9 |
| D-034 | Agreed | Device performance pass: 60 s at full capacity, p95 frame time ≤ 16.7 ms on the S26 Ultra and ≤ 33 ms at 4× CPU throttle; headless CI fps is logged only | Codex/ChatGPT round 2, point 5; CI has no GPU |
| D-036 | Approved (owner) | **Claude does no art at all.** Everything artistic goes to Codex (ChatGPT role): kid art, variations, poses, animations, GUI art, map art, and placeholder art too. Claude's code-drawn placeholder kids are retired as soon as Codex supplies replacements. Claude still *reviews* art for consistency and technical fit (brief) and owns the export/validation pipeline and engine integration | Owner, gate-2 feedback, 2026-10-01 |
| D-037 | Approved (owner) | Keep the opaque cream body fill. Add **variation in body shapes and sizes** so kids don't look copy-pasted. Keep the face's spirit but vary it: eyes a little farther apart on some kids, a bit lopsided on others; Codex may experiment. Make Fire's flame slightly bigger | Owner, gate-2 feedback |
| D-038 | Approved (owner) | Codex may **create new potato kids and new combinations** beyond the 10-kid / 6-recipe starter roster. Codex owns names, themes and art; Claude owns IDs, data format, validation (tiers, reachability) and balance | Owner, gate-2 feedback |
| D-039 | Approved (owner) / design by Claude | **Kids never overlap.** Each kid has a body radius (shape and size from its variant). The sim keeps bodies at least `rA + rB` apart: wandering steers away, spawns and drops resolve to the nearest free spot. **Contact for fusion = bodies touching**, `distance ≤ rA + rB + touchSlack`. A drop onto a non-recipe kid slides to the nearest free spot instead of overlapping | Owner: "They should not overlap with each other ever" |
| D-040 | Approved (owner) / design by Claude | **Scrollable map.** The world is larger than one screen (initially 2160 × 3840 world units, about 2 × 2 portrait screens); the camera shows a 1080-wide window. Drag on empty ground pans with inertia; dragging a kid near a screen edge auto-scrolls. A single giant map plate would blow the 32 MiB texture budget, so the map is assembled from Codex's ground tiles and decor sprites; Codex designs the composition within that budget | Owner: "The screen should be able to scroll to see different parts of the map" |
| D-041 | Approved (owner) | Codex designs **poses and animations** (idle, walk, pick-up, fusion, others it proposes) and the **GUI art**. This replaces "procedural motion only" (D-016) where Codex's spec says so; procedural transforms may still layer on top. Codex first proposes the variation/pose/animation format and budget; Claude reviews technical fit before production | Owner, gate-2 feedback |
| D-042 | Status | Gate 2 is **not yet approved**: the owner approved the direction (fill, character) with changes. Claude shows the owner the revised art (variations, bigger flame) before calling gate 2 approved | Owner feedback, 2026-10-01 |

## Art v2 review settlement (2026-10-01)

Owner gate-2 direction D-036..D-042 is preserved in `.codex-out/decisions-gate2.md`; those instructions supersede the legacy shared-body/map/procedural-motion decisions above.

| ID | Status | Decision | Reason / authority |
| --- | --- | --- | --- |
| D-043 | Agreed (Claude + ChatGPT) | Kids reserve a lifetime axis-aligned silhouette box in absolute source-canvas `boundsPx`; clips declare `boundsPxByBody`. Contact uses box gap with interval overlap on the other axis. Scenery retains ground reserve circles plus authored silhouette boxes. No-overlap applies during interpolation and dragging as well as simulation. | Claude counterproposal in `.codex-out/claude-v2-spec-review.md`, accepted in `.codex-out/v2-review-response.md`; avoids excessive circle spacing while containing the full visible rig. Garden roof needs its own silhouette envelope above the ground circle. |

## ASSET-PLAYABLE Part A round 2 art revision (ChatGPT, 2026-10-02; Claude review pending)

In response to PR #21's four art-review items, Snowman gains a coal-black top hat; Raincloud becomes a separate near-white cloud with rain above the face; Picnic uses one paper peak; Glassblower wears raised diagonal goggles with a larger pipe/bulb. These are original costume revisions within D-044/D-045/D-046, with no Part B delivery or new anatomy. Snowman's existing rear `kid_snowman_back_snowball` component alone changes from torso to head_top, using the existing headwear pivot/fits: a torso follower would compress and hide the hat while sitting. Reusing the component keeps the same 33-component allocation and every lifetime box. All other pivots/fits/layers/motion fields remain unchanged. Full rationale and colour/grayscale game-size review: `.codex-out/asset-playable-a-notes.md`, Round 2. This records ChatGPT's art choice for review, not a new owner approval or engineering format decision.

## Open questions

| ID | For | Question |
|---|---|---|
| O-001 | Owner | Resolved → D-026 (Galaxy S26 Ultra). |
| O-002 | Owner | Resolved → D-025 (stay private). |
| O-003 | ChatGPT | Resolved: all accepted (PR #1 round 2). |

## Sub-agents and tools

| Agent | Used by | Purpose |
|---|---|---|
| Codex CLI (Claude Code `codex` plugin) | Claude | **Fills the ChatGPT role** under D-027: art/audio owner and reviewer of Claude's code. `/codex:rescue` for tasks, `/codex:review` for PR reviews. Worktree `../potato-kid-chatgpt`. |
