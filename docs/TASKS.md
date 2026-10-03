# Task board

Status: `todo` · `doing` · `review` · `blocked` · `done`. PR review is not owner approval. Since D-027, ChatGPT's role is run as Codex (`gpt-6.1-sol`, high effort) by Claude; Claude does no art (D-036).

## Where things stand (Claude, 2026-10-02, evening)

**Gates 1–3 are approved** (gate 2: D-044–D-046; gate 3: D-047). We're in **M3 / BUILD-MVP**, working toward **gate 4** (the MVP on the owner's S26 Ultra).

**Done in M3 so far**
- **Economy:** currencies, buildings, instant spawn and the Compendium in the sim (#27).
- **Offline catch-up** (#29), the **save system** (#30), and lifecycle wiring (#31).
- **Roster:** ROSTER-PLAN (Codex, #28), a 64-type MVP roster with a recipe graph toward ~500 types. ROSTER-SCALE (#35): trimmed exports and per-type costume loading.
- **GUI-MVP:** Codex's design (#32, #36). Claude's DOM implementation:
  - HUD, feedback and save banners (#33)
  - short viewports (#37)
  - the Garden, Capacity and Bias sheets (#39)
  - Compendium, offline summary and Settings (#41)
  - the **Potato-Dex** (#43, in review)
- **Art:** ASSET-MVP batches 1 and 2 (Codex, #34 and #40, Claude-reviewed) are imported: **52 kids and 46 recipes** in content (#38, #42).

**In flight**
- **Batch 3** (#44): the 12 tier-5 kids, plus Aurora and Terrarium follow-ups. Claude asked for changes to Windmill, Rescue Station and Sky Fair; Codex is on round 2.
- Its import then brings content to the full **64-kid** MVP roster.

**Before gate 4**
- Balance simulator and tuning (the six-seed weights, milestones and prices are provisional).
- Audio (Codex's 8 cues and music loop, then the runtime; Settings already stores audio choices).
- Icons and launcher/splash (Codex).
- An on-device check.

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
| BUILD-MVP | Claude | Currencies, buildings, Dex, compendium, offline + lifecycle, save, balance simulator, audio | **doing** (economy #27, offline #29, save #30, lifecycle #31 done; balance simulator #45 in review; audio runtime to do) | Tests pass; Codex review |
| GUI-MVP | ChatGPT (design, art) / Claude (DOM implementation) | Design the MVP's panels and HUD additions: currencies, building upgrades, bias picker, compendium, Potato-Dex, instant spawn, offline-return summary, feedback for refusals and rewards, save banners | **done** (design #32, #36; implementation #33, #37, #39, #41, #43; D-049 threshold #46) | — |
| ASSET-MVP | ChatGPT | Full roster polish, icons, font, 8 cues, music loop, launcher/splash | **doing** (all 64 costumes done: #34, #40, #44; next the 8 cues, music loop, icons, launcher/splash) | Claude review passes; device listening check |
| IMPORT-MVP | Claude | Bring each accepted art batch into content: kids, recipes, Dex milestones, previews | **review** (batches 1 and 2: #38, #42; batch 3, the full 64-kid roster, #47) | Validation, budget and preview checks pass; Codex review |
| BALANCE-SIM | Claude | Balance simulator; tune seed weights, prices and milestones for the 64-kid roster | **doing** (simulator #45; how long the MVP should last is an owner question at gate 4) | Pacing agreed with the owner holds in simulation; Codex review |
| SEND-HOME | ChatGPT (design, art) / Claude (sim, engine, UI) | D-048: drag a kid onto the Garden to send it home | **doing** (sim command #45; Codex designing the drop target and departure) | Codex design reviewed; engine/UI PR passes Codex review |
| GATE-4 | Owner | Approve the MVP | todo | Explicit approval before polish |
| ANIM-POLISH | ChatGPT (art) / Claude (engine) | Polish animations (owner, D-047): richer motion and effects | todo (polish phase, after gate 4) | Owner is happy on device |
