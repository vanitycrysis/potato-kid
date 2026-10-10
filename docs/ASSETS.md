# Asset list

## FARM-DESIGN delivery (2026-10-09; Claude review pending)

Current contract GUI_MVP §22, farm-design-1. Sixteen additive sources in art/src/farm, unchanged exporter/palette/face/font. One shared bed plus matching snack-sprout stamps and actual existing-rig workers. Locked sites stay absent from map; the paper sign illustrates locked Garden rows.

| Source ID | Source canvas / cropped export | Status |
| --- | --- | --- |
| building_food_field | 512 × 512 SVG / 418 × 384 PNG | final for Claude review |
| fx_crop_apple | 256 × 256 SVG / 112 × 183 PNG | final for Claude review |
| fx_crop_berries | 256 × 256 SVG / 112 × 179 PNG | final for Claude review |
| fx_crop_berry_jam | 256 × 256 SVG / 112 × 179 PNG | final for Claude review |
| fx_crop_carrot | 256 × 256 SVG / 112 × 184 PNG | final for Claude review |
| fx_crop_cheese | 256 × 256 SVG / 112 × 176 PNG | final for Claude review |
| fx_crop_cocoa | 256 × 256 SVG / 118 × 194 PNG | final for Claude review |
| fx_crop_corn | 256 × 256 SVG / 112 × 178 PNG | final for Claude review |
| fx_crop_cracker | 256 × 256 SVG / 112 × 181 PNG | final for Claude review |
| fx_crop_mushroom | 256 × 256 SVG / 118 × 183 PNG | final for Claude review |
| fx_crop_pickle | 256 × 256 SVG / 112 × 183 PNG | final for Claude review |
| fx_crop_soup | 256 × 256 SVG / 112 × 184 PNG | final for Claude review |
| fx_crop_toast | 256 × 256 SVG / 112 × 188 PNG | final for Claude review |
| fx_farm_locked | 256 × 256 SVG / 135 × 191 PNG | final for Claude review |
| icon_fields, icon_pantry | 128 × 128 native SVG / assets/ui SVG | final for Claude review; zero Pixi bytes |

Normal exports: assets/sprites/buildings, assets/sprites/fx and assets/ui. Authored/exported farm_v1.json declares geometry, crop transforms, work presentation, named placeholders and twenty scenery relocations over unchanged v3. Crop food silhouettes reuse existing approved icons verbatim with original stems/leaves; no ingredient/cooking assets or new audio.

**224 → 238 runtime PNGs; 14,745,012 → 16,481,264 decoded RGBA bytes (14.06194 → 15.71776 MiB), +1,736,252 bytes / +1.65582 MiB**. Conservative inventory includes DOM-used sign; actual device allocation/culling remains under 32 MiB. Export passes 309 sources/seven sidecars. Existing raster/source art, rig/map/personality and engine/tests stay byte-identical. [264-screen gallery](../art/previews/ui/farm_review.html), [handoff/questions](../.codex-out/farm-design-notes.md), [audit](../.codex-out/farm-audit.json). Claude review and implementation remain pending; no owner gate acceptance.

## LAYOUT-DESIGN round 2 (2026-10-09; Claude review pending)

Current layout/composition contract: GUI_MVP §§19–21, `layout-design-2`. The accepted UI/planting sidecars, HUD, sheets and D-074 flow are unchanged; cancellation text uses ink with a danger border. `map_garden_v3.json`, revision `layout-design-map-3-round2`, places Garden/outlet/camera near the centre, reuses the three ground/six small-decor textures and supplies connected path loops, 250 accents and twelve outer landmarks. Claude owns save migration and selecting v3 in every reader.

| New decorative source ID | Source canvas / cropped export | Status |
| --- | --- | --- |
| landmark_bench | 512 × 512 SVG / 318 × 218 PNG | final for Claude review |
| landmark_birdbath | 512 × 512 SVG / 316 × 204 PNG | final for Claude review |
| landmark_flower_pots | 512 × 512 SVG / 324 × 349 PNG | final for Claude review |
| landmark_seed_basket | 512 × 512 SVG / 310 × 253 PNG | final for Claude review |
| landmark_trellis | 512 × 512 SVG / 225 × 342 PNG | final for Claude review |
| landmark_watering_can | 512 × 512 SVG / 374 × 214 PNG | final for Claude review |

Sources: `art/src/maps/`; exports: `assets/maps/decor/`. Pivots, conservative bounds, scales, rotations and ground reserves are in the map sidecar; generated trim offsets retain source coordinates. Props have no gameplay function. Existing stump/pebble landmarks remain byte-identical; twelve compositions use eight silhouettes, at most two copies of any type. The six new cropped exports add **1,929,120 decoded RGBA bytes (1.83975 MiB)**: runtime inventory **218 → 224 PNGs**, **12,815,892 → 14,745,012 bytes (12.22219 → 14.06194 MiB)**. The historical inventories below describe earlier deliveries. The 32 MiB actual-allocation ceiling remains; device residency/culling are Claude's checks. Export passes 293 sources/six sidecars. Updated gallery has 62 SVG/PNG review screens, including every outer screen at 0.5× in both viewports. [Notes](../.codex-out/layout-design-notes.md), [gallery](../art/previews/ui/layout_review.html), [audit](../.codex-out/layout-audit.json). No owner gate acceptance or engine wander change.

## PLANT-V2-DESIGN delivery (2026-10-04; Claude review pending)

`plant-v2-design-2` follows D-061–D-063 and replaces the planting/two-variant portions of the historical gate-4 delivery below. GUI_MVP §§15–16, with §§7/17/18 amendments, is the current interaction contract. Round 2 addresses B1/B2; Claude approved the flow, ten rare identities, Dex and concepts in round 1. Owner concept approval remains pending.

| Asset / contract | Delivery | Status |
| --- | --- | --- |
| Eight rare looks | `fx_variant_{orbit,prism,ribbon,ripple,comet,petal,echo,zigzag}`: eight original 256 SVG sources and shared cropped PNGs; external symbols above the full costume envelope | exported; Claude review pending |
| Rare icons | Eight matching 128 native SVGs, `icon_variant_{id}` | exported; 0 Pixi bytes |
| Universal rare sparkle / birth | `fx_rare_sparkle`: six external ink/paper glints in one 240×204 cropped PNG; 2400 ms .8–1 idle, static reduced motion; same sprite expands/fades for480 ms at rare/special birth. Approved Start two-star DOM icon unchanged | B1 round 2 exported; Claude review pending |
| Mini mark | Existing .72 rig scale and foot placement; `fx_variant_mini` two unequal pebbles /45×33 cropped PNG; matching128 DOM icon, zero bracket/square contours | B2 round 2 exported; Claude review pending |
| Filling plots | `fx_plant_filling` five empty slots and `fx_plant_slot_filled` shared stamp, 256 SVG/cropped PNG; unchanged Garden grounds/reserve | exported; Claude review pending |
| Flow, rare profile and Dex | Five-slot filling, full-map multi-picker/current→projected odds, explicit Start review, four reveal outcomes, ten-rare detail and Specials collection | GUI_MVP and `gate4_v2.json` revised; review/integration pending |
| Special concepts | `.codex-out/special-concepts.md`: 20 ideas, 12 T5 / 8 T6, prize reasons and roster distinctions | **owner approval pending; no costumes produced** |
| Native review gallery | `.codex-out/plant-v2-index.html`: 204 SVG/PNG screens; forty one-rare-among-twelve comparisons, all-ten crowded colour/gray, Mini vs target, burst/static births, happy/special-parent picker; motion review | B1/B2 round 2; special art still pending |
| Runtime decode | 218 PNGs / **12,815,892 bytes (12.22219 MiB)**; round 2 +151,756 bytes, no new textures; only sparkle and Mini PNG change | 32 MiB physical ceiling retained; device allocation check pending |

