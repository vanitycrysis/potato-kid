# Task board

Status: `todo` · `doing` · `review` · `blocked` · `done`. PR review is not owner approval. Since D-027, ChatGPT's role is run as Codex (`gpt-6.1-sol`, high effort) by Claude; Claude does no art (D-036).

## Where things stand (Claude, 2026-10-10)

**Gates 1–3 are approved. Gate 4 came back with feedback twice.** The first round (D-050..D-059) is all on `main`. The second round (D-068..D-074, 2026-10-05): food is farmed by kids in fields; a much less busy screen; a 4 × 4-screen map with pinch-to-zoom; ten rare kids replace the rare variants; specials go wild too; kids can be taken back out of plots. When the work below is in, gate 4 goes back to the owner.

**Order of work**
- **Done since the second gate-4 round:** the owner's feedback (#81); PLOT-REMOVE's sim (#82); MAP-ZOOM (#83); RARE-KIDS' rules (#84); Codex's LAYOUT-DESIGN (#85), FARM-DESIGN (#86) and WILD-ART with the specials (#76); LAYOUT parts 1 and 2 (#87: stat strip, Garden/Dex/Notebook row, Notebook pages, Map view; #88: the 4 × 4 map v3, save schema 8, landscape fit floor).
- **Done too:** LAYOUT part 3 (#89: Kids on map, Which kid?, taking kids out of plots), so all of LAYOUT is in.
- **Claude, doing:** FARMING (#90, a **draft** that carries all of it: the sim, save schema 9 and the pantry feeding page are in; the map and the sheets come next on the same branch, and it merges only when a player can farm through the UI, Codex's P1).
- **Then, Claude:** the twenty specials' and ten rares' content entries with the wild-body renderer (`kid_wild_v1.json`), the rare tiers (simulator), the Dex's segments (§16.4), the T6 tier text, and the balance bot farming. Then the gate-4 build.
- **Codex:** no design task open; TROPHY-MAP (D-064) waits until after gate 4.
- **For the owner (not urgent):** kids' home range (see the HOME-RANGE row), D-067's happiness and name numbers.
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
| SPECIALS | ChatGPT (art, writing) / Claude (content, rules) | D-063: about 20 apex special kids (tier 5 or above): costumes, names, personalities and foods; content entries that no recipe uses, outside the spawn pool and the Compendium | **doing** (art and writing done in #76; Claude's content entries and the wild-body renderer next) | Every special passes content and art checks; Claude's review passes |
| LAYOUT-DESIGN | ChatGPT | D-070: redesign the HUD, tray and persistent marks so the world fills most of the screen (proposal: ≥ 75 % of a portrait phone with no sheet open), keeping the notebook look. D-071: the larger 4 × 4-screen map's composition from tiles and decor within the texture budget, and how zoom looks (any on-screen zoom control, the farthest and nearest zoom). D-074: taking a kid out of a filling plot and cancelling a growing plot (controls, confirmation, copy, the full-map refusal) | **done** (#85; Claude's review passed in round 2) | Claude's review passes (technical fit, consistency, D-045); GUI_MVP.md updated |
| FARM-DESIGN | ChatGPT | D-069: food fields on the map (look, choosing a field's food, assigning kids by drag or by tapping the field, kids visibly working, taking them back), the pantry, and feeding from the pantry in the kid card (replacing the food shop). Art for fields and crops in the approved style | **done** (#86; Claude's review passed in round 2) | Claude's review passes; GUI_MVP.md updated |
| WILD-ART | ChatGPT (art, writing) / Claude (review) | D-072: concepts, then art, names and personalities (with favourite and hated foods) for ten rare kids that keep only the face (one entirely rainbow; objects such as a blimp). D-073: redesign the four held specials and any special plainer than ordinary T2–T4 kids, in the same freer style, and answer Claude's third #76 finding (box-shaped props). Readable at about 55 px, in colour and grayscale, and within the texture budget | **done** (#76; Claude's review passed in round 2; Seashell's teapot read noted for the polish pass) | Claude's review passes; the owner sees them at the next gate-4 build |
| PLOT-REMOVE | Claude | D-074: take a kid out of a filling plot; cancel a growing plot (all kids back, time lost); only with room on the map; sim, save and UI from LAYOUT-DESIGN | **done** (#82: sim and save; the controls in #89) | Unit, save and e2e tests, including the full-map refusal and offline growth |
| MAP-ZOOM | Claude | D-071: a world of about 4 × 4 phone screens; pinch-to-zoom alongside one-finger pan and kid drag; spawning, wandering, offline catch-up and the simulator checked on the larger world | **done** (#83: pinch and wheel; #88: the 4 × 4 map, save schema 8, fit floor; the simulator shows a casual player two days slower, see HOME-RANGE) | e2e for pinch and pan; device check on the S26 Ultra; frame times per D-034 at the farthest zoom |
| RARE-KIDS | Claude | D-072: retire the ten variant looks; the rare roll sprouts one of ten rare kid types (apex, plantable, in the Dex, never sold, never in the spawn pool); both rolls hit means the rare kid; old variant kids become ordinary; content entries once WILD-ART lands | **doing** (#84: rules and schema 7 done; the ten rares' content entries and tiers next, with the wild-body renderer) | Unit and save-migration tests; content validation covers the rares; the simulator includes them |
| FARMING | Claude | D-069: fields, assignment, farming rates (favourite faster, hated refused), the pantry, feeding from it; farmers earn no Materials; remove the food shop; tune numbers with the simulator | **doing** (#90, draft: sim, save schema 9 and the pantry feeding page done; the map and sheets next, then the bot farming and tuning) | Unit, save and e2e tests; `npm run balance` before and after numbers; reviewed by Codex |
| LAYOUT | Claude | D-070: implement LAYOUT-DESIGN's HUD and tray | **done** (#87, #88, #89) | e2e covers the new layout at the GUI_MVP viewports; the world share is measured |
| HOME-RANGE | Owner (decision) / Claude (engine) | On the 4 × 4 map kids wander everywhere (about 1.5 a screen at 24). Codex proposes a soft preference for the Garden's neighbourhood, a kid dropped elsewhere anchoring where it was put, the whole map still open (LAYOUT-DESIGN notes). The simulator (#88): a casual player completes the roster on day 8.6 instead of 6.4 on the larger map | **blocked** (owner's choice: keep whole-map wandering, or try the soft home range in the simulator first) | The owner decides; if yes, simulator before and after |
| TROPHY-MAP | Both | D-064: a map to display special kids, bought for an absurd price | later (after SPECIALS) | — |
| WAVE-WIGGLE | ChatGPT (art) / Claude (engine check) | D-059: replace the wave with a really fast wiggle of the stubby arms | **done** (#62, Claude's review passed in round 2; Water's hood is the weakest case, for the owner's device check) | Claude's review passes; the owner sees it on device at the next gate-4 build |
| GATE-4 | Owner | Approve the MVP | **feedback** (2026-10-03: D-050..D-059, all done; 2026-10-05: D-068..D-074, in progress) | Explicit approval before polish |
| ANIM-POLISH | ChatGPT (art) / Claude (engine) | Polish animations (owner, D-047): richer motion and effects | todo (polish phase, after gate 4) | Owner is happy on device |
