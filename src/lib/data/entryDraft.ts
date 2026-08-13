/* The Entry editor's draft (ticket 29, ADR-0017): one rune-free module for
   the transition rules EntryEditor.svelte used to spread across five
   separate `$state` fields - draft content, the photo list, pending
   removed photo ids, isEmpty and the upsertEntry payload. The component
   keeps only a thin `$state` binding around what this returns; the save
   and delete-sheet guards stay in the component because they are UI-local,
   not draft content (CONTEXT: "Entry").

   Nothing here is a Svelte rune, so it runs and is tested under the Node
   tier the same way entryContent.ts and entries.ts already are. */

import { entryIsEmpty } from './entryContent.ts';
import type { Entry } from './types.ts';
import type { EntryInput } from './journal/entries.ts';
import type { NormalizedPhoto } from './journal/photos.ts';
import type { EditorPhoto } from '$lib/stores/photoPicking';

export interface EntryDraft {
  /** The entry being edited, unset for a new one. `toUpsert()` reads this
      so the caller need not carry it alongside the draft. */
  id: number | undefined;
  epochDay: number;
  timestamp: number;
  mood: number | null;
  note: string;
  dims: Record<string, number>;
  tags: string[];
  photos: EditorPhoto[];
  /** Stored photo ids taken off in this edit, removed on save rather than
      on the tap: nothing is committed until Save, so a removal the user
      backs out of by leaving the screen has to be recoverable. */
  removedPhotoIds: string[];
  readonly isEmpty: boolean;
  setMood(mood: number | null): void;
  setNote(note: string): void;
  setDim(key: string, value: number): void;
  toggleTag(id: string): void;
  addPhoto(photo: NormalizedPhoto): void;
  removePhoto(index: number): void;
  /** The exact upsertEntry payload for the draft as it stands, including
      photo attach and remove lists. */
  toUpsert(): EntryInput;
}

/** A blank draft for `epochDay`, or one hydrated from `existing` - the
    one-time fill EntryEditor.svelte's `onFirstResult` applies once the
    stored entry arrives over the async round trip. */
export function createEntryDraft(epochDay: number, existing?: Entry): EntryDraft {
  return {
    id: existing?.id,
    epochDay: existing?.epochDay ?? epochDay,
    timestamp: existing?.timestamp ?? 0,
    mood: existing?.mood ?? null,
    note: existing?.note ?? '',
    dims: existing ? { ...existing.dims } : {},
    tags: existing ? [...existing.tags] : [],
    photos: existing ? existing.photos.map((photo) => ({ kind: 'stored' as const, photo })) : [],
    removedPhotoIds: [],

    get isEmpty() {
      return entryIsEmpty({
        mood: this.mood,
        note: this.note,
        dimCount: Object.keys(this.dims).length,
        tagCount: this.tags.length,
        photoCount: this.photos.length
      });
    },

    setMood(mood) {
      this.mood = mood;
    },

    setNote(note) {
      this.note = note;
    },

    setDim(key, value) {
      this.dims[key] = value;
    },

    toggleTag(id) {
      this.tags = this.tags.includes(id) ? this.tags.filter((x: string) => x !== id) : [...this.tags, id];
    },

    addPhoto(photo) {
      this.photos.push({ kind: 'picked', photo });
    },

    removePhoto(index) {
      const [gone] = this.photos.splice(index, 1);
      if (gone?.kind === 'stored') this.removedPhotoIds.push(gone.photo.id);
    },

    toUpsert() {
      return {
        id: this.id,
        epochDay: this.epochDay,
        timestamp: this.timestamp || undefined,
        mood: this.mood,
        note: this.note,
        dims: this.dims,
        tags: this.tags,
        attachPhotos: this.photos.filter((p: EditorPhoto) => p.kind === 'picked').map((p) => p.photo),
        removePhotoIds: this.removedPhotoIds
      };
    }
  };
}
