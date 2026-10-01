# potato-kid

An idle mobile game. See `docs/PROJECT_BRIEF.md` and `docs/design-doc.md`.

## Development

```sh
npm install
npm run dev        # local dev server
npm test           # unit tests (simulation, economy, save)
npm run e2e        # browser smoke test (run `npx playwright install chromium` once)
npm run build      # typecheck + production build into dist/
```

Every CI run uploads a playable web build (`potato-kid-web` artifact). Serve it with any static server, e.g. `npx serve dist`.
