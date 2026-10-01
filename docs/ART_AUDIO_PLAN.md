# Art and audio proposal

Author: ChatGPT. Status: proposed, awaiting Claude's technical review and owner check-in 1. Date: 2026-10-01.

This is the art/audio contribution to the project plan, not an approved combined plan. No game code or production assets are included. The design in `design-doc.md` remains authoritative.

## Reference findings

All 22 WebP references have been inspected against a light background. They contain black line art with transparent interiors, not painted potato bodies. `pk_potato0.webp`, `pk_potato1.webp`, and the underscore-named pair establish the uneven round body, tiny dot eyes, short almost-flat smirk, and small edge nubs. The cook sequence adds a hat and a prop without changing the identity. The sleep and snow sequences show restrained movement and small changes to accessories; several frames depict entire scenes rather than isolated characters.

The reference canvases vary: base 364 x 340, cook 418 x 374, sleep 737 x 588 or 644 x 422, snow 626 x 559. They are style references, not a ready-to-import animation set. Preserve the originals unchanged. Do not infer frame timing from filenames, or normalize these scenes into game sprites without review.

## Visual direction proposed for approval

- Keep one nearly black outline color, uneven hand-drawn contours, the same base silhouette and face across types, and only a few nubs. Avoid detailed anatomy and heavy shading.
- Test a flat warm potato fill to keep transparent interiors from showing map detail. This is a proposed production adaptation, not an observed reference feature; include it in the art-style review.
- Give each type one costume/object silhouette and a restrained accent color. A flame, droplet accessory, or firefighter helmet should identify a type without relying on color alone. Keep both eyes and the mouth visible.
- Use a quiet cream/sage garden with sparse doodle plants around the perimeter and a low-detail play area. Buildings should read as simple objects, leaving wandering kids visually dominant. No grid.
- Keep text as live UI text. Art supplies icons, panels, and decoration, not baked labels or hidden recipe hints. Unknown Dex entries use one generic placeholder rather than revealing undiscovered costumes.

Proposed art-style gate: base Potato Kid, Fire, Water, Firefighter, and one garden background. Cook and Snow remain valuable style references; this proposal does not add them to the MVP roster. Fire/Water/Firefighter exercise different costume silhouettes and the design's example pairing. Claude must confirm the roster and resulting recipe types before production beyond these samples.

## Art production and handoff

1. After check-in 1 approval, establish a canonical editable base with locked body proportions, eye positions, mouth, ground point, and outline weight. For this simple doodle style, use editable SVG paths and separate body, face, and costume groups as the default source format. Hand-adjust paths so the result retains the reference's irregularity.
2. Produce the art-style samples before expanding the roster. View them at approximately 48, 64, and 96 logical pixels, including a crowded-map mockup. The smallest scale is a readability test, not a decision about the final touch target or zoom.
3. Obtain owner check-in 2 approval for the base, three variants, and map. Revise samples if necessary. Do not treat approval of this written proposal as approval of the style samples.
4. Build every approved kid from that canonical base plus its costume/object layer. Keep layers editable for consistent corrections. Following review of Claude's PR #1, deliver separate aligned body, face, and overlay PNGs for runtime composition, plus flattened previews for art review. Share the same body and face across types.
5. Export PNG RGBA sprites in sRGB. Each layer uses a 256 x 256 canvas, a fixed ground anchor at pixel (128, 224), and at least 8 pixels of clear edge padding. Keep the base scale constant across types; large props fit inside the frame. Keep body opaque within its outline, other layers transparent outside their marks, and all layers aligned. Proposed values remain subject to Claude's viewport/texture review.
6. Use Claude's proposed gentle procedural bob/wobble/tilt for idle and wander, moving the composite coherently. The canonical face remains fixed. Pick-up, placement, and spawning use engine transforms plus shared effects. No per-type frame sets, directional, combat, or long scene animations are commissioned for MVP; reserve drawn frames for shared effects that need them.
7. Export a quiet opaque map plate provisionally at 1080 x 2340, agreeing with Claude's proposed master size, with decorations and building sprites separate. Claude confirms camera, playable bounds, aspect-ratio handling, and safe areas before final export. Never stretch the character art to fit a viewport.
8. Deliver individual layers/effect frames plus a manifest describing stable asset ID, type ID, relative path, dimensions, ground anchor, layer order, effect frame order/timing, license/provenance, and revision. Claude owns engine-specific atlas packing and import settings. If an atlas is required, coordinate padding/extrusion with the selected renderer.

Suggested paths: `art/src/`, `art/previews/`, `assets/sprites/kids/`, `assets/sprites/buildings/`, `assets/ui/`, `assets/maps/`, `audio/source/`, and `assets/audio/`. Create these only when production is authorized. Use lowercase snake_case, for example `kid_base_body.png`, `kid_base_face.png`, `kid_fire_overlay.png`, `building_garden.png`, `icon_materials.png`, and `sfx_discovery.wav`. Reserved slots in the asset list must acquire approved type names before files are exported.

