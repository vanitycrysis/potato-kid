# The game as built

What Potato Kid is today, system by system, with the numbers that ship. This is the current state. The owner's original concept is `docs/archive/design-doc.md`; why each thing is the way it is, is in `docs/DECISIONS.md` (the D-numbers below).

All numbers live in `src/content/balance.json` unless a file is named.

## The loop

Potato kids wander a garden map. The player picks one up and drops it on another. If the two are a recipe, both are consumed and a new, higher-tier kid is born, and its entry is added to the Potato-Dex. The aim is to fill the Dex (D-003). There are no timers to wait out on buildings and nothing to buy with real money (D-019).

The pace is slow on purpose (D-052): the Garden makes one kid every 20 minutes, so a visit is a few fusions, some tending, and a look around.

## Kids

- **99 kids, 62 recipes** (`src/content/kids.json`, `recipes.json`): 68 ordinary kids in tiers 1 to 5, 20 **Special** kids and 11 **Rare** kids (D-066, D-072, D-082, D-104). The long-term target is about 500 (D-046).
- **Six tier 1 kids** come from the Garden: Potato, Fire, Water, Snow, Wind, Stone, weighted 30/16/16/16/12/10.
- **Recipes are hidden** until found. A recipe's result is always a higher tier than both parents. Nothing in the game hints at an unfound recipe (D-033).
- **Specials and Rares** come only from planting. No recipe uses or makes them. They are "wild": the kid is the object (a music box, a blimp) with the face on it (D-072, D-073).
- **Looks:** each kid is born with one of four bodies, four faces and three sizes (0.9, 1, 1.1). This is cosmetic and saved (D-037).
- **Personality:** every type has a description, likes, hates, hobbies, a favourite food and a hated food (D-058, `art/data/personality_v1.json`).
- **Kids never overlap** (D-039, D-043). Each has a box; the sim keeps boxes apart. A held kid floats over the others (D-083).

## The map

- One scrolling garden, 3072 × 5376 world units, about 2.8 phone screens each way (D-076). Drag to pan, pinch to zoom from 0.5× to 2× of the fitted view (D-071).
- On it: the Garden (where kids are born), up to four planting plots, up to four food fields, six decorations kids can use (benches, a bird bath, a picnic blanket, a pond, a log; D-090), and scenery kids walk around.
- The world carries on while the app is closed: on return kids are somewhere else (D-053).

## What the player does

| Action | How | Rules |
|---|---|---|
| Fuse | Drag a kid onto another | Releasing over a kid tries the pair, touching or not (D-051). While held over a partner, the partner is marked and a window shows the recipe if it is known (D-083) |
| Plant | Drag a kid onto a plot, or tap a plot and pick | 3 to 5 kids make one sprout in 30 minutes. The sprout is a tier 1 kid, or a Special (10 to 20 %) or a Rare (5 to 10 %), better with more and happier kids (D-061). A ripe plot glows and waits for a tap (D-088). Kids can be taken back out; a growing plot can be cancelled (D-074) |
| Farm | Drag a kid onto a field, or tap the field and pick | A field grows one chosen food. Each kid on it makes a bite an hour, two of its favourite. Up to four kids a field. Food goes to the pantry (D-069) |
| Feed | Tap a kid, feed it from the pantry | Happy for 20 minutes at ×1.5 income, or 60 minutes at ×2 on its favourite. A hated food is refused (D-056, D-079) |
| Name | Tap a kid | 50 Materials; the name shows under the kid (a setting hides names, D-091) and ends when the kid fuses or is planted (D-057) |
| Sit a kid down | Drop a kid on a decoration | It sits or splashes for a while and is a little happy (×1.25 for 10 minutes). Wandering kids use them on their own too (D-090) |

## Economy

- **Materials** come from kids standing on the map: `0.005 × 2^(tier − 1)` a second each, more when happy (D-020). They pay for buildings, plots, fields, names and Compendium respawns.
- **Potatokens** start at 3. One for each new recipe, and 2 to 12 at Dex milestones (5, 10, 16, 25, 36, 44, 52 and 64 kids). They buy an instant Garden spawn (1) or a Compendium respawn. There is no repeatable source yet: the owner plans a rewarded ad for 10 (D-102, not built).
- **Buildings** (Materials, no timers):

| Building | Does | Levels | Price |
|---|---|---|---|
| Garden | Each level multiplies the spawn interval by 0.903 | 1 to 10 | 20 × 2.9^level |
| Capacity | 12 kids on the map, +4 a level | 1 to 10 | 25 × 2.9^level |
| Bias | Weights the Garden toward one chosen tier 1 kid | 0 to 8 | 100 × 2.2^level |
| Compendium | Bring back any discovered ordinary kid: 800 × 2^(tier − 1) Materials, or Potatokens | 0 to 1 | 1000 |

- **Plots:** the first is free; the others cost 1000, 5000 and 25 000. **Fields:** 300, 3000, 15 000 and 60 000.

## Away from the game

Time away is credited in full, however long (D-080): Materials, Garden spawns up to capacity, plots ripening, fields growing, happiness wearing off, kids wandering. Nothing fuses while away (D-018). A "Welcome back" summary shows after 60 seconds or more (D-049).

## Screens

A DOM overlay over the Pixi map (D-022), in the notebook look with Patrick Hand:

- **HUD:** Materials, Potatokens, kids on the map out of capacity. Icons, not buttons (D-077).
- **Tray:** Garden (find it, spawn now), the Potato-Dex, the Notebook (Capacity, Spawn bias, Compendium, Map view, Settings).
- **Sheets:** each building, the plots, the fields and pantry, the Dex, a kid's card (personality, feeding, naming), the offline summary, Settings.
- **Lessons:** a short first-run introduction, then one short lesson when each mechanic first matters (D-086). Settings replays them.
- **New-kid popup:** a kid the player has never seen arrives with a large popup, its wave and one of ten lines (D-087).

## How kids move (motion v1, D-105)

Kids waddle, breathe, look about, sit, sleep with z's, and greet a kid resting nearby with a fast arm wiggle. Picked up, they dangle; put down, they squash with a puff of dust. In a fusion the two parents hop together into a puff and the child stretches up out of it. Every kid has a habit of its own that it does now and then (D-099). Marks such as z's and dust show only when zoomed in enough (D-100). Reduced motion keeps kids still. See `docs/ART.md`.

## Where the project stands

Gates 1 to 3 are approved. Gate 4 (the MVP) has been back to the owner four times; all four rounds of feedback are built. See `docs/HANDOFF.md` for what is open.
