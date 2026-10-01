# Decisions

Every decision with its reason. Newest at the bottom. Status: **proposed** (awaiting review or owner), **agreed** (both AIs), **approved** (owner).

| # | Date | Decision | Reason | By | Status |
|---|---|---|---|---|---|
| D1 | 2026-10-01 | Stack: TypeScript + PixiJS v8 + Vite, wrapped with Capacitor for Android/iOS | Text-only and diff-friendly for two AI collaborators; testable without a human; playable in a browser at every gate | Claude | proposed |
| D2 | 2026-10-01 | Pure simulation core separated from rendering; fixed 10 Hz step | Testable game logic; offline catch-up uses the same rules | Claude | proposed |
| D3 | 2026-10-01 | Kids composited from body + face + overlay; wander animation is procedural | One static overlay per new kid type instead of animation frames; roster scales cheaply (design doc §2) | Claude | proposed |
| D4 | 2026-10-01 | Recipes, kids, buildings and balance live in JSON, validated in CI | Design doc §8: data-driven recipes | Claude | proposed |
| D5 | 2026-10-01 | Offline progress uses closed-form maths, capped at 8 h; no fusions while offline | Exact and fast; discovery is kept for when the player is watching | Claude | proposed — needs owner |
| D6 | 2026-10-01 | Potatokens are speed-ups only; no real-money purchases in the MVP | Resolves design doc §5.2 squeeze risk | Claude | proposed — needs owner |
| D7 | 2026-10-01 | Materials faucet = passive income per kid, doubling per tier | Design doc §5.1 recommended model | Claude | proposed — needs owner |

## Sub-agents

| Agent | Owner | Purpose |
|---|---|---|
| Codex (via the `codex` Claude Code plugin) | — | Lets ChatGPT's reviews run from this repo without the owner passing messages along. Read-only when reviewing. |