Sources: `art/src/plant-v2/`, Mini in `art/src/gate4/`; unchanged `npm run art:export` passed287 sources/five sidecars. Round-2 preservation permits only those three SVGs and `gate4_v2.json`; all216 other runtime PNGs, kid/face/costume/rig/map/reference sources, personalities, concepts and `src/` are unchanged. `npm test`:25 files /215 tests pass. The source-alpha clear-window audit and69,120 geometry cases pass;204 native screens have zero visible text issues. Happy+1 effective tier and special-parent eligibility are settled; snapshot choice/open balance numbers: [Round 2 notes](../.codex-out/plant-v2-notes.md). Claude reviews and integrates; the owner reviews concepts before the separate SPECIALS costume task.

## PERSONALITY delivery (2026-10-03; Claude review pending)

| Asset / contract | Delivery | Status |
| --- | --- | --- |
| `personality_v1.json` | 64 type records in Claude's schema; description, favourite food, Likes prose, hated food, Hates prose, Hobbies | written and exported; Claude review pending |
| Food assignments | Pinned twelve IDs; 64 unique ordered pairs; each food used 4–7 times as favourite and 5–6 as hated; Round 2 changes only Snow's favourite to Toast | standalone validation and D-033 result/partner food check pass; Claude review pending |
| Review handoff | `.codex-out/personality-review.md`, `personality-notes.md`, `personality-check.json` and reproducible checker | ready for Claude's editorial/data review |

Source `art/data/personality_v1.json` exports to `assets/data/personality_v1.json`. Shared Dex/kid-card text follows GUI_MVP §18.1; no additional art, textures or `src/` edits. Revision `personality-1`; ChatGPT authors, Claude reviews and integrates. Export and 189 tests pass.

## GATE4-DESIGN delivery (2026-10-03; Claude review pending)

Current additive delivery `gate4-design-2`, round 2 for PR #67 (B1–B3/N1); retained art and historical inventories below are unchanged. GUI_MVP §§14–18 supersede §13. Round-1 figures in the notes are historical.

| Asset / contract | Delivery | Status |
| --- | --- | --- |
| Drop brackets / Garden target | Authored procedural geometry and sidecar; no hint tint or raster | final design; integration/review pending |
| `fx_plant_plot/seed/shoot/leaves/ready/waiting` | Six256 SVGs/trimmed shared PNGs; pivot(128,224), world scale.75, unchanged four plot grounds; dark basin/check and pause signs | round-2 art; Claude review pending; all alpha bounds inside300-unit reserve |
| `fx_variant_rainbow`, `fx_variant_mini`, `fx_happy` | Three256 SVGs/trimmed PNGs; Rainbow36×19 CSS arch above costume-inclusive lifetime box, no filters; Mini/happy unchanged | round-2 art;41,472 crown/costume and1152 face/pose combinations pass |
| `icon_variant_rainbow/mini`, `icon_happy` | Three128 native SVGs → assets/ui | final;0 Pixi bytes |
| `icon_food_{id}` | Twelve128 native SVGs; pinned vocabulary in§17/gate4_v2.json | final; ready for PERSONALITY |
| `sfx_plant` | WAV48 kHz16-bit mono/.360 s/−5.50 dBFS; score, checksum, Ogg/M4A | rendered/decoded; listening/WebView review pending |
| Review/state contract |114 SVG+1× PNG screens at390×844/640×360; compact food rows with shared effects,12-kid colour/gray crowns, plots and correct distinct Dex tiers | round-2 review compositions; runtime/focus/device checks pending |
| Runtime texture budget |Before gate4:198 /11,516,244 bytes; round1:206 /11,737,968; round2:207 /11,865,816 |11.31612 MiB raw; **+127,848 bytes vs round1**,32 MiB physical ceiling retained |

Sources `art/src/gate4/`; exports `npm run art:export`; no existing kid/face/costume/rig/map/source code changes. Platform masters/review PNGs are excluded from runtime accounting. Evidence, open numbers and limits: `.codex-out/gate4-design-notes.md`.

Owner/author: ChatGPT. Reviewer/export/integration: Claude. Retained prior delivery: **WAVE-WIGGLE, 2026-10-03, revision wave-wiggle-2; final art for Claude review.** The combined art roster has 64 types and 127 costume components, reusing the accepted 32 body poses and 12 face states. Roster delivery records below are historical. Official Patrick Hand is already bundled by Claude, as recorded in assets/PROVENANCE.md. Native conversion, runtime loading and content import remain Claude's work.

ART_AUDIO_PLAN.md defines appearance, motion, world composition, GUI, texture budget, sidecars and export acceptance. New owner decisions D-036..D-042 supersede this list's old shared-body, procedural-only and single-plate requirements. Source SVGs and JSON are authored by ChatGPT; runtime manifests are generated by Claude. Claude accepted the roster IDs/recipe reachability in his technical review; existing IDs/recipes stay unchanged. Expanded content/economy integration belongs to Claude.

## WAVE-WIGGLE delivery (2026-10-03; round 2 / PR #62; Claude review pending)

| Asset / contract | Delivery | Status |
| --- | --- | --- |
| `kid_body_{round,tall,squat,bean}_wave_{low,high}` | Eight replacement SVGs/trimmed PNGs; both 15 px nubs sweep106.3 degrees, 5.16 px tip travel at 55 px; steady body/face/headwear | final /wave-wiggle-2; Claude review pending |
| `kid_rig_v2.json` / `wave` | Eight entries /16 fps, non-looping, three beats with stand bookends; 500 ms unchanged. Both hand attachments updated; right props bob upright10 source px through the shared grip | all 64 costumes pass bounds/face clearance |
| Reduced motion / reserves / budget | Existing stand/open reduced motion and every pose/clip/lifetime box retained.198 runtime PNGs /11,516,244 decoded RGBA bytes (10.98275 MiB); +92,640 bytes versus round1 | zero extra reserve; physical GPU/device check pending |
| Review evidence | Eight55 px full-clip colour/gray strips, eight all 64 sheets, eight comparison sheets and side-by-side old/round1/round2 HTML playback; Baker/Blacksmith/Pinwheel/Rescue Station included | notes: `.codex-out/wave-wiggle-notes.md`, Round 2; detailed visibility counts: `wave-wiggle-visibility.json` |

This is the owner's D-059 correction. No motion lines or new anatomy; original shared drawings and attachment format, no per-type poses. The current Send home consumer reuses500 ms wave +150 ms fade; planting supersedes that interaction under D-054 in separate work. Earlier inventories below describe their original deliveries.

## Android launcher and splash delivery (2026-10-03; Claude review pending)

