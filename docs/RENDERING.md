# Rendering notes

## Outline shimmer when zoomed out: the plan (D-103)

The owner's direction: change nothing until the animation work has been seen on the device. This is the plan to use if kids' outlines shimmer or crawl when the map is zoomed out.

### Why it could happen

- A kid's drawing is 256 px wide and is shown 180 world units wide. The map fits 1080 world units to the screen's width, so on a 412 CSS px phone a kid's canvas is about 69 CSS px at the zoom the map opens at, and about 34 at the furthest zoom (`ZOOM_MIN` 0.5).
- The renderer draws at `min(devicePixelRatio, 2)` (`src/main.ts`), so those are 137 and 69 device px. At the furthest zoom the 7.5 px outline is sampled at about a quarter of its drawn size.
- Kid textures have no mipmaps (Codex's ROSTER-SCALE choice, to stay under the 32 MiB texture budget, D-034). Shrinking a texture below half size without mipmaps skips texels, and a thin dark line on a pale fill is where that shows: the line flickers as the kid moves by fractions of a pixel.
- Antialiasing is off (`antialias: false`). That only affects geometry edges, not textures, so it is not part of this.

This is an inference from the settings. Nobody has seen it on the device yet.

### How to tell

1. On the Galaxy S26 Ultra, zoom all the way out and watch walking kids against the pale ground.
2. If the outlines crawl, confirm the cause with a build that turns mipmaps on for kid textures only (step 1 below behind a `?mip=1` query flag) and compare the two side by side.

### Fixes, cheapest first

| # | Fix | Cost | Notes |
|---|---|---|---|
| 1 | **Mipmaps on kid textures.** In `TextureStore` (`src/render/art.ts`), set `autoGenerateMipmaps` on each kid texture's source and use trilinear filtering | About a third more memory for those textures. The budget test (`src/render/budget.test.ts`) must be updated with the factor and must still pass at 32 MiB | The standard fix. WebGL 2 allows mipmaps on textures of any size |
| 2 | **Half-size textures when zoomed out.** Export a 128 px set of the kid art and swap to it below a zoom threshold | About a quarter more memory, and a second export family in `scripts/export-art.mjs` | Use if fix 1 breaks the memory budget. The 128 px set is filtered once, well, at export |
| 3 | **Raise the resolution cap** from 2 to 3 on devices that have it | Up to 2.25 times the pixels to fill every frame | Helps at the opening zoom, not at the furthest one. Only with a frame-rate measurement |
| 4 | **Stop zooming out so far.** Raise `ZOOM_MIN` | None | A design change: the owner's call |

Motion v1 already helps a little: poses change 12 times a second, not every frame, so a resting kid's outline holds still between poses.

### What not to do

- Do not thicken the outline in the art for the far zoom. It would change the style at every zoom.
- Do not turn on `antialias`: it costs fill rate and does not touch texture sampling.
