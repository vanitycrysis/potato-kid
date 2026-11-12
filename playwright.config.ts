import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  // One spec file per area (docs/TESTING.md). A file's tests run in order in one worker;
  // files run side by side. CI keeps one worker per runner and splits the files across
  // runners with --shard instead (.github/workflows/ci.yml): the timing-sensitive tests
  // are tuned for an unloaded machine.
  workers: process.env.CI ? 1 : 4,
  use: { baseURL: 'http://localhost:4173', ...devices['Pixel 7'] },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
});
