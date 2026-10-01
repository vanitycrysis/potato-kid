# Engineering plan

Author: Claude. Revision 2 (2026-10-01): updated after ChatGPT's review on PR #1 (`docs/ENGINEERING_REVIEW.md` in PR #2). Each section says which review point it answers.

**Owner decisions already given (2026-10-01):** Android first; TypeScript + PixiJS + Capacitor stack approved. Also confirmed:
- Materials are earned passively per kid, scaled by tier.
- Potatokens are speed-ups only; there are no real-money purchases in the MVP.
- No fusions happen offline.
- Offline catch-up is capped at 8 hours.

## 1. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript, strict | Typed and testable; both AIs work in it fluently |
| World rendering | PixiJS v8 | Fast 2D WebGL batching; used for rendering only |
| UI (HUD, panels, Dex) | **DOM overlay** (plain TS + CSS) on top of the Pixi canvas | Live text, accessible touch targets (≥ 44 px), simple layout. Answers review §5 |
| Build | Vite | Static build; the same output runs in a browser and inside Capacitor |
| Mobile shell | Capacitor, **Android first** | Native storage, app pause and resume events, back button |
| Audio | Howler.js | Mobile audio unlock and format fallback |
| Tests | Vitest (simulation, economy, save, content) + Playwright (browser smoke test, drag-and-drop flows, screenshots) | Checks behaviour without a human |
| CI | GitHub Actions | Typecheck, lint, unit tests, build and e2e on every PR; **debug APK built in CI** from M2 on |

**Why not Godot or Unity (corrected, review §6).** Godot does export to the web. We prefer the web stack because the entire project is plain text that two agents can diff and review, the tests run headless in Node, and the same build runs in a browser and on Android. Unity's binary assets and editor-centric workflow suit agents working through PRs poorly.

**iOS (corrected, review §6).** The Capacitor iOS route needs a Mac with Xcode. Xcode's free Personal Team allows limited testing on your own device. Distribution needs a paid membership. iOS is out of MVP scope.

**Toolchain check (review §5).** This machine has the Android SDK, emulator images and Android Studio, whose bundled JDK can build APKs locally. CI builds on `ubuntu-latest` with `setup-java` and the Android SDK.

**Playable builds for the owner.** GitHub Pages is **not available** for this private repo on the current plan (the API returned 422). Until the owner decides otherwise, gate builds are delivered as:
- a zipped web build, attached to CI as an artifact;
- from M2 on, a debug APK the owner sideloads.

If the owner makes the repo public, the Pages workflow is ready.

## 2. Architecture

```
src/
  sim/       pure TS rules: state, step, recipes, economy, offline, rng. No Pixi, no DOM.
  content/   kids.json, recipes.json, buildings.json, balance.json (data only)
  save/      versioned save, slots, migrations, storage adapter
  render/    Pixi world view; reads state, never mutates it
  input/     pointer → world-coordinate commands
  ui/        DOM HUD and panels
  audio/     Howler wrapper driven by sim events
  platform/  app lifecycle (visibility, Capacitor pause/resume), storage backend
```

- **The simulation is separate from rendering.** `step(state, dt, commands) → events`. Rendering and audio react only to the events. The simulation steps at a fixed 10 Hz, and rendering interpolates positions between steps.
- **Offline catch-up is a deliberately simplified rule set** (review §1). It does not replay wandering or fusions. It reuses the same economy functions, but the rules are different, and the docs and tests say so.

### Contact and fusion contract (review §4)

1. Fusion candidates come from a spatial hash. A pair is a candidate when both kids are present, neither is being dragged, neither is inside its newborn grace period, and a recipe exists for the pair.
2. Candidates are sorted by `(distance, min(idA,idB), max(idA,idB))`. Kid IDs are stable, monotonically increasing integers, so ties always break the same way.
3. Candidates are resolved in that order inside one step. A kid already consumed in this step is skipped. Removing both parents and adding the result is one state update, so neither parent can fuse twice.
4. **The consumption guard is (3), not the grace period.** The 2 s newborn grace period is only a pacing parameter in `balance.json`, to be tuned in playtests.
5. **Dropping a kid.** A drop command carries screen coordinates. Input converts them to world coordinates using the camera transform as of the last *rendered* frame, so what the player sees is what is hit. A cancelled touch (`pointercancel`, leaving the app, a second finger) returns the kid to where the drag started. A dropped kid gets fusion-checked in the next step like any other kid.

### Content contract and validation (review §4)

CI fails if any of these are false:
- Kid IDs are unique.
- Every recipe pair is unique and unordered.
- Every recipe result exists, and its **tier is greater than both parents' tiers**.
- **Every recipe is reachable.** Each input is either in the spawn pool or the result of a reachable recipe; this is checked as a graph walk.
- Spawn and bias weights are > 0 and finite.
- Every kid has the assets its layers need (once art exists).
- Every kid appears in the Dex.

### Starter roster and recipes (proposal, review §4)

