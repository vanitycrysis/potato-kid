# Art and audio plan

Author: ChatGPT. Current delivery: **ASSET-MVP batch 1, 2026-10-02: 20 new tier 1-3 costumes, final art for Claude review.** Gate 2 remains approved under D-044. The accepted body/face/pose/clip rig, map, GUI and FX are retained. Current costume counts and budget are in the batch section below; later sections retain the original ASSET-PLAYABLE specifications and history. Official Patrick Hand is already bundled by Claude, as recorded in assets/PROVENANCE.md.

Authority: PROJECT_BRIEF.md, design-doc.md, `.codex-out/owner-gate2-feedback.md`, D-036..D-043 and the owner's 2026-10-02 D-044..D-046 task handoff. New owner direction supersedes the single body/face, procedural-only animation, fixed map plate and ten-type production limits. D-045 restricts faces to two dot eyes and a small smirk, replaced by two ticks/arcs for blink/asleep: no additional facial or body anatomy marks. Approved outline nubs/feet remain. D-046 targets about 500 types long term, roughly 50-80 in the MVP; this delivery finishes only the existing 16. ChatGPT authors all visual work. Claude validates, integrates and implements layout/simulation. Audio/platform scope remains as agreed.

## ASSET-MVP batch 1 delivery (2026-10-02; Claude review pending)

The approved rig now also supplies the 20 new tier1-3 costumes in ROSTER_PLAN.md. All are final for art review: 37 compact256 px components /9.25 MiB raw. Shared bodies, faces, poses, clips, source conventions and lifetime boxes are unchanged. The historical33-component/104-PNG budget below applies to the earlier16; the combined export is70 costume components /141 PNGs /38.40625 MiB raw. Claude's ROSTER-SCALE loading/unloading and resident-budget verification must precede game content import. No later costumes, icons, font changes, audio or platform art are included. Status rows: ASSETS.md; provenance: assets/PROVENANCE.md; native 68 CSS px review and validation: .codex-out/asset-mvp-1-notes.md.

## Direction and persistent individuality

The 22 references, inspected through the reference contact sheet, establish irregular potato contours, dot eyes, a small off-centre smirk and tiny nubs. Cook, sleep and snow suggest restrained acting. Keep cream bodies `#fff1d5`, near-black round ink `#1a1a1a` at nominal 7.5 px on 256, and restrained costume accents. Draw a scruffy garden club: different potato shapes, still the same dryly amused little character. Avoid perfect ovals, symmetric sprouts, detailed pupils and large mouths.

Four independently drawn body families, four faces and three uniform sizes yield **48 appearances**. Costume/tier/earning power never select physique. Choose once at birth using a separate cosmetic RNG and persist `{bodyId, faceId, scale}`; no reroll per render/reload. Fusion and compendium births get fresh appearances; existing saves get a deterministic assignment from stable kid ID once. Gameplay RNG and spawn weights are untouched. No mirroring or nonuniform random scaling. Dex uses one fixed round/classic/1.00 neutral exemplar from the same components.

| Body ID / birth weight | Drawing | Slice lifetime boundsPx [left, top, right, bottom] |
| --- | --- | --- |
| round / 40 | Uneven left shoulder, shallow right dent, off-centre belly; successor to r2 | [16,12,240,236] |
| tall / 20 | Narrow upright potato, one high shoulder, unequal nubs | [24,8,232,236] |
| squat / 20 | Broad low belly, flatter base, short unequal feet | [8,26,248,236] |
| bean / 20 | Leaning bean, heavy left hip, small right shoulder notch | [12,14,244,236] |

**Agreed revision:** use axis-aligned silhouette boxes, accepted from Claude's technical review of 4e5d06d. Each frame declares `boundsPx: [left,top,right,bottom]` in absolute 256-canvas coordinates. It conservatively contains the body, every permitted follower after fitting, and concurrent clip deltas. Each clip supplies `boundsPxByBody`; each body's `boundsPx` is their lifetime union, shared across all costumes. Sitting never releases the space needed for standing. Deferred production poses must fit the same reserve or receive an explicitly reviewed envelope revision before integration.

