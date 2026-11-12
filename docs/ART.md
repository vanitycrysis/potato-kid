# Art and animation

How Potato Kid's kid art and animation work today: the rules, the rig, the tools and the review. This is the current state. The history (who delivered what, round by round) is in `docs/archive/` and `docs/DECISIONS.md`.

Since 2026-11-11 Claude draws the art and Codex reviews it (D-096). Codex's earlier art stays unless a decision changes it.

## The rules a drawing must meet

| Rule | What it means | Decision |
|---|---|---|
| The face is fixed | Two dot eyes and the small smirk, with blink and asleep states. Nothing else on a kid may read as a facial feature: no brows, nose, cheeks, teeth, ears. A stroke near the eyes reads as a brow, and two arcs with a curl between them read as a face, so check marks and effects for this too | D-045 |
| The face is clear | Nothing in front covers or crowds the eyes or smirk, on any of the four faces, in any pose | D-045 |
| No stem | No stroke on top of the head | D-097 |
| Props are held | A prop in a hand overlaps the arm stroke in every pose. Parts of one object connect in every pose. An arm that moves really moves: it never just gets thicker | D-098 |
| Kids never overlap | A kid's drawings stay inside its lifetime box (plus the motion margin) in every pose and every frame of the clips it lives in | D-043, D-105 |
| No recipe hints | Art and writing never hint at a recipe the player has not found | D-033 |
| It reads small | A kid is judged at about 55 CSS px, in colour and in grey. One large shape reads; small props do not | D-044 |

`npm run art:kids` checks the measurable ones. The review checks the rest.

## Style

- **Line:** ink `#1a1a1a`, round caps and joins. 7.5 px for bodies and main shapes, 6 for smaller parts, 4 to 5 for details.
- **Body:** cream `#fff1d5`.
- **Palette:** muted notebook colours: `#d8b576` honey, `#d19871` clay, `#809ba9` slate, `#d79a8c` rose, `#a5b58a` sage, `#d3e4e8` ice, `#bd655b` brick, `#bbb2cc` lilac, `#efd6a0` butter, `#ece6f1` pale, `#96bbc0` water. World `#f4efe2`, scenery ink `#686b55`.
- **Canvas:** 256 × 256 px per drawing, 8 px clear at every edge, transparent. A kid stands on the ground point (128, 224) and is drawn 180 world units wide.
- **Font in the UI:** Patrick Hand.

## The rig

`art/data/kid_rig_v2.json` is the rig. A kid on the map is layers, bottom to top: shadow, back costume parts, body, face, front costume parts.

- **Four bodies:** round, tall, squat, bean. Each has frames: `stand`, `step_left`, `step_right`, `sit`, `settle`, `held`, `wave_high`, `wave_low` (in the rig), and `farm_left`, `farm_right`, `splash_out` (`kid_activity_v1.json`).
- **Four faces:** classic, wide, crooked, dreamy, each `open`, `blink`, `asleep`. The wide face's eyes are at x 74 and 182 on the round body: keep front parts well clear of them.
- **A costume** is a list of components. Each has a drawing, a layer (`back` or `front`), an attachment point (`head_top`, `torso`, `hand_right`, `face_centre`), the pivot on its canvas that sits on that point, and a scale per body (`fitByBody`). Draw on the round body's stand frame: head top (128, 55), torso (128, 166), right hand (199, 172).
- **Wild kids** (the specials and the rares, `kid_wild_v1.json`) are one drawing of their own with the shared face placed on it. No costume, no body frames.

### Limits that shape a costume