Revision `launcher-splash-1`: four original editable SVG masters in `art/src/android/` and four full-canvas PNG masters in `art/exports/android/`. Colour art reuses the approved Round/stand body and Classic/open face exactly, with no text or additional anatomy. Launcher background: GUI sage `#e2e8d4`; opaque splash window background: GUI paper `#fff1d5`. The monochrome layer is a single black silhouette with transparent eye/smirk cutouts; the eye holes have a small optical enlargement for 48px readability. It shares the colour mark's silhouette, placement and safe circle. Status: **final art for Claude review**; native conversion and physical device acceptance remain open.

All visible pixels fit the central 264px launcher /768px splash circles. Review sources and PNGs in `art/previews/android/` cover circle/squircle/teardrop, colour/light-theme/dark-theme, 48dp/108dp at both 1px/dp and 3px/dp, plus a 1440×3120 cream splash frame and safe-circle sheet. These are art mockups, not OS screenshots. Masters do not load into Pixi. Provenance: `assets/PROVENANCE.md`; reproduction, conversion notes, validation and exact inventory: `.codex-out/launcher-splash-notes.md`.

## Send home design delivery (2026-10-03; Claude review pending)

GUI_MVP §13 supplies the Garden target, 400ms dwell/release guard, existing wave plus fade departure, specific-instance Dex path, exact card copy and reduced motion. Additive source contract: `art/data/ui_v2.json.mvp.sendHome`; generated copy: `assets/data/ui_v2.json`. Existing kid wave/stand, shadow, Garden and GUI sources/exports are reused unchanged. New runtime SVGs/PNGs/rig clips: **none**; additional decoded bytes/Pixi textures: **0**. The complete unchanged PNG inventory is **198 /11,480,824 bytes (10.94897 MiB)**; physical GPU allocation remains Claude's check. Review-only delivery: 28 SVG/1× PNG screen pairs in `art/previews/ui/send_home_*`, at390×844 and640×360. Gallery, reproducible checks and implementation handoff: `.codex-out/send-home-notes.md`.




## ASSET-MVP batch 3: tier 5 and two follow-ups (2026-10-02; Claude review pending)

Twelve tier-5 costumes are **final art for Claude review**, revision `asset-mvp-3`. The complete art roster is **64 types /127 costume components**, using the unchanged 32 body poses and 12 face states. New sources: art/src/kids; sidecar: art/data/kid_rig_v2.json; trimmed exports: assets/sprites/kids and assets/data. Every new costume uses two shared components; no physique, face, pose, clip, attachment, lifetime bound or tier art changes. Content import and engine/device checks remain Claude's work. Earlier delivery sections below are historical.

| Kid ID | Tier | Costume / primary read | Components / attachments | Status |
| --- | ---: | --- | --- | --- |
| festival | 5 | Three broad hanging pennants on one short bowed bunting cord; small carried drum. | front/head_top: `kid_festival_front_bunting`; front/hand_right: `kid_festival_front_drum` | final; batch 3, Claude review pending |
| observatory | 5 | Broad diagonal telescope barrel with flared objective, short eyepiece and compact tripod; low slit dome is secondary. | front/hand_right: `kid_observatory_front_telescope`; front/head_top: `kid_observatory_front_dome` | final; batch 3, Claude review pending |
| botanical_garden | 5 | Square left-offset trellis with open lattice and two projecting broad leaf tabs; tiny carried seed tray. | back/head_top: `kid_botanical_garden_back_trellis`; front/hand_right: `kid_botanical_garden_front_tray` | final; batch 3, Claude review pending |
| moon_garden | 5 | Tilted thin-spined crescent with unequal tips and deep right-open concavity; low hand-held mushroom lamp. | front/head_top: `kid_moon_garden_front_crescent`; front/hand_right: `kid_moon_garden_front_lamp` | final; batch 3, Claude review pending |
| patisserie | 5 | Three diminishing cake tiers with one short unlit candle; pointed soft piping bag at the hand. | front/head_top: `kid_patisserie_front_cake`; front/hand_right: `kid_patisserie_front_bag` | final; batch 3, Claude review pending |
| winter_market | 5 | Shallow square-ended striped stall awning with three deep broad lower scallops; cocoa sachet hem apron. | front/head_top: `kid_winter_market_front_awning`; front/torso: `kid_winter_market_front_apron` | final; batch 3, Claude review pending |
| harbor | 5 | Broad blunt anchor with open top ring and two upward-curving flukes; short paired rear mooring posts. | front/hand_right: `kid_harbor_front_anchor`; back/torso: `kid_harbor_back_posts` | final; batch 3, Claude review pending |
| sky_fair | 5 | Left-offset continuous Ferris wheel with five upright cabins and five angled spokes; ticket sash at the hem. | back/head_top: `kid_sky_fair_back_wheel`; front/torso: `kid_sky_fair_front_ticket` | final; batch 3, Claude review pending |
| rescue_station | 5 | Tall hooked rescue ladder with two rails and five open rungs beside the left shoulder and hip; small carried rescue torch. Existing stretcher ID retained. | back/torso: `kid_rescue_station_back_stretcher`; front/hand_right: `kid_rescue_station_front_torch` | final; batch 3, Claude review pending |
| sculpture_park | 5 | Single thick carved curling spiral on a short stepped foot above the crown; low plinth plaque. | front/head_top: `kid_sculpture_park_front_spiral`; front/torso: `kid_sculpture_park_front_plinth` | final; batch 3, Claude review pending |
| windmill | 5 | Tapered miniature mill tower, pitched cap, doorway and four separate sail panels on thin spars; small grain sack at the hand. | back/head_top: `kid_windmill_back_sails`; front/hand_right: `kid_windmill_front_grain` | final; batch 3, Claude review pending |
| mosaic | 5 | Square-ended L-shaped tile cap with a tall left block, broad top step and lower right arm; tiled hem apron. | front/head_top: `kid_mosaic_front_tiles`; front/torso: `kid_mosaic_front_apron` | final; batch 3, Claude review pending |

**Batch-2 follow-ups:** Aurora's existing rear light component becomes a broad softly lobed flowing light sheet with no upright shaft or crossbar; its hem tab is unchanged. Terrarium's existing jar component becomes a narrow continuous domed glass cloche without a lid, lifting tab, loop or angular shoulders; its mushroom label is unchanged. Lantern and every other retained kid's components are byte-identical. Existing pivots, fits, IDs, order and layers remain exact. ROSTER_PLAN now records both concepts.

Round-1 allocation figures are historical (see the original handoff notes). Round 2 changes only three primary PNG crops: 105,688 decoded RGBA bytes, a 31,444 byte increase over round 1. The complete export remains **198 PNGs /10.94897 MiB**, including 171 kid layers /6.31190 MiB and 127 costume components /2.34863 MiB. Storage-wide dimensions do not establish physical GPU residency or device performance. Zero additional lifetime reserve on all four bodies.

All 55px colour/gray, 64-kid gray/outline, cap-cluster, isolated-cap, seated/held, 3x crop and supplementary review sheets use the asset-mvp-3- prefix in art/previews/roster. Reproduction, collision/everyday-object review, D-045 audit, exact inventory and limitations: [.codex-out/asset-mvp-3-notes.md](../.codex-out/asset-mvp-3-notes.md). Audio, icons, font and launcher/splash work remain outside this delivery.