Map a source endpoint to world with `worldGround + (endpoint - [128,224]) * (180/256) * appearanceScale`. Transform all box corners when validating authored rotations; retain the conservative world AABB. The widest slice reserve is 185.625 world units (Squat, size 1.10), versus the discarded circle proposal's roughly 2.5 body-width neighbour spacing. Costumes may not change a body's reserve by type. Keep whole boxes inside world bounds. Shadows and transient FX may overlap; kid silhouettes may not.

| Face ID / weight | Eyes relative to face-centre | Treatment |
| --- | --- | --- |
| classic / 40 | (-40,0), (40,0), dots radius 3.75 | Familiar nearly flat smirk |
| wide / 25 | (-54,6), (54,6), radius 3.75 | Approved v2-faces-2: visibly wide spacing, smirk lower |
| crooked / 25 | (-34,-8), (38,10), radius 3.75 | Approved v2-faces-2: visibly lopsided eyes and tilted small smirk |
| dreamy / 10 | (-22,5), (22,5), radius 3.25 | Part A: close-set low dots, smirk at (119,130)..(137,127); no lid/brow strokes |

Each has open, blink (two short ticks) and asleep (two shallow arcs) states: 12 final face textures. Dreamy's ticks/arcs retain its close spacing and low position; its mouth is identical across all three states. Preserve the mouth unchanged through blinking, rather than squashing the entire face. Source face pivot (128,116); body-frame attachments position it. Wide must fit Tall too. Size choices 0.90 / 1.00 / 1.10, weights 25 / 50 / 25; transform every layer uniformly about ground and scale both collision-box axes by the same factor.

## Pose and animation format

Keep 256 x 256 sRGB RGBA kid layers, ground anchor (128,224), at least 8 px clear source padding, logical order **back -> body -> face -> front**. Full production targets eight drawings per body: `stand`, `step_left`, `step_right`, `sit`, `wave_low`, `wave_high`, `held`, `settle` = 32 body images. Walk front-facing with tiny alternating feet; no directional body sets. Sleep uses the compact sitting body, not a sideways image.

Part B delivers all eight poses for all four bodies (32 textures), the existing 12 faces and all 15 clips. sit_down/wake now use the drawn settle frame. The held loop uses a 0.25-degree maximum lean and 1-pixel lift to retain the original lifetime/headwear reserves; these are inside the clip table caps. The seven event clips retain every specified entry count/fps/duration. FX timing is shared by all types. Engine event dispatch and FX rendering remain Claude's integration work.

Counts below are full-production timeline entries; repeated texture references do not add PNGs. ChatGPT authors timings/transforms in JSON. All attachment followers move when the body/frame changes unless explicitly listed otherwise.

| Clip | Entries / fps / duration | Sequence and layers touched |
| --- | --- | --- |
| idle | 4 / 2 / 2 s loop | stand x4; body, face and followers breathe <=1 px |
| blink | 3 / 12 / 0.25 s | Face open/blink/open only; every 3-7 s |
| walk | 4 / 8 / 0.50 s loop | stand, step_left, stand, step_right; body + followers, open face |
| look_around | 4 / 6 / 0.67 s | stand x4; face offset x=0,-3,+3,0 only |
| sit_down | 3 / 8 / 0.375 s | stand, settle, sit; body + followers |
| seated | 4 / 2 / 2 s loop | sit x4; body + followers breathe <=1 px |
| sleep | 4 / 1 / 4 s loop | sit x4; asleep face, <=1 px breath, no Z text |
| wake | 3 / 8 / 0.375 s | sit, settle, stand; face asleep/blink/open + followers |
| wave | 4 / 8 / 0.50 s | stand, wave_low, wave_high, stand; body + hand followers, unchanged face |
| pick_up | 2 / 12 / 0.167 s | stand, held; body + followers |
| held | 4 / 4 / 1 s loop | held x4; rig lean <=2 degrees, lift <=6 canvas px; open face |
| drop | 3 / 12 / 0.25 s | held, settle, stand; body + followers; drawn squash, no root enlargement |
| spawn | 3 / 10 / 0.30 s | settle, held, stand, opacities 0.4/0.8/1; all kid layers + 3 FX at 10 fps |
| fusion | 4 / 12 / 0.333 s | 4 shared FX; parents disappear on consumption; child uses spawn at resolved free ground; no parent convergence |
| discovery | 4 / 8 / 0.50 s | 4 shared FX above child; kid stays posed; first discovery only, then DOM toast |

