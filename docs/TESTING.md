# Testing

How the tests are laid out, how to run them, and how CI runs them.

## The suites

| Suite | Where | Run with | What it covers |
|---|---|---|---|
| Unit | `src/**/*.test.ts` (Vitest) | `npm test` | The sim, content, save, render helpers and UI logic |
| End to end | `tests/e2e/*.spec.ts` (Playwright, Pixel 7 profile) | `npm run e2e` | The built app in Chromium, driven through the `?debug=1` hooks (`window.__PK__`) |
| Art checks | `scripts/export-art.mjs` | `npm run art:check` | Every art source against the asset contract |
| Art previews | `tests/preview/` | `npm run art:preview` | Review captures through the real engine. Not part of CI |

## End-to-end layout

The end-to-end suite is one spec file per area, with shared helpers in `tests/e2e/helpers.ts`
(`boot`, `openTool`, `frames`, `dropOnto`, and prices computed from `balance.json`).

- A file's tests run in order in one worker. Files run side by side.
- Locally the suite uses four workers and takes about six minutes. If a test fails only in a
  full run, re-run that file alone (`npx playwright test tests/e2e/away.spec.ts`) before
  treating it as a real failure: a few tests are sensitive to a loaded machine.
- `npm run e2e` builds first. `npx playwright test` does not: it tests whatever is in `dist/`.
- Put a new test in the file for its area. Start a new file only for a new area, and keep
  files under about 700 lines so the CI shards stay even.

## CI

`.github/workflows/ci.yml` runs four kinds of job side by side on every pull request and on
every push to `main`:

- `check`: typecheck, lint, unit tests, build.
- `e2e`: six runners, each taking one sixth of the spec files (`--shard=N/6`) with one worker.
- `android`: the debug APK.
- `ci`: passes only when all of the above passed.

`ci` is the required check on `main` (branch protection, with "branch must be up to date").
A pull request cannot merge until `ci` is green on a commit that contains the current `main`.
Merge with `gh pr merge <number> --merge`; a direct push to `main` is refused.
