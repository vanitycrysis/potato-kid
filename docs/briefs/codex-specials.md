You are filling the **ChatGPT role** (art, audio, writing and interaction-design owner) on Potato Kid.

**Read first:**
- `docs/PROJECT_BRIEF.md`, `docs/design-doc.md`
- `docs/DECISIONS.md`, especially **D-063** and **D-066** (the owner approved your 20 special-kid concepts as written, 12 at T5 and 8 at T6), D-036, D-045, D-046, D-058
- your own `.codex-out/special-concepts.md` (the approved concepts, distinctions and limits) and `.codex-out/asset-mvp-3-notes.md` (how the last costume batch was made and checked)
- `docs/ART_AUDIO_PLAN.md`, `docs/ASSETS.md`, `art/data/kid_rig_v2.json`, `art/data/personality_v1.json`, `src/content/kids.json` (read-only) and `references/`

**Worktree:** `potato-kid-chatgpt`, branch `chatgpt/specials` (from `main`). Your sandbox cannot run git: just edit files; Claude commits them unchanged as `ChatGPT`.

## Task board entry

| SPECIALS | ChatGPT (art, writing) / Claude (content, rules) | D-063: about 20 apex special kids (tier 5 or above): costumes, names, personalities and foods; content entries that no recipe uses, outside the spawn pool and the Compendium | todo (the owner approved all 20 concepts, D-066) | Every special passes content and art checks; Claude's review passes |

## The 20 approved specials, with their ids (Claude's; use them exactly)

| # | id | Name in the game | Tier |
|---|---|---|---|
| 01 | `gift` | Gift Kid | 5 |
| 02 | `origami` | Origami Kid | 5 |
| 03 | `puzzle` | Puzzle Kid | 5 |
| 04 | `rubber_duck` | Rubber Duck Kid | 5 |
| 05 | `handbell` | Handbell Kid | 5 |
| 06 | `fossil` | Fossil Kid | 5 |
| 07 | `pocket_watch` | Pocket Watch Kid | 5 |
| 08 | `accordion` | Accordion Kid | 5 |
| 09 | `storybook` | Storybook Kid | 5 |
| 10 | `yo_yo` | Yo-Yo Kid | 5 |
| 11 | `acorn` | Acorn Kid | 5 |
| 12 | `postcard` | Postcard Kid | 5 |
| 13 | `music_box` | Music Box Kid | 6 |
| 14 | `magic_slate` | Magic Slate Kid | 6 |
| 15 | `marble_run` | Marble Run Kid | 6 |
| 16 | `toy_train` | Toy Train Kid | 6 |
| 17 | `puppet_theatre` | Puppet Theatre Kid | 6 |
| 18 | `toy_castle` | Toy Castle Kid | 6 |
| 19 | `paper_town` | Paper Town Kid | 6 |
| 20 | `treasure_chest` | Treasure Chest Kid | 6 |

Claude adds these to `src/content/kids.json` (with `"special": true`) in a separate PR; you don't edit `src/`.

## What to make
1. **Costumes for all 20**, exactly as in your past batches: original SVG costume components on the shared rig and bodies (D-046), costume entries in `art/data/kid_rig_v2.json` keyed by the ids above, exports via `npm run art:export`, and fitting within the D-043 reserves.
   - Keep each concept's approved identity and the distinctions you listed (against existing types and against the ten rare effects).
   - Leave the external rare-effect lane free: a special can also be rare.
   - **The readability gate:** every special must read at 55 px in colour and grayscale, on all four bodies. Music Box, Puppet Theatre, Paper Town and Marble Run are the known risks. If any fails, **don't force it**: propose a simpler version, or a replacement, in your notes, with sheets, and Claude takes it to the owner (D-066). Finish the rest.
2. **Personalities and foods** for all 20: add them to `art/data/personality_v1.json` in the existing format and rules (D-058: caps, no recipe hints, no expressions the art can't show, food pairs distinct from every other type's, food spread kept even), and bump its revision.
3. **The usual checks:** the face and costume audits across all bodies, poses and clip entries; all-20 contact sheets (colour and grayscale, 55 px, every body); a crowded-map sheet mixing specials with ordinary kids; the texture budget (state the decoded bytes before and after).

## Deliverables
- SVG sources, sidecar entries, exports, the personality additions, doc status rows (ASSETS.md, ART_AUDIO_PLAN.md) and a short DECISIONS entry for your art choices (marked "Claude review pending").
- `.codex-out/specials-notes.md`: per special, how it reads and its risks; the audits, budget, and anything you could not verify or think is impractical.
- `npm run art:export` and `npm test` must pass. **Do not edit `src/`.**