Bitmap generation is optional for map concept exploration after plan approval; if used, record prompts and references and redraw/clean up the selected concept into the agreed style. It is not needed for the canonical base, shared face, or icon system. Never generate each animation frame independently and accept inconsistent character identity.

## Audio direction and production

Aim for a small, warm toy-garden sound: soft wood/pluck tones, rounded pops, a short discovery flourish, and very little sonic clutter. No voices, continuous sounds for each wandering kid, or automatic sounds for failed pairings. Successful consumption gets a single gentle fusion cue; a first discovery gets the more distinctive reward cue.

ChatGPT has no dedicated music-generation tool in this workspace and cannot promise finished music from one. Proposed route: compose an original sparse 60-90 second instrumental loop as MIDI/note-event source, render with a scripted synthesizer, and audition the result before acceptance. Scripted synthesis can also create the brief sound effects. Keep score/event data and synthesis parameters reproducible. If the music fails listening review, bring a concrete alternative to the owner; third-party libraries or paid tools are not assumed.

- Masters: WAV PCM, 48 kHz, 16-bit; mono effects and stereo music. Supply source/event data and exact loop sample boundaries for music.
- Runtime delivery: proposed Ogg and M4A alternatives, agreeing with Claude's initial spec; verify decoding and loop behavior on the chosen Howler/browser/WebView targets before acceptance. Select decoded versus streaming music deliberately. Keep WAV masters regardless of final codec. Use approximately -18 LUFS as a music starting target; short effects use peaks and listening-based matching rather than one mandatory integrated-LUFS value.
- Effects: UI tap, pick up, place, spawn, fusion, first discovery, upgrade, and resource spend. Most cues should be 0.08-0.5 seconds; discovery may last up to 1.2 seconds. Proposed peak ceiling -3 dBFS with listening-based volume matching. Prevent clicks with short fades.
- One music loop only for MVP. Test seamless repetition, fatigue, and quiet phone-speaker playback. Share a WAV audition preview before integration.
- Claude implements separate music/SFX controls, persistence, platform audio activation, and event rate limiting. Materials income should not produce one sound per kid or tick. Define event priorities so crowded maps do not create stacked loud cues.
- All commissioned/generated work needs provenance recorded; imported fonts, soundfonts, samples, or audio require a compatible license. Prefer original assets and synthesized tones with no outside samples.

## Proposed delivery slices

| Gate/slice | Art and audio contribution | Acceptance |
| --- | --- | --- |
| 1: project plan | This proposal, `ASSETS.md`, initial tasks/decisions, technical agreement with Claude | Both proposals reviewed; one combined plan covers stack, milestones, MVP scope, asset list; owner approves |
| 2: art style | Base, Fire, Water, Firefighter, one map; small/crowded previews | Claude checks consistency and import specs; owner approves visuals |
| 3: first playable | Approved parents/result for Claude's first recipe, Garden, shared interaction effects, essential UI and tap/pick-up/place/spawn/fusion cues | Claude integrates spawn/wander/drag/recipe; ChatGPT reviews behavior and readability; owner approves playable |
| 4: MVP | Remaining approved starter roster, four building roles, Dex/compendium/upgrade UI art, all eight cues, one music loop | Asset checks and device listening/visual review pass; complete MVP awaits owner approval before polish or extra content |

The ten-type/six-recipe budget adopts Claude's proposed workload scope; exact type IDs/tiers/recipe roles remain to be locked. Layer/export sizes remain proposals. Claude owns the engineering milestone plan, economy, recipe table, and performance budget. Use an initial art-texture target of at most 32 MiB decoded at a time; validate it against the selected renderer, atlas overhead, camera, and actual capacity. Do not treat compressed file size as runtime texture memory.

## Review requested from Claude

Please review this proposal and `ASSETS.md` in [PR #2](https://github.com/vanitycrysis/potato-kid/pull/2) for reference fidelity and technical fit. Confirm or propose changes to layer size/anchor, viewport/background approach, procedural motion/atlas expectations, IDs/manifest format, roster budget, audio codec/activation/streaming, and texture budget.

Claude's engineering proposal appeared in [PR #1](https://github.com/vanitycrysis/potato-kid/pull/1) during preparation. ChatGPT's critical review is recorded in `ENGINEERING_REVIEW.md` and in that PR; it requests fixes to offline spawn phase/income, recovery ordering, content acceptance, device/audio validation, and platform claims. Art runtime layering, provisional map size, and roster budget have been adopted here. Claude's response and review of this proposal are still pending.

The combined plan must explicitly seek owner decisions on the Materials faucet and Potatoken scope already left open in `design-doc.md`, and on Claude's proposed eight-hour offline cap/no offline fusions. Endgame and adventures remain outside MVP. Consolidate the reviewed proposals in a joint plan document, link the review outcomes, and only then present check-in 1. Reciprocal review is not yet complete.
