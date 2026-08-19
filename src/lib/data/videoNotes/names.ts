/* Video note file names (ticket 22, mirroring voiceRecordings/names.ts).

   A stored name is opaque and relative: "<uuid>.webm", resolved against the
   same root a photo's name is (OPFS on web, the app-private directory on
   Android) - video notes share Photo's file store rather than a store of
   their own (journal/videoNotes.ts).

   The same extension a voice recording gets, because it is the same
   container: both are WebM, and a uuid never collides, so the two kinds sit
   in one directory without ambiguity. Nothing infers a file's kind from its
   name - the orphan sweep asks every table which paths it references
   (sweepOrphanPhotos) rather than reading extensions - so telling them
   apart is not a job a name has to do.

   No thumbnail to derive: unlike a photo, a video note is one file. A
   poster frame would be derived state, which ADR-0010 keeps out. */

export const videoFileName = (uuid: string): string => `${uuid}.webm`;
