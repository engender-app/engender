/* What the offline shell is made of: which files in static/ belong to it,
   which one directory does not, and what the cache holding them is called
   (phase 5 performance ticket 01).

   The cache name is here rather than in the worker because two sides delete by
   it, and only one of them is the worker.

   Everything in static/ is shell - the manifests, the icons, the woff2 faces -
   because the app reaches for all of it on the way to its first paint. The OCR
   engine is the exception, and it is the exception because the app already
   treats it as one: labs/ocr-engine.ts dynamic-imports tesseract.js and points
   it at this directory only once a recognition actually starts, so a person who
   never opens the lab scanner never loads a byte of it. Precaching it anyway
   put 49.7 MB of the shell's 54.1 MB behind a feature most first visits will
   not touch.

   scripts/prepare-vendor-assets.mjs is what writes the directory, and
   ocr-engine.ts is what reads it. Both agree with the worker through the
   constant below rather than through three copies of the same string.

   That script also writes static/pdf-fonts/, which is not an exception and
   is precached with everything else: the fourteen standard PDF faces are
   800 KB rather than 50 MB, and a document viewer that only draws its text
   online would defeat what the store is for (ADR-0065).

   Two built files are kept out of the install for the same reason the OCR
   engine is, though neither is in static/ and neither has a directory of its
   own, so they are named by pattern (phase 14 pre-release ticket 13).

   The PDF renderer's worker is 1.4 MB (0.42 MB brotli) that only opening a
   document uses. It joins the cache the first time one is opened, by the
   page's ask below, exactly as the OCR engine does. The fonts stay, so a
   document that was opened once draws offline.

   The SQLite worker1 promiser's worker is never constructed at all: the
   file is in the build because the sqlite-wasm package names it in
   `sqlite3Worker1Promiser.defaultConfig`, a factory only that promiser
   calls, and the journal talks to SQLite through mc-worker.ts and SQLocal's
   worker instead. Nothing asks for it, so nothing is lost by not storing it. */

/** The one directory in static/ that the shell does not precache. */
export const ON_DEMAND_PREFIX = '/tesseract/';

/** The PDF renderer's worker, which is emitted with a hashed name. */
export const PDF_WORKER_PATTERN = /\/_app\/immutable\/workers\/pdf-worker-[^/]+\.js$/;

/** The worker the sqlite-wasm package's worker1 promiser would construct,
    and which this app never does. */
export const UNUSED_WORKER_PATTERN = /\/_app\/immutable\/workers\/sqlite3-worker1-bundler-friendly-[^/]+\.js$/;

/** What every cache this app owns is named after, one per release. Shared
    because two sides delete by it: the worker drops previous releases on
    activate, and register.ts drops all of them on Android, where an install
    that predates this ticket left a worker behind. */
export const SHELL_CACHE_PREFIX = 'engender-shell-';

/** Splits the release's asset paths into the set an install precaches and
    the sets a page has to ask for or nothing ever does. `base` is the path
    the app is served under, which is what SvelteKit's `files` list is
    already prefixed with.

    `onDemand` is the OCR engine, `pdfWorker` the document renderer's worker:
    two asks, because opening a PDF must not download 21 MB of OCR.
    `unused` is stored by nobody. */
export function splitShellAssets(
  paths: string[],
  base: string
): { shell: string[]; onDemand: string[]; pdfWorker: string[]; unused: string[] } {
  const prefix = base + ON_DEMAND_PREFIX;
  const shell: string[] = [];
  const onDemand: string[] = [];
  const pdfWorker: string[] = [];
  const unused: string[] = [];
  for (const path of paths) {
    if (path.startsWith(prefix)) onDemand.push(path);
    else if (PDF_WORKER_PATTERN.test(path)) pdfWorker.push(path);
    else if (UNUSED_WORKER_PATTERN.test(path)) unused.push(path);
    else shell.push(path);
  }
  return { shell, onDemand, pdfWorker, unused };
}
