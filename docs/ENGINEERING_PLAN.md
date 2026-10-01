# Engineering plan (Claude's proposal, check-in 1)

Status: **proposal**. ChatGPT reviews this; after one review round it is merged with ChatGPT's art and audio plan and goes to the owner for check-in 1. Nothing gets built until the owner approves.

## 1. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict) | Typed simulation code is easy to test, and both AIs read and write it fluently. |
| Rendering | **PixiJS v8** | Fast 2D WebGL batching. A screen with 100+ sprites is trivial for it on mid-range phones. Rendering only, so the game logic does not depend on it. |
| Build | **Vite** | Fast dev server; a static build that runs anywhere. |
| Mobile shell | **Capacitor** (Android first, then iOS) | Wraps the web build into real store apps and gives native storage, app pause and resume events, and haptics. |
| Audio | **Howler.js** | Handles mobile audio unlock, sprite sheets and music loops. |
| Tests | **Vitest** (simulation, economy, save) + **Playwright** (smoke test and screenshots in a headless browser) | Lets the two AIs check behaviour and visuals without a human. |
| CI | **GitHub Actions** | Typecheck, lint and tests on every PR. Each `main` build is deployed to **GitHub Pages** so the owner can play it in a phone browser at every gate. |

**Alternatives considered.** Godot 4 has a good 2D engine, but its scene and editor workflow is harder for two agents to work on through text diffs and PRs, and there is no browser build the owner can tap through as easily. Unity is heavy, uses opaque asset files, and its licensing is a burden for a project like this. Phaser would also work, but we would use little of it beyond what PixiJS already gives us.

## 2. Architecture

```
src/
  sim/        pure TypeScript game state and rules. No Pixi, no DOM. Fully unit-tested.
    state.ts      GameState type (kids, currencies, buildings, dex, rngSeed, lastSavedAt)
    tick.ts       fixed-step update: wander → contact detection → recipe resolution → spawn → income
    recipes.ts    unordered-pair recipe lookup
    economy.ts    all formulas (spawn interval, income, costs) in one file
    offline.ts    closed-form catch-up for time away
    rng.ts        seeded PRNG so every test is deterministic
  content/    data only: kids.json, recipes.json, buildings.json, balance.json
  save/       versioned JSON save, migrations, storage adapter (localStorage / Capacitor Preferences)
  render/     Pixi scene that reads GameState and draws it; does not change it
  input/      pick-up/drag/drop → commands into sim
  ui/         HUD, Dex, building panels (Pixi or lightweight DOM overlay)
  audio/      Howler wrapper; reacts to sim events
```

**Key rules**

- **The simulation is separate from rendering.** `sim` exposes `step(state, dt, commands) → events`. The renderer and audio only react to the returned events (`kidSpawned`, `fused`, `recipeDiscovered`, ...). This keeps the game logic testable without a renderer, and offline catch-up uses the same rules.
- **Fixed timestep**: 10 Hz for the simulation; rendering interpolates between steps at 60 fps. Wandering is cheap steering (random heading changes, kept inside the map bounds).
- **Contact and fusion.** Contact checks use a spatial hash, so they stay cheap with many kids. Each step, candidate pairs are sorted by distance, and a kid that has already been consumed in that step is skipped. As the design doc requires, two kids cannot both trigger a recipe in the same frame. A short **spawn grace period** (~2 s) stops a kid fusing the moment it appears. A kid being dragged by the player cannot fuse until it is dropped.
- **Recipes are data**: `{ "a": "fire", "b": "firefighter", "result": "steam_kid" }`, looked up with the key `min(a,b)|max(a,b)`. Adding a kid or recipe means editing JSON only. CI checks the content files: no duplicate pairs, every result type exists, every kid has art.
- **Kids are composited from layers.** Each kid is drawn as body + face + overlay in a Pixi container. Wander animation is **procedural** (hop, squash, slight tilt, blink). Overlays follow the body automatically, so new kid types need **one static overlay image, not animation frames**. Hand-drawn frames are kept for a few special moments (fusion, napping, the Garden). This is the cheapest way to get the large roster the design doc counts on.

## 3. Economy and balance model (first pass; all numbers in `balance.json`)

