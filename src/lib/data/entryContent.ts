/* The editor requires a mood for a new entry. Stored and imported
   rows need at least one mood, dimension value, tag, non-blank note,
   photo, voice recording, video note or body-region intensity.
   Keep this predicate shared across persistence and editor guards. */

export interface EntryContent {
  mood: number | null;
  note: string;
  dimCount: number;
  tagCount: number;
  photoCount: number;
  recordingCount: number;
  videoCount: number;
  bodyRegionCount: number;
}

export function entryIsEmpty(e: EntryContent): boolean {
  return (
    e.mood == null &&
    !e.note.trim() &&
    e.dimCount === 0 &&
    e.tagCount === 0 &&
    e.photoCount === 0 &&
    e.recordingCount === 0 &&
    e.videoCount === 0 &&
    e.bodyRegionCount === 0
  );
}

export const EMPTY_ENTRY_ERROR =
  'an entry needs a mood, a dimension value, a tag, a note, a photo, a voice recording, a video note or a body-region intensity';