After 6-10 s stationary choose look 50%, wave 20%, sit 20%, sleep 10%. Seated hold 3-6 s; sleep hold 6-10 s then wake. Separate cosmetic scheduler, randomized phase; no effect on income/fusion. Priority: consumed > held/pickup/drop > spawn > walk > wake/ambient. Pickup interrupts any pose immediately; use held by next presentation frame. Reduced motion uses stand/sit holds and short opacity transitions; no looping sway/breath or discovery bursts.

Replace current procedural hop/squash, squash-blink, 1.12 held scale and pop overshoot where these clips apply. Applying both would breach envelopes. Interpolate authored transforms only. Render/interpolation, held positions and pending drop previews must also preserve separation: show the resolved free position, not an overlapping pointer-follow sprite until the next sim tick. Grounded lifetime boxes must not intersect. Resolve any penetration along the axis of least penetration; ties need a deterministic rule. Fusion contact is a box gap <= `touchSlack` on one axis with overlapping intervals on the other, including exact corner contact with a deterministic tolerance. Use the same lifetime boxes for separation and contact. Never use centre distance or a half-width radius for v2 kids. Resolve child position against remaining kids after consumption, and spawn only when space exists. Remove parent silhouettes immediately before showing the child; fading parent ghosts would need reservations and are excluded. Keep kid boxes inside world bounds.

Attachments in every body frame: `ground`, `head_top`, `face_centre`, `torso`, `hand_left`, `hand_right`. Each records absolute source `position:[x,y]`, clockwise `rotationDeg`, `scale:[sx,sy]`. Ground is always [128,224], 0 degrees, [1,1]. Illustrative round/stand: head [128,56], face [128,116], torso [128,166], left hand [52,168], right hand [202,168]. Actual values for all 32 drawings are authored in production, never inferred from alpha bounds.

Back/front are logical layers that may contain multiple independently attached components. One component = one 256 PNG and one sprite. Draw all back components before body, all front after face; component-array order is authoritative. Each has an authored source pivot and fit multiplier for each body. A torso wrap follows torso scale; headwear follows head_top; a hand prop follows its hand. Water's hood needs a loose opening that fits all faces/poses; do not bake four hoods. Wave the free left nub when a prop occupies the right hand. Face alpha stays unobstructed in all allowed combinations.

ASSETS.md assigns **26 front + 7 back components**, shared across every physique, face and pose. Picnic has three front parts and therefore five kid sprites including body/face. Performance fixtures must cover five sprites, not assume four draws from four logical layers. Fire flicker is authored <=2-degree rotation and 0.98-1.00 scale on existing back/head components, included in envelope; no additional fire frames.

**Bigger Fire:** increase connected rear flame visible area approximately 15%, foreground crest approximately 10% from r2. Broaden middle/secondary tongues; the existing high tip is near the border, so do not simply scale the layer. Keep the asymmetric central mass, exposed side nubs and warm accents. Validate transformed padding/bounds and inspect 48/64 px/grayscale beside Water and Firefighter.

## Scrolling garden