| Quantity | Formula | Starting value |
|---|---|---|
| Garden spawn interval | `base · 0.85^(level-1)` | 12 s, generous on purpose (starvation is the risk) |
| Capacity | `base + 4·(level-1)` | 12 kids |
| Materials per kid per second | `0.5 · 2^(tier-1)` | tier 1 = 0.5/s |
| Upgrade cost | `c0 · 1.6^level` | per building |
| Spawn bias | chosen type's spawn weight × `(1 + 0.5·level)` | 1 type at a time |
| Compendium respawn | `respawnBase · 2^(tier-1)` Materials | — |

I will write a **balance simulator** (a headless script that plays the economy with a simple bot strategy) and use it to tune these values. It reports time-to-first-recipe, time-to-each-tier, and the share of time the map sits below 30% capacity, which measures starvation. These numbers decide the tuning, not guesses.

**Offline progress** (non-negotiable) uses **closed-form maths**, not millions of replayed ticks:
- spawns = `min(capacity − population, floor(away / interval))`;
- Materials = the exact integral of income while the population climbs from the spawns and then plateaus at capacity;
- capped at 8 h at first (an upgrade can extend it later);
- clock safety: a negative or absurdly large time away is clamped.

**Proposal: no fusions while the player is away.** The kids "nap" while the app is closed, which fits the sleep reference. Discovery is the main reward, so it should happen while the player is watching, and this also keeps offline maths exact. The player comes back to a full, napping map ready to experiment with.

## 4. Save system

- Versioned JSON: `{ version, savedAt, state }`, with ordered migration functions and tests for each.
- Saves every 10 s, on `visibilitychange` / app pause, and after every fusion or purchase.
- Two save slots that alternate (A/B), each checked against a checksum, so a crash halfway through a write cannot wipe the save.
- Cloud save is out of scope for the MVP.

## 5. Milestones

| # | Milestone | Contents | Ends at |
|---|---|---|---|
| M0 | Plan | This doc + ChatGPT's art/audio plan, merged | **Gate 1** |
| M1 | Art style + tech skeleton | ChatGPT: base kid, 3 variants, 1 map background. Claude meanwhile: repo scaffold, CI, Pages deploy, kid compositing tested with placeholder art | **Gate 2** |
| M2 | First playable | Spawn, wander, pick up/place, 1 working recipe, real art in it | **Gate 3** |
| M3 | Systems | Currencies, Garden + capacity + bias + compendium buildings, Dex, offline progress, saving, starter content (~10 kids, ~6 recipes), balance simulator | — |
| M4 | MVP complete | Android build via Capacitor, audio in, performance check (60 fps with capacity maxed on a mid-range phone), balance pass | **Gate 4** |

## 6. Risks I found while reading

1. **Type colour coding vs the references.** The design doc asks for "clear type-color coding", but the references are black ink only. Proposal: the outline stays black (it is the character's identity), and each type family gets a **colour from a small palette on its overlay/accent**. ChatGPT should decide the details; it affects readability more than anything else.
2. **The references have transparent bodies.** The line art is pure black on full transparency, including inside the potato. On a map background the kids would look see-through. In-game sprites need an **opaque body fill** (off-white or potato-cream).
3. **Duplicate references.** `pk_potato0.webp`, `pk_potato1.webp` and `pk_potato_1.webp` are byte-identical. That is harmless; just noting it.
4. **Potatoken squeeze (design doc §5.2).** Recommendation for the owner: the Garden's free spawning carries the game, and Potatokens are only used to speed things up. The MVP has **no real-money purchases**; Potatokens come from discoveries and milestones. This avoids the "paywall-y" problem the doc flags.
5. **The Materials faucet (design doc §5.1).** I recommend confirming passive income scaled by tier, as the doc assumes. The economy model above is built on it.

## 7. What I need from the owner at gate 1

- Approve the stack: TypeScript + PixiJS + Capacitor.
- **Android first?** iOS needs a Mac and a paid Apple developer account for any device build. Which phone will you test on?
- Confirm or replace: the passive Materials faucet; Potatokens as a speed-up only, with no IAP in the MVP; no fusions while offline.

**Owner answers (2026-10-01):** Android first. Stack approved. The passive faucet, speed-up-only Potatokens with no IAP, and no offline fusions are all confirmed. See DECISIONS D1, D5–D9.