## ASSET-MVP batch 2: new tier 4 costumes (2026-10-02; Claude review pending)

Sixteen new tier-4 costumes are **final art for Claude review**, revision `asset-mvp-2`. Sources: `art/src/kids/`; authored sidecar: `art/data/kid_rig_v2.json`; generated PNGs/sidecars: `assets/sprites/kids/` and `assets/data/`. The art roster is now **52 types /103 costume components** with the original 32 body and 12 face layers unchanged. Batch 1 is accepted through PR #34; its historical rows below are retained. Content import remains Claude's work.

| Kid ID | Tier | Costume / primary read | Components / attachments | Status |
| --- | ---: | --- | --- | --- |
| greenhouse | 4 | One pitched roof over a square glass frame, with no eaves or tiers; small seed tray at the hem. | front/head_top: `kid_greenhouse_front_roof`; front/torso: `kid_greenhouse_front_tray` | final; Claude review pending |
| bouquet | 4 | Three broad lobed flower heads fan out above a tied hand-held paper cone; tiny paper tie at the hem. | front/hand_right: `kid_bouquet_front_flowers`; front/torso: `kid_bouquet_front_wrap` | final; Claude review pending |
| bonsai | 4 | Two unequal flat foliage shelves, offset left-high/right-low on a bent woody trunk; low shallow tray. | front/head_top: `kid_bonsai_front_tree`; front/torso: `kid_bonsai_front_tray` | final; Claude review pending |
| terrarium | 4 | Narrow tall continuous domed glass cloche at the left crown, filled with pale glass, moss and a mushroom; no lid, lifting tab, loop or square shoulders. Unchanged hem mushroom label. | front/head_top: `kid_terrarium_front_jar`; front/torso: `kid_terrarium_front_mushroom` | final; batch 3 follow-up, Claude review pending |
| teapot | 4 | Short upright hollow-ended spout projecting at the left side; unchanged knobbed lid and rear loop handle; bare belly with no pottery band. | back/torso: `kid_teapot_back_handle`; front/head_top: `kid_teapot_front_lid`; front/torso: `kid_teapot_front_spout` | final; round 2, Claude review pending |
| cookie | 4 | Tilted near-round biscuit with a large open upper-right bite notch; crumb pocket at the hem. | front/head_top: `kid_cookie_front_cookie`; front/torso: `kid_cookie_front_pocket` | final; Claude review pending |
| pretzel | 4 | Unequal diagonal dough loops crossed by a thick rising rope; one dominant upper-left opening and smaller lower-right knot; unchanged hem ribbon. | front/head_top: `kid_pretzel_front_pretzel`; front/torso: `kid_pretzel_front_ribbon` | final; round 2, Claude review pending |
| soup | 4 | Deep twin-handled side pot, unchanged; long hooked ladle handle descends into a low open scoop beside the pot, replacing the raised circular disk. | front/torso: `kid_soup_front_pot`; front/hand_right: `kid_soup_front_ladle` | final; round 2, Claude review pending |
| snowglobe | 4 | Small round glass globe with stepped foot beside the right crown; a low stepped snow-scene plaque supports the theme. | back/head_top: `kid_snowglobe_back_globe`; front/torso: `kid_snowglobe_front_pedestal` | final; Claude review pending |
| ice_sculptor | 4 | Solid beveled ice block with a large scooped carving notch, held at right with a diagonal steel chisel; unchanged low chisel holster. | front/hand_right: `kid_ice_sculptor_front_ice`; front/torso: `kid_ice_sculptor_front_holster` | final; round 2, Claude review pending |
| weather_vane | 4 | A broad horizontal arrow with a fishtail and pointed arrowhead on a short post; small compass badge low on the torso. | front/head_top: `kid_weather_vane_front_arrow`; front/torso: `kid_weather_vane_front_compass` | final; Claude review pending |
| balloon | 4 | Left-offset pear-shaped balloon tapering into a short neck, with two tethers and a low rectangular woven basket. | back/head_top: `kid_balloon_back_balloon`; front/torso: `kid_balloon_front_basket` | final; Claude review pending |
| steamboat | 4 | Unchanged flat-topped funnel cap; small cabin boat with paddle wheel carried at the right hip, leaving the potato base clear. | front/torso: `kid_steamboat_front_hull`; front/head_top: `kid_steamboat_front_funnel` | final; round 2, Claude review pending |
| lifeguard | 4 | Large vertical open lifebuoy worn on the left hip, with four red sectors; compact rescue float at the right hand. | front/torso: `kid_lifeguard_front_buoy`; front/hand_right: `kid_lifeguard_front_float` | final; Claude review pending |
| kiln | 4 | Square brick shoulders and flat top ledge around one broad bottom-open arch; small hand-held square tile. | front/head_top: `kid_kiln_front_arch`; front/hand_right: `kid_kiln_front_tile` | final; Claude review pending |
| aurora | 4 | Broad softly lobed folded light sheet above and beside the left crown; no narrow staff, transverse top blade or angular teeth. Unchanged flat hem light tab. | back/head_top: `kid_aurora_back_curtain`; front/torso: `kid_aurora_front_pendant` | final; batch 3 follow-up, Claude review pending |

This batch adds **33 compact cropped PNGs /0.51296 MiB decoded RGBA** (537,880 bytes), 29 front and 4 back components. All 174 exported game PNGs total 10.61056 MiB; these are storage-wide decoded dimensions, not a measured GPU residency/atlas/surface result. Full 256px source canvases would be 8.25 MiB for this batch, but runtime exports use trim.json. Each new kid has 2 components except Teapot's 3. No envelope/pose/face changes. Concept refinements, exhaustive checks and 55px sheets: [batch 2 notes](../.codex-out/asset-mvp-2-notes.md). No tier-5, audio, icons, font or platform art is included.

## ASSET-MVP batch 1: tiers 1-3 (2026-10-02)

Twenty new costumes are **final art for Claude review**, revision `asset-mvp-1`. This section extends the historical 16-type Part A/B tables below. Sources: `art/src/kids/`; PNGs: `assets/sprites/kids/`; authored sidecar: `art/data/kid_rig_v2.json`; generated copy: `assets/data/kid_rig_v2.json`. No content import or later batch has started. Shared body/face/pose/clip metadata, the accepted 33 costume components and every lifetime bound remain unchanged.

