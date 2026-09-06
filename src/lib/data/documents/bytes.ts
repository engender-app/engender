/* Is this a PDF? (phase 8 features ticket 53, ADR-0065)

   The one signature every PDF carries, at the very start of the file:
   `%PDF-`. Read from the bytes, never the filename or the browser's
   declared MIME type - the same reason photos/bytes.ts gives for HEIC, and
   the same reason the archive importer registry sniffs a header instead of
   trusting what a picker called a file (archive/sources.ts). */

const PDF_HEADER = '%PDF-';

export function isPdf(bytes: Uint8Array): boolean {
  return bytes.length >= PDF_HEADER.length && [...PDF_HEADER].every((c, i) => bytes[i] === c.charCodeAt(0));
}
