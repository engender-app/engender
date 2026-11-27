/* pdf.js's worker, with the app's own floor patch ahead of it.

   The worker is here rather than taken from the package as a URL for one
   reason: a worker is its own realm, so nothing the main thread polyfills
   reaches it. The `.at(-1)` in the worker's half of pdf.js still needs
   the patch for the other browser targets (pdf-floor.ts); Android's floor
   is now WebView 104. Bundling it as the app's own module worker also puts
   it in _app/immutable/ where the
   emitted-client-assets plugin can see it, which is what gets it into the
   offline shell at all (vite.config.ts, ADR-0021).

   The legacy build, not the default one: it is where pdf.js compiles its
   own syntax down and carries the core-js pieces the floor is missing. */
import './pdf-floor';
import 'pdfjs-dist/legacy/build/pdf.worker.mjs';
