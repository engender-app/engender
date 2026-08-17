/* The entry invariant (CONTEXT: "Entry"): an entry holds at least one of
   mood, a dimension value, a tag, a non-blank note, a photo, a body-region
   intensity - or it does not exist. One predicate, because it is enforced
   in the journal, again in the demo-store repository for the ticket
   07-to-08 window, and echoed by the editor's save guard - three sites
   that must never drift. */

export interface EntryContent {
  mood: number | null;
  note: string;
  dimCount: number;
  tagCount: number;
  photoCount: number;
  bodyRegionCount: number;
}

export function entryIsEmpty(e: EntryContent): boolean {
  return (
    e.mood == null &&
    !e.note.trim() &&
    e.dimCount === 0 &&
    e.tagCount === 0 &&
    e.photoCount === 0 &&
    e.bodyRegionCount === 0
  );
}

export const EMPTY_ENTRY_ERROR = 'an entry needs a mood, a dimension value, a tag, a note, a photo or a body-region intensity';
