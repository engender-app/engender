/* Dev server for the benchmark probe (phase 2 ticket 20). The same shape as
   tests/browser-tier/browser-tier.vite.config.ts and separate for the same
   reason it is: named so svelte-check's project auto-discovery, which globs
   for vite.config.*, does not pick it up and fail on the missing Svelte
   plugin. run.mjs loads it explicitly. */
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';

export default defineConfig({
  worker: { format: 'es' },
  server: { headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } },
  root: import.meta.dirname,
  plugins: [svelte()],
  publicDir: resolve(import.meta.dirname, '../../static'),
  define: {
    __DEMO__: JSON.stringify(false),
    __APP_VERSION__: JSON.stringify('0.0.0-benchmark')
  },
  resolve: {
    alias: {
      '$app/state': resolve(import.meta.dirname, '../browser-tier/app-state-stub.ts'),
      '$app/navigation': resolve(import.meta.dirname, '../browser-tier/app-navigation-stub.ts'),
      '$lib/stores/boot.svelte': resolve(import.meta.dirname, '../browser-tier/entry-editor-boot-stub.ts'),
      $lib: resolve(import.meta.dirname, '../../src/lib')
    }
  },
  // Pre-bundling would inline the sqlite3mc wasm module in a way that
  // breaks its own URL-relative wasm loading inside mc-worker.ts.
  optimizeDeps: {
    exclude: ['@evolu/sqlite-wasm']
  }
});