This is the shared proposal. **ChatGPT owns names and theming** and may rename anything. I own the IDs and the structure. It is built from the design doc's examples (Fire, Water, Firefighter) and the cook and snow references.

| ID | Tier | Source | Theme |
|---|---|---|---|
| `plain` | 1 | spawns | the base Potato Kid, no overlay |
| `fire` | 1 | spawns | flame |
| `water` | 1 | spawns | droplet |
| `snow` | 1 | spawns | beanie + scarf (snow refs) |
| `chef` | 2 | recipe | chef hat + pan (cook refs) |
| `firefighter` | 2 | recipe | helmet + hose |
| `snowman` | 2 | recipe | snowman body (snow refs) |
| `steam` | 2 | recipe | steam cloud |
| `hero` | 3 | recipe | firefighter cape / medal |
| `sundae` | 3 | recipe | ice-cream bowl |

| # | Recipe | Notes |
|---|---|---|
| R1 | `plain + water → firefighter` | **The first-playable recipe.** Uses only art-gate assets (base, water, firefighter). |
| R2 | `plain + fire → chef` | |
| R3 | `plain + snow → snowman` | |
| R4 | `fire + water → steam` | |
| R5 | `fire + firefighter → hero` | The design doc's own example pairing |
| R6 | `chef + snowman → sundae` | |

There are 55 possible type pairs and 6 recipes, which keeps the recipe set sparse as the design asks. Early discovery is denser on purpose: 4 of the 10 tier-1 pairs are recipes. The balance simulator will tell us whether that is too generous.

- **Spawn pool:** `plain` 40, `fire` 20, `water` 20, `snow` 20.
- **Bias building:** multiplies one chosen tier-1 type's weight by `1 + 0.5·level`.

### Buildings (MVP)

| ID | Effect per level | Location |
|---|---|---|
| `garden` | Spawn interval × 0.85 | **On the map:** kids emerge from it |
| `capacity` | +4 capacity | UI panel |
| `bias` | Chosen type's weight × (1 + 0.5·level) | UI panel |
| `compendium` | Unlocks respawning a discovered kid for Materials (or Potatokens) | UI panel |

Proposal for ChatGPT: only the Garden needs a large map sprite. The other three are reached from a bottom tray and need **icons, not 512 px building sprites**. This keeps the play area clear for kids and cuts the art budget. All upgrades are **instant**, so the MVP has no construction timers (review §2).

**Potatokens in the MVP:**
- Spent on instant spawns, and as an alternative way to pay for compendium respawns.
- Earned from first discoveries and Dex milestones.
- No time-skip feature exists in the MVP, because nothing has a timer.

## 3. Economy (first pass; every value lives in `balance.json`)

| Quantity | Formula | Start |
|---|---|---|
| Garden spawn interval | `12 s · 0.85^(level-1)` | 12 s |
| Capacity | `12 + 4·(level-1)` | 12 |
| Materials per kid per second | `0.5 · 2^(tier-1)` | 0.5 |
| Upgrade cost | `c0 · 1.6^level` | per building |
| Compendium respawn | `respawnBase · 2^(tier-1)` | — |

A headless **balance simulator** plays the economy with a scripted player bot. It reports:
- time to the first recipe;
- time to each tier;
- the share of time the map sits below 30 % capacity (starvation).

The tuning comes from those numbers.

### Spawn timer and capacity (review §1)

- The state stores a persistent `spawnProgress` in seconds, in `[0, interval]`.
- **Online:** `spawnProgress += dt`. When it reaches the interval and there is room, a kid spawns and progress drops by one interval.
- **When the map is full, progress stops at the interval.** One spawn is "banked", and it happens the instant a slot frees up, for example right after a fusion. Spawn opportunities beyond that one are discarded. Online and offline use this same rule.

### Offline catch-up (review §1)

**Inputs:**
- `away = clamp(now − lastReconciledAt, 0, 8 h)`. Time beyond 8 h is discarded, and the return summary says "capped at 8 h". A negative clock change gives `away = 0`, with no penalty.
- The current state: population, `spawnProgress`, RNG state, the current interval, capacity, and the income of each existing kid.

**Algorithm:**
1. The first spawn happens at `t₁ = interval − spawnProgress`, then every interval after that, while `tᵢ ≤ away` and the population is below capacity.
2. Each admitted spawn's type is drawn from the seeded RNG, in order.
3. `Materials = existingIncome · away + Σᵢ income(kidᵢ) · (away − tᵢ)`.
4. Afterwards `spawnProgress` is either `away − t_last` (map not full), the full interval (map full: one spawn banked), or `spawnProgress + away` when no spawn happened.
5. The loop is bounded: at most `capacity` admitted spawns.

**Resuming exactly once.** `reconcile(now)` sets `lastReconciledAt = now` in the same state update that applies the catch-up. A second resume signal (both `visibilitychange` and the native `resume` event fire) then computes `away ≈ 0` and does nothing. The function is idempotent by construction.

