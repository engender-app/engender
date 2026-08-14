/* Dev server for the benchmark probe (phase 2 ticket 20). The same shape as
   tests/browser-tier/browser-tier.vite.config.ts and separate for the same
   reason it is: named so svelte-check's project auto-discovery, which globs
   for vite.config.*, does not pick it up and fail on the missing Svelte
   plugin. run.mjs loads it explicitly. */
import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import sqlocal from 'sqlocal/vite';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [sqlocal()],
  resolve: {
    alias: {
      $lib: resolve(import.meta.dirname, '../../src/lib')
    }
  },
  // Pre-bundling would inline the sqlite3mc wasm module in a way that
  // breaks its own URL-relative wasm loading inside mc-worker.ts.
  optimizeDeps: {
    exclude: ['@evolu/sqlite-wasm']
  }
});
