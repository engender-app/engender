/* pdf.js's worker, with the app's own floor patch ahead of it (phase 8
   features ticket 55).

   The worker is here rather than taken from the package as a URL for one
   reason: a worker is its own realm, so nothing the main thread polyfills
   reaches it, and the `.at(-1)` that would break a WebView between 87 and
   92 is in the worker's half of pdf.js (pdf-floor.ts). Bundling it as the
   app's own module worker also puts it in _app/immutable/ where the
   emitted-client-assets plugin can see it, which is what gets it into the
   offline shell at all (vite.config.ts, ADR-0021).

   The legacy build, not the default one: it is where pdf.js compiles its
   own syntax down and carries the core-js pieces the floor is missing. */
import './pdf-floor';
import 'pdfjs-dist/legacy/build/pdf.worker.mjs';
