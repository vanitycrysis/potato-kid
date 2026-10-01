# Asset list

Owner: ChatGPT. Reviewer/integration: Claude. Revision 2, 2026-10-01: Claude's nine review points applied; awaiting verification. No production assets exist. Specifications below define delivery; actual appearance/fill/stroke require owner gate 2. See ART_AUDIO_PLAN.md for workflow.

## Characters and environment

Every kid uses shared kid_plain_body.png and kid_plain_face.png, 256 x 256 sRGB RGBA, ground anchor (128,224), at least 8 px clear padding. Optional costumes use `kid_<id>_overlay_back.png` / `kid_<id>_overlay_front.png`. Order: back -> body -> face -> front. Front artwork leaves eyes/smirk visible; absent layers have no PNG. Editable SVG and flattened previews accompany exports.

| Type / asset ID | Tier / source | Theme / planned costume layers | Needed for | Status / done means |
| --- | --- | --- | --- | --- |
| kid_plain | 1 / spawn | Shared lumpy body, dot eyes/smirk/nubs; no costume | Art gate / R1 | Planned; reference identity approved by owner |
| kid_fire | 1 / spawn | Flame tips behind body, small flame crest in front; warm accent | Art gate | Planned; reads as flame at 48/64 px |
| kid_water | 1 / spawn | Droplet hood/object in front; cool accent | Art gate / R1 | Planned; distinct from flame and steam without colour |
| kid_snow | 1 / spawn | Beanie and scarf in front, based on snow references | MVP | Planned; distinct from snowman |
| kid_chef | 2 / R2 | Chef hat and pan/spoon in front, based on cook references | MVP | Planned; prop inside padding, face unchanged |
| kid_firefighter | 2 / R1 | Hose tail behind; helmet/nozzle in front | Art gate / R1 | Planned; helmet/hose legible and aligned |
| kid_snowman | 2 / R3 | Compact snowball plinth behind; snow buttons/accessory in front | MVP | Planned; fits frame without shrinking shared body or replacing face |
| kid_steam | 2 / R4 | Curling vapour crest in front; restrained pale accent | MVP | Planned; silhouette distinct from Water and fusion puff |
| kid_hero | 3 / R5 | Cape behind; medal in front; firefighter rescue theme | MVP | Planned; costume consistent with Fire + Firefighter |
| kid_sundae | 3 / R6 | Bowl rear behind; bowl rim/topping in front; chilled dessert theme | MVP | Planned; face clear, distinct from snowman |
| map_garden | — | Opaque PNG 1080 x 2400; central 1080 x 1920 safe band y=240..2160; top/bottom decorative bleed; editable source | Art gate | Planned; 16:9/20:9 and safe-inset crowded previews pass |
| building_garden | — | RGBA PNG 512 x 512; bottom-centre ground anchor (256,480), >=8 px clear padding | First playable | Planned; recognizable spawn building and agreed footprint |
| fx_shadow | — | Shared subtle oval, RGBA PNG 128 x 64 | First playable | Planned; anchoring/lift legible |
| fx_spawn | — | 3 shared RGBA 256 x 256 frames, fx_spawn_01..03.png | First playable | Planned; brief/unobtrusive, engine timing reviewed |
| fx_fusion | — | 4 shared RGBA 256 x 256 frames, fx_fusion_01..04.png | First playable | Planned; consume-two/make-one legible |
| fx_discovery | — | 4 shared RGBA 256 x 256 frames, fx_discovery_01..04.png | MVP | Planned; first discovery distinct from repeat fusion |

Ten types: two shared textures, nine front costumes and up to five back costumes = at most 16 kid textures. One map, one Garden building, one shadow, eleven effect frames. Capacity/Bias/Compendium have tray icons only. Dex portraits reuse composites; ten flattened previews are review artifacts. Procedural movement/pick-up/drop, no per-type frame sets. Nominal wandering bounds y=400..1880 also respect sprite radii, Garden footprint and actual unobscured viewport.

Recipes retained without renames: R1 plain + water -> firefighter (first playable); R2 plain + fire -> chef; R3 plain + snow -> snowman; R4 fire + water -> steam; R5 fire + firefighter -> hero; R6 chef + snowman -> sundae. Spawn weights: plain 40, fire/water/snow 20 each. Claude owns rules/balance, ChatGPT names/themes.

## UI and platform art

