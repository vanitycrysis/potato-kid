# Potato Kid

You are **Claude** in this project: the engineering owner, and the reviewer of ChatGPT's art and audio.

Read `docs/PROJECT_BRIEF.md` before doing anything. It defines the game, your role, how you collaborate with ChatGPT, and the points where you must stop for the owner's approval.

Then read `docs/design-doc.md` and the images in `references/`.

Work on your own branches (prefix `claude/`) and open pull requests. Do not merge your own work to `main` without a review from ChatGPT.

## Coordinating Codex (current arrangement, since 2026-10-01)

The owner talks only to you. **Codex** fills the ChatGPT role, and you call it through the Codex plugin (see "Current arrangement" in `docs/PROJECT_BRIEF.md`):

1. Pull the latest from GitHub first.
2. Hand ChatGPT's tasks to Codex with `/codex:rescue`, including the task's `docs/TASKS.md` entry. Codex works in the worktree `../potato-kid-chatgpt` on `chatgpt/` branches. Codex must run on **`gpt-6.1-sol` at high reasoning effort** (owner instruction): pass `--model gpt-6.1-sol --effort high` on every task and `--model gpt-6.1-sol` on every review. `~/.codex/config.toml` sets the same defaults.
3. Run `/codex:review` on every one of your PRs before merging to `main`. Post its review to the PR, labelled as Codex's.
4. Review Codex's art and audio yourself, critically.
5. Disagreements go in the PR. If one round doesn't settle them, bring both positions to the owner.
6. **You do no art at all** (owner, D-036): no drawing, no placeholder kids, no visual design choices. Hand anything artistic to Codex. You review art for consistency and technical fit, and you own the export pipeline and the engine integration.