World x=0..2160, y=0..3840, top-left origin; camera sees 1080 world units across with height from usable portrait viewport. Retire the single 1080 x 2400 runtime plate and old fixed safe-band bounds. Kids occupy the whole world; HUD/tray are screen-space DOM, not permanently excluded world strips. Clamp camera to world edges, adapting if view is taller than world. Start centred x=1080 with Garden below the HUD. Empty-ground pan/inertia and held edge auto-scroll belong to Claude.

Palette: cream `#f4efe2`, pale sage `#e2e8d4`, dusty path `#d8c5a4`, soft scenery ink `#686b55`. Three opaque seamless **256** tiles at 1 source px = 1 world unit: `ground_cream`, `ground_sage`, `ground_speckle`. All share identical cream edge pixels; sage transition lives inside the tile so arbitrary neighbours meet cleanly. Outer 160-unit fringe chooses sage/cream/speckle weights 65/25/10; interior cream/speckle 90/10. Classify fringe by cell centre. Fixed seed 20261001, no per-camera reshuffle or rotations. Clip partial final rows/columns. Keep the central lawn very quiet.

Three transparent **256** path decals: straight (opposite ports), bend (adjacent), fork (three). Dusty beige, no dark outline; ChatGPT supplies edge-port masks. Rotate in 90-degree steps. Grid origin [56,0], 256 cells, columns 0..7, rows 0..14. Main route cells (col,row): [(4,3),(4,4),(4,5),(4,6),(4,7),(3,7),(3,8),(3,9),(3,10),(3,11),(4,11),(5,11),(5,12)]. Spur [(3,7),(2,7),(1,7)] joins at fork. Connectivity selects decal/rotation; endpoint ports may open into the lawn with their pale edge intentionally exposed, no extra endcap texture. Paths are walkable art, not navigation rails.

| Placement | World ground point / source size | Appearance / exclusion |
| --- | --- | --- |
| Garden | [1080,620] / 512 x 512, source pivot [256,480] | Sprout roof over shallow wooden soil bed, blank cream sign; circle radius 300 world units; spawn outlet [1080,1120], search outward for free space |
| Pebble patch | [460,1940] / 512 x 512, pivot [256,480] | Low pale stone oval and three clovers; left path destination; radius 280; scenery only |
| Picnic stump | [1660,3320] / 512 x 512, pivot [256,480] | Low ringed stump, tiny leaf; right path destination; radius 280; scenery only |
| Flower accents | [300,860], [1860,1280], [260,2700], [1910,3000] | Up to three flower/clover instances per patch, outside path/landmark clearance |

Six **256** small decor sources: tuft, clover, flower, pebble, twig, mushroom. Source pivot [128,224], display scale 0.45-0.60 (normally 128 world units wide). Add 32 perimeter instances: for i=0..15, left x=96+(i mod 3)*28, right x=2064-(i mod 3)*28, y=220+i*220. Cycle the six IDs by i, deterministic jitter <=12 units per axis. Final alpha must remain inside world. Cap 44 small instances including accents; skip conflicts instead of filling gaps.

Draw scenery behind kids; reserve radius 90 world units for each small instance, 280 for landmarks, 300 Garden. Require a 16-world-unit gap from scenery silhouette boxes, plus circle-vs-kid-box clearance for the ground reserves: distance from scenery centre to the nearest point on the kid box >= decor reserve radius +16. Both exclusions apply. Garden's tall roof extends above its 300-unit ground reserve, so the circle alone is insufficient. Instance boundsPx in the map sidecar enclose the visible source art. Paths/ground reserve none. Keep x=480..1680 free of tall decor except Garden. Only Garden is a gameplay building: Capacity, Bias, Compendium remain tray controls. No terrain hazards or extra mechanics.

ChatGPT supplies `art/data/map_garden_v2.json`: world/cell sizes, seed/weights, ports/path cells, final explicit instances with asset ID, ground position, scale, rotation, exclusion and draw order. Claude implements these authored rules/placements, not improvised scenery. Review all four camera quadrants, seams, edges, crowded Garden outlet and 16:9/20:9 drag auto-scroll. Never rasterize the whole world into a persistent intermediate texture.

