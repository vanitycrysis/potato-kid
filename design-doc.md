# Potato Kid — Game Design Doc (Handoff)

**Genre:** Mobile idle / ambient ecosystem with discovery-breeding
**Platform:** Mobile (phone-first)
**Build target:** Playable MVP, single implementer (Fable)
**Status:** Design locked for MVP; some items flagged open below

---

## 1. The Pitch

Potato Kid is a living terrarium on your phone. Little potato creatures wander a 2D map on their own. When certain pairs touch, they're consumed and fuse into a new, rarer potato kid. The player spawns kids, picks them up and places them next to each other to hunt for hidden recipes, earns resources, and expands their world to hold more life and unlock rarer combos.

It is **not** a merge game and has **no grid**. The feel is a self-running ecosystem you nudge and experiment with, not a board you organize.

---

## 2. Art Direction

Base potato kid: a round, lumpy hand-drawn potato with a single-color outline, a minimal face (two dot eyes, a small smirk of a mouth), and a few little sprout nubs poking out around the edge. Deliberately doodle-simple.

Variety comes entirely from **costumes and objects layered over the same face** — Fire kid, Firefighter kid, etc. are the base potato wearing/being something, keeping the same eyes-and-smirk identity. This is a core production advantage: a huge roster can be produced cheaply because every kid is one base + one overlay.

Keep the screen readable with many kids on it at once — strong silhouettes, clear type-color coding.

---

## 3. Core Loop

```
Potato Garden spawns kids  →  kids wander the map & passively earn Materials
        →  player picks up & places kids to trigger interaction recipes
        →  two parents are CONSUMED, one higher-tier kid is born
        →  discovery logged in the Potato-Dex
        →  spend Materials upgrading buildings (capacity, spawn rate, spawn bias)
        →  spend/earn Potatokens for instant spawns & time-skips
        →  repeat, hunting rarer kids and fuller Dex completion
```

Every system below serves this loop.

---

## 4. Systems

### 4.1 The Map & The Kids
- A 2D plane where potato kids **wander autonomously** (simple ambient movement / wander AI).
- The player can **pick up any kid and place it** anywhere — including right next to another kid to deliberately attempt a recipe. This is the primary player verb and the heart of the discovery game.
- Each kid has a **type** (Fire, Water, Firefighter, etc.) and a **tier/rarity**.

### 4.2 Interactions & Recipes (the breeding system)
- **Recipe-based.** Only specific, hand-designed pairs do anything. Most pairings do nothing — sparse density is intended.
- When a valid pair makes contact: **both parents are consumed**, and **one new, higher-tier kid is produced**.
- The Fire + Firefighter example is just a normal consumption recipe (both consumed → new kid).
- Because two kids go in and one comes out, **population self-regulates** — no exponential growth, no runaway sprite counts. This is load-bearing; keep the consume-two-make-one rule intact.
- Recipes are **hidden until discovered**, then revealed in the Dex. Discovery is the main dopamine driver.

> **Design pressure to watch:** consumption means the risk is *starvation*, not overflow. If spawning is too slow, the map empties and the player waits at a near-empty screen. **The Garden's spawn rate is the master pacing dial for the whole game** — tune it generously.

### 4.3 The Potato Garden (spawning)
- A core building that **spawns base/random kids over time**.
- **Upgradeable** to spawn more frequently.
- Must include **offline progress** — keeps generating spawns while the app is closed (non-negotiable for an idle game).
- **Potatokens** can be spent to **instantly spawn** a kid.

### 4.4 Spawn-Bias Buildings
- Additional buildings let the player **bias the spawn pool toward chosen types**, giving real control over what they're hunting.
- Early game = fun random chaos; mid game = targeted hunting for the two specific parents a recipe needs.
- This solves the "waiting for a Fire AND a Firefighter to coincide" luck-gating problem.

### 4.5 Capacity
- The map has a **capacity cap** = how many kids can exist at once.
- **Upgradeable via buildings.** Higher capacity = a fuller, more productive world and more simultaneous experimentation.
- With consumption in place, capacity is a comfort ceiling and progression lever rather than a safety valve.

### 4.6 Currencies
- **Materials** (soft / earned): the upgrade currency. Faucet = passive income from kids on the map (see Open Decisions). Drain = building upgrades.
- **Potatokens** (hard / premium): instant spawn, construction time-skips, and possibly a premium spawn/combo.

> **Watch:** Potatokens currently do double duty (time-skips *and* spawning). Now that breeding makes players crave many spawns, this may feel too tight / paywall-y. Flagged, not yet resolved.

### 4.7 Potato-Dex
- Tracks every kid discovered and every recipe found.
- Undiscovered recipes stay hidden. Completion is a primary long-term goal.

### 4.8 Compendium
- Lets players **re-spawn already-discovered kids for a fee** (Materials and/or Potatokens).
- Solves *re-acquisition* after discovery, so a known recipe isn't gated on RNG handing you the parents again.

### 4.9 Buildings (general)
- Buildings are the main Materials sink and house the upgrade trees: Garden (spawn rate), capacity, spawn-bias, compendium access.
- Originally planned to also provide adventure buffs (shops, potatotions/potions, relics) — **deferred with adventures** (see §6).

---

## 5. Open Decisions (resolve before / during build)

1. **Materials faucet — needs sign-off.** With adventures cut, the recommended faucet is **kids passively generating Materials while on the map, scaled by tier/rarity** (so rarer kids earn more, making breeding feel rewarding beyond collection). This is the assumed model throughout this doc but hasn't been explicitly confirmed. **Confirm or replace.**
2. **Potatoken scope.** Decide whether spawning should stay on Potatokens or move to a softer resource, to avoid premium-currency squeeze.
3. **Endgame.** Still open (see §7).

---

## 6. Scope: MVP vs Later

### In the MVP
- 2D wandering map with capacity cap
- Pick-up-and-place interaction
- Potato Garden with upgradeable spawn rate + offline progress
- A starter set of types and a handful of recipes (consume-two → one)
- Materials + Potatokens with their faucets/drains
- A few buildings: Garden, capacity, one spawn-bias building, compendium
- Potato-Dex with hidden-until-discovered recipes
- Instant spawn via Potatokens

### Deferred (planned, not in MVP)
- **Adventures:** turn-based combat where kids are sent out; party of 3–4; enemies are bugs/foods in the same doodle style; type advantages mirror map recipes. This was the original Materials faucet, hence the passive-income replacement above. Buildings providing shops/potatotions/relics return with this.
- **Endgame systems** (§7).

---

## 7. Endgame (open — options to consider)
- **Prestige / ascension:** reset the map for a permanent multiplier (idle-genre staple).
- **Collection completion:** full Potato-Dex as the "soul" goal.
- **Seasonal / event kids** and limited recipes for live-ops longevity.
- A combination (collection as the goal, prestige as the grind engine) is the natural fit.

---

## 8. Build Notes for the Implementer
- **Offline progression** is mandatory.
- Keep the **consume-two-make-one** invariant — it's what keeps population and performance bounded on mobile.
- Add a **per-pair interaction guard** is unnecessary given consumption, but ensure two kids can't double-trigger a recipe in the same frame before both are removed.
- Recipes should be **data-driven** (a simple table of `typeA + typeB → result`) so new kids/recipes can be added without code changes.
- Tune the **Garden spawn rate generously** — it's the master pacing dial and starvation is the main failure mode.