- **The lifetime box.** Round `[16, 12, 240, 236]`, tall `[24, 8, 232, 236]`, squat `[8, 26, 248, 236]`, bean `[12, 14, 244, 236]` (left, top, right, bottom on the canvas). Everything a kid ever shows must be inside. A hat can rise about 43 px above the round head; a hand prop can reach about 37 px right of the hand.
- **Only the right hand holds props.** In the wave the left hand's attachment swings 25 px; the right one rises 10. All 45 hand props in the roster are right-hand.
- **The waving arm is somewhere else.** In `wave_high` and `wave_low` the arm strokes sit outside the body, up to 40 px from where they rest. A thin prop needs something at its grip (the Wizard's pommel) to stay on the arm in both.
- **The torso squashes.** Seated attachments scale the torso to 0.7 high, so anything on `torso` flattens when the kid sits. Wings, and anything that must keep its shape, go on `head_top`.
- **Two parts of one object** on different attachments drift apart between poses. Draw the covering part later in the list so it hides the join (the Umbrella's canopy is drawn after its shaft, which slides under it).

## Tools

| Command | What it does |
|---|---|
| `npm run art:export` | Rasterises `art/src/**/*.svg` to `assets/`, copies the sidecars in `art/data/` to `assets/data/`, and checks the asset contract. Run it after any art change |
| `npm run art:check` | The contract only, writing nothing |
| `npm run art:kids` | Every kid listed in `art/kid_checks.json`, on every body in every pose: bounds, grip, joined parts, covered tips, face clearance. And for every kid in the roster, in every frame of its clips: its drawings inside box plus margin, no mark across a face, no costume part moved onto a face. `-- --all` also reports the drawing rules for the older costumes |
| `npm run motion:build` | Bakes `art/motion/*.mjs` into `art/data/kid_motion_v1.json`. Run `art:export` after it |
| `npm run motion:check` | Fails if the baked file is out of date |
| `PK_REVIEW=<ids> npx playwright test -c playwright.preview.config.ts review.spec` | Captures those kids through the engine, every body with every face, colour and grey, into `.review/` |
| `PK_MOTION=<clips> [PK_TYPE=<id>] [PK_BODY=<body>] npx playwright test -c playwright.preview.config.ts motion.spec` | Captures clips frame by frame through the engine. `habit:<id>` shows a kid's own habit |

Build first (`npm run build`): the preview captures run against `dist/`. The debug hook behind `motion.spec` is `window.__PK__.debugPose(kidId, clip, seconds)`.

The checker is a floor under the review, not the review. It cannot judge whether a grip convinces, how a costume reads, or whether a motion reads as what it is meant to be.

## Adding a kid

1. Draw its components in `art/src/kids/` as `kid_<id>_<back|front>_<part>.svg` (a wild kid: `art/src/kids/wild/kid_body_wild<id>_stand.svg`).
2. Add its costume to `kid_rig_v2.json` (or its type to `kid_wild_v1.json`, with face anchor, face scale and lifetime bounds).
3. Add it to `src/content/kids.json`, its recipe to `src/content/recipes.json` (the result's tier must exceed both parents'), and its personality to `art/data/personality_v1.json` (description 117 to 137 graphemes).
4. Add it to `art/kid_checks.json` and run `npm run art:export` and `npm run art:kids`.
5. Write its habit (below) and run `npm run motion:build`.
6. Capture it (`review.spec`, `motion.spec`), look at every sheet, then hand it to Codex for an art review.

## Animation (motion v1, D-105)

Animation is authored data. Nothing is animated in engine code.

- A clip is written in `art/motion/` as a function of time that returns a pose. `bake` samples it at 12 frames a second into a frame list. `scripts/build-motion.mjs` writes all of them to `kid_motion_v1.json`.
- The map lays that file over the rig (`mapRig` in `src/content/artData.ts`): a clip of the same name replaces Codex's. The Dex, cards and the new-kid popup keep `kidRig`, Codex's frame-swap clips.
- A frame can set: the body frame, the face state, the rig's offset, rotation, scale and opacity (about the ground point, or about a height with `pivotY`), a face offset, each costume part's offset, rotation and scale (about its attachment point, or `about: 'centre'` for the middle of its drawing), and marks.

| File | Holds |
|---|---|
| `art/motion/lib.mjs` | `bake`, `keys` (keyframes with eases), `steps`, `sin` |
| `art/motion/core.mjs` | The clips every kid shares: `idle`, `walk`, `look_around`, `sit_down`, `seated`, `sleep`, `wake`, `wave`, `pick_up`, `held`, `drop`, `spawn`, `fusion_parent`, `fusion_child`; and `MARGIN` |
| `art/motion/habit-kit.mjs` | Helpers for habits: `fly` (a mark that travels and fades), `hop`, `stretch`, `shake`, `flutter`, anchors |
| `art/motion/habits*.mjs` | One habit per kid, by tier; `habits-wild.mjs` for specials and rares |

### The margin

Motion carries a kid a little outside its lifetime box, so every box grows by `MARGIN` (6 px left and right, 12 above, 4 below, in source px). The clips a kid lives in must stay inside box plus margin, and `npm run art:kids` checks every kid's real drawings in every frame. The short event clips (`spawn`, `pick_up`, `held`, `drop`, the fusion clips) may pass it for a moment.

### Marks (D-100)

Marks are small drawings (`art/src/fx/fx_mark_*.svg`: z, dust, spark, star, note, drop, tick, steam, leaf, snow, bubble, flame, ring) shown with a frame. They show only at the zoom the map opens at or closer (`marksMinZoom`), and never under reduced motion. Place a mark from an attachment (`anchor: 'head_top'`), so it sits right on every body shape.

A mark in front of a kid must never cross its face. The torso's attachment point is only about 30 px below the smirk, so a mark placed "above the torso" lands on the face: place steam and sparks beside the prop they come from (the Tea Kid's cup is 84 px to the right of the torso point), or draw the mark `behind`.

### Habits (D-099)

Every kid has one: two or three seconds, a small wind-up, one clear action, a settle. It moves the kid's own costume parts, the body and a few marks; the face only blinks or sleeps. A wild kid's habit is whole-body motion and marks. The sim picks a habit as one of a resting kid's activities.

Hand props have little room to move. Turned toward the body they cross the face (the wide face's eye is 17 px from the hand's column); turned away they leave the box. Small turns, lifts and bobs work; a tall prop (the Blacksmith's hammer, the Bouquet) mostly rises and falls. To spin, a part must turn about its own middle (`about: 'centre'`), and its drawing must be the spinning thing alone.

Four costumes are one drawing with their stand, so the part that should spin cannot: Sky Fair's wheel, Windmill's sails, Pinwheel's wheel and Sculpture Park's spiral. Their habits work around it. Splitting each drawing into two components would let them turn.

## Review

1. **Claude** checks every drawing large and at game size, on all four bodies and in every pose, and every animation frame by frame. `npm run art:kids` must pass.
2. **Codex** reviews the art: a read-only task (`codex-companion task`, no `--write`) in a review worktree, asked to open the rendered sheets and to check the geometry itself. Its findings are fixed and it reviews again until it accepts. Its reviews go on the pull request, verbatim.
3. **The owner** sees it after that.

A prompt that worked is in the history of PR #127: name the decisions to judge against, list the files, say what changed since the last round, and ask for a verdict per kid.

## Known gaps

- `npm run art:kids -- --all` reports about fifty problems in costumes drawn before D-098: a few props that miss the waving arm on the squat body, a few faces crowded on the wide face, and bounds overshoots of a pixel or two. They are reported, not failed.
- The owner's review found that tier 4 and 5 costumes read weaker at game size than tier 1 (small caps and hand props). Redrawing them around one large shape is approved (D-101) and not started.
- Outline shimmer when zoomed out: see `docs/RENDERING.md`.
