# Asset list

Owner: ChatGPT. Reviewer/integration: Claude. Status: proposed for check-in 1; no production assets made. All sizes and counts await technical agreement. See `ART_AUDIO_PLAN.md` for reference findings, source workflow, delivery, and acceptance.

## Characters and environment

| Stable planning ID | Asset / count | Proposed spec | Needed for | Status / done means |
| --- | --- | --- | --- | --- |
| kid_base | Base Potato Kid / 1 type | Editable base SVG; PNG RGBA, 256 x 256, anchor (128,224); 2 idle + 2 wander frames | Art gate | Proposed; same lumpy body/dot eyes/smirk/nubs as references, approved by owner |
| kid_fire | Fire / 1 type | Shared base, flame costume/object; same 4-frame export | Art gate | Proposed; recognizable silhouette and visible canonical face |
| kid_water | Water / 1 type | Shared base, water costume/object; same 4-frame export | Art gate | Proposed; distinct at small size without depending on color |
| kid_firefighter | Firefighter / 1 type | Shared base, helmet/tool; same 4-frame export | Art gate | Proposed; same face/body and clean prop bounds |
| kid_result_a-d | Reserved starter types / 4 slots | Same shared base and 4-frame export | First playable / MVP | Names/tiers/recipe roles await Claude; these are a budget, not four invented recipes |
| map_garden | Garden map / 1 | Opaque PNG, provisionally 1080 x 1920; quiet open play area; editable source | Art gate | Proposed; camera/safe areas agreed, crowded kids readable |
| building_garden | Potato Garden / 1 | PNG RGBA, provisional 512 x 512; bottom-center anchor with 8 px padding | First playable | Proposed; recognizable spawn building, correct scale/import |
| building_capacity | Capacity building / 1 | Same building spec | MVP | Visual form awaits Claude's building definition |
| building_spawn_bias | Spawn-bias building / 1 | Same building spec | MVP | Visual form follows agreed targeted spawn pool |
| building_compendium | Compendium building / 1 | Same building spec | MVP | Recognizable rediscovery/re-acquisition role |
| fx_shadow | Shared ground shadow / 1 | PNG RGBA 128 x 64, subtle oval | First playable | Proposed; supports anchoring and lift feedback |
| fx_spawn | Spawn puff / 3 frames | PNG RGBA 256 x 256; centered shared effect, separate from kid | First playable | Proposed; brief and unobtrusive |
| fx_fusion | Recipe fusion puff / 4 frames | Same shared-effect spec | First playable | Proposed; two parents becoming one stays legible |
| fx_discovery | First-discovery sparkle / 4 frames | Same shared-effect spec | MVP | Proposed; distinguish first discovery from repeat fusion |

Budget: eight kid types, 32 kid frames, one map, four buildings, one shadow, eleven effect frames. Dex portraits reuse each kid's approved idle art, so eight additional character drawings are not required. No additional frames for pick-up/drop or every look direction are budgeted; Claude provides restrained transforms.

## UI art

| Asset group | Count and spec | Needed for | Status / done means |
| --- | --- | --- | --- |
| Currency icons | 2: `icon_materials`, `icon_potatokens`; editable SVG and 128 x 128 PNG RGBA | First playable / MVP | Proposed; currencies remain distinct at 24-32 logical pixels |
| Navigation/status icons | 10: Garden, capacity, spawn bias, compendium, Dex, settings, audio on, audio off, unknown kid/recipe, timer; SVG and 128 x 128 PNG RGBA | MVP | Proposed; one coherent outline weight, no recipe spoilers, labels supplied by code |
| Shared panel surface | 1; SVG and provisional 256 x 256 PNG with agreed nine-slice insets | First playable / MVP | Proposed; Claude confirms whether native UI rendering is preferable |
| Shared button surfaces | 3 states: normal, pressed, disabled; SVG/PNG and agreed insets | First playable / MVP | Proposed; states distinguishable and live labels legible |
| Rarity badge marks | Budget 3; SVG/64 x 64 PNG RGBA | MVP | Tier count/names await Claude; each uses shape plus color |

Dex cards, recipe layout, offline summary, upgrades, settings, and compendium reuse these surfaces/icons. Text, layout, hit targets, and resource amounts stay in the UI implementation. No store screenshots, app-store marketing, adventure assets, prestige art, or extra skins are included in this MVP list.

## Audio

| ID | Cue | Proposed master / duration | Needed for | Status / done means |
| --- | --- | --- | --- | --- |
| sfx_ui_tap | Soft UI confirmation | Mono WAV PCM 48 kHz/16-bit; 0.08-0.15 s | First playable | Proposed; quiet and pleasant when repeated |
| sfx_pick_up | Lift | Same; 0.10-0.25 s | First playable | Proposed; clear interaction feedback |
| sfx_place | Set down | Same; 0.10-0.25 s | First playable | Proposed; distinct from lift |
| sfx_spawn | New kid appears | Same; 0.20-0.40 s | First playable | Proposed; restrained repeated cue |
| sfx_fusion | Successful recipe | Same; 0.25-0.50 s | First playable | Proposed; communicates success without harshness |
| sfx_discovery | First discovery flourish | Same; 0.60-1.20 s | MVP | Proposed; distinct reward, no simultaneous duplicate fusion cue |
| sfx_upgrade | Building upgrade | Same; 0.25-0.50 s | MVP | Proposed; satisfying confirmation |
| sfx_spend | Resource spend | Same; 0.10-0.25 s | MVP | Proposed; use when no more specific success cue applies |
| music_garden | Original ambient instrumental loop / 1 | Stereo WAV PCM 48 kHz/16-bit; 60-90 s; note/MIDI source and loop boundaries | MVP | Proposed scripted composition/render; seamless and non-fatiguing after listening review |

Runtime codec awaits Claude's stack choice. Keep music/SFX separately controllable and do not sonify every passive-income tick. No audio assets exist yet; tool limitations and proposed music route are recorded in `ART_AUDIO_PLAN.md`.

## Acceptance for every delivery

- Source, preview, runtime export, provenance/license, and manifest agree on asset IDs and revision.
- Correct dimensions, alpha behavior, padding, anchors, frame order, and timing; no clipped outlines or unintended empty frames.
- Preview transparent art on light/dark backgrounds and in a crowded portrait scene at actual display sizes. Outline and face remain readable.
- Confirm audio decodes in Claude's target runtime; check peaks, clicks, loop boundaries, and listening balance on headphones and phone speakers.
- Claude posts review of reference consistency and technical fit in GitHub. Art-gate samples additionally require owner approval before full production.
