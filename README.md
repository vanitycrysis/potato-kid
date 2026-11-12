# potato-kid

An idle mobile game. See `docs/PROJECT_BRIEF.md`, then `docs/README.md` for the rest of the documentation.

## Development

```sh
npm install
npm run dev        # local dev server
npm test           # unit tests (simulation, economy, save)
npm run e2e        # end-to-end tests (run `npx playwright install chromium` once)
npm run build      # typecheck + production build into dist/
```

Every CI run uploads a playable web build (`potato-kid-web` artifact). Serve it with any static server, e.g. `npx serve dist`.
