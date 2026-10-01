# Asset provenance

Art-style sample set, round 2, 2026-10-01. Individual source revisions are listed below. All sources are original work for Potato Kid. References informed the character identity and doodle language; no reference image is embedded, traced or modified. No fonts, external images, generated bitmaps or third-party assets are used in the delivered art.

For every listed asset: **author:** ChatGPT/Codex `gpt-6.1-sol`; **tool:** hand-authored SVG; **licence:** original work for Potato Kid. No image-generation prompt was used.

| Asset ID | Editable source | Revision | References consulted |
| --- | --- | --- | --- |
| kid_plain_body | `art/src/kids/kid_plain_body.svg` | 2 | `references/pk_potato0.webp`, `pk_potato1.webp`, `pk_potato_0.webp`, `pk_potato_1.webp`; cook/snow costumes for shared-body continuity |
| kid_plain_face | `art/src/kids/kid_plain_face.svg` | 1 | All four plain references above; `references/pk_cook_0.webp` through `pk_cook_6.webp` for dot-eye and short-smirk continuity |
| kid_fire_overlay_back | `art/src/kids/kid_fire_overlay_back.svg` | 2 | Plain references for proportions; cook/snow references for simple costume language; original flame design from `docs/ASSETS.md` |
| kid_fire_overlay_front | `art/src/kids/kid_fire_overlay_front.svg` | 1 | Plain references for face clearance; `references/pk_cook_0.webp` through `pk_cook_6.webp` for small forehead accessories; original flame crest |
| kid_water_overlay_front | `art/src/kids/kid_water_overlay_front.svg` | 1 | Plain references; `references/pk_snow_0.webp` through `pk_snow_6.webp` for open-face costume framing; original droplet hood from `docs/ASSETS.md` |
| kid_firefighter_overlay_back | `art/src/kids/kid_firefighter_overlay_back.svg` | 2 | `references/pk_cook_0.webp` through `pk_cook_6.webp` for side-object simplicity; original short hose return replacing the round-1 loop |
| kid_firefighter_overlay_front | `art/src/kids/kid_firefighter_overlay_front.svg` | 2 | Cook references for hat/prop scale; snow references for face clearance; original red firefighter helmet with raised shield/ridge/sloping rear brim and nozzle/coupling |
| map_garden | `art/src/maps/map_garden.svg` | 1 | All 22 images in `references/`, especially `pk_sleep_0.webp` through `pk_sleep_3.webp` and snow scenes for sparse environmental doodles; cream/sage direction from `docs/ART_AUDIO_PLAN.md` |

All 22 references were inspected in `.codex-out/reference-contact-sheet.png`; plain, cook and snow originals were also opened individually. The supplied references remain unchanged. Warm opaque fill, thicker production outlines and all new costumes/garden motifs are original adaptations awaiting owner check-in 2.

Round 2 changes the shared body's shoulder/flank/bottom contour, gathers Fire's rear flames into one asymmetric central mass, replaces Firefighter's tan ranger-like hat with a muted red rescue helmet, and shortens/thickens the hose with a broader coupling. All four composites use the revised shared body; face, Fire front, Water front and map sources retain revision 1. Dimensions, filenames, layer order, ground anchor, padding requirement, cream fill and 7.5 px near-black stroke are unchanged.

Claude's `npm run art:export` produces the corresponding PNGs under `assets/sprites/kids/` and `assets/maps/`, plus review previews. Per-layer derivatives inherit their source revisions; composites must use the revision-2 body. The supplied round-1 PNGs and previews were inspected for this revision and were left untouched. An independent scratch SVG render in `.codex-out/art-r2-check.png` was inspected at 48/64/96/256 px on light/dark/grayscale backgrounds; it is not a runtime export or game-build acceptance result. Claude's round-2 export validation, game previews and re-review remain pending.
