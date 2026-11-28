/* Build each Android probe as a self-contained static bundle with
   relative paths for Bridge.setServerBasePath. Output directly to test
   APK assets so SvelteKit does not type-check generated JS under tests/.
   run.mjs loads this config explicitly and selects via ANDROID_TIER_PROBE.
   kdf-budget requires an explicit physical-device run. */
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { join } from 'node:path';

const ASSETS = 'android/app/src/androidTest/assets';

const PROBES = {
  'locked-journal': { root: 'locked-journal', outDir: `${ASSETS}/locked-journal-probe` },
  'key-gate': { root: 'key-gate', outDir: `${ASSETS}/key-gate-probe` },
  'kdf-budget': { root: 'kdf-budget', outDir: `${ASSETS}/kdf-budget-probe` },
  ocr: { root: 'ocr', outDir: `${ASSETS}/ocr-probe` },
  'credential-power-cut': { root: 'credential-power-cut', outDir: `${ASSETS}/credential-power-cut-probe` },
  'pin-count': { root: 'pin-count', outDir: `${ASSETS}/pin-count-probe` },
  /** The shared journal contract suite over the native driver. */
  'auto-export': { root: 'auto-export', outDir: `${ASSETS}/auto-export-probe` },
  contract: { root: '.', outDir: `${ASSETS}/probe` },
  /** Seeds a journal so the claim gate can read its bytes. */
  encryption: { root: 'encryption', outDir: `${ASSETS}/encryption-probe` },
  /** Archive import/export between web and Android implementations. */
  'archive-recovery': { root: 'archive/recovery', outDir: `${ASSETS}/archive-recovery-probe` },
  archive: { root: 'archive', outDir: `${ASSETS}/archive-cross-probe` },
  /** Ten-year Journal benchmark over the native driver. */
  'long-journal': { root: 'long-journal', outDir: `${ASSETS}/long-journal-probe` }
};

const name = process.env.ANDROID_TIER_PROBE ?? 'contract';
const probe = PROBES[name as keyof typeof PROBES];
if (!probe) throw new Error(`no android-tier probe called "${name}"`);

const repo = join(import.meta.dirname, '../..');

export default defineConfig({
  root: join(import.meta.dirname, probe.root),
  base: './',
  resolve: {
    alias: {
      ...(name === 'long-journal' ? {
        '$lib/stores/today.svelte': join(repo, 'tests/long-journal/today-stub.ts'),
        '$lib/stores/boot.svelte': join(repo, 'tests/browser-tier/entry-editor-boot-stub.ts')
      } : {}),
      $lib: join(repo, 'src/lib'),
      '$app/state': join(repo, 'tests/browser-tier/screen-router.svelte.ts'),
      '$app/navigation': join(repo, 'tests/browser-tier/app-navigation-stub.ts')
    }
  },
  plugins: ['auto-export', 'archive-recovery', 'pin-count', 'key-gate', 'long-journal'].includes(name) ? [svelte({ configFile: false })] : [],
  define: {
    __DEMO__: JSON.stringify(false),
    __APP_VERSION__: JSON.stringify('0.0.0-archive-recovery')
  },
  optimizeDeps: {
    exclude: ['@evolu/sqlite-wasm']
  },
  worker: {
    format: 'es'
  },
  build: {
    outDir: join(repo, probe.outDir),
    emptyOutDir: true,
    // A probe is read once by a WebView on a phone; a readable failure trace
    // is worth more here than a small bundle.
    minify: false,
    /* The same floor capacitor.config.ts declares: a probe should run
       wherever the app is claimed to run, and no further. Targeting older
       than this would let one pass on a WebView the app itself cannot start
       in, which is a green light for a device nobody can use. */
    target: 'chrome86'
  }
});
