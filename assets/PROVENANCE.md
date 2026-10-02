# Asset provenance

## Current delivery: ASSET-PLAYABLE Part B (2026-10-02)

Revision **asset-playable-b-1**, author ChatGPT/Codex in the ChatGPT project role. Original hand-authored SVG paths and JSON, written with Node.js using .codex-out/author-asset-playable-b.mjs; Chromium/Playwright raster export and review. References: all 22 supplied reference images inspected via the reference contact sheet, D-044..D-046, approved Part A art and garden/GUI sources. No image generation, tracing, external artwork, baked runtime text or external audio. Licence: original work for Potato Kid.

New: 16 deferred body pose SVGs, 11 event-FX SVGs, one shadow SVG and two landmark SVGs. Existing faces, 16 costume definitions/33 costume SVG drawings, original poses and all four lifetime boxes remain unchanged. Existing map/building/native GUI drawings are promoted to final by metadata only. Three sidecars now carry this revision. Each source's own desc retains its drawing revision; status-only promotions do not falsely claim a redraw. Exact current source dimensions, SHA-256, revision and status are in .codex-out/asset-playable-b-inventory.json. Generated PNG/JSON/SVG exports inherit their source revision; output hashes and source preservation are in .codex-out/asset-playable-b-export-check.json.

Seven historical r2 kid sources moved unchanged from art/src/kids/ to **art/history/r2/**. Their hashes are recorded in the export check; the corresponding legacy PNGs are retired by normal exporter stale-file cleanup, preventing duplicate runtime loads. Historical provenance below refers to these preserved originals. Historical scratch author/check scripts may retain their original source paths; use the Part B checkers for the current delivery.

### Patrick Hand Regular: blocked fetch; Claude handoff (D-031)

No font binary, substitute, partial licence, copyright, revision or invented hash is bundled. Shell fetch of the official upstream failed with **fetch failed** under restricted network access. The official directory was verified through the browser: [Google Fonts Patrick Hand upstream](https://github.com/google/fonts/tree/main/ofl/patrickhand).

Claude must fetch the exact upstream **PatrickHand-Regular.ttf** and **full OFL.txt**, without modification or conversion, from these official paths:

- https://raw.githubusercontent.com/google/fonts/main/ofl/patrickhand/PatrickHand-Regular.ttf
- https://raw.githubusercontent.com/google/fonts/main/ofl/patrickhand/OFL.txt
- https://raw.githubusercontent.com/google/fonts/main/ofl/patrickhand/upstream_info.md
- https://raw.githubusercontent.com/google/fonts/main/ofl/patrickhand/METADATA.pb

Pin the fetched repository commit and record the font's internal version/revision, full copyright string, file byte lengths and SHA-256 for TTF/OFL here. Store the TTF and complete SIL OFL 1.1 text together in assets/fonts/patrick-hand/, and enable the local font only after verification. No runtime remote font fetch. Device glyph/numeral/reflow/fallback checks remain pending. This entry explicitly leaves the font deliverable to Claude under the authorized blocked-fetch exception.

## Accepted Part A art: ASSET-PLAYABLE Part A (2026-10-02)

Current art revision **asset-playable-a-3**, ChatGPT/Codex, Part A round 3. Three original SVG sources supersede their round-2 drawings: `kid_raincloud_back_cloud`, `kid_raincloud_front_drop`, `kid_picnic_front_hat`. Tools: original hand-authored SVG paths through `.codex-out/author-asset-playable-a-round3.mjs`, Node.js; licence: original work for Potato Kid. References: all 22 supplied images inspected in the contact sheet, Round 2 engine crops and Claude's PR #21 review. Raincloud is a deeper muted sage cloud offset right, with falling rain; Picnic is a red checked kerchief with a side knot. No image generation, tracing, external images or baked text. All accepted art, including Snowman and Glassblower, and all three sidecars are byte-identical to Round 2; rig revision remains **asset-playable-a-2**. No extra reserve, slots, textures, anatomy or Part B content.

The current inventory retains prior hashes and adds `round2Sha256` for these three sources alongside their final hashes. Runtime PNGs and all engine review captures are regenerated. Preservation evidence: `.codex-out/asset-playable-a-round3-preservation-check.json`; fit/clearance evidence and native colour/grayscale judgments: `.codex-out/asset-playable-a-notes.md`, Round 3. Claude's art re-review remains pending.

### Part A round 2 record

Rig revision **asset-playable-a-2**, ChatGPT/Codex, Part A round 2. Six original SVG sources supersede their round-1 drawings: `kid_snowman_back_snowball` (legacy ID now carries the rear top hat), `kid_raincloud_back_cloud`, `kid_raincloud_front_drop`, `kid_picnic_front_hat`, `kid_glassblower_front_goggles`, `kid_glassblower_front_pipe`. Tools: hand-authored SVG paths/JSON through `.codex-out/author-asset-playable-a-round2.mjs`, Node.js; licence: original work for Potato Kid. Inspected all 22 references in the contact sheet and Claude's e953dc8 colour/grayscale/crowd engine captures before editing. No image generation, tracing, external images or baked text. Source dimensions/statuses/allocation stay the same. Snowman's rear component alone changes attachment/pivot/fits to existing headwear values, justified by seated hat occlusion; all lifetime boxes and motion remain unchanged. The front snow suit retains round-1 artwork. Other delivered sources retain their individual earlier revisions.

The current inventory preserves pre-Part-A hashes and records `round1Sha256` for these six changed sources alongside their current hashes. Runtime PNGs/sidecar and real-engine review captures under `art/previews/ingame/` are regenerated for round 2. Independent alpha/vector evidence and game-size colour/grayscale/stand/seated scratch sheets are regenerated under `.codex-out/`. Claude's critical review and physical-device acceptance remain pending. See the appended Round 2 section in `.codex-out/asset-playable-a-notes.md`.

### Part A round 1 record

Revision **asset-playable-a-1**, author ChatGPT/Codex in the project ChatGPT role. Original hand-authored SVG/JSON, written with Node.js using `.codex-out/author-asset-playable-a.mjs`; no image generation, external artwork, fonts, tracing or embedded reference images. Licence: original work for Potato Kid. Inspected all 22 supplied references through `.codex-out/reference-contact-sheet.png` and the approved engine sample sheets. Plain/cook/snow references inform the same sparse face, costume language and outline; all new details are original.

This entry supersedes the maturity labels in the historical inventories below **only for the 61 delivered v2 kid SVGs**: 16 existing body poses, 12 face states and 33 costume components. These are `final` in the authored sidecar, pending Claude's review. Historical r2 sources and map/UI are not promoted. The root rig retains its slice marker and explicit deferred fields; Part B is not delivered.

Exact per-ID source paths, current and previous SHA-256 hashes, status and revision are recorded in `.codex-out/asset-playable-a-inventory.json`. The 27 former placeholder SVGs are redrawn under their existing filenames. All three Dreamy states use only close-set eye dots/ticks/arcs and the small unchanged smirk; its extra open-state strokes are removed. The Firefighter nozzle drawing moves 6 source px right to clear seated Wide on Bean. All other approved body/face/Fire/Water/Firefighter artwork is retained and its metadata promoted. Component allocation, layer order, dimensions, pivots, fits, lifetime bounds and motion data remain unchanged. Snowman's existing front buttons file includes the visible lower snow suit; Sundae's front rim file includes the cup and short foot.

PNG and JSON outputs in `assets/` were regenerated by `npm run art:export`; derivatives inherit their source revision. Scratch browser renders and independent alpha/vector validation records live in `.codex-out/asset-playable-a-*`. These are review artifacts, not runtime textures or an in-engine/device acceptance result. Full change/readability/scale notes: `.codex-out/asset-playable-a-notes.md`.

## Historical samples

Art-style sample set, round 2, 2026-10-01. Individual source revisions are listed below. All sources are original work for Potato Kid. References informed the character identity and doodle language; no reference image is embedded, traced or modified. No fonts, external images, generated bitmaps or third-party assets are used in the delivered art.

For every listed asset: **author:** ChatGPT/Codex `gpt-6.1-sol`; **tool:** hand-authored SVG; **licence:** original work for Potato Kid. No image-generation prompt was used.

| Asset ID | Editable source | Revision | References consulted |
| --- | --- | --- | --- |
| kid_plain_body | `art/history/r2/kid_plain_body.svg` | 2 | `references/pk_potato0.webp`, `pk_potato1.webp`, `pk_potato_0.webp`, `pk_potato_1.webp`; cook/snow costumes for shared-body continuity |
| kid_plain_face | `art/history/r2/kid_plain_face.svg` | 1 | All four plain references above; `references/pk_cook_0.webp` through `pk_cook_6.webp` for dot-eye and short-smirk continuity |
| kid_fire_overlay_back | `art/history/r2/kid_fire_overlay_back.svg` | 2 | Plain references for proportions; cook/snow references for simple costume language; original flame design from `docs/ASSETS.md` |
| kid_fire_overlay_front | `art/history/r2/kid_fire_overlay_front.svg` | 1 | Plain references for face clearance; `references/pk_cook_0.webp` through `pk_cook_6.webp` for small forehead accessories; original flame crest |
| kid_water_overlay_front | `art/history/r2/kid_water_overlay_front.svg` | 1 | Plain references; `references/pk_snow_0.webp` through `pk_snow_6.webp` for open-face costume framing; original droplet hood from `docs/ASSETS.md` |
| kid_firefighter_overlay_back | `art/history/r2/kid_firefighter_overlay_back.svg` | 2 | `references/pk_cook_0.webp` through `pk_cook_6.webp` for side-object simplicity; original short hose return replacing the round-1 loop |
| kid_firefighter_overlay_front | `art/history/r2/kid_firefighter_overlay_front.svg` | 2 | Cook references for hat/prop scale; snow references for face clearance; original red firefighter helmet with raised shield/ridge/sloping rear brim and nozzle/coupling |
| map_garden | `art/src/maps/map_garden.svg` | 1 | All 22 images in `references/`, especially `pk_sleep_0.webp` through `pk_sleep_3.webp` and snow scenes for sparse environmental doodles; cream/sage direction from `docs/ART_AUDIO_PLAN.md` |

All 22 references were inspected in `.codex-out/reference-contact-sheet.png`; plain, cook and snow originals were also opened individually. The supplied references remain unchanged. Warm opaque fill, thicker production outlines and all new costumes/garden motifs are original adaptations awaiting owner check-in 2.

Round 2 changes the shared body's shoulder/flank/bottom contour, gathers Fire's rear flames into one asymmetric central mass, replaces Firefighter's tan ranger-like hat with a muted red rescue helmet, and shortens/thickens the hose with a broader coupling. All four composites use the revised shared body; face, Fire front, Water front and map sources retain revision 1. Dimensions, filenames, layer order, ground anchor, padding requirement, cream fill and 7.5 px near-black stroke are unchanged.

Claude's `npm run art:export` produces the corresponding PNGs under `assets/sprites/kids/` and `assets/maps/`, plus review previews. Per-layer derivatives inherit their source revisions; composites must use the revision-2 body. The supplied round-1 PNGs and previews were inspected for this revision and were left untouched. An independent scratch SVG render in `.codex-out/art-r2-check.png` was inspected at 48/64/96/256 px on light/dark/grayscale backgrounds; it is not a runtime export or game-build acceptance result. Claude's round-2 export validation, game previews and re-review remain pending.

## V2 sample slice, revision v2-slice-1 (2026-10-01)

Author: ChatGPT/Codex, project role under D-027. Tools: original hand-authored SVG paths and JSON, emitted with Node.js by `.codex-out/author-v2-slice.mjs`; no image generation, rasterization, external artwork or embedded font. Licence: original work for Potato Kid. No reference is traced or embedded. Reference contact sheet (all 22 supplied images) and plain/cook/sleep/snow originals informed the contours, minimal face, compact acting and costume simplicity. V2 Round evolves the r2 original outline; Fire evolves the r2 original connected flame, and Firefighter evolves the original r2 helmet/short hose. Tall/Squat/Bean, seated outlines, placeholders, map pieces and GUI are newly authored.

Every asset below is revision **v2-slice-1**. Status means maturity; gate 2 is pending and nothing is final. The following explicit mapping is the source inventory, not a runtime manifest.

| Asset ID | Editable source | Status |
| --- | --- | --- |
| kid_body_round_stand | `art/src/kids/kid_body_round_stand.svg` | style_sample |
| kid_body_round_step_left | `art/src/kids/kid_body_round_step_left.svg` | style_sample |
| kid_body_round_step_right | `art/src/kids/kid_body_round_step_right.svg` | style_sample |
| kid_body_round_sit | `art/src/kids/kid_body_round_sit.svg` | style_sample |
| kid_body_tall_stand | `art/src/kids/kid_body_tall_stand.svg` | style_sample |
| kid_body_tall_step_left | `art/src/kids/kid_body_tall_step_left.svg` | style_sample |
| kid_body_tall_step_right | `art/src/kids/kid_body_tall_step_right.svg` | style_sample |
| kid_body_tall_sit | `art/src/kids/kid_body_tall_sit.svg` | style_sample |
| kid_body_squat_stand | `art/src/kids/kid_body_squat_stand.svg` | style_sample |
| kid_body_squat_step_left | `art/src/kids/kid_body_squat_step_left.svg` | style_sample |
| kid_body_squat_step_right | `art/src/kids/kid_body_squat_step_right.svg` | style_sample |
| kid_body_squat_sit | `art/src/kids/kid_body_squat_sit.svg` | style_sample |
| kid_body_bean_stand | `art/src/kids/kid_body_bean_stand.svg` | style_sample |
| kid_body_bean_step_left | `art/src/kids/kid_body_bean_step_left.svg` | style_sample |
| kid_body_bean_step_right | `art/src/kids/kid_body_bean_step_right.svg` | style_sample |
| kid_body_bean_sit | `art/src/kids/kid_body_bean_sit.svg` | style_sample |
| kid_face_classic_open | `art/src/kids/kid_face_classic_open.svg` | style_sample |
| kid_face_classic_blink | `art/src/kids/kid_face_classic_blink.svg` | style_sample |
| kid_face_classic_asleep | `art/src/kids/kid_face_classic_asleep.svg` | style_sample |
| kid_face_wide_open | `art/src/kids/kid_face_wide_open.svg` | style_sample |
| kid_face_wide_blink | `art/src/kids/kid_face_wide_blink.svg` | style_sample |
| kid_face_wide_asleep | `art/src/kids/kid_face_wide_asleep.svg` | style_sample |
| kid_face_crooked_open | `art/src/kids/kid_face_crooked_open.svg` | style_sample |
| kid_face_crooked_blink | `art/src/kids/kid_face_crooked_blink.svg` | style_sample |
| kid_face_crooked_asleep | `art/src/kids/kid_face_crooked_asleep.svg` | style_sample |
| kid_face_dreamy_open | `art/src/kids/kid_face_dreamy_open.svg` | style_sample |
| kid_face_dreamy_blink | `art/src/kids/kid_face_dreamy_blink.svg` | style_sample |
| kid_face_dreamy_asleep | `art/src/kids/kid_face_dreamy_asleep.svg` | style_sample |
| kid_fire_back_flame | `art/src/kids/kid_fire_back_flame.svg` | style_sample |
| kid_fire_front_crest | `art/src/kids/kid_fire_front_crest.svg` | style_sample |
| kid_water_front_hood | `art/src/kids/kid_water_front_hood.svg` | style_sample |
| kid_firefighter_back_hose | `art/src/kids/kid_firefighter_back_hose.svg` | style_sample |
| kid_firefighter_front_helmet | `art/src/kids/kid_firefighter_front_helmet.svg` | style_sample |
| kid_firefighter_front_nozzle | `art/src/kids/kid_firefighter_front_nozzle.svg` | style_sample |
| kid_snow_front_beanie | `art/src/kids/kid_snow_front_beanie.svg` | placeholder |
| kid_snow_front_scarf | `art/src/kids/kid_snow_front_scarf.svg` | placeholder |
| kid_chef_front_hat | `art/src/kids/kid_chef_front_hat.svg` | placeholder |
| kid_chef_front_pan | `art/src/kids/kid_chef_front_pan.svg` | placeholder |
| kid_snowman_back_snowball | `art/src/kids/kid_snowman_back_snowball.svg` | placeholder |
| kid_snowman_front_buttons | `art/src/kids/kid_snowman_front_buttons.svg` | placeholder |
| kid_steam_front_vapour | `art/src/kids/kid_steam_front_vapour.svg` | placeholder |
| kid_hero_back_cape | `art/src/kids/kid_hero_back_cape.svg` | placeholder |
| kid_hero_front_medal | `art/src/kids/kid_hero_front_medal.svg` | placeholder |
| kid_sundae_back_bowl | `art/src/kids/kid_sundae_back_bowl.svg` | placeholder |
| kid_sundae_front_cherry | `art/src/kids/kid_sundae_front_cherry.svg` | placeholder |
| kid_sundae_front_rim | `art/src/kids/kid_sundae_front_rim.svg` | placeholder |
| kid_sprout_front_leaves | `art/src/kids/kid_sprout_front_leaves.svg` | placeholder |
| kid_sprout_front_bib | `art/src/kids/kid_sprout_front_bib.svg` | placeholder |
| kid_gardener_front_hat | `art/src/kids/kid_gardener_front_hat.svg` | placeholder |
| kid_gardener_front_apron | `art/src/kids/kid_gardener_front_apron.svg` | placeholder |
| kid_gardener_front_trowel | `art/src/kids/kid_gardener_front_trowel.svg` | placeholder |
| kid_raincloud_back_cloud | `art/src/kids/kid_raincloud_back_cloud.svg` | placeholder |
| kid_raincloud_front_drop | `art/src/kids/kid_raincloud_front_drop.svg` | placeholder |
| kid_glassblower_front_goggles | `art/src/kids/kid_glassblower_front_goggles.svg` | placeholder |
| kid_glassblower_front_pipe | `art/src/kids/kid_glassblower_front_pipe.svg` | placeholder |
| kid_lantern_back_glow | `art/src/kids/kid_lantern_back_glow.svg` | placeholder |
| kid_lantern_front_cap | `art/src/kids/kid_lantern_front_cap.svg` | placeholder |
| kid_lantern_front_star | `art/src/kids/kid_lantern_front_star.svg` | placeholder |
| kid_picnic_front_hat | `art/src/kids/kid_picnic_front_hat.svg` | placeholder |
| kid_picnic_front_bib | `art/src/kids/kid_picnic_front_bib.svg` | placeholder |
| kid_picnic_front_basket | `art/src/kids/kid_picnic_front_basket.svg` | placeholder |
| ground_cream | `art/src/maps/ground_cream.svg` | style_sample |
| ground_sage | `art/src/maps/ground_sage.svg` | style_sample |
| ground_speckle | `art/src/maps/ground_speckle.svg` | style_sample |
| path_straight | `art/src/maps/path_straight.svg` | style_sample |
| path_bend | `art/src/maps/path_bend.svg` | style_sample |
| path_fork | `art/src/maps/path_fork.svg` | style_sample |
| decor_tuft | `art/src/maps/decor_tuft.svg` | style_sample |
| decor_clover | `art/src/maps/decor_clover.svg` | style_sample |
| decor_flower | `art/src/maps/decor_flower.svg` | style_sample |
| decor_pebble | `art/src/maps/decor_pebble.svg` | style_sample |
| decor_twig | `art/src/maps/decor_twig.svg` | style_sample |
| decor_mushroom | `art/src/maps/decor_mushroom.svg` | style_sample |
| building_garden | `art/src/buildings/building_garden.svg` | style_sample |
| icon_materials | `art/src/ui/icon_materials.svg` | style_sample |
| icon_potatokens | `art/src/ui/icon_potatokens.svg` | style_sample |
| icon_kids | `art/src/ui/icon_kids.svg` | style_sample |
| icon_garden | `art/src/ui/icon_garden.svg` | style_sample |
| icon_capacity | `art/src/ui/icon_capacity.svg` | style_sample |
| icon_bias | `art/src/ui/icon_bias.svg` | style_sample |
| icon_compendium | `art/src/ui/icon_compendium.svg` | style_sample |
| icon_dex | `art/src/ui/icon_dex.svg` | style_sample |
| icon_settings | `art/src/ui/icon_settings.svg` | style_sample |
| icon_audio_on | `art/src/ui/icon_audio_on.svg` | style_sample |
| icon_audio_off | `art/src/ui/icon_audio_off.svg` | style_sample |
| icon_unknown | `art/src/ui/icon_unknown.svg` | style_sample |
| icon_timer | `art/src/ui/icon_timer.svg` | style_sample |
| icon_close | `art/src/ui/icon_close.svg` | style_sample |
| icon_discovery | `art/src/ui/icon_discovery.svg` | style_sample |
| ui_panel | `art/src/ui/ui_panel.svg` | style_sample |
| ui_tray | `art/src/ui/ui_tray.svg` | style_sample |
| ui_toast | `art/src/ui/ui_toast.svg` | style_sample |
| ui_button_normal | `art/src/ui/ui_button_normal.svg` | style_sample |
| ui_button_pressed | `art/src/ui/ui_button_pressed.svg` | style_sample |
| ui_button_disabled | `art/src/ui/ui_button_disabled.svg` | style_sample |
| ui_button_selected | `art/src/ui/ui_button_selected.svg` | style_sample |
| ui_focus | `art/src/ui/ui_focus.svg` | style_sample |
| ui_spawn_full | `art/src/ui/ui_spawn_full.svg` | style_sample |
| ui_hold_ring | `art/src/ui/ui_hold_ring.svg` | style_sample |
| ui_place_clear | `art/src/ui/ui_place_clear.svg` | style_sample |
| ui_place_blocked | `art/src/ui/ui_place_blocked.svg` | style_sample |
| badge_tier_1 | `art/src/ui/badge_tier_1.svg` | style_sample |
| badge_tier_2 | `art/src/ui/badge_tier_2.svg` | style_sample |
| badge_tier_3 | `art/src/ui/badge_tier_3.svg` | style_sample |
| badge_tier_4 | `art/src/ui/badge_tier_4.svg` | style_sample |

| Sidecar / review ID | Editable source | Purpose |
| --- | --- | --- |
| kid_rig_v2 | `art/data/kid_rig_v2.json` | Authored appearances, attachments, component order/fits, timings, collision boxes, subset/deferred coverage |
| map_garden_v2 | `art/data/map_garden_v2.json` | Authored deterministic tiled world, path ports, explicit instance pivots/envelopes/outlet |
| ui_v2 | `art/data/ui_v2.json` | Authored tokens, DOM SVG IDs, live-layout contract and review dimensions |
| v2_slice_contacts | `art/previews/kids/v2_slice_contacts.svg` | Neutral body/face and costume sheet reusing source paths/transforms |
| v2_pose_strip | `art/previews/animation/v2_pose_strip.svg` | Stand/left step/right step/sit, reusing source paths/transforms |
| v2_garden_corner | `art/previews/maps/v2_garden_corner.svg` | Editable map crop with three labelled-in-description decor exemplars, review only |
| ui_hud_v2_390x844 | `art/previews/ui/ui_hud_v2_390x844.svg` | HUD/tray mockup, static review text and safe-inset guides |
| ui_hud_v2_390x693 | `art/previews/ui/ui_hud_v2_390x693.svg` | Short portrait HUD/tray mockup, static review text and safe-inset guides |

Claude's extended art:export will rasterize only the 74 world SVGs into the runtime directories in docs/ASSETS.md, copy the 31 DOM UI SVGs to assets/ui without PNG siblings, validate/copy the three authored sidecars, and generate runtime mappings. Derivatives inherit v2-slice-1. No v2 raster derivative, font binary, engine capture, device check or alpha-validation result is claimed here. Legacy r2 sources/exports and generated manifest were preserved; they must not coexist in the v2 runtime allocation. Raw world allocation for this subset is 19.25 MiB before packing; full-production ceiling remains 32 MiB.

## Face readability revision v2-faces-2 (2026-10-01)

ART-V2-FACES, authored by ChatGPT/Codex. Tools: original SVG path/circle edits and JSON edits using Node.js; sampled vector geometry checks, no image generation or raster export. Licence: original work for Potato Kid. The existing reference contact sheet (all 22 supplied images) and Claude's actual `types-20x9.png`, `types-16x9.png` and `crowd-40.png` engine captures informed this revision. Supplied references remain unchanged; nothing is traced or embedded.

This entry supersedes the v2-slice-1 revision for exactly these nine sources: `art/src/kids/kid_face_wide_{open,blink,asleep}.svg`, `art/src/kids/kid_face_crooked_{open,blink,asleep}.svg`, and `art/src/kids/kid_face_dreamy_{open,blink,asleep}.svg`. All retain `style_sample` status. Wide has a 108 px eye span, Crooked an 18 px eye stagger and more tilted short smirk, and Dreamy closer-set dot eyes with relaxed lid strokes. Closed-eye states preserve each layout and the mouth stays identical across a face's three states. Classic retains v2-slice-1.

`art/data/kid_rig_v2.json` is also revised to v2-faces-2: Water's existing hood follows `face_centre` at source pivot [128,116], with local fit [1.16,1] for each body. The existing face attachment scales still apply, including Tall's 0.84 horizontal fit. This prevents the former torso follower's seated compression from covering eyes and gives Wide clearance. No costume SVG changes. All other rig content, face slots, appearance weights and texture counts are unchanged.

Source XML, sampled outline/face-clearance checks and vector padding/envelope checks passed; these are not raster alpha validation or visual acceptance. Runtime PNGs and existing preview sheets/captures were not regenerated. Claude exports these source revisions, validates the composed alpha, reviews new engine captures, and commits as ChatGPT before gate 2 goes to the owner. The new per-layer PNG derivatives inherit v2-faces-2 only after that export; the previous derivatives remain older revisions.

## ASSET-PLAYABLE Part B round 2 — original vector revision

ChatGPT authored eight revised wave SVGs and eight revised fusion/discovery SVGs in the worktree, responding to PR #23. Revision asset-playable-b-2. Hand-authored editable paths only; no image generation, external artwork, tracing or baked text. Current dimensions/hashes and retained round1Sha256 are in .codex-out/asset-playable-b-inventory.json. The pre-edit full source/export hash snapshot is .codex-out/asset-playable-b-round2-baseline.json; preservation, FX alpha/vector bounds and raw allocation evidence are .codex-out/asset-playable-b-round2-check.json. All accepted art is byte-identical. The only rig edits are root revision, the free hand_left attachment of wave_low/wave_high, and fusion/discovery canvas, sourcePivot, offsetPx and boundsPx. Generated derivatives inherit their sources. Details and integration/review fields: .codex-out/asset-playable-b-notes.md, Round 2. Claude commits/pushes unchanged; no git operations by Codex.
