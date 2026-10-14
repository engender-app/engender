/* OCR is installed before offline readiness, but initialized only on a scan.
   Versioned sets are produced by prepare-vendor-assets.mjs. Root OCR paths
   serve retained pre-generation pages and are not part of a new install.
   PDF fonts stay installed; the PDF worker still loads on demand (ADR-0065). */
export const OCR_ROOT = '/tesseract/';

/** The PDF renderer's worker, which is emitted with a hashed name. */
export const PDF_WORKER_PATTERN = /\/_app\/immutable\/workers\/pdf-worker-[^/]+\.js$/;

/** The worker the sqlite-wasm package's worker1 promiser would construct,
    and which this app never does. */
export const UNUSED_WORKER_PATTERN = /\/_app\/immutable\/workers\/sqlite3-worker1-bundler-friendly-[^/]+\.js$/;

/** What every cache this app owns is named after, one per release. Shared
    because two sides delete by it: the worker keeps only previous OCR on
    activate, and register.ts drops all of them on Android, where an install
    that predates this ticket left a worker behind. */
export const SHELL_CACHE_PREFIX = 'engender-shell-';

/** Classify the current immutable OCR set with the shell. Legacy OCR URLs
    and the unused SQLite promiser worker are not part of this install. */
export function splitShellAssets(
  paths: string[],
  base: string,
  ocrPrefix: string
): { shell: string[]; pdfWorker: string[]; unused: string[] } {
  const shell: string[] = [];
  const pdfWorker: string[] = [];
  const unused: string[] = [];
  for (const path of paths) {
    if (path.startsWith(base + OCR_ROOT) && !path.startsWith(base + ocrPrefix)) unused.push(path);
    else if (PDF_WORKER_PATTERN.test(path)) pdfWorker.push(path);
    else if (UNUSED_WORKER_PATTERN.test(path)) unused.push(path);
    else shell.push(path);
  }
  return { shell, pdfWorker, unused };
}
