/* Standalone dev server for the browser-tier probe (ticket 03) - separate
   from the app's own vite.config.ts on purpose, since this only exists to
   serve probe.ts to a real browser over COOP/COEP, and ticket 04 owns
   wiring SQLocal into the app itself. Named so svelte-check's project
   auto-discovery (which globs for vite.config.*) does not pick it up and
   fail on the missing Svelte plugin - run.mjs loads it explicitly. */
import { defineConfig } from 'vite';
import sqlocal from 'sqlocal/vite';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [sqlocal()],
  // Same exclusion the app's own config needs (ticket 09): pre-bundling
  // would inline the sqlite3mc wasm module in a way that breaks its own
  // URL-relative wasm loading inside mc-worker.ts.
  optimizeDeps: {
    exclude: ['@evolu/sqlite-wasm']
  }
});
