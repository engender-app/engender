/* The Entry editor's draft (ticket 29, ADR-0017): one rune-free module for
   the transition rules EntryEditor.svelte used to spread across five
   separate `$state` fields - draft content, the photo list, pending
   removed photo ids, isEmpty and the upsertEntry payload. The component
   keeps only a thin `$state` binding around what this returns; the save
   and delete-sheet guards stay in the component because they are UI-local,
   not draft content (CONTEXT: "Entry").

   Nothing here is a Svelte rune, so it runs and is tested under the Node
   tier the same way entryContent.ts and entries.ts already are. */

import { BODY_REGION_INTENSITY_DEFAULT } from './bodyMap';
import { entryIsEmpty } from './entryContent';
import type { Entry } from './types';
import type { EntryInput } from './journal/entries';
import type { NormalizedPhoto } from './journal/photos';
import type { EditorPhoto } from '$lib/stores/photoPicking';
import type { EditorRecording } from '$lib/stores/voiceRecording';

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
  bodyRegions: Record<string, number>;
  photos: EditorPhoto[];
  /** Stored photo ids taken off in this edit, removed on save rather than
      on the tap: nothing is committed until Save, so a removal the user
      backs out of by leaving the screen has to be recoverable. */
  removedPhotoIds: string[];
  recordings: EditorRecording[];
  /** Stored recording ids taken off in this edit, the same removed-on-save
      rule removedPhotoIds follows. */
  removedRecordingIds: string[];
  readonly isEmpty: boolean;
  readonly hasMoodOnlyContent: boolean;
  setMood(mood: number | null): void;
  setNote(note: string): void;
  setDim(key: string, value: number): void;
  toggleTag(id: string): void;
  /** Merges a template's pre-fill into the draft (ticket 17): tags join the
      selection already there rather than toggling it, so applying the same
      template twice cannot flip a tag back off, and dims overwrite by key
      the way `setDim` does. Every value it sets is a plain field afterwards
      - `toggleTag`/`setDim` edit it same as anything the person picked
      themselves. */
  applyTemplate(tags: string[], dims: Record<string, number>): void;
  toggleBodyRegion(key: string): void;
  setBodyRegionIntensity(key: string, intensity: number): void;
  addPhoto(photo: NormalizedPhoto): void;
  removePhoto(index: number): void;
  addRecording(bytes: Uint8Array): void;
  removeRecording(index: number): void;
  /** The exact upsertEntry payload for the draft as it stands, including
      photo and recording attach and remove lists. */
  toUpsert(): EntryInput;
}

/** A blank draft for `epochDay`, or one hydrated from `existing` - the
    one-time fill EntryEditor.svelte's `onFirstResult` applies once the
    stored entry arrives over the async round trip. */
export function createEntryDraft(epochDay: number, existing?: Entry, seedMood?: number | null): EntryDraft {
  return {
    id: existing?.id,
    epochDay: existing?.epochDay ?? epochDay,
    timestamp: existing?.timestamp ?? 0,
    mood: existing ? existing.mood : seedMood ?? null,
    note: existing?.note ?? '',
    dims: existing ? { ...existing.dims } : {},
    tags: existing ? [...existing.tags] : [],
    bodyRegions: existing ? { ...existing.bodyRegions } : {},
    photos: existing ? existing.photos.map((photo) => ({ kind: 'stored' as const, photo })) : [],
    removedPhotoIds: [],
    recordings: existing ? existing.recordings.map((recording) => ({ kind: 'stored' as const, recording })) : [],
    removedRecordingIds: [],

    get isEmpty() {
      return entryIsEmpty({
        mood: this.mood,
        note: this.note,
        dimCount: Object.keys(this.dims).length,
        tagCount: this.tags.length,
        photoCount: this.photos.length,
        recordingCount: this.recordings.length,
        bodyRegionCount: Object.keys(this.bodyRegions).length
      });
    },

    get hasMoodOnlyContent() {
      return (
        this.mood != null &&
        !this.note.trim() &&
        Object.keys(this.dims).length === 0 &&
        this.tags.length === 0 &&
        this.photos.length === 0 &&
        this.recordings.length === 0 &&
        Object.keys(this.bodyRegions).length === 0
      );
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

    applyTemplate(tags, dims) {
      this.tags = [...new Set([...this.tags, ...tags])];
      this.dims = { ...this.dims, ...dims };
    },

    toggleBodyRegion(key) {
      if (key in this.bodyRegions) {
        const { [key]: _removed, ...rest } = this.bodyRegions;
        this.bodyRegions = rest;
      } else {
        this.bodyRegions = { ...this.bodyRegions, [key]: BODY_REGION_INTENSITY_DEFAULT };
      }
    },

    setBodyRegionIntensity(key, intensity) {
      this.bodyRegions[key] = intensity;
    },

    addPhoto(photo) {
      this.photos.push({ kind: 'picked', photo });
    },

    removePhoto(index) {
      const [gone] = this.photos.splice(index, 1);
      if (gone.kind === 'stored') this.removedPhotoIds.push(gone.photo.id);
    },

    addRecording(bytes) {
      this.recordings.push({ kind: 'recorded', bytes });
    },

    removeRecording(index) {
      const [gone] = this.recordings.splice(index, 1);
      if (gone.kind === 'stored') this.removedRecordingIds.push(gone.recording.id);
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
        bodyRegions: this.bodyRegions,
        attachPhotos: this.photos.filter((p: EditorPhoto) => p.kind === 'picked').map((p) => p.photo),
        removePhotoIds: this.removedPhotoIds,
        attachRecordings: this.recordings
          .filter((r: EditorRecording) => r.kind === 'recorded')
          .map((r) => r.bytes),
        removeRecordingIds: this.removedRecordingIds
      };
    }
  };
}
