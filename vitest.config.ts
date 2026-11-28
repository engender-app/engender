/* Node tier. Fast, runs on every change via `npm test`.
   The browser tier lives under tests/browser-tier/ and runs via its own
   script (`npm run test:browser`), not through this config - it needs a
   real browser for OPFS/WASM SQLite, which this Node-only config cannot
   provide. */
import { defineConfig } from 'vitest/config';
import { appVersion } from './scripts/app-version.mjs';

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'tests/browser-tier/**']
  }
});