**Short absences.** A gap of 5 s or less between frames, for example a dropped frame or a brief tab switch, is simulated normally rather than reconciled offline.

**Tests:**
- partial intervals, e.g. 11 s of progress plus a 1 s absence gives one spawn (ChatGPT's counterexample);
- capacity reached partway through an absence;
- mixed-tier incomes;
- repeated resume;
- a negative clock change;
- an absence over 8 h;
- RNG continuity across save and load.

## 4. Save system (review §3)

**Record:** `{ schema, revision, savedAt, state, checksum }`. The state includes `spawnProgress`, the RNG state, `lastReconciledAt` and the next kid ID.

- **Two slots, A and B.** Each write goes to the slot *not* holding the current best save, with `revision + 1`.
- **Writes are serialized** through one promise queue, so they never overlap.
- **Loading:**
  1. Read both slots.
  2. Drop any slot that fails to parse or fails its checksum.
  3. If a slot's schema is newer than the app: **refuse to overwrite it**, enter read-only mode, and tell the player to update.
  4. Pick the highest valid revision.
  5. Migrate it, in schema order.
  6. Reconcile offline time once.
  7. Save once.
- **Both slots invalid:** copy the raw data to a `quarantine` key, start a new game and show a notice. A valid save is never silently replaced.
- **Errors:** storage errors are caught and the game keeps running. A failed save is retried at the next trigger and reported in a debug log.
- **When it saves:** every 10 s, on pause or a visibility change, and after each fusion, purchase or upgrade.

## 5. Asset import contract (moved here from my draft `ASSETS.md`; `ASSETS.md` is ChatGPT's)

I accept ChatGPT's spec in PR #2 with these engine-side terms:
- **Kids:** 256 × 256 RGBA PNG layers (`body`, `face`, `overlay`). Ground anchor at (128, 224); at least 8 px clear padding. Display size is 48–72 CSS px × device pixel ratio, up to 3, so 256 px source is enough.
- **Atlas, manifest, encoding:** I own atlas packing. I **generate the runtime manifest** from file names and dimensions in the build, so nobody maintains pixel sizes by hand. Provenance and licence information is a small hand-written file that ChatGPT owns.
- **World and background** (review §5, camera): the world is **1080 units wide** and the camera fits it to the screen's width.
  - Visible height ranges from about 1920 units (16:9 screens) to 2400 (20:9).
  - The background is **1080 × 2400**. Everything important sits in the central **1080 × 1920** safe band; the top and bottom 240 are decorative bleed.
  - The playable area for wandering is the safe band minus HUD insets: top 160, bottom tray 280.
- **Audio:** ChatGPT delivers **WAV masters only**. The build encodes Ogg Vorbis and M4A AAC reproducibly with ffmpeg, so codec settings live in one script.
  - I agree with ChatGPT: no integrated-LUFS target for short SFX, use a peak ceiling and listening checks instead. Music starts at about −18 LUFS.

## 6. Audio runtime (review §5)

- **Volume:** separate music and SFX volumes plus a mute toggle, saved with the game.
- **Unlock:** audio unlocks on the first pointer-up. If unlocking fails, the game runs silent with no errors.
- **Pausing:** on pause or when hidden, music pauses and SFX stop; music resumes on resume.
- **Priorities:** discovery > fusion > upgrade > spawn > place / pick up > UI tap.
  - Discovery replaces the fusion cue for the same event.
  - Spawn cues are limited to one per 300 ms.
  - Passive income has no per-tick sound.
- **Loops:** each music loop is auditioned in the Android WebView build before it is accepted.

## 7. Performance acceptance (review §5)

- **Target:** 60 fps on a **named** mid-range Android phone (the owner's test phone, to be identified), with:
  - capacity maxed at 40 kids, three layers each;
  - effects, HUD and input active;
  - decoded textures under 32 MiB.
- **Measurement:**
  - frame-time percentiles (p50, p95) from an in-game debug overlay on the device;
  - Chrome remote debugging for memory.
- **CI benchmark:** a headless-Chromium frame-time test catches regressions only. It is never claimed as a phone result.

## 8. Milestones

| # | Milestone | Contents | Ends at |
|---|---|---|---|
| M0 | Plan | Both proposals reviewed and consolidated | Gate 1: owner has approved the stack and rules; the asset list and roster go in the next update |
| M1 | Art style + skeleton | ChatGPT: base, Fire, Water, Firefighter, garden map. Claude: scaffold and CI (PR #3), layered kid compositing and wander with placeholder art, content validator | **Gate 2** |
| M2 | First playable | Spawn, wander, drag and drop, R1 `plain + water → firefighter`, debug APK | **Gate 3** |
| M3 | Systems | Currencies, buildings, Dex, compendium, offline progress, save, full roster, balance simulator, audio | — |
| M4 | MVP complete | Balance pass, device performance and listening checks, release-candidate APK | **Gate 4** |
