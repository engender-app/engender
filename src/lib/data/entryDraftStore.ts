/* Where an in-progress entry draft survives a killed process (ticket 14),
   the same read/write/clear shape as the boot cache and the PIN-attempt
   store (ADR-0009's mirror-outside-SQLite pattern): the journal stays the
   source of truth for saved entries, this is a throwaway mirror the editor
   keeps in step with itself and clears the moment it unmounts, so only a
   process death mid-edit ever leaves it behind to be found. */

import type { PersistedEntryDraft } from './entryDraftPersistence';

export interface EntryDraftStore {
  read(): PersistedEntryDraft | null;
  write(draft: PersistedEntryDraft): void;
  clear(): void;
}

export const ENTRY_DRAFT_STORE_KEY = 'gender-diary-entry-draft';

// Hand-editable storage: anything that is not this shape is no draft at
// all, the same rule attempt-store.ts applies to its own mirror.
function isPersistedEntryDraft(value: unknown): value is PersistedEntryDraft {
  if (!value || typeof value !== 'object') return false;
  const d = value as Partial<PersistedEntryDraft>;
  return (
    (d.id === undefined || Number.isFinite(d.id)) &&
    Number.isFinite(d.epochDay) &&
    Number.isFinite(d.timestamp) &&
    (d.mood === null || Number.isFinite(d.mood)) &&
    typeof d.note === 'string' &&
    typeof d.dims === 'object' &&
    d.dims !== null &&
    !Array.isArray(d.dims) &&
    Array.isArray(d.tags) &&
    typeof d.bodyRegions === 'object' &&
    d.bodyRegions !== null &&
    !Array.isArray(d.bodyRegions) &&
    Array.isArray(d.removedPhotoIds)
  );
}

export function localStorageEntryDraft(): EntryDraftStore {
  return {
    read() {
      try {
        const raw = localStorage.getItem(ENTRY_DRAFT_STORE_KEY);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        return isPersistedEntryDraft(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    write(draft) {
      try {
        localStorage.setItem(ENTRY_DRAFT_STORE_KEY, JSON.stringify(draft));
      } catch {
        /* storage full / private mode - a killed process just loses the draft */
      }
    },
    clear() {
      try {
        localStorage.removeItem(ENTRY_DRAFT_STORE_KEY);
      } catch {
        /* nothing to clear if it could not be written in the first place */
      }
    }
  };
}
