/* Which of the files in static/ belong to the offline shell, and which one
   directory does not (phase 5 performance ticket 01).

   Everything in static/ is shell - the manifests, the icons, the woff2 faces -
   because the app reaches for all of it on the way to its first paint. The OCR
   engine is the exception, and it is the exception because the app already
   treats it as one: labs/ocr-engine.ts dynamic-imports tesseract.js and points
   it at this directory only once a recognition actually starts, so a person who
   never opens the lab scanner never loads a byte of it. Precaching it anyway
   put 49.7 MB of the shell's 54.1 MB behind a feature most first visits will
   not touch.

   scripts/prepare-tesseract-assets.mjs is what writes the directory, and
   ocr-engine.ts is what reads it. Both agree with the worker through the
   constant below rather than through three copies of the same string. */

/** The one directory in static/ that the shell does not precache. */
export const ON_DEMAND_PREFIX = '/tesseract/';

/** What every cache this app owns is named after, one per release. Shared
    because two sides delete by it: the worker drops previous releases on
    activate, and register.ts drops all of them on Android, where an install
    that predates this ticket left a worker behind. */
export const SHELL_CACHE_PREFIX = 'gender-diary-shell-';

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
