/* The ceiling on a single document's stored file (phase 8 features ticket
   53, ADR-0065).

   25 MB. Images are normalised first (photos/normalize.ts) and land at
   2048px on the long edge and quality 0.82, which essentially never
   reaches this - the ceiling is really about scans, which cannot be
   normalised and are stored exactly as they arrived. Sits beside the
   10 MB video ceiling (videoNotes/limits.ts) and the archive importer's
   own (archive/zipReader.ts) for the same reason each of those gives:
   protecting the size of the encrypted archive, not any per-item quality
   target. */
export const DOCUMENT_SIZE_CEILING = 25 * 1024 * 1024;
