import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';
const root = import.meta.dirname;
const repo = resolve(root, '../..');
export default defineConfig({
  root,
  base: './',
  plugins: [svelte({ configFile: false })],
  resolve: { alias: {
    '$lib/stores/boot.svelte': resolve(root, 'boot.ts'),
    '$lib/lock/keystore-bridge': resolve(root, 'keystore.ts'),
    $lib: resolve(repo, 'src/lib'),
    '$app/state': resolve(repo, 'tests/browser-tier/screen-router.svelte.ts'),
    '$app/navigation': resolve(repo, 'tests/browser-tier/app-navigation-stub.ts'),
    '$app/environment': resolve(repo, 'tests/browser-tier/app-environment-stub.ts')
  } },
  define: { __DEMO__: 'false', __APP_VERSION__: JSON.stringify('0.0.0-wordmark-probe') },
  worker: { format: 'es' },
  build: { outDir: resolve(repo, 'android/app/src/main/assets/public/ui03'), emptyOutDir: true, target: 'chrome104' }
});