| ID / group | Count and spec | Needed for | Status / done means |
| --- | --- | --- | --- |
| icon_materials, icon_potatokens | 2; editable SVG + 128 x 128 RGBA PNG | First playable / MVP | Planned; distinct at 24-32 CSS px |
| Navigation/status icons | 10: icon_garden, icon_capacity, icon_bias, icon_compendium, icon_dex, icon_settings, icon_audio_on, icon_audio_off, icon_unknown, icon_timer; SVG + 128 x 128 RGBA PNG | Essential subset first playable; full set MVP | Planned; coherent ink; no hidden-recipe hints; timer means spawn/offline time, not construction |
| ui_panel | 1; SVG + 256 x 256 PNG surface | First playable / MVP | Planned; DOM decoration, CSS/insets agreed with Claude |
| ui_button_normal, ui_button_pressed, ui_button_disabled | 3; SVG + 256 x 256 PNG surfaces | First playable / MVP | Planned; live labels/states legible |
| badge_tier_1, badge_tier_2, badge_tier_3 | 3; SVG + 64 x 64 RGBA PNG | MVP | Planned; shape plus colour identifies tier |
| font_patrick_hand_regular | 1 locally bundled font, full OFL.txt/copyright; source revision/hash in provenance | First UI / M4 final | Selected, not downloaded; device labels/numbers/glyphs/reflow/fallback reviewed |
| android_launcher_foreground | 1 SVG + transparent 432 x 432 PNG; key art inside central 264 px diameter circle | M4 | Planned; face/sprouts survive circle/squircle masks |
| android_launcher_background | 1 SVG + opaque 432 x 432 PNG | M4 | Planned; full bleed, quiet contrast |
| android_splash_logo | 1 SVG + transparent 1152 x 1152 PNG; key art inside central 768 px diameter circle | M4 | Planned; native vector conversion and masked launch checked |

Patrick Hand Regular uses [SIL OFL 1.1](https://github.com/google/fonts/blob/main/ofl/patrickhand/OFL.txt); bundle licence alongside the font, use system sans-serif fallback. Font files are not textures. Android PNG dimensions are 4x art masters; Claude generates density-specific/native resources. Splash uses the no-icon-background 288/192 dp option in [Android's dimensions](https://developer.android.com/develop/ui/views/launch/splash-screen#dimensions), with an opaque cream window background in code. See ART_AUDIO_PLAN.md for adaptive-icon source and packaging responsibilities.

DOM text, layout, hit targets (>=44 CSS px), quantities and focus stay in code. Dex/cards/offline/upgrades/settings reuse surfaces/icons. Drag outline/ring and in-bounds feedback are procedural and shape-based; recipe-specific hints may only reference already-discovered recipes. No dedicated drag bitmap. No store screenshots, marketing, adventures, prestige art or extra skins.

## Audio

| ID | Cue | Master / duration | Needed for | Status / done means |
| --- | --- | --- | --- | --- |
| sfx_ui_tap | Soft confirmation | Mono WAV PCM 48 kHz/16-bit; 0.08-0.15 s | First playable | Planned; quiet repeated cue |
| sfx_pick_up | Lift | Same; 0.10-0.25 s | First playable | Planned; clear lift |
| sfx_place | Set down | Same; 0.10-0.25 s | First playable | Planned; distinct from lift |
| sfx_spawn | New kid | Same; 0.20-0.40 s | First playable | Planned; restrained repetition |
| sfx_fusion | Successful recipe | Same; 0.25-0.50 s | First playable | Planned; gentle success |
| sfx_discovery | First discovery | Same; 0.60-1.20 s | MVP | Planned; replaces same-event fusion cue |
| sfx_upgrade | Building upgrade | Same; 0.25-0.50 s | MVP | Planned; clear confirmation |
| sfx_spend | Resource spend | Same; 0.10-0.25 s | MVP | Planned; only without a more specific success cue |
| music_garden | Original instrumental loop | Stereo WAV PCM 48 kHz/16-bit; 60-90 s; note/MIDI source + loop sample boundaries | MVP | Planned scripted composition; seamless/non-fatiguing after listening |

ChatGPT delivers WAV masters and reproducible source only. Claude's ffmpeg build generates Ogg Vorbis/M4A AAC and verifies decode/looping on Howler/Android WebView. Listening/peak checks for SFX, near -18 LUFS starting target for music; no short-SFX LUFS requirement. Separate music/SFX controls and no passive-income tick cues.

## Acceptance for every delivery

- Stable IDs match source, previews, exports and assets/PROVENANCE.md (source/tool/prompts/licence/revision); include font licence. Claude's build generates runtime paths/dimensions/layer mappings; no hand-maintained runtime manifest.
- CI checks naming/dimensions/alpha. Review anchors, padding, layer alignment, effect order/timing, clipping, correct opaque map/body and no empty optional exports.
- Inspect on light/dark backgrounds and at 48/64/96 CSS px in crowded portrait layouts. Check outline, face and costume silhouettes; art-gate owner approval includes fill and 7-8 px stroke.
- Measure <=32 MiB decoded textures including atlas overhead; test 40 kids with four-layer cases and HUD/input/effects on the owner-named phone. Source PNG sizes are not performance evidence.
- Audition WAV and build codecs on headphones/phone speakers; check decode, peaks, clicks, seam repetition, balance, mute/unlock/pause/resume.
- Claude reviews reference fidelity and technical fit in GitHub; actual art-gate samples need owner approval before roster production.
