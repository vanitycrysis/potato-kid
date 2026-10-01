# Combined project plan: revised consolidation draft

Prepared by ChatGPT, 2026-10-01, from [PR #1 engineering rev. 2](https://github.com/vanitycrysis/potato-kid/pull/1) and [PR #2 art/audio revision](https://github.com/vanitycrysis/potato-kid/pull/2). Status: draft, **PR #1 changes requested**; Claude must verify PR #2 revisions and finalize the merged plan. Owner approval of stack/rules is recorded in Claude's consolidated DECISIONS.md; review and approval of the complete asset list/roster are not implied. No production assets were created in this task.

## Game, roster and MVP scope

Phone-first portrait ecosystem, free wandering, no grid. Pick up/place kids to discover hidden recipes. Every fusion consumes two parents and makes one kid above both parent tiers. All costumes retain the same lumpy body and dot-eyes/smirk identity.

MVP: Garden spawn/upgrades, capacity, spawn bias, Materials/Potatokens, instant spawns, Dex/hidden recipes, compendium re-acquisition, offline progress, saving/recovery. Garden is the only map building; Capacity/Bias/Compendium use tray icons and DOM panels. No construction timers, IAP, offline fusion or cap-extension upgrades. Adventures, endgame/prestige/events, cloud saves and extra skins remain deferred.

| Tier | Stable IDs / themes |
| --- | --- |
| 1, spawn pool | plain (base), fire (flame), water (droplet), snow (beanie/scarf) |
| 2, recipe results | chef (hat/pan), firefighter (helmet/hose), snowman (snowball costume), steam (vapour crest) |
| 3, recipe results | hero (rescue cape/medal), sundae (dessert bowl/topping) |

| Recipe | Parents -> result |
| --- | --- |
| R1, first playable | plain + water -> firefighter |
| R2 | plain + fire -> chef |
| R3 | plain + snow -> snowman |
| R4 | fire + water -> steam |
| R5 | fire + firefighter -> hero |
| R6 | chef + snowman -> sundae |

Spawn weights plain/fire/water/snow = 40/20/20/20. Garden starts at 12 s, capacity at 12. Materials income is tier-scaled; balance values remain tunable. Potatokens come from discoveries/Dex milestones and pay for instant spawns or alternative compendium payment. Upgrades are instant. Balance simulation measures first-recipe/tier timing and starvation.

## Stack, simulation and delivery

Owner-approved TypeScript + PixiJS v8 + Vite + Capacitor, Android first. Accept Claude's DOM UI overlay with live text and >=44 CSS px targets. Howler audio, Vitest simulation/economy/save/content checks, Playwright browser flows, GitHub Actions. Claude reports local Android SDK/JDK availability; CI supplies its toolchain. Repo stays private. Deliver web ZIP and debug APK as CI artifacts, not a Pages dependency. iOS remains later with separate native tooling/distribution requirements.

Pure fixed-step 10 Hz simulation, seeded RNG, commands in/events out, interpolated rendering. Stable IDs and atomic consumption prevent double fusion; dragged kids are excluded and cancellations return to drag origin. Require an actual distance/contact predicate before fusion, not only spatial-hash proximity. CI checks unique IDs/pairs, higher result tiers, reachable recipes, valid weights, required assets and Dex entries.

Offline: owner-approved eight-hour cap, excess discarded and reported, no wandering/fusion replay. Persist spawn phase/RNG and the time through which income/spawns were accounted. Credit existing income over eligible elapsed time and new kids only from their admission times. At capacity, phase advances only with elapsed time up to one banked interval. Exact phase handling, online/offline boundary ownership and hidden short absences still need the corrections in ChatGPT's round-2 review.

Save proposal: schema/checksum/revision, serialized alternating-slot writes, highest valid revision, future-schema overwrite protection, load -> migrate -> reconcile -> save. Before acceptance, define storage-read versus corrupt-data failures, migration/state-validation failure and durable quarantine before replacement. Storage errors must not silently cause loss or fresh-save overwrite.

## Art/audio contract and asset budget

ChatGPT owns editable source, aligned exports, previews, provenance and original audio; Claude reviews fidelity/import fit and owns integration, atlas packing, generated manifest, codecs and motion. Detailed contract: ART_AUDIO_PLAN.md and ASSETS.md.

- Ten kid types: shared body/face, nine front costumes and up to five back costumes (16 textures total). Each 256 x 256 RGBA, anchor (128,224), >=8 px padding. Draw back -> body -> face -> front; absent layers omitted. Procedural animation, no per-type frame sets; Dex reuses composites.
- Start export strokes near 7-8 px. Warm opaque fill and bolder stroke require actual art-gate approval. Preview 48/64/96 CSS px and a crowded 40-kid scene.
- Opaque Garden map 1080 x 2400, safe band y=240..2160; decorative 240 px bleed at each end. Width-fit centred camera. Nominal wander y=400..1880 after top160/bottom280 world-unit HUD/tray insets; further constrain for kid radius, Garden footprint and actual visible unobscured viewport/native insets.
- One 512 x 512 Garden map sprite, one shared shadow, eleven shared effect frames. Capacity/Bias/Compendium use icons. Twelve UI icons, shared panel/three button surfaces and three tier marks; live text/layout/hit areas stay in DOM.
- Locally bundled Patrick Hand Regular font, [SIL OFL licence](https://github.com/google/fonts/blob/main/ofl/patrickhand/OFL.txt), retained copyright/licence and system sans-serif fallback. Device text/number/glyph/reflow review.
- M4 Android adaptive foreground/background 432 x 432, essential content in central 264 px diameter circle. Static splash SVG and 1152 x 1152 PNG preview/master, essential content in 768 px circle, for Android's 288/192 dp no-icon-background option. Claude generates native resources and verifies masks/launch; M2 may use placeholders. Specs/source links in ART_AUDIO_PLAN.md.
- Procedural held-kid outline/ring and in-bounds shape feedback; no extra bitmap. Never reveal an undiscovered recipe through valid-match highlighting.
- Eight SFX and one original 60-90 s loop, reproducible note/MIDI/scripted synthesis. No dedicated music generator available here; finished music depends on listening acceptance. WAV 48 kHz/16-bit masters only from ChatGPT; Claude builds Ogg Vorbis/M4A AAC with ffmpeg. Peak/listening SFX checks, music starting near -18 LUFS, runtime codec/seam audition and persisted separate volume/mute/unlock/pause/resume controls.
- Claude generates runtime manifest paths/dimensions/layer mappings from exports. ChatGPT supplies assets/PROVENANCE.md for sources/tools/prompts/licences/revisions; no manually maintained runtime manifest.

Initial <=32 MiB decoded texture target includes map, atlases, effects and UI. Test worst-case four-layer kids, 40 population, HUD/input/effects on the owner's Galaxy S26 Ultra; measure frame-time percentiles/memory. Four-times CPU-throttled browser testing is an additional proxy, not proof of another phone's performance. Target 60 fps; set an explicit measurement window/pass threshold before device acceptance.

## Milestones and owner gates

| Milestone | Work | Exit |
| --- | --- | --- |
| M0 plan | Resolve engineering findings, verify revised art plan, consolidate shared records | Owner stack/rules already approved; finalize complete reviewed plan and acknowledge roster/asset list |
| M1 art style + skeleton | Plain/Fire/Water/Firefighter/map and small/crowded previews; Claude scaffold/CI/placeholder compositing | Claude reviews imports/style; owner gate 2 approves actual samples |
| M2 first playable | Spawn, wander, pick up/place, R1, debug APK, essential feedback | ChatGPT engineering/readability review; owner gate 3 |
| M3 systems | Currencies, building roles, Dex/compendium, offline/save, full roster/audio, balance simulator | Tests/imports/listening and reciprocal reviews |
| M4 MVP | Balance/device/recovery checks, final font/launch art, candidate APK | Owner gate 4 before polish or extra content |

Owner answers recorded in PR #1 include stack/Android first, tier-scaled passive Materials, Potatoken scope/no IAP/instant upgrades, eight-hour cap/no offline fusion, private repo and Galaxy S26 Ultra. Do not re-request these answers. Style, first-playable and MVP gates remain. Claude must present the final roster/asset list and clearly record any remaining gate-1 acknowledgment.

## Review status and next work

Round-1 engineering review is historical in ENGINEERING_REVIEW.md. [Claude's PR #1 response](https://github.com/vanitycrysis/potato-kid/pull/1#issuecomment-5940047945) was checked against current remote rev. 2. ChatGPT's round-2 report is .codex-out/pr1-round2-review.md, awaiting Claude's verbatim PR posting: changes requested for timer/lifecycle, save-error and contact-contract issues. Accept D-009/D-011/D-022/D-023/D-024/D-025; no roster renames.

[Claude's PR #2 review](https://github.com/vanitycrysis/potato-kid/pull/2#issuecomment-5940058569) points 1-9 are applied; .codex-out/pr2-response.md records each response and proposed decision updates. Claude must verify these revisions. This document incorporates both reviews without claiming engineering approval.

Claude merges PR #1 only after resolving/escalating the round-2 findings. Then rebase PR #2, retain art/assets/review/joint-plan docs, and preserve the updated ChatGPT handoff within Claude's consolidated TASKS.md before dropping conflicting branch copies. DECISIONS.md is untouched here. PRs #3/#4 remain separate unreviewed implementation work in this task. After plan consolidation, art-style samples are next; no style approval or game tests are claimed.
