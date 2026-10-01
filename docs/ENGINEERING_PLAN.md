# Engineering plan

Author: Claude. Revision 4 (2026-10-01): rev. 2 answered ChatGPT's round-1 review; rev. 3 answered Codex/ChatGPT's round-2 review (contact predicate, spawn phase rule, accounting boundary and lifecycle, clock rewind, save failure paths, four layers); rev. 4 answers round 3 (a migration-failed slot is never overwritten; reconcile wording). Each section says which review point it answers.

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

1. **Contact predicate (round 2, point 4).** Two kids are in contact when the distance between their **ground points** is `≤ contactRadius` (`balance.json`, 90 world units; a kid is drawn 180 units tall). Contact is measured on the shared body only: costume layers (capes, hoses, bowls) never change mechanics. The spatial hash (cell size = `contactRadius`, 3 × 3 neighbourhood) only *finds* neighbours; the distance predicate decides contact.
   A pair is a candidate when both kids are present and in contact, neither is being dragged, neither is inside its newborn grace period, and a recipe exists for the pair. Tests cover a recipe pair in adjacent cells but outside the radius, and pairs exactly at and just beyond the boundary.
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
- **Online:** `spawnProgress += dt`. When it reaches the interval and there is room, a kid spawns and progress keeps the overshoot (`progress − interval`).
- **When the map is full, progress accumulates only up to the interval.** If it reaches the interval while full, one spawn is "banked" and fires the instant a slot frees up. Further opportunities are discarded.
- **Reaching capacity never banks time by itself (round 2, point 1).** A spawn that *fills* the map leaves progress at its overshoot, not at the full interval, so a fusion right afterwards does not trigger an immediate spawn. Online and offline use exactly this rule.

### Offline catch-up (review §1)

**Inputs:**
- `away = clamp(now − accountedUntil, 0, 8 h)`. Time beyond 8 h is discarded, and the return summary says "capped at 8 h".
- **`accountedUntil`** (persisted, wall-clock ms) is the instant up to which spawns and income have been credited. It is the single accounting boundary for online and offline time. See "Accounting boundary" below.
- The current state: population, `spawnProgress`, RNG state, the current interval, capacity, and the income of each existing kid.

**Algorithm:**
1. The first spawn happens at `t₁ = interval − spawnProgress`, then every interval after that, while `tᵢ ≤ away` and the population is below capacity.
2. Each admitted spawn's type is drawn from the seeded RNG, in order.
3. `Materials = existingIncome · away + Σᵢ income(kidᵢ) · (away − tᵢ)`.
4. **Phase rule (round 2, point 1):** after at least one admitted spawn, `spawnProgress = min(interval, away − t_last)`; with no admitted spawn, `spawnProgress = min(interval, spawnProgress + away)`. Both cases apply whether or not the map ends full. So 11 s progress + 1 s away into the last free slot leaves progress 0, and a full map at progress 0 with `away = 0` stays at 0.
5. The loop is bounded: at most `capacity` admitted spawns.

**Accounting boundary (round 2, point 1).** Every online sim step advances `accountedUntil` by its `dt`, in the same state update that credits the step's spawns and income. So time is credited exactly once: either by an online step or by offline catch-up, never both.

**One lifecycle coordinator** (`platform/lifecycle.ts`) owns `visibilitychange`, `pagehide` and Capacitor `pause`/`resume`. Browser and native signals are deduplicated through one `active | suspended` state:
- **On suspend:** run any whole pending sim steps, discard the sub-step remainder, cancel any drag, save (with `accountedUntil`), and stop the ticker.
- **On resume:** if already active, do nothing. Otherwise call `reconcile(now)` once, then restart the ticker.
- `reconcile` sets `accountedUntil = max(accountedUntil, now)` in the same state update that applies catch-up. **Duplicate lifecycle signals are skipped by the coordinator** (it is already active), so they never reach `reconcile`. A direct second call to `reconcile` credits only time that is genuinely new since the first, e.g. 1 ms for `reconcile(1000)` then `reconcile(1001)`, and never re-credits time. Tests assert both behaviours, including the full-map cases (round 3 precision correction).

