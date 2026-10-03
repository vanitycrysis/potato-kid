import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'android', 'node_modules', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node scripts (some also run code inside Playwright's browser page), including the
    // art sources' generators (Codex's audio renderer).
    files: ['scripts/**/*.mjs', 'art/src/**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', Buffer: 'readonly', console: 'readonly', URL: 'readonly', document: 'readonly', Image: 'readonly', DOMParser: 'readonly', btoa: 'readonly', unescape: 'readonly' },
    },
  },
);
