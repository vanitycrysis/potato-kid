import { defineConfig } from '@playwright/test';

// `npm run art:preview`: renders review captures of ChatGPT/Codex's art through the real
// engine (not a second composer), into art/previews/ingame/. Not part of CI.
export default defineConfig({
  testDir: 'tests/preview',
  use: { baseURL: 'http://localhost:4174' },
  webServer: {
    command: 'npm run preview -- --port 4174 --strictPort',
    port: 4174,
    reuseExistingServer: false,
  },
});
