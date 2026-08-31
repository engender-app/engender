/* The Entry editor's draft (ticket 29, ADR-0017): one rune-free module for
   the transition rules EntryEditor.svelte used to spread across five
   separate `$state` fields - draft content, the photo list, pending
   removed photo ids, isEmpty and the upsertEntry payload. The component
   keeps only a thin `$state` binding around what this returns; the save
   and delete-sheet guards stay in the component because they are UI-local,
   not draft content (CONTEXT: "Entry").

   Nothing here is a Svelte rune, so it runs and is tested under the Node
   tier the same way entryContent.ts and entries.ts already are. */

import { bodyRegionIsLogged, copyBodyRegions } from './bodyMap';
import { entryIsEmpty } from './entryContent';
import type { BodyRegionFeeling, Entry } from './types';
import type {
  EntryCycleEventInput,
  EntryDoseLogInput,
  EntryEffectMarkerInput,
  EntryInput,
  EntryProcedureRecoveryInput,
  EntryTryoutFeltSenseInput
} from './journal/entries';
import type { NormalizedPhoto } from './journal/photos';
import type { EditorPhoto } from '$lib/stores/photoPicking';
import type { EditorRecording } from '$lib/stores/voiceRecording';
import type { EditorVideo } from '$lib/stores/videoRecording';

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
  bodyRegions: Record<string, BodyRegionFeeling>;
  photos: EditorPhoto[];
  /** Stored photo ids taken off in this edit, removed on save rather than
      on the tap: nothing is committed until Save, so a removal the user
      backs out of by leaving the screen has to be recoverable. */
  removedPhotoIds: string[];
  recordings: EditorRecording[];
  /** Stored recording ids taken off in this edit, the same removed-on-save
      rule removedPhotoIds follows. */
  removedRecordingIds: string[];
  videos: EditorVideo[];
  /** Stored video note ids taken off in this edit, the same removed-on-save
      rule removedPhotoIds follows. */
  removedVideoIds: string[];
  tryoutFeltSense: EntryTryoutFeltSenseInput | null;
  doseLog: EntryDoseLogInput | null;
  procedureRecovery: EntryProcedureRecoveryInput | null;
  effectMarker: EntryEffectMarkerInput | null;
  cycleEvent: EntryCycleEventInput | null;
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
  /** Puts a region's slider on screen, or takes it off. Nothing is seeded:
      a region picked and then left alone carries nothing and is dropped on
      save (ticket 31), so picking one is not itself content. */
  toggleBodyRegion(key: string): void;
  /** Writes one region's whole feeling, the way the picker's single bipolar
      slider produces it: at most one axis carries a value, the other is
      null. Overwrites both sides, so dragging across the midpoint takes
      back the side it came from. */
  setBodyRegionFeeling(key: string, feeling: BodyRegionFeeling): void;
  addPhoto(photo: NormalizedPhoto): void;
  removePhoto(index: number): void;
  addRecording(bytes: Uint8Array): void;
  removeRecording(index: number): void;
  addVideo(bytes: Uint8Array): void;
  removeVideo(index: number): void;
  setTryoutFeltSense(feltSense: EntryTryoutFeltSenseInput | null): void;
  setDoseLog(doseLog: EntryDoseLogInput | null): void;
  setProcedureRecovery(recovery: EntryProcedureRecoveryInput | null): void;
  setEffectMarker(marker: EntryEffectMarkerInput | null): void;
  setCycleEvent(cycleEvent: EntryCycleEventInput | null): void;
  /** The exact upsertEntry payload for the draft as it stands, including the
      photo, recording and video-note attach and remove lists. */
  toUpsert(): EntryInput;
}

/** A blank draft for `epochDay`, or one hydrated from `existing` - the
    one-time fill EntryEditor.svelte's `onFirstResult` applies once the
    stored entry arrives over the async round trip. */
/** How many regions actually say something, by the one rule bodyMap.ts
    states: a region on screen with both axes still null is a slider waiting
    for input, not content. */
function loggedRegionCount(bodyRegions: Record<string, BodyRegionFeeling>): number {
  return Object.values(bodyRegions).filter(bodyRegionIsLogged).length;
}

export function createEntryDraft(epochDay: number, existing?: Entry, seedMood?: number | null): EntryDraft {
  return {
    id: existing?.id,
    epochDay: existing?.epochDay ?? epochDay,
    timestamp: existing?.timestamp ?? 0,
    mood: existing ? existing.mood : seedMood ?? null,
    note: existing?.note ?? '',
    dims: existing ? { ...existing.dims } : {},
    tags: existing ? [...existing.tags] : [],
    bodyRegions: existing ? copyBodyRegions(existing.bodyRegions) : {},
    photos: existing ? existing.photos.map((photo) => ({ kind: 'stored' as const, photo })) : [],
    removedPhotoIds: [],
    recordings: existing ? existing.recordings.map((recording) => ({ kind: 'stored' as const, recording })) : [],
    removedRecordingIds: [],
    videos: existing ? existing.videos.map((video) => ({ kind: 'stored' as const, video })) : [],
    removedVideoIds: [],
    tryoutFeltSense: null,
    doseLog: null,
    procedureRecovery: null,
    effectMarker: null,
    cycleEvent: null,

    get isEmpty() {
      return entryIsEmpty({
        mood: this.mood,
        note: this.note,
        dimCount: Object.keys(this.dims).length,
        tagCount: this.tags.length,
        photoCount: this.photos.length,
        recordingCount: this.recordings.length,
        videoCount: this.videos.length,
        bodyRegionCount: loggedRegionCount(this.bodyRegions)
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
        this.videos.length === 0 &&
        loggedRegionCount(this.bodyRegions) === 0
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
        this.bodyRegions = { ...this.bodyRegions, [key]: { dysphoria: null, euphoria: null } };
      }
    },

    setBodyRegionFeeling(key, feeling) {
      this.bodyRegions[key] = feeling;
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

    addVideo(bytes) {
      this.videos.push({ kind: 'recorded', bytes });
    },

    removeVideo(index) {
      const [gone] = this.videos.splice(index, 1);
      if (gone.kind === 'stored') this.removedVideoIds.push(gone.video.id);
    },

    setTryoutFeltSense(feltSense) {
      this.tryoutFeltSense = feltSense;
    },

    setDoseLog(doseLog) {
      this.doseLog = doseLog;
    },

    setProcedureRecovery(recovery) {
      this.procedureRecovery = recovery;
    },

    setEffectMarker(marker) {
      this.effectMarker = marker;
    },

    setCycleEvent(cycleEvent) {
      this.cycleEvent = cycleEvent;
    },

    toUpsert() {
      const payload: EntryInput = {
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
        removeRecordingIds: this.removedRecordingIds,
        attachVideos: this.videos.filter((v: EditorVideo) => v.kind === 'recorded').map((v) => v.bytes),
        removeVideoIds: this.removedVideoIds
      };
      if (this.tryoutFeltSense) payload.tryoutFeltSense = this.tryoutFeltSense;
      if (this.doseLog) payload.doseLog = this.doseLog;
      if (this.procedureRecovery) payload.procedureRecovery = this.procedureRecovery;
      if (this.effectMarker) payload.effectMarker = this.effectMarker;
      if (this.cycleEvent) payload.cycleEvent = this.cycleEvent;
      return payload;
    }
  };
}
