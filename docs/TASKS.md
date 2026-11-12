# Task board

What is open, who owns it, and what "done" means. Status: `todo` · `doing` · `review` · `blocked` · `later`. Pull request review is not owner approval.

The board up to the fourth gate-4 round, with every pull request number, is `archive/TASKS_2026-10.md`.

## With the owner

| ID | Task | Status | Done when |
|---|---|---|---|
| GATE-4 | Approve the MVP. Four rounds of feedback are built (D-050 to D-095). The next build also carries the November work: no stem, five new kids, motion v1 | **with the owner** | Explicit approval before polish |
| O-004 | Does a Claude on another model (Opus 5.5) keep drawing, or does new art go back to Codex? | **open question** | The owner answers (`DECISIONS.md`, Open questions) |
| O-005 | Rewarded ad (D-102): which ad network, and a daily limit? | **open question** | The owner answers |
| O-006 | The Dex icon's potato has two ticks on top. Remove them, as the stem was (D-097)? | **open question** | The owner answers |

## Open work

| ID | Owner | Task | Status | Done when |
|---|---|---|---|---|
| MOTION-V1 | Claude (art, engine) / Codex (review) | D-099 to D-101, D-105: the animation engine, the shared clips and a habit for every kid | **review** (see `HANDOFF.md` for the pull request) | Codex's code and art reviews are clean, CI is green, merged; the owner sees it on the device |
| COSTUME-READ | Art owner | D-101: redraw tier 4 and 5 costumes around one large shape so rarer kids read at game size. Today most are a small cap and a hand prop | todo | Each redrawn costume passes `npm run art:kids` and Codex's art review; a side-by-side sheet at 55 px for the owner |
| COSTUME-SPLIT | Art owner | Split four one-piece costumes so their wheels can spin: Sky Fair's wheel, Windmill's sails, Pinwheel, Sculpture Park's spiral (`docs/ART.md`, "Habits"). Then give them spinning habits | todo | Each is two components; habits updated; checks and review pass |
| LEGACY-ART | Art owner | `npm run art:kids -- --all` reports about fifty problems in costumes drawn before D-098 (props off the waving arm on the squat body, faces crowded on the wide face, a pixel or two outside the box) | todo | The report is empty, and those kids move into `art/kid_checks.json` |
| REWARDED-AD | Claude | D-102: watch an ad for 10 Potatokens | **blocked** on O-005 | An ad SDK in the Android build, the reward in the sim and save, a limit if the owner wants one |
| SHIMMER | Claude | D-103: outline shimmer when zoomed out | **waiting** on a device look | `docs/RENDERING.md`: check on the S26 Ultra; if it shows, mipmaps on kid textures within the 32 MiB budget |
| SPLIT-GAME | Claude | D-101: move planting, farming and feeding out of `src/sim/game.ts` (about 1,850 lines), as `visits.ts` was | todo | No behaviour change; unit and end-to-end suites pass; reviewed by Codex |
| SPLIT-SCENE | Claude | D-101: move map input (drag, tap, pinch, pan) out of `src/render/scene.ts` (about 1,870 lines) into a module of its own | todo | As above |
| FRAME-ALLOC | Claude | D-101: `MapScene.frame` builds a map, a set and an object per kid every frame. Reuse them | todo | No allocation per frame in the kid loop; fps logged before and after |
| PREVIEWS-OUT | Claude | D-101: `art/previews/` is 414 MB of old review captures in the repository. Remove it from the tree; keep current review sheets small, in `art/review/` | todo | The folder is gone from `main`; `tests/preview` writes to `.review/` |
| DEBUG-HOOKS | Claude | The `?debug=1` hooks ship in the release bundle | todo | A release build without them, and the end-to-end suite still running against a build with them |
| DEX-MILESTONES | Claude (numbers) | Dex milestones stop at 64 kids; the roster is 99 | todo | Milestones to the full roster, checked with `npm run balance` |
| MOTION-SIZE | Claude | The baked motion file adds about 630 KB to the bundle before compression | later | Only if the APK size or load time shows it |
| TROPHY-MAP | Both | D-064: a second map to display special kids, bought at an absurd price | later (after gate 4) | — |
| EXPEDITIONS | — | D-065: sending kids out to gather | parked (owner idea) | — |

## Notes for the owner's polish pass (not tasks yet)

- Seashell Kid reads closer to a teapot at game size.
- The picnic blanket's bottom-edge marks read a little like legs.
- The farm and map paths are quite rectilinear.
- The kid card's line for a decoration's happiness ("From a decoration: no planting bonus.") is Claude's wording.
