/* The archive area (ticket 13, PRD F14): everything the journal holds, in
   the shape an archive carries it (archive/payload.ts).

   Which areas travel and in what order they are inserted back is the
   registry's (archiveSections.ts, ADR-0027); the per-section reads are in
   archiveRead.ts. What is left here is the file manifest, which is this
   area's alone, and the four operations the app calls.

   The sections read rows themselves rather than calling the other areas'
   getters, for two reasons. Identity: every row travels by key or uuid, and
   the entries area addresses entries by the rowid that means nothing on
   another device (ADR-0002). Volume: the screens read a day or a list at a
   time and can afford a query per entry for its dimensions, tags and
   photos; an export reads every entry there has ever been, so each of those
   becomes one query for the whole journal.

   Photo bytes stay out of the snapshot. It names the files and how long
   each one is - which is what lets the chunk count be settled before
   anything is encrypted (ADR-0007) - and hands back a reader for one file
   at a time, so nothing ever holds the photo set at once.

   Ticket 14's Replace and Merge are the other half of this area, one
   journal operation each. They live in restore.ts, with the per-section
   writes in archiveApply.ts: the two halves share nothing but the wire
   format and the registry, and the ordering rule an import turns on
   (ADR-0011) is long enough to be worth reading on its own. */

import { filesOf } from '../photos/names';
import { restoreArchive, type RestoreContents } from './restore';
import {
  daylioPreview,
  type DaylioCommitResult,
  type DaylioNaming,
  type DaylioPreview
} from '../archive/daylio';
import type { ArchiveFile, ArchiveJournal } from '../archive/payload';
import type { SqliteDriver } from '../sqlite/driver';
import type { PhotoFileStore } from './journal';
import { readRowContext } from './archiveRead';
import { readArchiveJournal } from './archiveSections';

export interface ArchiveSnapshot {
  journal: ArchiveJournal;
  /** Every photo file the snapshot's rows name and the store actually
      holds, thumbnails included, in body order. */
  files: ArchiveFile[];
  /** The bytes of one file named in `files`. */
  readFile(name: string): Promise<Uint8Array>;
  /** Optional batched read. Results align with `names`; null means missing. */
  readFiles?(names: string[]): Promise<(Uint8Array | null)[]>;
}

export interface ArchiveArea {
  snapshot(): Promise<ArchiveSnapshot>;
  /** Parses and resolves a Daylio CSV without writing. Counts are net
      additions, so they are the counts commit reports (PRD F28). */
  previewDaylioImport(csv: string, naming: DaylioNaming): Promise<DaylioPreview>;
  /** Always Merge. An unmapped mood is refused before restore sees a row. */
  commitDaylioImport(preview: DaylioPreview): Promise<DaylioCommitResult>;
  /** Discards this device's journal and installs the archive's, keeping the
      built-in vocabulary by key and leaving preferences alone (ADR-0011).
      One operation: the order it happens in is not a caller's to compose. */
  replace(contents: RestoreContents): Promise<void>;
  /** Adds what this device does not have and leaves matched rows alone, so
      importing the same archive twice is a no-op the second time. */
  merge(contents: RestoreContents): Promise<void>;
}

export function makeArchiveArea(driver: SqliteDriver, files: PhotoFileStore): ArchiveArea {
  /** The manifest for a plain list of file names, minus whatever the store
      no longer holds. A missing file still travels as an absent row would
      - dropping it would delete a file that is only missing on this
      device from the archive too. */
  const manifestNames = async (names: string[]): Promise<ArchiveFile[]> => {
    if (names.length === 0) return [];

    if (files.sizeMany) {
      const lengths = await files.sizeMany(names);
      const manifested: ArchiveFile[] = [];
      for (let i = 0; i < names.length; i++) {
        const length = lengths[i];
        if (length !== null) manifested.push({ name: names[i], length });
      }
      return manifested;
    }

    const manifested: ArchiveFile[] = [];
    for (const name of names) {
      const length = await files.size(name);
      if (length !== null) manifested.push({ name, length });
    }
    return manifested;
  };

  /** The manifest for photo and hair-photo rows specifically: each names
      one full file, and filesOf() expands it to the derived thumbnail
      name beside it (names.ts) - a recording has no such pair
      (voiceRecordings/names.ts), so manifestNames() alone covers it. */
  const manifest = (fileOwners: { file_path: string }[]): Promise<ArchiveFile[]> =>
    manifestNames(fileOwners.flatMap((owner) => filesOf(owner.file_path)));

  const area: ArchiveArea = {
    replace: (contents) => restoreArchive(driver, files, 'replace', contents),
    merge: (contents) => restoreArchive(driver, files, 'merge', contents),

    async previewDaylioImport(csv, naming) {
      return daylioPreview(csv, (await area.snapshot()).journal, naming);
    },

    async commitDaylioImport(preview) {
      if (preview.unmappedMoodLabels.length > 0) {
        throw new Error(`Daylio mood ${preview.unmappedMoodLabels.join(', ')} is not mapped; nothing was imported`);
      }
      const before = await area.snapshot();
      await restoreArchive(driver, files, 'merge', {
        journal: preview.journal,
        files: (async function* () {})()
      });
      const after = await area.snapshot();
      return {
        entriesAdded: after.journal.entries.length - before.journal.entries.length,
        tagsAdded:
          after.journal.tagGroups.flatMap((group) => group.tags).length -
          before.journal.tagGroups.flatMap((group) => group.tags).length
      };
    },

    async snapshot() {
      // One read of the photo, hair photo and recording tables for the rows,
      // their owners and the manifest: several passes over the same lists,
      // never several queries (archiveRead.ts).
      const reading = await readRowContext(driver);

      const archivedFiles = [
        ...(await manifest([...reading.photos, ...reading.hairPhotos])),
        ...(await manifestNames(reading.recordings.map((r) => r.file_path)))
      ];

      return {
        journal: await readArchiveJournal(reading),
        files: archivedFiles,
        async readFile(name) {
          const bytes = await files.read(name);
          // The manifest is built from the store's own answers moments
          // earlier, so a file that has gone since is a real failure, not
          // a case to paper over: packing it as zero bytes would produce
          // an archive whose lengths no longer add up.
          if (!bytes) throw new Error(`photo file missing while exporting: ${name}`);
          return bytes;
        },
        async readFiles(names) {
          if (names.length === 0) return [];
          if (!files.readMany) {
            return Promise.all(names.map(async (name) => {
              const bytes = await files.read(name);
              return bytes ?? null;
            }));
          }
          return files.readMany(names);
        }
      };
    }
  };
  return area;
}
