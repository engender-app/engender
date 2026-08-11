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
import { makeRemindersArea, type RemindersArea } from './reminders';
import { makeTagsArea, type TagsArea } from './tags';
import { reconcileBuiltIns } from './reconcile';

/** Where photo files live (ticket 11 provides the real one). The journal
    owns the rows; whoever owns the bytes hands this in so deleting an
    entry or milestone can take its files along. */
export interface PhotoFileStore {
  remove(filePath: string): Promise<void>;
}

export interface Journal {
  entries: EntriesArea;
  tags: TagsArea;
  dimensions: DimensionsArea;
  milestones: MilestonesArea;
  labs: LabsArea;
  reminders: RemindersArea;
  /** Adds whatever built-in vocabulary is missing, by key, and touches
      nothing else - safe on every boot and again before ticket 14's
      Replace import applies. */
  reconcileBuiltIns(): Promise<void>;
}

const noFiles: PhotoFileStore = { remove: async () => {} };

export function openJournal(driver: SqliteDriver, files: PhotoFileStore = noFiles): Journal {
  return {
    entries: makeEntriesArea(driver, files),
    tags: makeTagsArea(driver),
    dimensions: makeDimensionsArea(driver),
    milestones: makeMilestonesArea(driver, files),
    labs: makeLabsArea(driver),
    reminders: makeRemindersArea(driver),
    reconcileBuiltIns: () => reconcileBuiltIns(driver)
  };
}
