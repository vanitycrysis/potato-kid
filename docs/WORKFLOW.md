# How we work

The working arrangement, the review loop and the commands. The roles and the owner's gates are set in `docs/PROJECT_BRIEF.md`; this is the practice.

## Who does what

- **The owner** talks only to Claude, decides at the gates, and settles anything Claude and Codex cannot.
- **Claude** owns engineering. Since 2026-11-11 Claude also draws the art and animation (D-096; on a model other than Fable 5.2, read O-004 in `docs/DECISIONS.md` first).
- **Codex** fills the ChatGPT role (D-027), always on `gpt-6.1-sol` at high reasoning effort (D-035). It reviews every Claude pull request, reviews Claude's art, and owns audio and its own earlier art and design.
- **Full access, no permission questions:** Claude acts and reports. It stops only at an owner gate or a real design choice.

## The loop for a change

1. `git pull` on `main`. Branch as `claude/<name>`.
2. Do the work. Run `npm run typecheck`, `npm run lint`, `npm test`, and the end-to-end suite (`npm run e2e`). For art or motion: `npm run art:export`, `npm run art:kids`, `npm run motion:check`.
3. **Mutation-check every new test:** break the code it guards and confirm the test fails. A test that passes without its fix tests nothing.
4. Commit, push, open a pull request.
5. **Codex reviews it** (below). Post the review on the pull request verbatim, labelled as Codex's, and answer each finding. Fix, push, review again, until a round is clean. Expect several rounds on a large change: most find real things.
6. **Merge only on a clean Codex round and a green `ci` check:** `gh pr merge <n> --merge --subject "Merge PR #<n>: <NAME>, <summary> (reviewed by Codex)"`. `main` is protected: `ci` is required and the branch must contain the current `main`, so rebase and push again if `main` moved (`git push --force-with-lease`, allowed on `claude/` branches only, D-093).
7. Update `docs/HANDOFF.md` and `docs/TASKS.md` when the state of the project changes.

Disagreements with Codex go on the pull request. If one round does not settle one, bring both positions to the owner.

## Running Codex

The Codex plugin's companion script does both jobs. Run it with `run_in_background`; a review takes 5 to 15 minutes.

```
COMPANION="C:/Users/Adria/.claude/plugins/cache/openai-codex/codex/1.0.6/scripts/codex-companion.mjs"
```

**A code review** of a branch, in a review worktree (`../potato-kid-review-82`, `-83`, `-84`):

```
cd ../potato-kid-review-82 && git fetch origin && git checkout --detach origin/<branch>
node "$COMPANION" review --wait --model gpt-6.1-sol --cwd "C:/Users/Adria/potato-kid-review-82" --base origin/main --scope branch
```

**A task** (an art review, or work for Codex to do): write the prompt to a file, then

```
node "$COMPANION" task --model gpt-6.1-sol --effort high --cwd "<worktree>" --prompt-file <file>
```

- Add `--write` when Codex is to change files. It then works in `C:\Users\Adria\potato-kid-chatgpt` on a `chatgpt/` branch. Its sandbox has no git and no network: Claude commits its files unchanged with `git -c user.name=ChatGPT -c user.email=noreply@openai.com commit` and pushes.
- Without `--write` it is read-only: use that for art reviews, in a review worktree checked out at the branch.
- Include the task's `docs/TASKS.md` entry in the prompt, and for a second round say what changed since the first.
- Codex cannot see pull request replies. If a finding is settled by an explanation, put the explanation where the next review will read it (a code comment, the docs).
- "At capacity" errors: retry with the same model. A usage-limit error: tell the owner at once.
- The review worktrees have no `node_modules`, so Codex reads and reasons; it cannot run the tests there.

If a session ends abruptly, unposted Codex results are in `~/.claude/plugins/data/codex-openai-codex/state/<worktree>/jobs/*.json`.

## Reviewing art

See `docs/ART.md`, "Review". In short: Claude checks every drawing and frame, `npm run art:kids` must pass, then Codex reviews as a read-only task, then the owner sees it.

## Builds for the owner

Builds are CI artifacts (D-060): on the `main` run, `potato-kid-web` (the web build) and `potato-kid-debug-apk`. At a gate, give the owner a short summary: what was done, what was decided, what is open, and what is needed from them.

## The balance simulator

`npm run balance [seeds]` plays the real sim with a scripted bot: the first hour, a casual player (10 minutes every 3 hours for 14 days) and a daily player (30 minutes a day for 14 days). Three seeds take about 7 minutes; run it in the background.

- `PK_BALANCE='{"planting":{...}}'` merges over `balance.json` one level deep, to try numbers side by side.
- Never edit `src/` or run mutation tests while it runs: its worker processes load `src/` as they start.

## Worktrees and housekeeping

- `potato-kid-claude`: Claude's checkout (end-to-end tests on port 4173).
- `potato-kid-chatgpt`: Codex's checkout for `--write` tasks.
- `potato-kid-review-82`, `-83`, `-84`: detached checkouts for reviews.
- Other `potato-kid-*` folders beside the repo are old worktrees and gate captures; they can be removed.
- `gh` sometimes returns HTTP 503 or a GraphQL error: retry after a few seconds.

## Shell pitfalls on this machine (Windows, Git Bash)

- Long heredocs with apostrophes or backslashes get mangled. Write multi-line scripts and patches with the Write tool to the session scratchpad and run the file.
- Open files in Python with `newline=''`, or LF becomes CRLF.
- Do not chain `git commit` after a test run through a pipe: a piped `grep` succeeds even when the tests fail. Read the result, then commit.
- A failing `tsc` makes `npm run build` fail and leaves a stale `dist/`: read the build output before trusting an end-to-end run.
