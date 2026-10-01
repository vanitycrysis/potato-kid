# Potato Kid: combined project plan

**Final (2026-10-01).** Drafted by ChatGPT and finalized by Claude after both reviews closed:
- [PR #1](https://github.com/vanitycrysis/potato-kid/pull/1): engineering plan, four review rounds, approved by Codex/ChatGPT at rev. 4.
- [PR #2](https://github.com/vanitycrysis/potato-kid/pull/2): art/audio plan, two rounds, approved by Claude.

The detailed contracts live in `ENGINEERING_PLAN.md`, `ART_AUDIO_PLAN.md` and `ASSETS.md`; decisions are in `DECISIONS.md`. Owner approvals so far: stack, game rules, Android first, test device and private repo (D-014, D-018 to D-021, D-025, D-026). The owner acknowledges the roster and asset list at gate 2.

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

Pure fixed-step 10 Hz simulation, seeded RNG, commands in/events out, interpolated rendering. Contact = ground-point distance ≤ 90 world units, on the body only (D-030). Stable IDs and atomic consumption prevent double fusion; dragged kids are excluded, and cancellations return to the drag origin. CI checks unique IDs/pairs, higher result tiers, reachable recipes, valid weights, balance shape, required assets and Dex entries.

**Offline:** owner-approved 8-hour cap, with excess discarded and reported; no wandering or fusion replay. The persisted `accountedUntil` high-water mark is advanced by every online step and by `reconcile`, so no time is credited twice, even after a clock rewind. One lifecycle coordinator owns browser and native pause/resume. Any suspension, however short, is no-fusion offline time.

Existing kids earn over the whole absence; each new kid earns from its admission time. Phase rule: after a spawn, `min(interval, away − t_last)`; otherwise `min(interval, progress + away)`. Reaching capacity never banks time by itself (D-018, D-028).

**Save:** schema, checksum and monotonic revision; serialized alternating-slot writes; highest valid revision wins; future-schema overwrite protection; load → migrate → reconcile → save.
- Unreadable storage is never treated as empty.
- Corrupt and migration-failed slots are protected until their raw bytes are archived and read back.
- A fallback to an older save is announced.
- Otherwise the game runs in an unsaved session with a visible banner (D-029).

## Art/audio contract and asset budget

ChatGPT owns editable source, aligned exports, previews, provenance and original audio; Claude reviews fidelity/import fit and owns integration, atlas packing, generated manifest, codecs and motion. Detailed contract: ART_AUDIO_PLAN.md and ASSETS.md.

- Ten kid types: shared body/face, nine front costumes and up to five back costumes (16 textures total). Each 256 x 256 RGBA, anchor (128,224), >=8 px padding. Draw back -> body -> face -> front; absent layers omitted. Procedural animation, no per-type frame sets; Dex reuses composites.
- Start export strokes near 7-8 px. Warm opaque fill and bolder stroke require actual art-gate approval. Preview 48/64/96 CSS px and a crowded 40-kid scene.
- Opaque Garden map 1080 x 2400, safe band y=240..2160; decorative 240 px bleed at each end. The camera fits the safe band (`min(w/1080, h/1920)`, centred), which is width-fit on portrait phones. The app is locked to portrait. Nominal wander y=400..1880 after top160/bottom280 world-unit HUD/tray insets; further constrain for kid radius, Garden footprint and actual visible unobscured viewport/native insets.
- One 512 x 512 Garden map sprite, one shared shadow, eleven shared effect frames. Capacity/Bias/Compendium use icons. Twelve UI icons, shared panel/three button surfaces and three tier marks; live text/layout/hit areas stay in DOM.
- Locally bundled Patrick Hand Regular font, [SIL OFL licence](https://github.com/google/fonts/blob/main/ofl/patrickhand/OFL.txt), retained copyright/licence and system sans-serif fallback. Device text/number/glyph/reflow review.
- M4 Android adaptive foreground/background 432 x 432, essential content in central 264 px diameter circle. Static splash SVG and 1152 x 1152 PNG preview/master, essential content in 768 px circle, for Android's 288/192 dp no-icon-background option. Claude generates native resources and verifies masks/launch; M2 may use placeholders. Specs/source links in ART_AUDIO_PLAN.md.
- Procedural held-kid outline/ring and in-bounds shape feedback; no extra bitmap. Never reveal an undiscovered recipe through valid-match highlighting.
- Eight SFX and one original 60-90 s loop, reproducible note/MIDI/scripted synthesis. No dedicated music generator available here; finished music depends on listening acceptance. WAV 48 kHz/16-bit masters only from ChatGPT; Claude builds Ogg Vorbis/M4A AAC with ffmpeg. Peak/listening SFX checks, music starting near -18 LUFS, runtime codec/seam audition and persisted separate volume/mute/unlock/pause/resume controls.
- Claude generates runtime manifest paths/dimensions/layer mappings from exports. ChatGPT supplies assets/PROVENANCE.md for sources/tools/prompts/licences/revisions; no manually maintained runtime manifest.

Initial <=32 MiB decoded texture target includes map, atlases, effects and UI. Test worst-case four-layer kids, 40 population, HUD/input/effects on the owner's Galaxy S26 Ultra; measure frame-time percentiles/memory. Four-times CPU-throttled browser testing is an additional proxy, not proof of another phone's performance. Pass threshold (D-034): a 60 s run at full capacity with p95 frame time ≤ 16.7 ms on the S26 Ultra and ≤ 33 ms at 4× CPU throttle. Headless CI frame rate is logged only.

## Milestones and owner gates

| Milestone | Work | Exit |
| --- | --- | --- |
| M0 plan | **Done**: both proposals reviewed, consolidated and merged | Stack/rules approved by owner; roster and asset list acknowledged at gate 2 |
| M1 art style + skeleton | Plain/Fire/Water/Firefighter/map and small/crowded previews; Claude scaffold/CI/placeholder compositing | Claude reviews imports/style; owner gate 2 approves actual samples |
| M2 first playable | Spawn, wander, pick up/place, R1, debug APK, essential feedback | ChatGPT engineering/readability review; owner gate 3 |
| M3 systems | Currencies, building roles, Dex/compendium, offline/save, full roster/audio, balance simulator | Tests/imports/listening and reciprocal reviews |
| M4 MVP | Balance/device/recovery checks, final font/launch art, candidate APK | Owner gate 4 before polish or extra content |

Owner answers recorded in PR #1 include stack/Android first, tier-scaled passive Materials, Potatoken scope/no IAP/instant upgrades, eight-hour cap/no offline fusion, private repo and Galaxy S26 Ultra. Do not re-request these answers. Style, first-playable and MVP gates remain. Claude must present the final roster/asset list and clearly record any remaining gate-1 acknowledgment.

## Review record

| Round | Reviewer | Result |
| --- | --- | --- |
| PR #1 round 1 | ChatGPT | Six changes requested (`ENGINEERING_REVIEW.md`) → rev. 2 |
| PR #2 round 1 | Claude | Nine changes requested → ChatGPT rev. 2 applied all nine, disputed none |
| PR #1 round 2 | Codex/ChatGPT | Phase, accounting, save failures, contact, short absences, clock rewind, layers → rev. 3 |
| PR #1 round 3 | Codex/ChatGPT | One remaining save hole (migration-failed slot) → rev. 4 |
| PR #1 round 4 | Codex/ChatGPT | **Approved** |
| PR #2 round 2 | Claude | **Approved** |

No disagreement needed an owner decision. The save-recovery point Codex asked to raise is reported to the owner for information: both collaborators agreed on the fix.

**Implementation so far:** PR #3 (scaffold) and PR #4 (layered kids, wander, content validator) are merged after Codex code review. PR #5 (first playable) and PR #6 (art export tool) are in review. **Next:** ART-STYLE samples for gate 2.
