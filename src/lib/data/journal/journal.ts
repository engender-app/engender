/* The journal (ADR-0017, CONTEXT: "Journal"): everything this device holds
   about the user's transition, reached through one handle bound to a
   database driver. A factory takes a SqliteDriver and a photo file store
   and composes six area modules behind that handle. The interface is
   uniformly async and free of Svelte runes, so the whole thing runs under
   the Node tier's real SQLite; it mints every row's identity itself
   (ADR-0002), so no screen ever needs a Date.now() scheme again.

   One thin app-level module constructs the instance at boot
   (stores/boot.svelte.ts); tests construct their own over
   test-support's node:sqlite driver. */

import type { SqliteDriver } from '../sqlite/driver';
import { makeDimensionsArea, type DimensionsArea } from './dimensions';
import { makeEntriesArea, type EntriesArea } from './entries';
import { makeLabsArea, type LabsArea } from './labs';
import { makeMilestonesArea, type MilestonesArea } from './milestones';
import { makePhotosArea, type PhotosArea } from './photos';
import { makeRemindersArea, type RemindersArea } from './reminders';
import { makeTagsArea, type TagsArea } from './tags';
import { reconcileBuiltIns } from './reconcile';

/** Where photo files live. The journal owns the rows; whoever owns the
    bytes implements this, so the rules about files - a delete takes them
    along, the boot sweep reclaims what no row references - are testable
    against a fake in the Node tier (ADR-0017).

    Every argument is an opaque file name, never a path: OPFS on web and
    the app-private directory on Android are different roots, and an
    archive written on one has to import on the other (names.ts). */
export interface PhotoFileStore {
  write(name: string, bytes: Uint8Array): Promise<void>;
  read(name: string): Promise<Uint8Array | null>;
  remove(name: string): Promise<void>;
  /** Every file in the store, for the orphan sweep. */
  list(): Promise<string[]>;
}

export interface Journal {
  entries: EntriesArea;
  tags: TagsArea;
  dimensions: DimensionsArea;
  milestones: MilestonesArea;
  photos: PhotosArea;
  labs: LabsArea;
  reminders: RemindersArea;
  /** Adds whatever built-in vocabulary is missing, by key, and touches
      nothing else - safe on every boot and again before ticket 14's
      Replace import applies. */
  reconcileBuiltIns(): Promise<void>;
}

/* The default for callers with no file store: reads find nothing and
   writes are refused rather than silently dropped, so a photo can never
   look stored when nothing holds its bytes. Deleting still succeeds -
   removing a file that was never written is the state the caller wanted. */
const noFiles: PhotoFileStore = {
  write: async () => {
    throw new Error('no photo file store: openJournal() was called without one');
  },
  read: async () => null,
  remove: async () => {},
  list: async () => []
};

export function openJournal(driver: SqliteDriver, files: PhotoFileStore = noFiles): Journal {
  return {
    entries: makeEntriesArea(driver, files),
    tags: makeTagsArea(driver),
    dimensions: makeDimensionsArea(driver),
    milestones: makeMilestonesArea(driver, files),
    photos: makePhotosArea(driver, files),
    labs: makeLabsArea(driver),
    reminders: makeRemindersArea(driver),
    reconcileBuiltIns: () => reconcileBuiltIns(driver)
  };
}
