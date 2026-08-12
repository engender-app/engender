/* Builds an android-tier probe into a static bundle the instrumentation
   tests serve to the app's WebView (ticket 11, ticket 13).

   Separate from the app's vite.config.ts and named so svelte-check's project
   auto-discovery does not pick it up, for the same reason the browser tier's
   config is - run.mjs loads it explicitly.

   A build rather than a dev server: a probe runs inside an emulator's
   WebView from the app's own file system, where there is no host to reach.
   Relative asset paths for the same reason, since Bridge.setServerBasePath
   serves a bundle from a directory rather than from a document root - which
   is also why each probe is its own self-contained bundle in its own
   directory rather than two pages sharing one.

   They build straight into the test APK's assets rather than into a dist/
   beside this file. Partly to save a copy step, but mostly because
   SvelteKit's generated tsconfig includes every .js file under tests/, so a
   bundle left there becomes 400 svelte-check errors in generated code.

   ANDROID_TIER_PROBE picks which one; run.mjs builds both. */
import { defineConfig } from 'vite';
import { join } from 'node:path';

const ASSETS = 'android/app/src/androidTest/assets';

const PROBES = {
  /** Ticket 11: the shared journal contract suite over the native driver. */
  contract: { root: '.', outDir: `${ASSETS}/probe` },
  /** Ticket 13: seeds a journal so the claim gate can read its bytes. */
  encryption: { root: 'encryption', outDir: `${ASSETS}/encryption-probe` }
};

const name = process.env.ANDROID_TIER_PROBE ?? 'contract';
const probe = PROBES[name as keyof typeof PROBES];
if (!probe) throw new Error(`no android-tier probe called "${name}"`);

const repo = join(import.meta.dirname, '../..');

export default defineConfig({
  root: join(import.meta.dirname, probe.root),
  base: './',
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
