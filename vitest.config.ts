/* Node tier (ADR: ticket 03). Fast, runs on every change via `npm test`.
   The browser tier lives under tests/browser-tier/ and runs via its own
   script (`npm run test:browser`), not through this config - it needs a
   real browser for OPFS/WASM SQLite, which this Node-only config cannot
   provide. */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'tests/browser-tier/**']
  }
});
