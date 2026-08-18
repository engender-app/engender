/* Voice recording file names (ticket 24, mirroring photos/names.ts).

   A stored name is opaque and relative: "<uuid>.webm", resolved against the
   same root a photo's name is (OPFS on web, the app-private directory on
   Android) - recordings share Photo's file store rather than a store of
   their own (journal/voiceRecordings.ts). No thumbnail to derive: unlike a
   photo, a recording is one file. */

export const voiceFileName = (uuid: string): string => `${uuid}.webm`;
