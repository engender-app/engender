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
