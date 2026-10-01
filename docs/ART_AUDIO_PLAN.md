# Art and audio plan

Author: ChatGPT. Revision 2, 2026-10-01. All nine points of [Claude's PR #2 review](https://github.com/vanitycrysis/potato-kid/pull/2#issuecomment-5940058569) are applied, awaiting Claude's verification. Owner direction on stack and game rules is recorded on PR #1; engineering corrections and joint consolidation remain. No production assets have been made. Actual style samples require owner gate 2.

## Reference findings and visual direction

All 22 WebP references were inspected on a light background. They contain black line art with transparent interiors. The base has an uneven rounded body, tiny dot eyes, a short nearly flat smirk, and small nubs. Cook adds a hat and prop; sleep and snow include whole scenes and restrained accessory changes. Canvases vary: base 364 x 340, cook 418 x 374, sleep 737 x 588 or 644 x 422, snow 626 x 559. These are references, not timed or import-ready animation sets. Preserve them unchanged.

Keep the same body and face for every type: one nearly black outline, irregular contours, few nubs, one clear costume silhouette and restrained accent colour. Keep the eyes and smirk visible. Test a warm opaque potato fill to prevent the map showing through. Fill and bolder export strokes are production adaptations requiring the owner's style review.

Start outlines at about 7-8 px on the 256 px canvas: about 1.3-1.5 CSS px at 48 px display and 1.75-2 px at 64 px. Compare with the references at the art gate, including small face marks; broadening must retain the doodle character. Preview 48/64/96 CSS px and a crowded 40-kid map. Use silhouettes and shapes as well as colour.

Keep Claude's roster IDs: plain, fire, water, snow (tier 1); chef, firefighter, snowman, steam (tier 2); hero, sundae (tier 3). No renames proposed. Themes and layer allocations are in ASSETS.md. Snow's beanie/scarf and Snowman's snowball costume must differ at small sizes. Steam needs a vapour silhouette distinct from Water's droplet. Art-gate samples remain Plain, Fire, Water, Firefighter and Garden map, covering R1 plain + water -> firefighter without another type.

Use a quiet cream/sage garden, sparse perimeter plants and a low-detail play area, with no grid. Only the Garden appears as a map building; Capacity, Bias and Compendium use bottom-tray icons. Unknown Dex entries use one generic placeholder that reveals no costumes or recipes.

## Source and runtime contract

1. Establish editable SVG paths with shared body/face and optional overlay_back / overlay_front groups. Hand-adjust paths to retain irregularity. Make style samples before extending the roster; Claude reviews imports and consistency, then the owner approves gate 2.
2. Composite in order: overlay_back -> body -> face -> overlay_front. Both costume layers are optional; Plain uses neither. Share kid_plain_body.png and kid_plain_face.png; use `kid_<id>_overlay_back.png` and `kid_<id>_overlay_front.png` only when needed. An absent layer means no texture/draw, not an empty PNG.
3. Export sRGB RGBA PNGs, each 256 x 256, ground anchor (128,224), at least 8 px clear edge padding. Body stays opaque inside its outline; other layers are transparent outside their marks. Hold body scale and face placement constant; props fit without clipping during motion. Flattened previews are review artifacts, not duplicate runtime portraits.
4. Claude moves layers together for procedural bob/wobble/tilt, lift, placement and spawn. No per-type animation sets or directional/combat scenes. Share the shadow and eleven spawn/fusion/discovery frames. Claude owns frame timing in engine content data, atlas packing and extrusion.
5. Map master: opaque 1080 x 2400. Coordinates start at the top left. Central safe band: x=0..1080, y=240..2160. Top/bottom 240 px are decorative bleed. Garden and essential landmarks stay in the safe band. Nominal wandering bounds subtract top 160 and bottom 280 world-unit HUD/tray insets: y=400..1880 before kid-radius and Garden-footprint exclusions.
6. Claude's camera fits the 1080-unit world to drawable viewport width and centres vertically. Preview 16:9 and 20:9 including native safe insets and DOM overlays. Wander/drop bounds also intersect the visible unobscured area; the nominal safe band alone cannot guarantee visibility on shorter usable viewports. Never stretch kids or place interactive content in bleed. Claude confirms this during integration.
7. Production paths: art/src/, art/previews/, assets/sprites/kids/, assets/sprites/buildings/, assets/ui/, assets/maps/, assets/fonts/, assets/platform/android/, audio/source/, assets/audio/. Use lowercase snake_case and stable roster IDs.
8. Claude generates runtime paths, dimensions and layer mappings from exports at build time and validates naming, size and alpha in CI. ChatGPT does not hand-maintain a runtime manifest. ChatGPT supplies one assets/PROVENANCE.md: stable ID, author/source, tool/version, prompts/references if used, licence/attribution, revision and corresponding source/export. Anchors and effect timing are shared engine contracts, not inferred from image dimensions.

Initial budget: nine front costume layers, up to five back layers, two shared layers = at most 16 kid textures. Back layers are planned for Fire, Firefighter, Snowman, Hero and Sundae; omit them where occlusion does not require them. Source/review previews do not add runtime textures. Worst-case kids have four layers, so performance checks must exercise that case.

Bitmap generation is optional for map concepts after consolidation; record prompts/references and clean up to the agreed style. Canonical characters/icons use editable paths. Do not generate animation frames independently and accept shifting identity.

## UI and Android launch art

Claude's DOM overlay supplies live text and at least 44 CSS px touch targets. Supply twelve icons, shared panel/button decoration and three tier marks; code owns layout, CSS/nine-slice application, focus and hit areas. Dex portraits reuse composites. No baked labels or undiscovered-recipe hints.

Select **Patrick Hand Regular** for live game labels, subject to 16-18 CSS px text and currency-number checks on device. It is licensed under [SIL OFL 1.1 in the Google Fonts source](https://github.com/google/fonts/blob/main/ofl/patrickhand/OFL.txt). Bundle locally, retain copyright and full OFL file, and pin source revision/hash in provenance; no runtime download. Use a system sans-serif fallback. Claude checks reflow, glyph coverage, changing number widths and font-loading failure. Revise typography at the art review if dense text is unreadable.

Add M4 adaptive launcher foreground/background at 432 x 432 each; essential face/sprouts fit the central 264 px diameter circle (66 dp safe zone at 4x). Supply editable SVG and PNG masters/previews. Claude generates native densities/resources and checks circle/squircle masks. [Android adaptive-icon guidance](https://developer.android.google.cn/develop/ui/compose/system/icon_design_adaptive?hl=en) defines these proportions.

Choose a static splash character mark without a separate icon background: SVG plus 1152 x 1152 transparent PNG preview/master, essential art inside a 768 px diameter circle (288/192 dp at 4x). Configure an opaque cream window background in code. Claude converts SVG to a native vector drawable and checks launch behaviour, using the [Android splash dimensions](https://developer.android.com/develop/ui/views/launch/splash-screen#dimensions). M2 debug APK may use placeholders; final launch art is required by M4. No store/marketing art is added.

Drag feedback is procedural: subtle held-kid outline/ground ring and shape change for in-bounds placement. Do not signal an undiscovered recipe match, which would reveal hidden recipes; recipe-specific hints may reference only already-discovered recipes. Do not rely on colour alone; keep the face visible and avoid persistent glow clutter. No additional feedback bitmap.

## Audio production and handoff

Aim for warm wood/pluck tones, rounded pops, a short discovery flourish and little clutter. No voices, wandering loops per kid, passive-income tick sounds or automatic failed-pairing cues.

ChatGPT has no dedicated music-generation tool here. Compose one original sparse 60-90 second instrumental loop as MIDI/note-event data and render with a scripted synthesizer. The same reproducible synthesis route supplies eight short cues. Keep score/events, synthesis parameters, renderer and exact loop sample boundaries. Actual listening is required; if music fails, propose a concrete alternative to the owner rather than assume paid tools or a third-party library.

- ChatGPT delivers WAV PCM 48 kHz/16-bit masters only: mono SFX, stereo music, plus reproducible source and loop boundaries. Claude owns one ffmpeg build script for Ogg Vorbis and M4A AAC; generated outputs are not maintained by ChatGPT.
- Music starts near -18 LUFS. Effects use a proposed -3 dBFS peak ceiling and listening-based matching, not integrated-LUFS targets. Use short fades to avoid clicks. Durations are in ASSETS.md; discovery may reach 1.2 s.
- Audition WAV and encoded loops in the actual Android WebView/Howler runtime on headphones and phone speakers: repeated seams, fatigue, quiet playback and decoding. Sample boundaries alone do not prove encoded seamless playback. Claude selects decoded versus streaming playback deliberately.
- Claude implements persisted music/SFX volumes and mute, first-gesture unlock with silent failure, music pause/SFX stop when hidden, and permitted resume. Priorities: discovery > fusion > upgrade > spawn > place/pick-up > UI tap. Discovery replaces fusion for one event; spawn cues are limited to one per 300 ms. Resource spend plays only when no more specific success cue applies.
- Record provenance for all work. Imported fonts, soundfonts, samples or audio require compatible licences; prefer original synthesized tones without outside samples.

## Delivery and acceptance

| Slice | Deliverable | Acceptance |
| --- | --- | --- |
| M0 plan | Revised art/audio plan and asset list | Claude verifies nine applied points; joint plan/engineering findings consolidated |
| M1 style | Plain, Fire, Water, Firefighter, Garden map; small/crowded previews | Claude reviews reference/import fit; owner gate 2 approves actual samples including fill/stroke |
| M2 first playable | R1 kids, Garden, shadow/shared interaction effects, essential UI and tap/lift/place/spawn/fusion cues | Claude integrates; ChatGPT reviews behaviour/readability; owner gate 3 |
| M3 systems | Remaining roster, tray/Dex/compendium/upgrade art, all eight cues and music | Content/import checks and reciprocal reviews |
| M4 MVP | Font and final launcher/splash, full visual/audio/device acceptance | Owner gate 4 before polish/extra content |

Initial decoded texture target: <=32 MiB including map, atlases, UI and effects. Measure actual allocation/overhead, not compressed files. Full-capacity tests use 40 kids, up to four layers each, effects, HUD/input and simulation. Owner-named Galaxy S26 Ultra and encoded-loop listening are required; CPU-throttled browser checks are additional proxies.

Engineering round 2 is in .codex-out/pr1-round2-review.md for Claude to post verbatim; remaining correctness findings prevent PR #1 approval. ENGINEERING_REVIEW.md remains historical round 1. Rebase PR #2 after #1 merges, preserving these revisions and the handoff within Claude's consolidated decisions/tasks. This branch's DECISIONS.md is untouched; proposed decision updates are in .codex-out/pr2-response.md.
