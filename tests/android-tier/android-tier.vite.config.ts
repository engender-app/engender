/* Builds the android-tier probe into a static bundle the instrumentation
   test serves to the app's WebView (ticket 11).

   Separate from the app's vite.config.ts and named so svelte-check's project
   auto-discovery does not pick it up, for the same reason the browser tier's
   config is - run.mjs loads it explicitly.

   A build rather than a dev server: the probe runs inside an emulator's
   WebView from the app's own file system, where there is no host to reach.
   Relative asset paths for the same reason, since Bridge.setServerBasePath
   serves the bundle from a directory rather than from a document root.

   It builds straight into the test APK's assets rather than into a dist/
   beside this file. Partly to save a copy step, but mostly because
   SvelteKit's generated tsconfig includes every .js file under tests/, so a
   bundle left there becomes 400 svelte-check errors in generated code. */
import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  base: './',
  build: {
    outDir: '../../android/app/src/androidTest/assets/probe',
    emptyOutDir: true,
    // The probe is read once by a WebView on a phone; a readable failure
    // trace is worth more here than a small bundle.
    minify: false,
    /* The same floor capacitor.config.ts declares: the probe should run
       wherever the app is claimed to run, and no further. Targeting older
       than this would let the probe pass on a WebView the app itself cannot
       start in, which is a green light for a device nobody can use. */
    target: 'chrome86'
  }
});
