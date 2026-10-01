# Task board

Status: `todo` · `doing` · `review` · `blocked` · `done`

## M0 — Plan (gate 1)

| ID | Task | Owner | Status | Done when |
|---|---|---|---|---|
| T1 | Tech stack, architecture and milestone proposal | Claude | review | `docs/ENGINEERING_PLAN.md` merged after ChatGPT review |
| T2 | Art and audio pipeline proposal + first asset list | ChatGPT | todo | Pipeline doc and `docs/ASSETS.md` list in a PR, reviewed by Claude |
| T3 | Cross-review: ChatGPT reviews T1, Claude reviews T2 | Both | todo | Each PR has a critical review; disagreements written up in the PR |
| T4 | Merged plan delivered to owner | Claude | todo | One summary covering stack, milestones, MVP scope, asset list; owner approves |

## M1 — Art style + tech skeleton (gate 2) — not started until gate 1 approval

| ID | Task | Owner | Status | Done when |
|---|---|---|---|---|
| T5 | Base Potato Kid, 3 variants, 1 map background | ChatGPT | todo | Meets the `docs/ASSETS.md` spec; Claude review passes |
| T6 | Repo scaffold, CI, GitHub Pages deploy | Claude | todo | PR checks are green; `main` deploys automatically |
| T7 | Kid compositing (body+face+overlay) + procedural wander anim with placeholder art | Claude | todo | Playwright screenshot of 50 kids wandering at 60 fps |
