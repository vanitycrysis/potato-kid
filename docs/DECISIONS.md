# Decisions

Every decision with its reason. Newest at the bottom. Status: **proposed** (awaiting review or owner), **agreed** (both AIs), **approved** (owner).

| # | Date | Decision | Reason | By | Status |
|---|---|---|---|---|---|
| D1 | 2026-10-01 | Stack: TypeScript + PixiJS v8 + Vite, wrapped with Capacitor for Android/iOS | Text-only and diff-friendly for two AI collaborators; testable without a human; playable in a browser at every gate | Claude | approved (owner, 2026-10-01) |
| D2 | 2026-10-01 | Pure simulation core separated from rendering; fixed 10 Hz step | Testable game logic; offline catch-up uses the same rules | Claude | proposed |
| D3 | 2026-10-01 | Kids composited from body + face + overlay; wander animation is procedural | One static overlay per new kid type instead of animation frames; roster scales cheaply (design doc §2) | Claude | proposed |
| D4 | 2026-10-01 | Recipes, kids, buildings and balance live in JSON, validated in CI | Design doc §8: data-driven recipes | Claude | proposed |
| D5 | 2026-10-01 | Offline progress uses closed-form maths, capped at 8 h; no fusions while offline | Exact and fast; discovery is kept for when the player is watching | Claude | approved (owner, 2026-10-01) |
| D6 | 2026-10-01 | Potatokens are speed-ups only; no real-money purchases in the MVP | Resolves design doc §5.2 squeeze risk | Claude | approved (owner, 2026-10-01) |
| D7 | 2026-10-01 | Materials faucet = passive income per kid, doubling per tier | Design doc §5.1 recommended model | Claude | approved (owner, 2026-10-01) |
| D8 | 2026-10-01 | Android first; iOS later | Owner decision. An iOS build needs a Mac and a paid Apple developer account | Owner | approved |
| D9 | 2026-10-01 | The "ChatGPT" collaborator role is filled by OpenAI Codex (CLI, driven through the Claude Code `codex` plugin), working in its own git worktree `../potato-kid-chatgpt` on `chatgpt/` branches | The owner asked Claude and Codex to work together autonomously; separate worktrees keep the "never the same working tree" rule | Owner | approved |

## Sub-agents

| Agent | Owner | Purpose |
|---|---|---|
| Codex (via the `codex` Claude Code plugin) | ChatGPT role | Art/audio owner and code reviewer (see D9). Runs read-only for reviews and write-enabled in its own worktree for its own tasks. Claude commits and pushes Codex's output as a separate git author (`Codex`), and posts Codex's reviews verbatim as PR comments marked as Codex's. |