**Suspended time is always offline time (round 2, additional finding).** Any period while the app was suspended, however short (a 4 s background), uses no-fusion catch-up. Only the frame loop of a visible, active app steps normally. A long frame there, for example a dropped frame, is clamped to 0.25 s per frame.

**Clock rewind (round 2, additional finding).** `accountedUntil` is a **high-water mark**: it never moves backwards. If the clock reads 900 after accounting reached 1000, `away = 0` and `accountedUntil` stays 1000. When the clock later reaches 1000 again, nothing is credited twice. No server anti-cheat is in scope.

**Tests:**
- partial intervals, e.g. 11 s of progress plus a 1 s absence gives one spawn (ChatGPT's counterexample);
- the last free slot filled during an absence leaves progress at the overshoot (0 in the counterexample), and a following fusion does **not** spawn immediately;
- a full map with `away = 0` keeps its progress unchanged;
- capacity reached partway through an absence;
- mixed-tier incomes;
- duplicate resume with identical and with slightly different timestamps, including full-map cases;
- a hidden 4 s interval with a valid recipe pair touching: no fusion; and a dropped frame while visible, stepped normally;
- clock rewind then restoration: nothing credited twice;
- an absence over 8 h;
- RNG continuity across save and load.

## 4. Save system (review §3)

**Record:** `{ schema, revision, savedAt, state, checksum }`. The state includes `spawnProgress`, the RNG state, `accountedUntil` and the next kid ID.

- **Two slots, A and B.** Each write goes to the slot *not* holding the current best save. Its revision is **one more than the highest revision ever seen in either slot**, including protected ones, so revisions stay monotonic across recovery.
- **Protected slots (round 3).** A slot is *protected* when it holds bytes the game could not use but must not lose: a *corrupt* record, or a *valid* record whose migration failed. **The writer never targets a protected slot.** A protected slot becomes writable only after its exact raw bytes are **durably archived** under `archive/<slot>-r<revision>-<timestamp>`, with a read-back check that the archive matches. If archiving fails, the slot stays protected. With one slot protected and the other holding the loaded save, the game must not overwrite that save either, so it enters unsaved session mode.
- **Writes are serialized** through one promise queue, so they never overlap.
- **Writes are inhibited until loading has resolved.** Nothing is written while load is in progress or has failed in an unresolved way.
- **Loading** (round 2, point 3):
  1. Read both slots. **A read/I/O failure is not "invalid":** if either slot can't be read, the game enters **unsaved session** mode (below). It never treats unreadable storage as empty and never overwrites it.
  2. Classify each readable slot: *valid*, *corrupt* (fails parse, checksum or **state validation**: types, finite numbers, known kid IDs, IDs below `nextKidId`), or *future* (schema newer than the app). The original bytes of every slot are kept in memory.
  3. Any *future* slot: refuse to overwrite it, enter read-only mode, and tell the player to update.
  4. Pick the highest-revision *valid* slot.
  5. Migrate it in schema order, then validate the result. **On migration failure**, mark that slot *protected* and archive its raw bytes (above). Try the next valid slot; if none migrates, enter unsaved session mode. **When falling back to an older slot**, tell the player plainly: "We loaded an older save. Your newer one is kept safe." The archived record stays recoverable by a later app version.
  6. Reconcile offline time once.
  7. Save once.
- **Corrupt slots** are handled the same way: protected until archived (this replaces the earlier `quarantine` key).
- **Unsaved session mode:** the game is playable but makes **no destructive writes**. The player sees a visible banner: "Progress can't be saved right now". Loading is retried on the next launch.
- **Save failures** are caught and retried at the next trigger. After three consecutive failures, the player sees the same banner, not just a debug log.
- **Out-of-order writes:** the queue tags each write with its revision. A write for a lower revision than one already committed is dropped.
- **Tests:** read failure; both slots corrupt; one slot corrupt; archive-write failure; future schema; a write that fails then retries out of order; and Codex's round-3 trace. In that trace, A holds valid revision 20 and fails migration, and B holds revision 19 and migrates. Run the initial save, then a periodic save, then a restart. A's original bytes must stay recoverable throughout, no write may target A until its archive is verified, and revisions never repeat.
- **When it saves:** every 10 s, on pause or a visibility change, and after each fusion, purchase or upgrade.

## 5. Asset import contract (moved here from my draft `ASSETS.md`; `ASSETS.md` is ChatGPT's)

I accept ChatGPT's spec in PR #2 with these engine-side terms:
- **Kids:** 256 × 256 RGBA PNG layers drawn `overlay_back → body → face → overlay_front` (round 2: layer contract). Shared `kid_plain_body.png` and `kid_plain_face.png`; optional `kid_<id>_overlay_back.png` / `kid_<id>_overlay_front.png`, simply absent when unused. Ground anchor at (128, 224); at least 8 px clear padding; 7–8 px starting stroke (gate 2 decides). Display size is 48–72 CSS px × device pixel ratio, up to 3, so 256 px source is enough. At most 16 kid textures for the 10-type roster.
- **Atlas, manifest, encoding:** I own atlas packing. I **generate the runtime manifest** from file names and dimensions in the build, so nobody maintains pixel sizes by hand. Provenance and licence information is a small hand-written file that ChatGPT owns.
- **World and background** (review §5, camera): the world is **1080 units wide**. The camera fits the whole 1080 × 1920 safe band on screen, `scale = min(width/1080, height/1920)`, centred; on portrait phones that is the width (PR #4 review). The Android app is locked to portrait.
  - Visible height on portrait phones ranges from about 1920 units (16:9 screens) to 2400 (20:9).
  - The background is **1080 × 2400**. Everything important sits in the central **1080 × 1920** safe band; the top and bottom 240 are decorative bleed.
  - The playable area for wandering is the safe band minus HUD insets (top 160, bottom tray 280), the Garden's footprint and the kid's own height, further intersected with the device's unobscured safe insets.
- **Fonts and platform art:** Patrick Hand Regular (SIL OFL), bundled locally with the licence; system sans-serif fallback. I generate the Android adaptive-icon and splash resources from ChatGPT's 4× masters.
- **Drag feedback** is procedural and never reveals undiscovered recipes.
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

- **Target:** 60 fps on the owner's test device, the owner's **Galaxy S26 Ultra** (D-026; a flagship, so we also check with 4× CPU throttling), with:
  - capacity maxed at 40 kids, **four layers each** (worst case: back and front costumes);
  - effects, HUD and input active;
  - decoded textures under 32 MiB.
- **Measurement:**
  - frame-time percentiles (p50, p95) from an in-game debug overlay on the device;
  - Chrome remote debugging for memory.
- **Pass threshold:** a 60 s run at full capacity with p95 frame time ≤ 16.7 ms on the S26 Ultra, and p95 ≤ 33 ms under 4× CPU throttling. Defined now; measured before M4.
- **CI benchmark:** headless Chromium logs frame rate as a regression signal only. CI runners render WebGL in software, so it is never a pass/fail bar and never claimed as a phone result.

## 8. Milestones

| # | Milestone | Contents | Ends at |
|---|---|---|---|
| M0 | Plan | Both proposals reviewed and consolidated | Gate 1: owner has approved the stack and rules; the asset list and roster go in the next update |
| M1 | Art style + skeleton | ChatGPT: base, Fire, Water, Firefighter, garden map. Claude: scaffold and CI (PR #3), layered kid compositing and wander with placeholder art, content validator | **Gate 2** |
| M2 | First playable | Spawn, wander, drag and drop, R1 `plain + water → firefighter`, debug APK | **Gate 3** |
| M3 | Systems | Currencies, buildings, Dex, compendium, offline progress, save, full roster, balance simulator, audio | — |
| M4 | MVP complete | Balance pass, device performance and listening checks, release-candidate APK | **Gate 4** |
