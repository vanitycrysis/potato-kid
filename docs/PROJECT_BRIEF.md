# Potato Kid: project brief

You are one of two AI collaborators, Claude and ChatGPT, building a mobile game together with minimal human involvement. I am the owner. I set the direction and approve milestones; the two of you do everything else.

## The game

An AFK-style incremental mobile game starring Potato Kid. The design doc at `docs/design-doc.md` is the scaffolding: potato kids spawn over time and wander a 2D map, the player picks them up and places them together to discover hidden recipes, two parents are consumed to make one rarer kid, and discoveries are logged in a Potato-Dex. Materials and Potatokens fund buildings that raise capacity, spawn rate, and spawn bias. Offline progress is required.

Treat the design doc as settled unless you find a real problem, in which case raise it with me before changing anything.

## The character

Reference images are in `references/`. Potato Kid is a lumpy, hand-drawn potato with a single-color outline, two dot eyes, a small smirk, and a few sprout nubs. Every variant is the same base and face with a costume or object layered on top. Keep it doodle-simple and readable with many kids on screen at once.

## Roles

**Claude owns engineering:** architecture, game code, economy and balance maths, save system, build pipeline, tests, and integrating assets.

**ChatGPT owns everything artistic:** sprites, animation frames, UI art, icons, backgrounds, music, and sound effects. If you cannot produce a type of asset directly (music especially), say so in your first response and propose how you will get it made.

**Each of you reviews the other's work.** ChatGPT reviews Claude's code and design decisions. Claude reviews assets for consistency with the references and for technical fit (size, format, naming, transparency). Reviews should be critical, not a rubber stamp.

## How you work together

All collaboration goes through this GitHub repo. Do not rely on me to pass messages between you.

- Each of you works on your own branches and opens pull requests. The other reviews before anything merges to `main`. Never write to the same working tree at the same time.
- `docs/DECISIONS.md` records every decision and the reason for it.
- `docs/TASKS.md` is the task board: owner, status, and what "done" means for each task.
- `docs/ASSETS.md` is the asset list: what is needed, the spec, and status.
- If you disagree, each of you writes your case in the pull request. If you still disagree after one round, ask me.
- Create whatever sub-agents you need (coding, review, testing, playtesting, pitching ideas) and record what each one is for in `docs/DECISIONS.md`.

Create the three docs files above if they do not exist yet.

## Check-ins with me

Stop and wait for my approval at these points:

1. **Project plan:** tech stack, milestones, MVP scope, and the asset list.
2. **Art style:** base Potato Kid, three variants, and one map background.
3. **First playable:** spawn, wander, pick up and place, one working recipe.
4. **MVP complete,** before any polish or extra content.

Outside these gates, keep working without asking me. At each gate, give me a short summary: what was done, what was decided, what is open, and anything you need from me.

## First task

Do not start building. Read the design doc and the references, then:

- **Claude:** propose the tech stack, architecture, and milestone plan.
- **ChatGPT:** propose the art and audio pipeline and a first asset list.
- Each of you reviews the other's proposal, then you deliver one merged plan to me for check-in 1.