## DOM GUI design

**GUI-MVP revision (2026-10-02; Claude review pending):** [GUI_MVP.md](GUI_MVP.md) is now the precise layout/state/copy contract, superseding the deferred expanded-layout work and old HUD coordinates in this section. The palette, Patrick Hand, native SVG/nine-slice contract, neutral portrait rig and unknown packet remain. HUD now uses three portrait rows/one compact row; shared modal sheets cover all buildings, picker, Compendium, Dex, offline, save states and Settings. `art/data/ui_v2.json` has the additive `mvp` tokens and existing HUD paths are updated. Ten native GUI SVG additions (including tier5) add zero Pixi texture allocations. The locally bundled official font from PLAYABLE-INTEGRATION is used for true-size review, superseding this plan's historical font-fetch block. This delivery is design/art only: Claude implements DOM and behavioural/device checks before gate4.

Cream paper notebook over a sage garden: hand-inked rounded borders, sage selected state, dusty orange discovery corner. Live text in previously selected locally bundled Patrick Hand Regular, system sans fallback. Labels 18 CSS px, counts 20-24, dense text >=16, hit targets >=44; visible focus and shape changes as well as colour.

ChatGPT delivers **native SVG**, no runtime GUI PNG, in `art/src/ui/`, copied through art:export to `assets/ui/`; plus review-only 390 x 844 and 390 x 693 SVG layout mockups with safe-inset guides. Shared surfaces use a 24 x 24 viewBox and 8 px corner/inset system, applied as SVG border fragments/CSS border-image. Preserve border thickness, never stretch whole pictograms. Claude implements authored spacing/layout and live quantities.

- **HUD:** two-row paper strip below top safe inset, 8 px outer margin/gaps. Row 1 kids count left, Materials/Potatokens chips right; Settings control at least 44 px. Row 2 sprout clock, next-spawn countdown, slim progress track and >=44 px instant-spawn button. Full capacity uses live text plus paused hatch, not just colour. On narrow widths currencies wrap; never squeeze touch targets.
- **Tray:** scalloped paper top, bottom-safe padding; four equal cells >=56 px high, 28 px icon above live Garden/Capacity/Bias/Compendium labels. Dex is a separate 48 px tab above the right edge. Selected item has a leaf underline. Expanded upgrades reuse sheets; retain the visible world above.
- **Dex:** solid cream bottom sheet up to 80% usable height, heading/close control, three card columns at 390 px, two below 360. Portrait box 80 px; tier mark and live name below. Locked entries use one closed seed packet/question mark, no hidden type silhouette. Kids/Recipes/Compendium tabs. Discovered recipe rows use live plus/arrow; unrevealed slots read Unknown recipe.
- **Discovery toast:** 8 px side margins below HUD, <=96 px high; orange star corner, 56 px reused portrait, live New kid/name/tier. Show 2.5 s, tap opens that discovered Dex entry; queue discoveries. No toast on repeat fusion and no unrevealed parentage hints. It intercepts its own touches and stays outside the main drag corridor.
- **Buttons:** normal cream/ink; pressed inset bottom line; disabled dashed border/muted text; selected sage/leaf underline; focus outline. Primary buttons have a small authored ink offset shadow. Spawn-full gets authored hatch. Live labels, not baked lettering.

Deliver 15 icons: materials (timber offcuts), potatokens (potato coin), kids (two heads), garden (sprout bed), capacity (open fence), bias (branching sprout), compendium (seed envelope), dex (tabbed notebook), settings, audio_on, audio_off, unknown (closed seed packet), timer (sprout clock), close, discovery (four-point star). Tier marks: 1 single seed, 2 twin leaf, 3 three-petal bud, 4 four-point blossom; shape plus colour. Tier 4 is proposed with expansion, not a balance change.

