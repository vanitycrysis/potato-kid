# The UI: a map

Every screen and widget, the file that implements it, and where its detailed specification is. The UI is a DOM overlay over the Pixi map (D-022), designed by Codex in the notebook look and implemented by Claude.

The detailed specification is `docs/archive/GUI_MVP.md` (259 KB). It was written in rounds, so later sections amend earlier ones. Code comments cite it as "GUI_MVP §n". Use this page to find the section that is current.

## Which sections of GUI_MVP.md are current

| Section | Topic | State |
|---|---|---|
| §1, §2 | Visual tokens; viewport, layers, the modal sheet | Current |
| §3 | HUD and navigation | **Superseded** by §19 and then §23 (number display rules in §3 still hold) |
| §4, §5, §6 | Garden and Capacity sheets; Bias; Compendium | Current |
| §7 | Potato-Dex, portraits | Current, with §16.4 (segments) |
| §8 | Offline summary | Current, with §26 (no cap line) and §27.5 (arrivals before the summary) |
| §9, §10, §11 | Feedback cards; save banners and read-only; Settings | Current |
| §13 | Send home | **Superseded** by planting (§15). Its hold-and-release gesture is planting's |
| §14 | Gate-4 interaction contract | Current where §§15 to 27 do not amend it |
| §15 | Planting | Current, **amended** by §20 to §21 (taking kids out, cancelling) and §27.6 (a ripe plot waits for a tap) |
| §16 | Rare kids, sparkle, profiles, Dex | Current (§16.4: Dex segments), with §27.7 (the sparkle moves) |
| §17 | Foods and feeding | §17.1 and §17.2 (buying food) **superseded** by §22 (farming and the pantry); happiness rules current |
| §18 | Kid card, personality, naming | Current |
| §19 | Layout: more world | Current for layout rules; the HUD's look is §23 |
| §20 | Zoom and the map | Current (the map is now half the area, D-076) |
| §21 | Taking kids out, cancelling | Current |
| §22 | Food fields and pantry | Current |
| §23 | Icon HUD and tray | Current |
| §24 | First-run tutorial | **Superseded** by §27.1 to §27.3 (introduction and lessons) |
| §25 | Held hover, partner mark, recipe window | Current |
| §26 | Special and Rare badges, offline copy | Current |
| §27 | Lessons, new-kid popup, ripe plots, sparkle, nicknames | Current |

## Screens and files

| What the player sees | File (`src/ui/`) | Spec |
|---|---|---|
| The frame, the HUD (Materials, Potatokens, kids and capacity), the tray, wiring of everything below | `hud.ts`, `hud.css` | §19, §23 |
| How each icon names itself (tap a stat for its name) | `nameBubble.ts` | §23.2 |
| The modal sheet shell: one sheet at a time, focus, Back, scrim | `sheet.ts` | §2 |
| Garden sheet: who is on the map, the next arrival, Spawn now, the plots | `arrivals.ts`, `gardenPlots.ts` | §4, §15, §19.2, §21 |
| Planting: the overlay while dragging onto a plot; one kid into a plot by tapping; success notes | `homeOverlay.ts`, `plotRoute.ts`, `plantingNotes.ts` | §15, §21 |
| Notebook: Capacity, Spawn bias, Compendium, Map view, Settings | `notebook.ts`, `buildings.ts` | §4 to §6, §23.3 |
| Food fields, their kids and the pantry | `fields.ts` | §22 |
| Potato-Dex: Kids (Ordinary, Specials, Rares), Recipes, Compendium tab; a kid's detail and its live copies | `dex.ts`, `dexHome.ts`, `kidsOnMap.ts` | §7, §16.4, §15.6 |
| Kid card: personality, feeding from the pantry, naming | `kidCard.ts` | §17, §18, §22.6 |
| The recipe window while a kid is held over a partner | `recipePreview.ts` | §25 |
| Feedback cards (a new recipe, Potatokens, refusals) | `feedback.ts` | §9 |
| Nicknames under kids on the map | `nameplates.ts` | §27.7 |
| New-kid popup | `newKidPopup.ts`, `animatedPortrait.ts` | §27.4, §27.5 |
| The first-run introduction, lessons and their replay | `tutorial.ts`, `lessons.ts`, `lessonNotes.ts`, `lessonsSheet.ts` | §27.1 to §27.3 |
| Offline summary | `offline.ts` | §8 |
| Settings (audio on or off, music and sound volumes, nicknames on the map, replaying the lessons) | `settings.ts` | §11 |
| Kid portraits in the DOM | `portrait.ts` | §7 "Portrait contract" |
| Number and time display | `format.ts` | §3 "Number display" |

On the map itself (Pixi, `src/render/`): plots (`plotsView.ts`), fields (`fieldsView.ts`), decorations (`decorationsView.ts`), the rare sparkle and the Happy sun (`rareView.ts`), the planting target (`homeTarget.ts`), kids (`rigView.ts`).

## Rules that hold everywhere

- One modal sheet at a time; the world's input pauses under it.
- Hit targets are at least 44 CSS px. Labels are 18 px, dense text at least 16.
- Nothing shown to the player hints at an unfound recipe: an undiscovered kid or recipe is a seed packet with no tier or name (D-033).
- "Special" and "Rare" are shown by name, never as a tier number (D-082).
- Reduced motion is honoured: clips show their still frame, effects and marks are off.
- Save trouble shows a persistent banner; a save from a newer version makes the game read-only (D-029, §10).