| Kid ID | Tier | Costume / read | Components / attachments | Status |
| --- | ---: | --- | --- | --- |
| wind | 1 | Broad horizontal mint windsock, blunt open left end and short bent tail; no pom or knit cuff. | front/head_top: `kid_wind_front_windsock` | final; Claude review pending |
| stone | 1 | Thin skewed slate pebble slab; blunt irregular ends and almost no rise, no brim. | front/head_top: `kid_stone_front_pebble` | final; Claude review pending |
| sail | 2 | Single compact triangular blue sail at left on a short mast; low rope sash. | back/head_top: `kid_sail_back_sail`; front/torso: `kid_sail_front_rope` | final; Claude review pending |
| blizzard | 2 | Broad six-point snowflake with notched tips; short flat ice muffler below the smirk. | front/head_top: `kid_blizzard_front_snowflake`; front/torso: `kid_blizzard_front_muffler` | final; Claude review pending |
| builder | 2 | Upright orange rectangular brick held at right; torso tool belt, bare head. | front/hand_right: `kid_builder_front_brick`; front/torso: `kid_builder_front_belt` | final; Claude review pending |
| forge | 2 | Low iron anvil with short squared left heel, long tapering right horn and deeply pinched waist; ember apron. | front/head_top: `kid_forge_front_anvil`; front/torso: `kid_forge_front_apron` | final; Claude review pending |
| kite | 2 | Offset tilted diamond with a short bow tail; chunky hand spool. | back/head_top: `kid_kite_back_kite`; front/hand_right: `kid_kite_front_spool` | final; Claude review pending |
| baker | 3 | Long near-horizontal bread paddle with a broad flat end and one oblong loaf; wheat apron. | front/hand_right: `kid_baker_front_paddle`; front/torso: `kid_baker_front_apron` | final; Claude review pending |
| tea | 3 | Wide shallow cup wrap with one projecting round handle; folded tea-tag cap. | front/torso: `kid_tea_front_cup`; front/head_top: `kid_tea_front_tag` | final; Claude review pending |
| cocoa | 3 | Tall straight-sided cocoa mug with squared right handle; one soft squared marshmallow cap. | front/torso: `kid_cocoa_front_mug`; front/head_top: `kid_cocoa_front_marshmallow` | final; Claude review pending |
| flower | 3 | One offset five-petal dusty rose blossom, above-left rather than a face ornament; leaf collar. | front/head_top: `kid_flower_front_blossom`; front/torso: `kid_flower_front_collar` | final; Claude review pending |
| cactus | 3 | Three connected blunt upright cactus pads, one tall central pad and lower unequal sides; pot belt. | front/head_top: `kid_cactus_front_pads`; front/torso: `kid_cactus_front_pot` | final; Claude review pending |
| mushroom | 3 | Symmetric shallow ochre dome with two round overhangs and lifted underside; small garden bib. | front/head_top: `kid_mushroom_front_cap`; front/torso: `kid_mushroom_front_bib` | final; Claude review pending |
| potter | 3 | Wide open-mouth terracotta jug at right with one large open side handle; clay apron. | front/hand_right: `kid_potter_front_jug`; front/torso: `kid_potter_front_apron` | final; Claude review pending |
| crystal | 3 | Three unequal angular lilac peaks, distinct from Stone slab and blunt Cactus pads. | front/head_top: `kid_crystal_front_cluster` | final; Claude review pending |
| blacksmith | 3 | One raised horizontal block hammer on a short handle; leather apron. | front/hand_right: `kid_blacksmith_front_hammer`; front/torso: `kid_blacksmith_front_apron` | final; Claude review pending |
| lighthouse | 3 | Narrow beacon tower, wide flat light hood and small peaked roof; striped sea-blue bib. | front/head_top: `kid_lighthouse_front_beacon`; front/torso: `kid_lighthouse_front_bib` | final; Claude review pending |
| captain | 3 | Open eight-spoke hand wheel, deliberately without broad blade masses; low peaked navy cap. | front/hand_right: `kid_captain_front_wheel`; front/head_top: `kid_captain_front_cap` | final; Claude review pending |
| whistle | 3 | Two unequal straight brass whistle pipes with wide mouths; small torso valve badge. | front/head_top: `kid_whistle_front_pipes`; front/torso: `kid_whistle_front_valve` | final; Claude review pending |
| pinwheel | 3 | Three broad folded triangular paper blades on a short hand stem; paper sash. | front/hand_right: `kid_pinwheel_front_pinwheel`; front/torso: `kid_pinwheel_front_sash` | final; Claude review pending |

Batch allocation: **37 new 256 x 256 RGBA PNGs / 9.25 MiB raw**, two back and 35 front components. Combined delivered costumes: 36 types /70 components (9 back +61 front); shared rig remains 32 bodies +12 faces. All exported game PNGs: **141 /38.40625 MiB raw**. This is exported storage, not an approved resident allocation: Claude's ROSTER-SCALE per-type loading/unloading is pending before content import. The earlier 104-image/29.15625 MiB budget below describes the previous 16-type delivery.

Four-body colour/grayscale game-size sheets, the 36-type grayscale/solid-silhouette collision lineups, hidden-secondary cap review, three sizes, all eight poses, all face states and seated/held rows: `art/previews/roster/asset-mvp-1-*.png`. Rendered at **68 CSS px per 256-source-pixel kid canvas**, native 1×, with visible overflow at 1.10 size. Independent exported-alpha checks cover659,520 combinations; no front alpha overlaps the eyes/mouth, no new component exceeds an existing pose/clip/lifetime bound. Sources and checks are reproducible in `.codex-out/`; notes and exact source/export hashes: `.codex-out/asset-mvp-1-notes.md` and `asset-mvp-1-inventory.json`. Physical-device/in-engine acceptance remains Claude's review; source `final` is not merge approval.

## Kid sources and exports

Every kid texture: 256 x 256 sRGB RGBA, ground anchor (128,224), >=8 px source padding. Order back -> body -> face -> front; back/front may contain multiple independent sprites. Production naming and routing:

| Group | Source / runtime convention | Count / status |
| --- | --- | --- |
| Bodies | `art/src/kids/kid_body_<body>_<frame>.svg` -> `assets/sprites/kids/` PNG | round/tall/squat/bean x stand/step_left/step_right/sit/wave_low/wave_high/held/settle = 32 final; eight wave drawings revised /wave-wiggle-2, Claude review pending |
| Faces | `kid_face_<face>_<state>.svg` -> kid PNG directory | classic/wide/crooked/dreamy x open/blink/asleep = 12 final; Dreamy corrected for D-045 |
| Costumes | `kid_<type>_<back_or_front>_<part>.svg` -> kid PNG directory | 7 back + 26 front = 33 final; shared across all delivered appearances/poses |
| Kid rig | `art/data/kid_rig_v2.json` -> generated runtime metadata | wave-wiggle-2; complete 15 clips, wave now 8 entries/16fps/500ms; reduced-motion mappings, costume fits and lifetime reserves unchanged; Claude review pending |
| Review composites | `art/previews/kids/` and `art/previews/animation/` | Editable contact/pose boards delivered; Claude renders all sizes at 48/64/96 px, gray/light/dark and engine captures; never runtime portrait textures |

Source paths remain editable, no independently generated drifting animation identities. No duplicate plain body/face runtime aliases after migration. Lifetime silhouette boundsPx in source coordinates: round [16,12,240,236], tall [24,8,232,236], squat [8,26,248,236], bean [12,14,244,236]; frame/clip unions and size weights are in ART_AUDIO_PLAN.md and kid_rig_v2.json. Appearance scale is 0.90/1.00/1.10 only. Declare attachments/boundsPx for every frame, not just neutral body. Body/face selection is persisted independently of tier/type.

The component names in this table are filename part suffixes. `head` attaches to head_top, `torso` to torso, `hand` to hand_right unless noted. Back parts normally attach to torso; Fire flame and Raincloud cloud attach to head_top. Each attachment/source pivot/fit is authored in the sidecar. Wave now wiggles both nubs with upright prop bobs (WAVE-WIGGLE round 2). Costume alpha may not obscure eyes/mouth. Components cannot be multiplied into per-body/per-animation copies.

