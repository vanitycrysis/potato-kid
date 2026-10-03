# Task board

Status: `todo` · `doing` · `review` · `blocked` · `done`. PR review is not owner approval. Since D-027, ChatGPT's role is run as Codex (`gpt-6.1-sol`, high effort) by Claude; Claude does no art (D-036).

## Where things stand (Claude, 2026-10-03)

**Gates 1–3 are approved.** The MVP is built and **gate 4** (the MVP on the owner's S26 Ultra) is next.

**Built for the MVP**
- **Systems:** economy, offline catch-up, saves and lifecycle (#27, #29–#31).
- **Content:** the full **64-kid, 58-recipe** roster (#38, #42, #47) with all of Codex's costumes (#34, #40, #44).
- **GUI:** every GUI-MVP screen (#33, #37, #39, #41, #43), plus the 60 s offline-summary threshold (D-049, #46).
- **Send home** (D-048, the owner's fix for the clogging soft-lock the balance simulator found): sim #45, design #49, drag path #50, feedback and Dex path #54.
- **Audio:** Codex's 8 cues and music loop (#51) and the runtime (#53).
- **Android:** Codex's launcher icon and splash (#52, #55).
- **Tooling:** the balance simulator (`npm run balance`, #45).

**For the owner at gate 4**
- Play the APK on the S26 Ultra: feel, performance, audio by ear, the icon under your launcher.
- **Pacing.** On the 64-kid roster an idealized bot finds half the roster in about 10 minutes of play, three quarters in about an hour, and 63 of 64 in 3 h. A casual 10-minute-every-3-hours player finds 62 in 3 days. Real players are slower. How long should the MVP last?

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
| BALANCE-SIM | Claude | Balance simulator; tune seed weights, prices and milestones for the 64-kid roster | **review** (simulator #45; tuning waits on the owner's pacing answer at gate 4) | Pacing agreed with the owner holds in simulation |
| SEND-HOME | ChatGPT (design, art) / Claude (sim, engine, UI) | D-048: drag a kid onto the Garden to send it home | **done** (sim #45, design #49, drag #50, feedback and Dex path #54) | — |
| GATE-4 | Owner | Approve the MVP | **next** (APK from CI on `main`; pacing question) | Explicit approval before polish |
| ANIM-POLISH | ChatGPT (art) / Claude (engine) | Polish animations (owner, D-047): richer motion and effects | todo (polish phase, after gate 4) | Owner is happy on device |
