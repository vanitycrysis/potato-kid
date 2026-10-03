# Task board

Status: `todo` · `doing` · `review` · `blocked` · `done`. PR review is not owner approval. Since D-027, ChatGPT's role is run as Codex (`gpt-6.1-sol`, high effort) by Claude; Claude does no art (D-036).

## Where things stand (Claude, 2026-10-03)

**Gates 1–3 are approved. Gate 4 came back with feedback** (D-050..D-059): the icon is approved; the MVP gets a forgiving drop, much slower pacing, a world that lives on offline, planting with Rainbow and Mini variants (replacing Send home), feeding, naming, kid personalities, a stubby-arm wiggle, and a music-loop fix. Then gate 4 goes back to the owner.

**Order of work**
- **Done:** MUSIC-LOOP (#61), WAVE-WIGGLE (#62), FUSE-DROP's engine side (#66) and GATE4-DESIGN (#67); they go to the owner's device at the next gate-4 build.
- **Now:** PACING and OFFLINE-WANDER in review (Claude); PERSONALITY in review (Codex). Next: PLANTING, VARIANTS and FEED-NAME (Claude), from GUI_MVP §§14–18.
- **After the design:** PLANTING, VARIANTS and FEED-NAME (Claude), with Codex's art and the planting cue.

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
| PACING | Claude | D-052: tutorial at one kid a minute, then 20 min falling to about 8 min with Garden upgrades; much slower Materials; retune prices and milestones with the simulator | **review** (PR with the simulator's before and after) | `npm run balance` shows the agreed schedule; PR with before and after numbers, reviewed by Codex |
| OFFLINE-WANDER | Claude | D-053: on return, kids have moved and offline spawns have walked out from the Garden; no offline fusions | **review** (PR after PACING) | Unit and e2e tests for positions after a long absence, with no recipe pair left touching |
| GATE4-DESIGN | ChatGPT | Interaction design and art for D-051..D-058: the drop highlight, planting (plots, seed, growing, sprout), Rainbow and Mini looks, foods, feeding, naming and the kid card; plus a planting sound in the existing audio style | **done** (#67; Claude's review passed in round 2; the owner sees it at gate 4) | Claude's review passes (technical fit, consistency, D-045) |
| PERSONALITY | ChatGPT (writing) / Claude (data format, validation) | D-058: a short description, likes, hates and hobbies for all 64 types, with a favourite and a hated food each (D-056) | **doing** (Codex, `chatgpt/personality`) | Every type has a personality that passes content validation; Claude's review passes |
| PLANTING | Claude | D-054: the sim, save, engine and UI for planting, plots and sprouts (offline too), replacing Send home | todo (after GATE4-DESIGN) | Unit, save-migration and e2e tests; the balance simulator includes planting |
| VARIANTS | Claude | D-055: Rainbow and Mini variants: odds, income, Dex marks, rendering from Codex's design | todo (after GATE4-DESIGN) | Tests for odds, income and saves; the Dex shows found variants |
| FEED-NAME | Claude | D-056, D-057: buying and feeding food, happiness, naming, the kid card | todo (after GATE4-DESIGN and PERSONALITY) | Tests for prices, refusals, boosts and names in saves; e2e for the kid card |
| WAVE-WIGGLE | ChatGPT (art) / Claude (engine check) | D-059: replace the wave with a really fast wiggle of the stubby arms | **done** (#62, Claude's review passed in round 2; Water's hood is the weakest case, for the owner's device check) | Claude's review passes; the owner sees it on device at the next gate-4 build |
| GATE-4 | Owner | Approve the MVP | **feedback** (2026-10-03: icon approved; D-050..D-059 to do first) | Explicit approval before polish |
| ANIM-POLISH | ChatGPT (art) / Claude (engine) | Polish animations (owner, D-047): richer motion and effects | todo (polish phase, after gate 4) | Owner is happy on device |