| ID / name | Tier / source | Theme | Back part(s) | Front part(s) | Current status / next delivery |
| --- | --- | --- | --- | --- | --- |
| plain / Potato Kid | 1 / spawn | Bare cream potato | none | none | final: four bodies x four existing frames, four faces x three states; D-045 audited |
| fire / Fire Kid | 1 / spawn | One asymmetric central flame, warm orange | flame | crest (head) | final: approved broader flame/crest retained |
| water / Water Kid | 1 / spawn | Open droplet hood, muted blue | none | hood (face_centre) | final: approved open hood retained; actual attachment as in sidecar |
| snow / Snow Kid | 1 / spawn | Knitted beanie and trailing scarf, icy blue | none | beanie (head), scarf (torso) | final: larger pom, tall crown, ribbed cuff and short scarf fringe |
| chef / Chef Kid | 2 / R2 | Cook-reference hat and small pan | none | hat (head), pan (hand) | final: puffed toque, cuff folds, cupped pan |
| firefighter / Firefighter Kid | 2 / R1 | Red raised-shield helmet, compact hose/nozzle | hose | helmet (head), nozzle (hand) | final: approved costume; nozzle drawing 6 px right for seated Wide/Bean clearance |
| snowman / Snowman Kid | 2 / R3 | Coal-black top hat, pale lower snow suit and coal buttons | top hat (head; legacy `back_snowball` ID) | buttons + lower snow suit (torso, one existing slot) | final, round 2: visible brim above the crown distinguishes it from Sundae in grayscale; no nose |
| steam / Steam Kid | 2 / R4 | Two pale curling vapour strokes | none | vapour (head) | final: unequal curls with ink border; distinct from hood/FX |
| hero / Hero Kid | 3 / R5 | Short cape, oversized rescue medal | cape | medal (torso) | final: flared cape, broad ribbon, diamond medal |
| sundae / Sundae Kid | 3 / R6 | Shallow dessert bowl, cherry | bowl | cherry (head), rim + cup/foot (torso, one existing slot) | final: visible curved bowl/short foot, cream lip, outlined cherry |
| sprout / Sprout Kid | 2 / R7, proposed | Unequal leaf pair and tiny seed bib | none | leaves (head), bib (torso) | final: asymmetric leaves, seed emblem on bib |
| gardener / Gardener Kid | 3 / R8, proposed | Crooked straw hat, apron, small trowel | none | hat (head), apron (torso), trowel (hand) | final: hatband/straw ticks, pocket apron, pointed trowel |
| raincloud / Raincloud Kid | 3 / R9, proposed | Puffy muted sage cloud offset above the right crown, two falling drops | cloud | drops (head, existing `front_drop` slot) | final, round 3: deeper unequal lobes, flat underside, cloud/body gap; drops outside crown slope and clear of body/face; current reserve, no rain particle field |
| glassblower / Glassblower Kid | 3 / R10, proposed | Diagonal safety goggles pushed onto crown, blowpipe with larger amber bulb | none | goggles (head), pipe (hand) | final, round 2: raised tilted lenses, longer pipe and taller bulb within existing hand reserve; alpha clearance checked |
| lantern / Lantern Kid | 4 / R11, proposed | Small amber lantern cap, star apron, glow behind | glow | cap (head), star (torso) | final: loop/roof/frame/flame cap, four-point star, flat glow within boundsPx |
| picnic / Picnic Kid | 4 / R12, proposed | Red checked kerchief with side knot, gingham bib, tiny basket | none | kerchief (head, existing `front_hat` slot), bib (torso), basket (hand) | final, round 3: rounded cloth wrap and short tied ends replace tan cone; bib and basket retained |

Totals: 16 types, 7 back components, 26 front components. Worst costume uses five sprites including body/face (Firefighter, Sundae, Gardener, Lantern or Picnic). Plain uses only body+face. Body/face/pose variation adds no per-type textures. Accent palettes follow themes but silhouette identifies type without hue.

## Sparse recipes and reachability

Spawn pool stays plain/fire/water/snow, weights 40/20/20/20. Proposed six new kids need no new spawn-pool type. Preserve R1..R6 exactly. Names/themes are ChatGPT's artistic proposal; Claude owns stable-ID acceptance, JSON content format, balance and validation.

| Recipe | Combination | Result tier / reachability |
| --- | --- | --- |
| R1 retained | plain + water -> firefighter | 2; both spawn; first playable |
| R2 retained | plain + fire -> chef | 2; both spawn |
| R3 retained | plain + snow -> snowman | 2; both spawn |
| R4 retained | fire + water -> steam | 2; both spawn |
| R5 retained | fire + firefighter -> hero | 3; firefighter from R1 |
| R6 retained | chef + snowman -> sundae | 3; parents from R2/R3 |
| R7 proposed | water + snow -> sprout | 2; thawed snow feeds a shoot |
| R8 proposed | plain + sprout -> gardener | 3; sprout from R7 |
| R9 proposed | water + steam -> raincloud | 3; steam from R4 |
| R10 proposed | fire + steam -> glassblower | 3; steam from R4 |
| R11 proposed | hero + glassblower -> lantern | 4; rescue light, R5/R10 parents |
| R12 proposed | sundae + gardener -> picnic | 4; garden dessert outing, R6/R8 parents |

Every result tier strictly exceeds both parents; all parents/results are constructible from spawn-only leaves. These are unordered pairs, no self-pair recipes. 12 recipes among 136 unordered pairs including self-pairs (8.82%) or 120 distinct-type pairs (10%). All other pairs do nothing; do not add reverse duplicate recipes. Six-child expansion is a proposal for this authorized roster task, not further optional systems or an implicit economy retune. Recipe tables in player UI remain hidden until discovered.

## Part A placeholder replacement owned by ChatGPT

ASSET-PLAYABLE Part A replaces the editable SVG costume sources in place for **all 12 former placeholder types**: snow, chef, snowman, steam, hero, sundae, sprout, gardener, raincloud, glassblower, lantern, picnic. The exact allocation is retained (22 front +5 back for these 12), with all costume/component statuses `final`. Plain/Fire/Water/Firefighter also become `final` following the owner's style approval, D-045 audit and fit checks. Snowman's buttons file contains the visible lower snow suit; Sundae's rim file contains the lip/cup/foot. Round 2 reuses Snowman's rear `kid_snowman_back_snowball` ID for a top hat: its follower changes from torso to head_top, pivot from [128,166] to [128,55], and fits to the established headwear fits. This justified exception prevents a seated torso transform from sinking/compressing the hat behind the head. All other followers/pivots/fits, every layer, filename, allocation, frame/clip/lifetime boundsPx and motion field remain unchanged. Reuse delivered body/face/rig; no flattened per-type PNG. Claude reviews the final drawings before merge.

Future placeholders use minimal hand-authored SVGs: one clear silhouette per hat/prop, flat accent, same ink/fill, no baked text, same pivots/fit/boundsPx and dimensions as final components. Deliver under normal filenames with sidecar `status: placeholder`; replace sources in place when ready. Production PNG allocation is the same slot, not a second retained placeholder texture. Preserve source history in git/provenance. `placeholder`, `style_sample`, `final` remain explicit per-costume statuses. Part A remains recorded historically. Part B completes poses/clips/FX/landmarks, clears those deferred lists, and promotes the rig to final; the official font fetch remains blocked.

