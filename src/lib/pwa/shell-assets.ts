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
   online would defeat what the store is for (ADR-0065). */

/** The one directory in static/ that the shell does not precache. */
export const ON_DEMAND_PREFIX = '/tesseract/';

/** What every cache this app owns is named after, one per release. Shared
    because two sides delete by it: the worker drops previous releases on
    activate, and register.ts drops all of them on Android, where an install
    that predates this ticket left a worker behind. */
export const SHELL_CACHE_PREFIX = 'engender-shell-';

/** Splits the release's asset paths into the set an install precaches and the
    set a page has to ask for. `base` is the path the app is served under,
    which is what SvelteKit's `files` list is already prefixed with. */
export function splitShellAssets(
  paths: string[],
  base: string
): { shell: string[]; onDemand: string[] } {
  const prefix = base + ON_DEMAND_PREFIX;
  const shell: string[] = [];
  const onDemand: string[] = [];
  for (const path of paths) (path.startsWith(prefix) ? onDemand : shell).push(path);
  return { shell, onDemand };
}
