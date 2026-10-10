# Task board

Status: `todo` · `doing` · `review` · `blocked` · `done`. PR review is not owner approval. Since D-027, ChatGPT's role is run as Codex (`gpt-6.1-sol`, high effort) by Claude; Claude does no art (D-036).

## Where things stand (Claude, 2026-10-05)

**Gates 1–3 are approved. Gate 4 came back with feedback twice.** The first round (D-050..D-059, 2026-10-03) is all on `main`. The second round (D-068..D-074, 2026-10-05): the build looks alright for this stage and visual polish waits for the polish phase; food is farmed by kids in fields instead of bought; a much less busy screen; a 4 × 4-screen map with pinch-to-zoom; ten rare kids replace the rare variants; specials go wild too; kids can be taken back out of plots. Then gate 4 goes back to the owner.

**Order of work**
- **Done:** MUSIC-LOOP (#61), WAVE-WIGGLE (#62), FUSE-DROP's engine side (#66), GATE4-DESIGN (#67), PACING (#68), PERSONALITY (#69), OFFLINE-WANDER (#70), PLANT-V2-DESIGN (#73), PLANTING (#72), VARIANTS (#77) and FEED-NAME (#78). The second gate-4 build went to the owner on 2026-10-05 (CI run 37269632535); their feedback is D-068..D-074.
- **Now, Codex (one task at a time, in this order):** LAYOUT-DESIGN (D-070, D-071's controls and larger map, D-074's take-out and cancel), then FARM-DESIGN (D-069), then WILD-ART (D-072's ten rare kids and D-073's special redesigns, on PR #76).
- **Claude, in review (2026-10-05):** PLOT-REMOVE's sim and save (#82), MAP-ZOOM's engine (#83), RARE-KIDS' rules (#84, stacked on #82). **Codex is out of usage until 2026-10-09 17:13** (the owner chose to wait), so none of them, nor this board's #81, can merge before then. FARMING's sim waits for FARM-DESIGN: its fields' interaction shapes the sim. UI work follows each Codex design.
- **Parked:** expeditions (D-065), an owner idea for later; nothing is built for it.

**Built for the MVP so far**
- **Systems:** economy, offline catch-up, saves and lifecycle (#27, #29–#31).
- **Content:** the full **64-kid, 58-recipe** roster (#38, #42, #47) with all of Codex's costumes (#34, #40, #44).
- **GUI:** every GUI-MVP screen (#33, #37, #39, #41, #43), plus the 60 s offline-summary threshold (D-049, #46).
- **Send home** (D-048, now superseded by planting, D-054): #45, #49, #50, #54. Its drag-and-hold gesture is kept for planting.
- **Audio:** Codex's 8 cues and music loop (#51) and the runtime (#53).
- **Android:** Codex's launcher icon and splash (#52, #55); the owner approved the icon at gate 4.
- **Tooling:** the balance simulator (`npm run balance`, #45).

## Board

| ID | Owner | Task | Status | Done when |
|---|---|---|---|---|
| PLAN-* | Both | Project plan | **done** (PRs #1, #2, #7) | — |
| GATE-1 | Owner | Approve the project plan | **done** (stack, rules, device, private repo; roster expanded with owner leave, D-038) | — |
| SCAFFOLD, COMPOSITE | Claude | Scaffold, CI, layered kids | **done** (#3, #4) | — |
| BUILD-PLAYABLE | Claude | Spawn, drag and drop, R1 fusion, debug APK | **done** (#5) | — |
| ART-STYLE / ART-V2 | ChatGPT | Art style, then v2 per owner feedback | **done** (#8, #16; gate 2 approved) | — |
| ENGINE-V2 | Claude | Rig renderer, appearance, box collision, map v2, scrolling, no overlap | **done** (#11, #14, #17) | — |
| GUI-V2 | Claude (impl) / ChatGPT (art) | HUD, tray, Dex button, toast | **done** (#15) | — |
| GATE-2 | Owner | Approve the art style | **done** (D-044, 2026-10-02) | — |
| ASSET-PLAYABLE | ChatGPT | A: D-045 face fix + final art for the 12 placeholder costumes. B: deferred poses and clips, FX, landmarks, font | **done** (#21, #23) | — |
| ROSTER-PLAN | ChatGPT (names, themes, combinations) / Claude (IDs, validation, balance) | Roster plan toward ~500 types (D-046): themes, tiers, recipe graph, and the 50–80 that ship in the MVP | **done** (#28: 64 MVP kids, 58 recipes, six seeds) | — |
| ROSTER-SCALE | Claude | Engine and pipeline for ~500 types: per-type texture loading and unloading, Dex thumbnails, content validation at scale, art-export throughput | **done** (#35) | — |
| PLAYABLE-INTEGRATION | Claude | Play part B's clips, FX and shadow; wave ambient; reduced motion; bundle the font | **done** (#24) | — |
| GATE-3 | Owner | Approve the first playable (on the S26 Ultra) | **done** (D-047, 2026-10-02) | — |
| BUILD-MVP | Claude | Currencies, buildings, Dex, compendium, offline + lifecycle, save, balance simulator, audio | **review** (economy #27, offline #29, save #30, lifecycle #31, balance simulator #45, audio runtime #53; Send home #50, #54) | Owner gate 4 |
| GUI-MVP | ChatGPT (design, art) / Claude (DOM implementation) | Design the MVP's panels and HUD additions | **done** (design #32, #36, #49; implementation #33, #37, #39, #41, #43, #46, #50, #54) | — |
| ASSET-MVP | ChatGPT | Full roster polish, icons, font, 8 cues, music loop, launcher/splash | **review** (64 costumes #34, #40, #44; audio #51; launcher and splash #52, converted #55) | Owner's device listening and look at gate 4 |
| IMPORT-MVP | Claude | Bring each accepted art batch into content | **done** (#38, #42, #47: 64 kids, 58 recipes) | — |
| BALANCE-SIM | Claude | Balance simulator; tune seed weights, prices and milestones for the 64-kid roster | **done** (simulator #45); the tuning moves to PACING | — |
| SEND-HOME | ChatGPT (design, art) / Claude (sim, engine, UI) | D-048: drag a kid onto the Garden to send it home | **done**, superseded by PLANTING (D-054) (sim #45, design #49, drag #50, feedback and Dex path #54) | — |
| MUSIC-LOOP | Claude | Gate-4 bug: the music doesn't always loop on the device. Make the loop seamless and keep it playing (also after app switches) | **done** (#61); the owner checks it on device at gate 4 | The loop has no gap or click and never stops on its own, in tests and on the owner's device |
| FUSE-DROP | Claude (engine) / ChatGPT (highlight design) | D-051: releasing a kid onto another tries the pair; the kid under the finger is highlighted while dragging | **review** (engine side merged in #66; the highlight from GUI_MVP §14.1 is drawn next) | Drops onto a partner fuse even on a crowded map; drops onto a non-partner slide apart; the highlight never hints at recipes; e2e covered |
| PACING | Claude | D-052: tutorial at one kid a minute, then 20 min falling to about 8 min with Garden upgrades; much slower Materials; retune prices and milestones with the simulator | **done** (#68) | `npm run balance` shows the agreed schedule; PR with before and after numbers, reviewed by Codex |
| OFFLINE-WANDER | Claude | D-053: on return, kids have moved and offline spawns have walked out from the Garden; no offline fusions | **done** (#70) | Unit and e2e tests for positions after a long absence, with no recipe pair left touching |
| GATE4-DESIGN | ChatGPT | Interaction design and art for D-051..D-058: the drop highlight, planting (plots, seed, growing, sprout), Rainbow and Mini looks, foods, feeding, naming and the kid card; plus a planting sound in the existing audio style | **done** (#67; Claude's review passed in round 2; the owner sees it at gate 4) | Claude's review passes (technical fit, consistency, D-045) |
| PERSONALITY | ChatGPT (writing) / Claude (data format, validation) | D-058: a short description, likes, hates and hobbies for all 64 types, with a favourite and a hated food each (D-056) | **done** (#69; the game loads it with FEED-NAME) | Every type has a personality that passes content validation; Claude's review passes |
| PLANTING | Claude | D-061 (supersedes D-054): the sim, save, engine and UI for planting 3 to 5 kids per plot (drag, or tap a plot and pick), Start growing, and sprouts with the special and rare rolls (offline too), replacing Send home | **done** (#72; Codex's review passed in round 5) | Unit, save-migration and e2e tests; the balance simulator includes planting |
| VARIANTS | Claude | D-062 (supersedes D-055): ten rare variants: rolls, income, Dex marks, sparkle and profile rendering from Codex's design; never sold by the Compendium | **done**, superseded by RARE-KIDS (D-072) (#77; Codex's review passed in round 5) | Tests for odds, income and saves; the Dex shows found variants |
| FEED-NAME | Claude | D-056, D-057: buying and feeding food, happiness, naming, the kid card | **done** (#78; Codex's review passed in round 12; D-067 numbers, tunable) | Tests for prices, refusals, boosts and names in saves; e2e for the kid card |
| PLANT-V2-DESIGN | ChatGPT | D-061..D-063: the planting flow for 3 to 5 kids (a plot filling up, picking kids by tapping a plot, Start growing sparkling at 5, showing the odds); eight more rare looks plus the sparkle and the special profile; concepts for about 20 special kids (names, one-line ideas, tiers) for the owner to approve; the Dex for specials and ten rares | **done** (#73; Claude's review passed in round 2) | Claude's review passes; the owner approves the special-kid concepts |
| SPECIALS | ChatGPT (art, writing) / Claude (content, rules) | D-063: about 20 apex special kids (tier 5 or above): costumes, names, personalities and foods; content entries that no recipe uses, outside the spawn pool and the Compendium | **doing** (#76: art and writing delivered; the owner settled both open questions with D-073, so Codex redesigns the four held specials and the plain-looking ones in the freer style, as part of WILD-ART; then Claude's content entries) | Every special passes content and art checks; Claude's review passes |
| LAYOUT-DESIGN | ChatGPT | D-070: redesign the HUD, tray and persistent marks so the world fills most of the screen (proposal: ≥ 75 % of a portrait phone with no sheet open), keeping the notebook look. D-071: the larger 4 × 4-screen map's composition from tiles and decor within the texture budget, and how zoom looks (any on-screen zoom control, the farthest and nearest zoom). D-074: taking a kid out of a filling plot and cancelling a growing plot (controls, confirmation, copy, the full-map refusal) | **review** (layout-design-2 delivered 2026-10-09; B1–B3 revised, Claude review pending) | Claude's review passes (technical fit, consistency, D-045); GUI_MVP.md updated |
| FARM-DESIGN | ChatGPT | D-069: food fields on the map (look, choosing a field's food, assigning kids by drag or by tapping the field, kids visibly working, taking them back), the pantry, and feeding from the pantry in the kid card (replacing the food shop). Art for fields and crops in the approved style | todo (after LAYOUT-DESIGN) | Claude's review passes; GUI_MVP.md updated |
| WILD-ART | ChatGPT (art, writing) / Claude (review) | D-072: concepts, then art, names and personalities (with favourite and hated foods) for ten rare kids that keep only the face (one entirely rainbow; objects such as a blimp). D-073: redesign the four held specials and any special plainer than ordinary T2–T4 kids, in the same freer style, and answer Claude's third #76 finding (box-shaped props). Readable at about 55 px, in colour and grayscale, and within the texture budget | todo (after FARM-DESIGN; on PR #76's branch for the specials) | Claude's review passes; the owner sees them at the next gate-4 build |
| PLOT-REMOVE | Claude | D-074: take a kid out of a filling plot; cancel a growing plot (all kids back, time lost); only with room on the map; sim, save and UI from LAYOUT-DESIGN | **review** (#82: sim and save; the controls follow LAYOUT-DESIGN) | Unit, save and e2e tests, including the full-map refusal and offline growth |
| MAP-ZOOM | Claude | D-071: a world of about 4 × 4 phone screens; pinch-to-zoom alongside one-finger pan and kid drag; spawning, wandering, offline catch-up and the simulator checked on the larger world | **review** (#83: pinch and wheel zoom, 0.5× to 2×; the 4 × 4 world comes with LAYOUT-DESIGN's map composition) | e2e for pinch and pan; device check on the S26 Ultra; frame times per D-034 at the farthest zoom |
| RARE-KIDS | Claude | D-072: retire the ten variant looks; the rare roll sprouts one of ten rare kid types (apex, plantable, in the Dex, never sold, never in the spawn pool); both rolls hit means the rare kid; old variant kids become ordinary; content entries once WILD-ART lands | **review** (#84, stacked on #82: rules, save schema 7, variants retired; the rare content comes with WILD-ART) | Unit and save-migration tests; content validation covers the rares; the simulator includes them |
| FARMING | Claude | D-069: fields, assignment, farming rates (favourite faster, hated refused), the pantry, feeding from it; farmers earn no Materials; remove the food shop; tune numbers with the simulator | todo (sim after RARE-KIDS; UI after FARM-DESIGN) | Unit, save and e2e tests; `npm run balance` before and after numbers; reviewed by Codex |
| LAYOUT | Claude | D-070: implement LAYOUT-DESIGN's HUD and tray | todo (after LAYOUT-DESIGN) | e2e covers the new layout at the GUI_MVP viewports; the world share is measured |
| TROPHY-MAP | Both | D-064: a map to display special kids, bought for an absurd price | later (after SPECIALS) | — |
| WAVE-WIGGLE | ChatGPT (art) / Claude (engine check) | D-059: replace the wave with a really fast wiggle of the stubby arms | **done** (#62, Claude's review passed in round 2; Water's hood is the weakest case, for the owner's device check) | Claude's review passes; the owner sees it on device at the next gate-4 build |
| GATE-4 | Owner | Approve the MVP | **feedback** (2026-10-03: D-050..D-059, all done; 2026-10-05: D-068..D-074, in progress) | Explicit approval before polish |
| ANIM-POLISH | ChatGPT (art) / Claude (engine) | Polish animations (owner, D-047): richer motion and effects | todo (polish phase, after gate 4) | Owner is happy on device |
