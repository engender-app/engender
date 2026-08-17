/* The journal (ADR-0017, CONTEXT: "Journal"): everything this device holds
   about the user's transition, reached through one handle bound to a
   database driver. A factory takes a SqliteDriver and a photo file store
   and composes nine area modules behind that handle. The interface is
   uniformly async and free of Svelte runes, so the whole thing runs under
   the Node tier's real SQLite; it mints every row's identity itself
   (ADR-0002), so no screen ever needs a Date.now() scheme again.

   One thin app-level module constructs the instance at boot
   (stores/boot.svelte.ts); tests construct their own over
   test-support's node:sqlite driver. */

import type { SqliteDriver } from '../sqlite/driver';
import { makeArchiveArea, type ArchiveArea } from './archive';
import { makeDimensionsArea, type DimensionsArea } from './dimensions';
import { makeEntriesArea, type EntriesArea } from './entries';
import { makeLabsArea, type LabsArea } from './labs';
import { makeMeasurementsArea, type MeasurementsArea } from './measurements';
import { makeMilestonesArea, type MilestonesArea } from './milestones';
import { makePhotosArea, type PhotosArea } from './photos';
import { makeRemindersArea, type RemindersArea } from './reminders';
import { makeStatsArea, type StatsArea } from './stats';
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
  /** Optional batched read. Results align with `names`; null means missing. */
  readMany?(names: string[]): Promise<(Uint8Array | null)[]>;
  /** How many bytes the file holds, or null if it is not there. An
      archive's chunk count has to be settled before its first chunk is
      encrypted (ADR-0007), so packing needs every photo's length up front
      - and reading each photo twice to find out is the thing the format
      exists to avoid. */
  size(name: string): Promise<number | null>;
  /** Optional batched size. Results align with `names`; null means missing. */
  sizeMany?(names: string[]): Promise<(number | null)[]>;
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
  measurements: MeasurementsArea;
  reminders: RemindersArea;
  /** Read-only aggregates over everything above (ADR-0012). Nothing here
      is stored; a stat is recomputed whenever it is asked for. */
  stats: StatsArea;
  /** Everything above at once, in the shape an export carries it
      (ADR-0007), and one archive read back in - Replace or Merge, each a
      single operation whose order of writes is nobody else's business
      (ADR-0011). */
  archive: ArchiveArea;
  /** Adds whatever built-in vocabulary is missing, by key, and touches
      nothing else - safe on every boot and again before ticket 14's
      Replace import applies. */
  reconcileBuiltIns(): Promise<void>;
}

export function openJournal(driver: SqliteDriver, files: PhotoFileStore): Journal {
  return {
    entries: makeEntriesArea(driver, files),
    tags: makeTagsArea(driver),
    dimensions: makeDimensionsArea(driver),
    milestones: makeMilestonesArea(driver, files),
    photos: makePhotosArea(driver, files),
    labs: makeLabsArea(driver),
    measurements: makeMeasurementsArea(driver),
    reminders: makeRemindersArea(driver),
    stats: makeStatsArea(driver),
    archive: makeArchiveArea(driver, files),
    reconcileBuiltIns: () => reconcileBuiltIns(driver)
  };
}
