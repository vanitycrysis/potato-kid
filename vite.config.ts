import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * The SIL OFL (condition 2) requires the licence to travel with the font. Vite emits the
 * bundled font as a hashed asset but knows nothing of its licence, so emit the full text
 * beside it in every build (Codex review, PR #24).
 */
function fontLicence(): Plugin {
  return {
    name: 'font-licence',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'assets/PatrickHand-OFL.txt',
        source: readFileSync('assets/fonts/patrick-hand/OFL.txt', 'utf8'),
      });
    },
  };
}

export default defineConfig({
  // Relative base so the same build works on GitHub Pages (sub-path) and inside Capacitor.
  base: './',
  build: { target: 'es2022' },
  plugins: [fontLicence()],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