Claude's acceptance for retirement: every accepted roster ID resolves through exported ChatGPT art, all files/rig combinations validate, then delete code-drawn kid placeholders and stop allocating them. Also supply ChatGPT temporary Garden/ground and essential UI SVGs with the map/UI slice before retiring their code-drawn stand-ins. Missing required art must produce a build/coverage error, never a new shape generated by Claude. The generic **undiscovered Dex** seed packet is separate and must not disguise a discovered type with no art. The slice draws the placeholders; Claude retires engine stand-ins only after validation passes.

## Map, building and FX exports

| ID / group | Spec and runtime directory | Status / done means |
| --- | --- | --- |
| ground_cream, ground_sage, ground_speckle | 3 opaque 256 x 256 PNGs, `assets/maps/tiles/`; common seamless cream edges | final; 16-pixel common cream edge band; all 9 tile-pair RGBA seam checks pass |
| path_straight, path_bend, path_fork | 3 transparent 256 PNGs, `assets/maps/tiles/`; sidecar ports, 90-degree rotations | final; [92,164] edge ports and 15 explicit path cells |
| decor_tuft, decor_clover, decor_flower, decor_pebble, decor_twig, decor_mushroom | 6 transparent 256 PNGs, pivot (128,224), >=8 px padding, `assets/maps/decor/` | final; 30 explicit small instances after six recorded skips, 44 cap; vector world bounds and reserve clearance pass |
| landmark_pebble_patch, landmark_picnic_stump | 2 transparent 512 PNGs, pivot (256,480), >=8 px padding, `assets/maps/decor/` | final; explicit [460,1940] / [1660,3320] placements, 280-unit reserves and source silhouette boxes |
| building_garden | 1 transparent 512 PNG, pivot (256,480), >=8 px padding, `assets/sprites/buildings/` | final; sprout roof/soil bed, source silhouette box +300 world-unit ground reserve |
| map_garden_v2.json | `art/data/`, world 2160 x 3840; tiled ground + explicit paths/instances/exclusions | Delivered: 135 ground cells, 15 path cells, Garden +30 small decor +2 landmarks; six conflicting perimeter reserves skipped explicitly |
| fx_shadow | 1 transparent 128 x 64 PNG, centre pivot (64,32), `assets/sprites/fx/` | final subtle asymmetric oval; source pivot [64,32], centred at kid ground; alpha 0.16, held multiplier 0.45 |
| fx_spawn_01..03 | 3 transparent 256 PNGs, ground anchor (128,224), >=8 px padding | final; 10 fps, 0.30 s, low sage puffs and dispersal ticks |
| fx_fusion_01..04 | 4 transparent 320 x 320 PNGs, pivot [160,288], offset [0,0], bounds [12,42,308,266] | final, round 2; 12 fps, 0.333 s; two broad ochre curls join above child then disperse; parents consumed immediately, no convergence |
| fx_discovery_01..04 | 4 transparent 320 x 320 PNGs, pivot [160,288], offset [0,-24], bounds [8,8,312,288] | final, round 2; 8 fps, 0.50 s; large irregular crown-and-side star burst; first discovery only |

Editable SVG counterparts go to `art/src/maps/`, `art/src/buildings/`, `art/src/fx/`. Seven legacy r2 kid SVGs are retained unchanged in `art/history/r2/`, outside export discovery; their duplicate PNGs are retired by the exporter. The old `map_garden.svg` / 1080 x 2400 plate remains historical review material until explicitly excluded from v2 export/runtime loading; no 2160 x 3840 replacement raster. Repeated tiles/decor cost instances, not new textures. Source landmark/Garden JSON includes pivot/exclusion data; world placement exclusions include the clearance rules in the plan.

## Native SVG GUI and platform art

**GUI-MVP update (2026-10-02, ChatGPT; Claude review pending):** [GUI_MVP.md](GUI_MVP.md) supersedes the deferred panel/toast layouts below. Thirty existing native SVGs remain unchanged; ui_spawn_full keeps its ID but moves its hatch to the corner to avoid stretched strokes over live labels. Ten additions bring this family to **41 native SVGs**: `badge_tier_5` (64 viewBox, five-petal blossom); `icon_spawn`, `icon_lock`, `icon_check`, `icon_warning`, `icon_none` (128 viewBox); `ui_button_primary`, `ui_banner_problem`, `ui_banner_recovery` (24 viewBox/eight-pixel nine-slice); `ui_slider_thumb` (24 viewBox, never nine-slice). Final art for Claude's technical review. Existing `icon_unknown` is the generic undiscovered seed packet; no extra portrait/packet art. Extended `ui_v2.json` retains schemaVersion2 and existing keys/IDs, revises HUD coordinates, adds the `mvp` contract and clears deferredLayouts. Review-only sources cover every requested screen and state at390×844,390×693,640×360; the two original HUD paths now show the MVP layout. Current official Patrick Hand binary/licence is already bundled by PLAYABLE-INTEGRATION; old blocked-font rows are historical. No new Pixi textures or kid-source changes. Reproduction/checks and state coverage: `.codex-out/gui-mvp-notes.md`.

| IDs / group | Count / delivery | Status / done means |
| --- | --- | --- |
| icon_materials, icon_potatokens, icon_kids | 3 SVG, 128 viewBox | final; timber offcuts/coin/two heads |
| icon_garden, icon_capacity, icon_bias, icon_compendium, icon_dex, icon_settings, icon_audio_on, icon_audio_off, icon_unknown, icon_timer, icon_close, icon_discovery | 12 SVG, 128 viewBox | final; authored pictograms, no hidden type/recipe hints |
| ui_panel, ui_tray, ui_toast | 3 SVG surface sets, 24 viewBox, 8 px corner system | final; nine-slice paper borders with live DOM content |
| ui_button_normal, ui_button_pressed, ui_button_disabled, ui_button_selected, ui_focus, ui_spawn_full | 6 SVG state decorations, same corner contract | final; state shapes/borders, native DOM only |
| ui_hold_ring, ui_place_clear, ui_place_blocked | 3 SVG feedback marks, 128 viewBox | final; ring/solid/dashed placement marks, no unknown-recipe hints; renderer rasterization debits reserve |
| badge_tier_1..4 | 4 SVG, 64 viewBox | final; seed/twin leaf/three-petal bud/four-point blossom; shape + colour |
| ui_v2.json / ui mockups | Tokens in `art/data/`; two SVG mockups in `art/previews/ui/`, 390 x 844 / 390 x 693 | Delivered tokens +two HUD/tray SVG mockups with 24 px safe-inset guides; expanded Dex/toast layouts deferred; device/reflow checks pending |
| font_patrick_hand_regular | Locally bundled font, full OFL.txt/copyright, revision/hash in provenance | Blocked: sandbox cannot fetch official PatrickHand-Regular.ttf/OFL.txt; no substitute bundled. Exact official URLs and required revision/hash/copyright handoff in provenance; device checks pending |
| android_launcher_foreground/background | SVG + 432 x 432 PNG masters; essential foreground inside central 264 px circle | final /launcher-splash-1; `art/src/android/` → `art/exports/android/`; sage `#e2e8d4`; Claude review/native density and mask conversion/device check pending |
| android_launcher_foreground_monochrome | SVG + transparent 432 x 432 PNG master; single black silhouette with transparent face cutouts, central 264 px circle | final /launcher-splash-1; Android 13+ themed alpha layer; Claude review/native conversion/device check pending |
| android_splash_logo | SVG + transparent 1152 x 1152 PNG master; essential mark inside 768 px circle | final /launcher-splash-1; opaque paper window background `#fff1d5`; Claude review/native conversion/device check pending |

