/* What survives EntryEditor.svelte across an Android process death (ticket
   14): a plain, JSON-safe snapshot of the draft's editable fields, matched
   back to whichever entry/day it belongs to and reapplied on top of a
   freshly created draft. Rune-free, tested under the Node tier like
   entryDraft.ts.

   Picked photos' raw bytes are deliberately not part of the snapshot - a
   localStorage mirror has no room for full-resolution JPEGs, so an unsaved
   photo attachment does not survive a killed process. A removal of an
   already-stored photo does survive, since that is just an id. */

import type { EntryDraft } from './entryDraft';

export interface PersistedEntryDraft {
  id: number | undefined;
  epochDay: number;
  timestamp: number;
  mood: number | null;
  note: string;
  dims: Record<string, number>;
  tags: string[];
  bodyRegions: Record<string, number>;
  removedPhotoIds: string[];
}

/** The subset of `draft` that is worth mirroring outside the component. */
export function serializeDraft(draft: EntryDraft): PersistedEntryDraft {
  return {
    id: draft.id,
    epochDay: draft.epochDay,
    timestamp: draft.timestamp,
    mood: draft.mood,
    note: draft.note,
    dims: { ...draft.dims },
    tags: [...draft.tags],
    bodyRegions: { ...draft.bodyRegions },
    removedPhotoIds: [...draft.removedPhotoIds]
  };
}

/** Whether `persisted` belongs to the entry/day this route is showing: an
    existing entry is identified by its id regardless of day (a retroactive
    correction can move it), a new entry by the day alone, since it has no
    id yet. */
export function draftMatchesRoute(persisted: PersistedEntryDraft, entryId: number | undefined, epochDay: number): boolean {
  if (entryId != null) return persisted.id === entryId;
  return persisted.id == null && persisted.epochDay === epochDay;
}

/** Overlays `persisted` onto `draft` in place. A stored photo the user had
    already removed before the process died stays removed rather than
    reappearing alongside the entry it came from. */
export function applyPersistedDraft(draft: EntryDraft, persisted: PersistedEntryDraft): void {
  draft.mood = persisted.mood;
  draft.note = persisted.note;
  draft.dims = { ...persisted.dims };
  draft.tags = [...persisted.tags];
  draft.bodyRegions = { ...persisted.bodyRegions };
  draft.removedPhotoIds = [...persisted.removedPhotoIds];
  draft.photos = draft.photos.filter((p) => p.kind !== 'stored' || !draft.removedPhotoIds.includes(p.photo.id));
}
