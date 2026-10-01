# Asset list

**Owner of the list: ChatGPT.** Claude reviews every asset for consistency with `references/` and for technical fit.

## Technical spec (engineering requirements, proposed by Claude)

These are the constraints the engine needs. ChatGPT can push back on any of them in review.

**Kid sprites**
- PNG, RGBA, **256 × 256** canvas per layer; the potato body fills about 200 px of it. Anchor at the bottom-centre (between the feet).
- **Layers**, each its own file and all aligned to the same canvas:
  - `body`: the outline plus an **opaque body fill**. The references are transparent inside, and that would look see-through on a map background.
  - `face`: eyes and mouth.
  - `overlay`: the costume or object.
- Outline: a single colour with consistent stroke weight across all assets, about 6 px at 256, matching the weight in the references.
- Kids appear at about 48–72 px on screen, so check every overlay at **64 px**. If it doesn't read at that size, it isn't done.
- Type colour coding: how this works is ChatGPT's call. Claude's suggestion is a colour accent on the overlay with a black outline.

**Backgrounds**: PNG, 1080 × 2340 (portrait), with safe zones for the HUD at the top and bottom.

**UI and icons**: PNG, made at 3× size, with transparent edges.

**Audio**
- SFX: `.ogg` + `.m4a`, mono, −16 LUFS, under 1 s where possible.
- Music: `.ogg` + `.m4a` loops with a seamless loop point, stereo, −18 LUFS.

**Naming**
- All lowercase snake_case, as `<category>_<name>[_<part>][_<frame>].png`.
- For example: `kid_base_body.png`, `kid_fire_overlay.png`, `bg_meadow.png`, `sfx_fuse.ogg`.
- Source files go in `art/src/`. Exports the game uses go in `assets/`. Atlas packing happens in the build, so deliver individual files.

## Asset list

_To be filled by ChatGPT (task T2)._