DOM portraits composite the same exported SVG components with their attachment transforms; fixed neutral exemplar, no cached raster per kid/appearance. No recipe-hint art for undiscovered pairs. ChatGPT supplies SVGs and `art/data/ui_v2.json` palette, type/spacing/inset tokens, state IDs and mockup dimensions. Code may apply these authored paths/masks; Claude must not draw new icons, ring/shadow/feedback shapes or placeholder art. Placement/held feedback SVGs are in ASSETS.md; positions/opacity may be driven procedurally by Claude.

## Decoded texture budget

RGBA bytes = width x height x 4; 1 MiB = 1,048,576 bytes. Count unique resident textures, not instances/compressed bytes. No mipmaps. Native DOM SVG adds no Pixi texture; review browser UI memory on device as well. Atlas slack/extrusion, duplicate sources and render targets count. Native Android art/review previews are not runtime game textures.

| Family | Unique images | Raw MiB |
| --- | ---: | ---: |
| Bodies | 4 x 8 at 256 = 32 | 8.00000 |
| Faces | 4 x 3 at 256 = 12 | 3.00000 |
| Costumes | 26 front + 7 back at 256 = 33 | 8.25000 |
| Spawn/fusion/discovery | 3 at 256 +8 at 320 = 11 | 3.87500 |
| Shadow | 1 at 128 x 64 | 0.03125 |
| Ground | 3 at 256 | 0.75000 |
| Path decals | 3 at 256 | 0.75000 |
| Small decor | 6 at 256 | 1.50000 |
| Landmarks | 2 at 512 | 2.00000 |
| Garden | 1 at 512 | 1.00000 |
| GUI rasters/extra portraits | 0 | 0.00000 |
| **Raw total** | **104 images, including 77 kid-layer images** | **29.15625** |
| Allocation reserve | Padding/extrusion/slack/necessary surfaces | **2.84375** |
| **Hard ceiling** | Actual simultaneous allocations | **32.00000** |

Load neither legacy map plate/shared aliases nor flattened portraits, launch masters or placeholders alongside replacements. Shared costumes prevent body x face x pose multiplication. Atlas rounding is not free: actual pages must fit 32 MiB; use individual textures/tightly packed non-power-of-two pages if necessary. If overhead cannot fit, reduce packing waste, then landmark/decor resolution, with art review. A new costume frame/component or GUI raster needs a budget debit before production. Reserved GPU surfaces for authored SVG placement feedback must also be reported if rasterized.

## JSON sidecar and exporter contract

ChatGPT authors `art/data/kid_rig_v2.json`, schemaVersion 2, with canvas, ground anchor, world canvas size, weighted appearance, bodies/frames/attachments/boundsPx, faces/states/pivots, costumes/components/pivots/fitByBody/status, clips/fps/loop/frames/clip maxima, effects and reduced-motion alternatives. See `.codex-out/art-v2-spec-notes.md` for a concrete JSON subset and transform order. Claude generates runtime paths/mappings from validated exports; no hand-maintained runtime manifest. Source coordinates remain authoritative if an atlas trims alpha; record trim offsets without changing pivots.

Exporter acceptance targets below: the current exporter recognizes v2 families and validates source padding/coverage/native SVG copying. Part A supplies independent transformed alpha and vector checks in `.codex-out/`; full integration of these targets remains Claude's pipeline work.

