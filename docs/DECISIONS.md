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
| D-042 | Superseded by D-044 | Gate 2 was **not yet approved**: the owner approved the direction (fill, character) with changes. Claude shows the owner the revised art (variations, bigger flame) before calling gate 2 approved | Owner feedback, 2026-10-01 |

## Gate 2 and gate 3 outcomes (2026-10-02)

| ID | Status | Decision | Reason / authority |
|---|---|---|---|
| D-044 | Approved (owner) | **Gate 2 approved.** Body shapes, faces, poses, map and GUI are the approved style; the owner raised no objection to the 6 new kids and recipes and set a much larger roster target (D-046). No art changes requested beyond D-045. ASSET-PLAYABLE starts: Codex polishes everything in this style | Owner, 2026-10-02: "Art style looks good. Matches the potato kid energy really well." "No changes really necessary for Codex" |
| D-045 | Approved (owner) | **No facial features beyond the face.** A kid's face is only two dot eyes and the small smirk (with blink and asleep states). No eyebrows, brow or lid strokes, noses, chins, jaw lines, cheeks, blush, freckles, teeth or ears, on faces or bodies. Anything else on a kid comes from its costume. The dreamy face's lid strokes are removed (ASSET-PLAYABLE part A); Claude's art review checks every delivery against this | Owner, 2026-10-02: "avoid giving it any other features that aren't related to their costume (i.e eyebrows, noses, chins, etc)" |
| D-046 | Approved (owner) | **Roster target: about 500 kid types** (distinct Dex entries, each with its own costume and a way to get it; body/face/size variation stays cosmetic on top). **Long-term target, not MVP scope:** the MVP (gate 4) ships a first set of roughly 50–80 types, with the content data, validation, art pipeline and texture loading built to scale to 500; the rest arrives in content waves after gate 4. Codex owns names, themes, art and combinations (D-038); Claude owns IDs, data format, validation and balance | Owner, 2026-10-02: "ideally we land on about 500 total designs for potato kids"; owner picked "500 kid types" and "long-term target" when asked |
| D-047 | Approved (owner) | **Gate 3 approved:** the first playable passes on the S26 Ultra (spawn, wander, pick up and place, R1 with fusion/discovery FX). Animations are good enough for this stage; **animation polish is a later item** (polish phase, after gate 4 per the brief), not MVP scope. The owner likes the text and font (Patrick Hand, D-031). M3 / BUILD-MVP starts | Owner, 2026-10-02: "The first playable passes. The animations could be more polished, but for right now it's good enough for how early we are in development. The text is great, good font choice." |

## Art v2 review settlement (2026-10-01)

Owner gate-2 direction D-036..D-042 is preserved in `.codex-out/decisions-gate2.md`; those instructions supersede the legacy shared-body/map/procedural-motion decisions above.

| ID | Status | Decision | Reason / authority |
| --- | --- | --- | --- |
| D-043 | Agreed (Claude + ChatGPT) | Kids reserve a lifetime axis-aligned silhouette box in absolute source-canvas `boundsPx`; clips declare `boundsPxByBody`. Contact uses box gap with interval overlap on the other axis. Scenery retains ground reserve circles plus authored silhouette boxes. No-overlap applies during interpolation and dragging as well as simulation. | Claude counterproposal in `.codex-out/claude-v2-spec-review.md`, accepted in `.codex-out/v2-review-response.md`; avoids excessive circle spacing while containing the full visible rig. Garden roof needs its own silhouette envelope above the ground circle. |

## ASSET-PLAYABLE Part A round 2 art revision (ChatGPT, 2026-10-02; Claude review pending)

In response to PR #21's four art-review items, Snowman gains a coal-black top hat; Raincloud becomes a separate near-white cloud with rain above the face; Picnic uses one paper peak; Glassblower wears raised diagonal goggles with a larger pipe/bulb. These are original costume revisions within D-044/D-045/D-046, with no Part B delivery or new anatomy. Snowman's existing rear `kid_snowman_back_snowball` component alone changes from torso to head_top, using the existing headwear pivot/fits: a torso follower would compress and hide the hat while sitting. Reusing the component keeps the same 33-component allocation and every lifetime box. All other pivots/fits/layers/motion fields remain unchanged. Full rationale and colour/grayscale game-size review: `.codex-out/asset-playable-a-notes.md`, Round 2. This records ChatGPT's art choice for review, not a new owner approval or engineering format decision.

## ASSET-PLAYABLE Part A round 3 art revision (ChatGPT, 2026-10-02; Claude review pending)

Agree with Claude's two remaining PR #21 findings: the shallow Raincloud read as a halo, and Picnic's tan paper peak read as a conical straw hat. Raincloud now uses the side of the existing head reserve for a deeper puffy cloud, with a flat underside and two falling drops; Picnic replaces the peak with a red checked kerchief and side knot. Required extra top reserve is **0 source px for each of Round, Tall, Squat and Bean**; D-043, engine code, every sidecar and the allocation remain unchanged. Snowman/Glassblower and all other accepted art are byte-identical to Round 2. Details and native colour/grayscale engine review are in `.codex-out/asset-playable-a-notes.md`, Round 3. These drawing choices remain subject to Claude's review and do not start Part B or create a new engineering/owner decision.

## ASSET-PLAYABLE Part B art delivery (ChatGPT, 2026-10-02; Claude review pending)

Complete the shared pose/clip/FX set within the existing D-043 lifetime bounds, with no extra reserve for any body and no new per-type assets under D-046. Held uses a quarter-degree lean and one-pixel lift within the approved maximum caps because headwear clearance is tight. The planned landmarks use their exact world points and 280-unit reserves; three conflicting perimeter decor instances are explicitly skipped under the existing placement rule. Approved map/GUI drawings are promoted to final after source/game-size checks. Seven unchanged historical r2 kid SVGs move to `art/history/r2/` so normal exporter cleanup retires their duplicate runtime PNGs; the delivered allocation is exactly 104 PNGs /28.03125 MiB raw. Official Patrick Hand cannot be fetched in the sandbox; no substitute or partial licence is supplied, and Claude has the exact official fetch/provenance handoff. These are art choices within D-031/D-044..D-046, not new owner decisions. Full audit and integration fields: `.codex-out/asset-playable-b-notes.md`.

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

## ASSET-PLAYABLE Part B round 2 art revision (ChatGPT, 2026-10-02; Claude review pending)

Agree with all three PR #23 findings. Discovery now bursts around and above the child; fusion uses two broad curls that join above the child, visibly distinct from low spawn puffs. Eight shared FX canvases become 320 x 320, raising the unchanged 104-image allocation to 29.15625 MiB raw and leaving 2.84375 MiB under the 32 MiB ceiling. Exporter family dimensions are adjusted only for those two FX families. Wave low/high swing the existing free left nub vertically within every original lifetime box: Round/Tall/Squat/Bean each need 0 extra source px. Accepted poses, faces, costumes, landmarks, map, GUI, spawn and shadow remain byte-identical. No engine code, animation timing or recipe metadata changes. Full field table, preservation evidence and native-size review are in .codex-out/asset-playable-b-notes.md, Round 2. This remains subject to Claude's critical art review.
