# Combined project plan draft: check-in 1

Status: draft consolidation, not owner-approved. Prepared by ChatGPT on 2026-10-01 from [Claude's engineering proposal, PR #1](https://github.com/vanitycrysis/potato-kid/pull/1) and [ChatGPT's art/audio proposal, PR #2](https://github.com/vanitycrysis/potato-kid/pull/2). Claude's response to ChatGPT's engineering review and Claude's reciprocal art review are pending. This document is the concrete shared plan for review, not a claim that both collaborators have signed off.

## Game and MVP scope

A phone-first, portrait, freely wandering potato ecosystem. The player picks up and places kids to discover sparse hidden recipes. Each successful recipe consumes exactly two parents and produces one higher-tier kid. Preserve the same lumpy body and dot-eyes/smirk identity across costumes. No grid.

MVP includes capacity, Garden spawning/upgrades, passive Materials, Potatokens and instant spawning, offline progress, save/recovery, four building roles (Garden, capacity, spawn bias, compendium), Potato-Dex discoveries/recipes, paid re-acquisition of known kids, and a starter budget of ten types/six recipes. Claude must specify the actual IDs, tiers, spawn pool, recipe table, and building definitions before the content contract is complete. Adventures, endgame/prestige/events, cloud saves, extra skins, cap-extension upgrades, and polish beyond the MVP gate remain deferred.

## Proposed stack and architecture

Adopt Claude's proposal: strict TypeScript, PixiJS v8 rendering, Vite, Capacitor Android-first packaging, Howler audio, Vitest for simulation/economy/save behavior, Playwright browser smoke/visual checks, GitHub Actions, and a GitHub Pages browser build. Pin compatible dependency versions during the approved scaffold rather than installing anything now. Android build-toolchain availability must be checked; native iOS tooling/distribution is a separate dependency. DOM versus Pixi UI remains to be resolved by Claude, with live text and adequate touch targets required.

Keep simulation independent of rendering and audio. Commands enter a fixed-step simulation; events drive visual/audio feedback. Seeded RNG and data-driven content enable deterministic checks. Use atomic consume-two/produce-one resolution, stable tie-breaking, no fusion while dragging, and a playtested newborn grace period. Rendering interpolates movement; layer transforms keep costumes attached to the canonical body/face.

The proposed offline mode does not replay wandering or fusions. Persist spawn phase, RNG, and reconciliation time; admit only capacity-limited spawns and credit each new kid's income for the time it actually existed. Specify cap behavior and prevent duplicate catch-up from multiple resume signals. Saving needs schema version, monotonic revision, serialized alternating-slot writes, integrity validation, defined recovery/migration order, and storage-error handling. These details are requested corrections to Claude's initial plan, awaiting Claude's response in PR #1.

Economy starts from Claude's proposed 12-second spawn interval, capacity 12, tier-scaled passive income, upgrade costs, and spawn bias. These are tuning proposals, not validated balance. Claude's headless economy simulator will measure first-recipe timing, progression, and starvation before acceptance. The Materials faucet, premium-currency scope, and offline cap/fusion policy require owner sign-off below.

## Art and audio pipeline and asset list

ChatGPT owns editable SVG body/face/costume source, coherent PNG layers and flattened review previews, UI art, map/building art, shared effects, and original audio. Claude reviews reference consistency and dimensions/formats/naming/transparency, then owns engine import, atlas packing, integration, and procedural motion. See `ART_AUDIO_PLAN.md` and `ASSETS.md` for the detailed deliverable contract.

- Ten kid types: base, Fire, Water, Firefighter, and six slots named by Claude. Runtime budget is one shared body, one shared face, nine overlays; 256 x 256 RGBA with proposed ground anchor (128,224). No per-type frame sets.
- One quiet 1080 x 2340 garden master; four building sprites; one shadow; eleven shared spawn/fusion/discovery effect frames. Safe areas/camera/cropping await technical agreement.
- Twelve UI icons, one shared panel, three button states, and a provisional three-tier badge set. Dex portraits reuse the character composites. Live text and layouts stay in code.
- Eight short effects and one 60-90 second original instrumental loop. ChatGPT has no dedicated music-generation tool; use reproducible note/MIDI composition and scripted synthesis, subject to listening review. WAV masters, proposed Ogg/M4A runtime alternatives, actual target-runtime decode/loop checks, and separate music/SFX controls.

Black/near-black ink and a cream body fill with restrained type accents are proposed. The original references are transparent line drawings; the filled-body adaptation must be approved through actual art-style samples. Test costumes at 48/64/96 logical pixels and in a crowded garden. The initial decoded art-texture target is <=32 MiB, subject to atlas/renderer/device measurement.

## Milestones and review gates

| Milestone | Work | Exit |
| --- | --- | --- |
| M0: plan | Exchange proposals, resolve review findings and interfaces, consolidate tracking docs | Owner gate 1 approves this final reviewed plan; pending |
| M1: art style and skeleton | ChatGPT makes base + Fire/Water/Firefighter + map; Claude creates scaffold/CI/browser build and tests placeholder composition | Claude reviews assets; owner gate 2 approves the actual visual samples |
| M2: first playable | Spawn, wander, pick up/place, one working recipe with approved parents/result and basic feedback | ChatGPT reviews code/behavior; owner gate 3 approves playable |
| M3: systems | Currencies, buildings, Dex/compendium, offline progress, saving, starter content, balance simulator | Engineering checks, art/audio delivery, reciprocal reviews; no separate owner gate |
| M4: MVP complete | Android build, full audio, device performance/readability/listening, balance and recovery checks | Owner gate 4 approves complete MVP before polish or extra content |

All work uses separate collaborator branches/worktrees and GitHub PRs. Reviews must be critical; neither collaborator merges their own work without the other's review. If a disagreement survives one discussion round, present both cases to the owner. Consolidate shared `TASKS.md`, `DECISIONS.md`, and `ASSETS.md` without discarding either collaborator's requirements.

## Validation and acceptance

Claude's implementation checks must cover atomic consumption, higher-tier/valid/reachable recipe content, save recovery/migration, offline partial intervals/tier income/capacity/resume idempotence/clock handling, and resource transaction behavior. Browser smoke tests exercise dragging and discovery. Art acceptance covers alpha, anchors, coherent layers, clipping, small-scale silhouettes, and crowded portraits. Audio acceptance includes actual listening, decoding, unlock/resume, event prioritization, volume controls, and loop continuity.

A headless screenshot is a visual check, not a phone-performance result. Measure frame times and texture memory with full capacity, effects, HUD, input, and simulation on an identified phone; 60 fps is a target to validate. Record tooling/device limitations honestly. No game tests have run at planning stage.

## Pending collaborator work before owner check-in 1

1. Claude responds to the [engineering review](https://github.com/vanitycrysis/potato-kid/pull/1#issuecomment-5939846296), revises the plan, and supplies the concrete roster/recipes, capacity spawn policy, save/offline contract, and device/UI/audio acceptance details.
2. Claude reviews PR #2's art/audio proposal and confirms or revises technical interfaces; ChatGPT resolves the feedback.
3. Consolidate both PRs' shared tracking records and update this draft to agreed status, with review links and remaining owner choices. No construction of game systems or production assets starts before project-plan approval.

## Owner choices at the completed gate

- Approve or revise stack, Android-first milestone scope, and asset budget; identify the phone for playable/device testing.
- Confirm tier-scaled passive Materials income, or choose a replacement.
- Confirm Potatokens earned through discoveries/milestones, instant-spawn availability, no real-money purchases in MVP, and the specific time-skip behavior to include. Construction timers are not silently added to scope.
- Approve or revise no offline fusions and the proposed eight-hour catch-up cap; time beyond that cap and return behavior must be explicit in the final reviewed plan.

These are the brief's milestone decisions, collected for the completed gate. They are not being asked on this incomplete draft.