All runtime DOM icons/surfaces/badges are SVG, copied through art:export; no PNG siblings loaded. UI source paths are `art/src/ui/`, exports `assets/ui/`. SVG portraits reuse neutral body/face/components and authored attachment transforms; no per-appearance raster cache. Live text/layout/hit areas/focus are Claude's code following ART_AUDIO_PLAN.md. Font files are not textures. Maintain the previously agreed SIL OFL 1.1 licence with Patrick Hand, system sans fallback, no runtime font download. Launcher/splash PNGs are art masters, not Pixi allocations. Native platform outputs stay Claude's build responsibility.

No store/marketing art, adventures, prestige or extra systems are added. Non-kid missing visual assets also come from ChatGPT under D-036, even when temporary.

## Audio

| ID | Cue | Master / duration | Needed for | Status / done means |
| --- | --- | --- | --- | --- |
| sfx_ui_tap | Soft confirmation | Mono WAV PCM 48 kHz/16-bit; 0.08-0.15 s | First playable | Master rendered, audio-mvp-1; 0.120 s, -8.0 dBFS; quiet repeated cue; Claude/device review pending |
| sfx_pick_up | Lift | Same; 0.10-0.25 s | First playable | Master rendered; 0.210 s, -4.0 dBFS; rising bright pluck; Claude/device review pending |
| sfx_place | Set down | Same; 0.10-0.25 s | First playable | Master rendered; 0.190 s, -4.5 dBFS; lower settling knock; Claude/device review pending |
| sfx_spawn | New kid | Same; 0.20-0.40 s | First playable | Master rendered; 0.340 s, -5.0 dBFS; restrained pop/pluck; Claude/device review pending |
| sfx_fusion | Successful recipe | Same; 0.25-0.50 s | First playable | Master rendered; 0.460 s, -3.5 dBFS; gentle C/G success; Claude/device review pending |
| sfx_discovery | First discovery | Same; 0.60-1.20 s | MVP | Master rendered; 1.160 s, -3.2 dBFS; C-E-G-D flourish; replaces same-event fusion; Claude/device review pending |
| sfx_upgrade | Building upgrade | Same; 0.25-0.50 s | MVP | Master rendered; 0.480 s, -3.8 dBFS; G-C-E confirmation; Claude/device review pending |
| sfx_spend | Resource spend | Same; 0.10-0.25 s | MVP | Master rendered; 0.180 s, -6.0 dBFS; descending wood pair; only without a more specific success cue; Claude/device review pending |
| music_garden | Original instrumental loop | Stereo WAV PCM 48 kHz/16-bit; 60-90 s; note/MIDI source + loop sample boundaries | MVP | Master rendered; 72.000 s, -18.00 LUFS, -4.46 dBFS; exact loop [0,3456000) frames; numeric seam passed; listening/fatigue/encoded-loop review pending |

ChatGPT delivers WAV masters and reproducible source only. Claude's ffmpeg build generates Ogg Vorbis/M4A AAC and verifies decode/looping on Howler/Android WebView. Listening/peak checks for SFX, near -18 LUFS starting target for music; no short-SFX LUFS requirement. Separate music/SFX controls and no passive-income tick cues.

Audio delivery `audio-mvp-1` (ChatGPT, 2026-10-03): nine masters in **`art/audio/`**, sources/score/parameters in `art/src/audio/`, Node-only command `node scripts/render-audio.mjs`; `--check` verifies identical WAV bytes. Overview and individual waveform/spectrogram PNGs: `art/previews/audio/`; full written measurements/limits: `.codex-out/audio-mvp-notes.md`; exact SHA-256 and channel measurements: `.codex-out/audio-mvp-measurements.json`. Independent ffmpeg metering agrees on music loudness and confirms all true peaks below -3 dBTP; no encoding was performed. No listening or device acceptance claimed. Send home adds no cue (D-048 / GUI_MVP §13).

## Budget and acceptance

The full budget in ART_AUDIO_PLAN.md is **29.15625 MiB raw +2.84375 MiB allocation reserve =32 MiB hard ceiling**. It includes 77 kid-layer images, 11 effects, 1 shadow, 6 ground/path textures, 6 decor, 2 landmarks, 1 Garden, zero GUI rasters: 104 unique runtime images. Placeholder and final use the same slots. Native launch/review images are not loaded. Measure actual atlas/source/render-target allocations, not compressed bytes; no mipmaps or giant world cache. Five-sprite costume cases require performance testing.

- Owner approved style at gate 2 (D-044); Part A merged as #21. Part B art and promoted map/UI sources await Claude review. Font fetch, expanded GUI layouts, engine event integration and device acceptance remain pending.
- ChatGPT supplies editable SVG/JSON, timing/pivots/footprints, previews and assets/PROVENANCE.md source/tool/reference/licence/revision mapping. Generated manifests remain generated.
- art:export recognizes v2 families, copies native SVG/sidecars, and validates source padding/coverage. Transformed alpha/boundsPx/face and continuous vector checks for Part B are in `.codex-out/check-asset-playable-b.mjs` and `.codex-out/check-asset-playable-b-vector.mjs`; these do not replace Claude's engine acceptance. Remaining exporter requirements include interpolation extrema, tile seams/ports/layout checks and actual memory accounting specified in ART_AUDIO_PLAN.md.
- Manually inspect 48/64/96 px, light/dark and grayscale, all body/face/pose costume fits, a nonoverlapping 40-kid fixture, all four map quadrants and 16:9/20:9 GUI/camera layouts. Validate render-time separation during interpolation/held/drop/pose/fusion, not only sim snapshots.
- Preserve audio/device acceptance: audition masters and encoded loops on headphones/phone speakers; verify peaks/clicks/seams/balance and mute/unlock/pause/resume. The named S26 Ultra and 4x CPU proxy remain required; these spec edits do not claim those checks passed.


### ASSET-MVP batch 3 round 2 (2026-10-02; PR #44)

Three primary sources and their PNGs change: kid_windmill_back_sails (tower with separate sails), kid_rescue_station_back_stretcher (hooked ladder; ID retained), kid_sky_fair_back_wheel (five-cabin wheel without a plus sign). Their secondaries, the eleven approved kids including Aurora/Terrarium, all existing art, and both complete rig files remain byte-identical. The three primary SVG revision tags are asset-mvp-3-round2; the rig revision remains asset-mvp-3. ROSTER_PLAN rows are updated with the reasons. Six regenerated review sheets use asset-mvp-3-round2-; original sheets are preserved. Current hashes, crops and budget: .codex-out/asset-mvp-3-round2-inventory.json and asset-mvp-3-round2-budget.json. Review rationale, validation, reproduction and the separate offline-summary recommendation: .codex-out/asset-mvp-3-notes.md, Round 2.
