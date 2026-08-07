import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Some repo modules (e.g. src/db/client.ts) read env vars at import time.
    // Load .env before any test file imports them so a merely-pure-function
    // test (like session-kind.test.ts) never needs a live DB connection —
    // just the env var present so the module can construct its client.
    setupFiles: ['dotenv/config'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
