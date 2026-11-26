/* Photo file names.

   A stored name is opaque and relative: "<uuid>.jpg", resolved against a
   root the platform picks (OPFS on web, the app-private directory on
   Android). Nothing above the file store ever sees an absolute path,
   because an absolute OPFS path cannot round-trip to Android and an
   archive has to import on either one (ticket 11).

   The thumbnail's name is derived from the full photo's rather than
   stored: it is mechanically implied by it, and ADR-0010 keeps derived
   state out of the schema. That is also what lets the orphan sweep decide
   whether a loose file belongs to a row without a second column to
   consult. */

export const photoFileName = (uuid: string): string => `${uuid}.jpg`;

export const thumbFileName = (fileName: string): string => fileName.replace(/\.jpg$/, '-thumb.jpg');

/** Both files a photo row owns, in the order they are written. */
export const filesOf = (fileName: string): string[] => [fileName, thumbFileName(fileName)];

/** The one canonical form of a stored name, shared by the manifest parser,
    the row checks and the restore, and mirrored by Android's
    PhotoFiles.fileFor. A name is its own trim - Android trims, OPFS
    does not, so " x.jpg" and "x.jpg" would be two files on one store and one
    on the other - with no control characters (Java's trim drops everything
    up to U+0020), no separator, no '..', and no leading '.', which keeps
    '.', '..' and Android's '.nomedia' marker out. Every name the app writes
    is "<uuid>.<extension>" or its "-thumb.jpg", all of which pass. An
    archive's manifest and rows are checked before any file is read or
    written (re-check carpet 11, F7; security scan 04). */
export const isStorableFileName = (name: string): boolean => {
  if (name.length === 0 || name !== name.trim() || name.startsWith('.')) return false;
  if (name.includes('/') || name.includes('\\') || name.includes('..')) return false;
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
};