1. Recognize body/frame, face/state, back/front component, ground/path/decor/landmark families and SVG-only UI. Validate unique names/IDs, legal roster references, source sizes/viewBoxes, required attachments, finite numbers, positive scales/fps/weights, complete frames/clips, and source existence. Missing optional layers have no empty files; missing required assets fail.
2. Validate opaque body interiors and ground, nonempty layers, alpha/padding; transform all allowed body/face/costume/pose combinations, checking face obstruction, >=8 px composed padding, boundsPx envelopes and interpolation extrema. Each clip box contains its transformed frames; the body lifetime box contains every clip box. Exact ground anchor is invariant. Reject costume fit/rotation clipping, not merely source padding.
3. Validate tile-edge RGBA equality, decal transparency, rotated path ports/connectivity, world instance bounds and exclusions, seed/placement completeness. Check all quadrant/camera preview coverage; no giant map plate enters the v2 runtime manifest.
4. Preserve atomic writes and check-only mode. Copy DOM SVG without PNG siblings; reject scripts/external URLs/fonts/unsafe paths. Generate manifest including component order/pivots/trim offsets/timing/status. Report raw bytes and actual allocated pages/render targets; fail >32 MiB or placeholder/final coexistence/duplicate legacy loads. Generated stale-file cleanup stays scoped to prior manifest.
5. Existing content validator checks proposed IDs/recipes for strict tier increase and spawn reachability once Claude accepts them. Assert every roster type has final or ChatGPT placeholder coverage. Make deterministic 48/64/96 px/gray contact sheets and a 40-kid nonoverlapping crowd using actual lifetime boxes; the current randomly overlapping crowd does not prove D-039.

Manual review still judges reference character, bigger Fire, face readability, costume tangencies and acting. Claude should test fixed-step and interpolated neighbours, pose changes, held pointer/cancel/drop previews, congested Garden, fusion children and camera edges; simulation-only spacing does not prove render-time spacing. Measure five-sprite worst case and real allocated texture bytes on S26 Ultra and existing 4x CPU-throttle/performance targets.

## Delivery and gates

Claude accepted technical fit, including his silhouette-box revision; the owner approved gate 2 on 2026-10-02 (D-044 handoff). ASSET-PLAYABLE Part A replaces the 27 placeholder components in place, removes Dreamy's extra strokes and promotes delivered Plain/Fire/Water/Firefighter/body/face sources to final. Round 2 addresses Claude's four art review points: Snowman gains a coal-black top hat, Raincloud a separated white cloud with rain above the face, Picnic one paper peak, and Glassblower raised diagonal goggles and a larger hand prop. Snowman's existing rear component now carries the hat and follows head_top at [128,55] with the established headwear fits, so it survives sitting without torso compression/occlusion. This is the only attachment/pivot/fit exception; allocation, layer order, filenames, all bounds and clips stay unchanged. Snowman's front buttons slot still draws the lower snow suit; Sundae's front rim slot draws the lip/cup/foot. Firefighter's nozzle artwork retains its 6 source px shift to clear seated Wide on Bean. See `.codex-out/asset-playable-a-notes.md` for checks, game-size/grayscale judgments and scale concerns. Part A did not change Part B assets; the Part B delivery is described below. Part B promotes the rig root to `final` / `first_playable_art`, clears the deferred pose/clip/effect lists and preserves all existing face/costume data and lifetime bounds. Claude reviews Part A before merge. Gate 3 remains first playable on the owner's phone; gate 4 remains MVP before extra content. Preserve provenance for every source/export, references/tool/version/licence/revision.

Round 3 supersedes only Round 2's Raincloud/Picnic drawings: Raincloud uses a deeper muted sage cloud with unequal puffs and a flat underside, offset above the right crown within the current reserve; Picnic wears a red checked fabric kerchief with a side knot and short floppy ends. The existing cloud/drop/headwear slots and every rig value remain unchanged. Extra top reserve required, in absolute source pixels: Round 0, Tall 0, Squat 0, Bean 0. Snowman and Glassblower are accepted and retain their exact Round 2 sources/exports. Native engine colour/grayscale review and preservation checks are recorded in the notes, Round 3. This was Part A only; Part B preserves those accepted costume sources unchanged.

## Part B delivery (2026-10-02; Claude review pending)

All deferred body poses and seven event clips are supplied, with real settle transitions and complete reduced-motion mappings. No lifetime box, existing costume pivot/fit, face or original pose changed. Wave uses the left nub; right-hand props remain fixed. Held/drop never enlarge the root. Shared FX use the existing ink/palette and reveal no recipe or type. Round 2 revises only wave_low/wave_high and fusion/discovery: fusion uses paired joining curls, discovery an irregular crown-and-side burst. Both FX use 320 x 320 sources, sourcePivot [160,288]; offsets fusion [0,0], discovery [0,-24]. Scale source pixels by the kid's 180/256 factor (never shrink the whole FX to a 180-world-unit width); see the Round 2 integration table in .codex-out/asset-playable-b-notes.md. All body reserves remain unchanged. Discovery is an effect-only clip above the unchanged kid; fusion removes parents on consumption and dispatches the child's separate spawn at a resolved free ground point.

Map and GUI source drawings pass the native-size/source check and are final under D-044. Two 512 landmarks use the planned pivots, positions and 280-unit reserves. The three additional landmark conflicts skip perimeter_left_07, perimeter_left_08 and perimeter_right_14; there are 30 small decor instances, Garden and two landmarks. Every instance has real art and exclusion metadata. Expanded sheet/toast/upgrade layout mockups and phone reflow checks remain deferred as before. Font fetch failed in the sandbox; no font or licence substitute is included.

Budget is exactly **104 runtime PNGs / 29.15625 MiB raw**, including 77 kid layers, leaving **2.84375 MiB** for allocation overhead within the 32 MiB ceiling. The 16 new body drawings, 11 event FX, shadow and two landmarks add **9.90625 MiB** to the prior v2 delivery. Seven legacy kid sources are preserved byte-for-byte in art/history/r2/; their 1.75 MiB duplicate PNGs are removed through normal exporter cleanup so the eager texture loader sees only the 104 planned images. No native DOM GUI rasters or portrait caches are added. Physical GPU/atlas/surface allocations remain Claude's device check.

Independent validation covers all bodies, costumes, faces/states, birth sizes, clip entries and sampled held interpolation. Native-size colour/gray/dark sheets and nine clip strips are in .codex-out/. Art notes, schema field semantics, original source hashes and font handoff: .codex-out/asset-playable-b-notes.md and assets/PROVENANCE.md. No engine edits or audio delivery.

## Audio production and handoff

Aim for warm wood/pluck tones, rounded pops, a short discovery flourish and little clutter. No voices, wandering loops per kid, passive-income tick sounds or automatic failed-pairing cues.

ChatGPT has no dedicated music-generation tool here. Compose one original sparse 60-90 second instrumental loop as MIDI/note-event data and render with a scripted synthesizer. The same reproducible synthesis route supplies eight short cues. Keep score/events, synthesis parameters, renderer and exact loop sample boundaries. Actual listening is required; if music fails, propose a concrete alternative to the owner rather than assume paid tools or a third-party library.

- ChatGPT delivers WAV PCM 48 kHz/16-bit masters only: mono SFX, stereo music, plus reproducible source and loop boundaries. Claude owns one ffmpeg build script for Ogg Vorbis and M4A AAC; generated outputs are not maintained by ChatGPT.
- Music starts near -18 LUFS. Effects use a proposed -3 dBFS peak ceiling and listening-based matching, not integrated-LUFS targets. Use short fades to avoid clicks. Durations are in ASSETS.md; discovery may reach 1.2 s.
- Audition WAV and encoded loops in the actual Android WebView/Howler runtime on headphones and phone speakers: repeated seams, fatigue, quiet playback and decoding. Sample boundaries alone do not prove encoded seamless playback. Claude selects decoded versus streaming playback deliberately.
- Claude implements persisted music/SFX volumes and mute, first-gesture unlock with silent failure, music pause/SFX stop when hidden, and permitted resume. Priorities: discovery > fusion > upgrade > spawn > place/pick-up > UI tap. Discovery replaces fusion for one event; spawn cues are limited to one per 300 ms. Resource spend plays only when no more specific success cue applies.
- Record provenance for all work. Imported fonts, soundfonts, samples or audio require compatible licences; prefer original synthesized tones without outside samples.
