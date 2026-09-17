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

import { thumbFileName } from '../photos/names';
import type { ImportCommit, OnRestoreProgress, RestoreContents, RestoreMode } from './restore';
import {
  daylioPreview,
  type DaylioCommitResult,
  type DaylioNaming,
  type DaylioPreview
} from '../archive/daylio';
import { daylioBackupPreview, type DaylioBackupPreview } from '../archive/daylioBackup';
import { dayonePreview, type DayOnePreview } from '../archive/dayone';
import { transTracksPreview, type TransTracksPreview } from '../archive/transtracks';
import { trackAndGraphPreview, type TrackAndGraphPreview } from '../archive/trackAndGraph';
import { pixelsPreview, type PixelsPreview } from '../archive/pixels';
import type { ArchiveFile, ArchiveImportLogRecord, ArchiveJournal } from '../archive/payload';
import type { SqliteDriver } from '../sqlite/driver';
import type { PhotoFileStore } from '../photos/photo-file-store';
import type { NormalizedPhoto } from './photos';
import { readImportLog, readRowContext } from './archiveRead';
import { readArchiveJournal } from './archiveSections';

interface TransTracksCommitResult {
  milestonesAdded: number;
  photosAdded: number;
}

interface DayOneCommitResult {
  entriesAdded: number;
  photosAdded: number;
}

interface TrackAndGraphCommitResult {
  measurementsAdded: number;
  typesAdded: number;
}

interface PixelsCommitResult {
  entriesAdded: number;
  tagsAdded: number;
}

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

/** What a committed backup import added. Every commit below reports its
    counts the same way - measured over the tables it writes, inside the
    transaction that writes them (restore.ts's `commitImport`, audit A1). */
interface DaylioBackupCommitResult {
  entriesAdded: number;
  milestonesAdded: number;
  tagsAdded: number;
  attachmentsAdded: number;
}

export interface ArchiveArea {
  snapshot(): Promise<ArchiveSnapshot>;
  /** Parses and resolves a Daylio CSV without writing. Counts are net
      additions, so they are the counts commit reports (PRD F28). */
  previewDaylioImport(csv: string, naming: DaylioNaming): Promise<DaylioPreview>;
  /** Always Merge. An unmapped mood is refused before restore sees a row.
      Writes one import_log record on success (ticket 03) - never on the
      unmapped-mood refusal above, which never reaches restore either. */
  commitDaylioImport(preview: DaylioPreview, onProgress?: OnRestoreProgress): Promise<DaylioCommitResult>;
  /** The same two steps for a `.daylio` backup rather than a CSV export
      (phase 7 ticket 09), which carries milestones, tag groups, custom
      scales, writing templates, photos and voice notes as well. */
  previewDaylioBackupImport(file: Uint8Array, naming: DaylioNaming): Promise<DaylioBackupPreview>;
  /** Always Merge. `normalize` is the photo pipeline (photos/normalize.ts),
      passed in rather than imported: it needs a canvas, and this seam is
      Node-tested. */
  commitDaylioBackupImport(
    preview: DaylioBackupPreview,
    normalize: (bytes: Uint8Array) => Promise<NormalizedPhoto>,
    onProgress?: OnRestoreProgress
  ): Promise<DaylioBackupCommitResult>;
  /** Parses and resolves a TransTracks `.ttbackup` zip without writing. */
  previewTransTracksImport(bytes: Uint8Array): Promise<TransTracksPreview>;
  /** Always Merge. `normalize` turns each raw photo the zip carried into
      stored JPEG bytes plus a thumbnail - normalizePhoto() needs a canvas
      and stays a caller's job, the same division photoPicking.ts already
      draws for every other photo-writing area (photos.ts's attach,
      hairProgress.ts, tryouts.ts, ...). Writes one import_log record on
      success (ticket 03), the same as commitDaylioImport. */
  commitTransTracksImport(
    preview: TransTracksPreview,
    normalize: (bytes: Uint8Array) => Promise<NormalizedPhoto>
  ): Promise<TransTracksCommitResult>;
  /** Parses and resolves a Day One JSON export (a zip) without writing. */
  previewDayOneImport(bytes: Uint8Array, naming: DaylioNaming): Promise<DayOnePreview>;
  /** Always Merge. `normalize` turns each raw photo the zip carried into
      stored JPEG bytes plus a thumbnail, the same division
      commitTransTracksImport draws and for the same reason. Writes one
      import_log record on success (ticket 03), the same as
      commitDaylioImport. */
  commitDayOneImport(
    preview: DayOnePreview,
    normalize: (bytes: Uint8Array) => Promise<NormalizedPhoto>
  ): Promise<DayOneCommitResult>;
  /** Parses and resolves a Track & Graph CSV export without writing. */
  previewTrackAndGraphImport(csv: string): Promise<TrackAndGraphPreview>;
  /** Always Merge. Writes one import_log record on success (ticket 03), the
      same as commitDaylioImport and commitTransTracksImport. */
  commitTrackAndGraphImport(preview: TrackAndGraphPreview): Promise<TrackAndGraphCommitResult>;
  /** Parses and resolves a Pixels backup JSON without writing. */
  previewPixelsImport(file: Uint8Array): Promise<PixelsPreview>;
  /** Always Merge. An unrecognised `type` is skipped by pixelsPreview and
      never blocks a commit. Writes one import_log record on success
      (ticket 03), the same as commitDaylioImport/commitTransTracksImport. */
  commitPixelsImport(preview: PixelsPreview): Promise<PixelsCommitResult>;
  /** The import history, most recent first, for the settings screen
      (ticket 03). Its own read rather than a slice of `snapshot()`: every
      other archive read costs the whole journal, and a settings screen
      asking "where did this come from" should not pay for it. */
  importLog(): Promise<ArchiveImportLogRecord[]>;
  /** Discards this device's journal and installs the archive's, keeping the
      built-in vocabulary by key and leaving preferences alone (ADR-0011).
      One operation: the order it happens in is not a caller's to compose. */
  replace(contents: RestoreContents, onProgress?: OnRestoreProgress): Promise<void>;
  /** Adds what this device does not have and leaves matched rows alone, so
      importing the same archive twice is a no-op the second time. */
  merge(contents: RestoreContents, onProgress?: OnRestoreProgress): Promise<void>;
}

/** restore.ts behind a dynamic import: it drags in pack.ts/codec.ts/
    payload.ts, an 82KB chunk that otherwise rides every eager path into this
    file (ticket 21's audit, ticket 27). One wrapper per entry point rather
    than repeating `await import('./restore')` at each of the eight call
    sites below - a dynamic import of the same specifier already resolves
    from the module loader's own cache, so there is nothing here worth
    memoizing by hand. */
async function restoreArchive(
  driver: SqliteDriver,
  files: PhotoFileStore,
  mode: RestoreMode,
  contents: RestoreContents,
  onProgress?: OnRestoreProgress
): Promise<void> {
  const restore = await import('./restore');
  return restore.restoreArchive(driver, files, mode, contents, onProgress);
}

/** The same wrapper for the other entry point: a Merge that measures what it
    added and writes the import history inside the same transaction (audit
    A1). Each commit below names the tables its own counts are measured over
    - the only place in this area that spells a SQL table, and deliberately
    so: these are the numbers the commit hands back, and a count of "entries"
    that named a section rather than a table would be one indirection away
    from the rows it is claiming to have written. */
async function commitImport(
  driver: SqliteDriver,
  files: PhotoFileStore,
  contents: RestoreContents,
  commit: ImportCommit,
  onProgress?: OnRestoreProgress
): Promise<Record<string, number>> {
  const restore = await import('./restore');
  return restore.commitImport(driver, files, contents, commit, onProgress);
}

/** No photos, for the sources whose file is rows all the way down: the
    restore is all rows and its progress is the section count alone. */
const noFiles = (): AsyncIterable<{ name: string; bytes: Uint8Array }> => (async function* () {})();

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

  const area: ArchiveArea = {
    replace: (contents, onProgress) => restoreArchive(driver, files, 'replace', contents, onProgress),
    merge: (contents, onProgress) => restoreArchive(driver, files, 'merge', contents, onProgress),

    async previewDaylioImport(csv, naming) {
      return daylioPreview(csv, (await area.snapshot()).journal, naming);
    },

    async commitDaylioImport(preview, onProgress) {
      if (preview.unmappedMoodLabels.length > 0) {
        throw new Error(`Daylio mood ${preview.unmappedMoodLabels.join(', ')} is not mapped; nothing was imported`);
      }
      // A CSV export carries no photos (daylio.ts).
      const added = await commitImport(
        driver,
        files,
        { journal: preview.journal, files: noFiles() },
        { source: 'daylio', counting: { entries: ['entry'], tags: ['tag'] } },
        onProgress
      );
      return { entriesAdded: added.entries, tagsAdded: added.tags };
    },

    async importLog() {
      // Copied before reversing rather than reversed in place: `toReversed`
      // is above the WebView floor (ADR-0023, ticket 55) and this is what
      // replaced it, so it has to keep the same promise not to touch what
      // it was handed - the read's array is its own today, and a reader
      // that started sharing one would be a bug nobody would look for here.
      return [...(await readImportLog(driver))].reverse();
    },

    async previewDaylioBackupImport(file, naming) {
      return daylioBackupPreview(file, (await area.snapshot()).journal, naming);
    },

    async commitDaylioBackupImport(preview, normalize, onProgress) {
      if (preview.unmappedMoodNames.length > 0) {
        throw new Error(
          `Daylio mood ${preview.unmappedMoodNames.join(', ')} has no scale position; nothing was imported`
        );
      }

      /* The photos are re-encoded on the way in rather than stored as
         Daylio held them: that is what strips their metadata, caps them at
         the stored edge and produces the thumbnail whose name every screen
         derives (photos/normalize.ts, photos/names.ts, ADR-0008). Files
         are written before any row is (restore.ts), so a photo this
         cannot decode fails the import with the journal untouched.

         One asset at a time, because the alternative is holding a
         journal's worth of decoded bitmaps at once. */
      const assetFiles = async function* () {
        for (const asset of preview.assets) {
          const bytes = await asset.read();
          if (asset.kind !== 'photo') {
            yield { name: asset.fileName, bytes };
            continue;
          }
          const normalized = await normalize(bytes);
          yield { name: asset.fileName, bytes: normalized.full };
          yield { name: thumbFileName(asset.fileName), bytes: normalized.thumb };
        }
      };

      /* Two files per photo and one per anything else, which is what the
         generator above yields and therefore what the restore will count
         (phase 9 audit ticket 11). Counted from the assets rather than
         from preview.photoCount, so the denominator cannot disagree with
         the numerator if either ever changes. */
      const fileCount = preview.assets.reduce((n, asset) => n + (asset.kind === 'photo' ? 2 : 1), 0);
      /* A preview somebody abandoned, and an import that threw on an
         undecodable photo, both leave no record: neither reaches the
         transaction the history row is written in (ticket 03, audit A1).
         An attachment is a photo row or a recording row, which is what
         "attachments" counts on the way back out. */
      const added = await commitImport(
        driver,
        files,
        { journal: preview.journal, files: assetFiles(), fileCount },
        {
          source: 'daylio-backup',
          counting: {
            entries: ['entry'],
            milestones: ['milestone'],
            tags: ['tag'],
            attachments: ['photo', 'voice_recording']
          }
        },
        onProgress
      );
      return {
        entriesAdded: added.entries,
        milestonesAdded: added.milestones,
        tagsAdded: added.tags,
        attachmentsAdded: added.attachments
      };
    },

    async previewTransTracksImport(bytes) {
      return transTracksPreview(bytes, (await area.snapshot()).journal);
    },

    async commitTransTracksImport(preview, normalize) {
      const added = await commitImport(
        driver,
        files,
        {
          journal: preview.journal,
          files: (async function* () {
            for (const [fileName, raw] of preview.rawPhotos) {
              const normalized = await normalize(raw);
              yield { name: fileName, bytes: normalized.full };
              yield { name: thumbFileName(fileName), bytes: normalized.thumb };
            }
          })()
        },
        { source: 'transtracks', counting: { milestones: ['milestone'], photos: ['photo'] } }
      );
      return { milestonesAdded: added.milestones, photosAdded: added.photos };
    },

    async previewDayOneImport(bytes, naming) {
      return dayonePreview(bytes, (await area.snapshot()).journal, naming);
    },

    async commitDayOneImport(preview, normalize) {
      const added = await commitImport(
        driver,
        files,
        {
          journal: preview.journal,
          files: (async function* () {
            for (const [fileName, raw] of preview.rawPhotos) {
              const normalized = await normalize(raw);
              yield { name: fileName, bytes: normalized.full };
              yield { name: thumbFileName(fileName), bytes: normalized.thumb };
            }
          })()
        },
        { source: 'dayone', counting: { entries: ['entry'], photos: ['photo'] } }
      );
      return { entriesAdded: added.entries, photosAdded: added.photos };
    },

    async previewTrackAndGraphImport(csv) {
      return trackAndGraphPreview(csv, (await area.snapshot()).journal);
    },

    async commitTrackAndGraphImport(preview) {
      const added = await commitImport(
        driver,
        files,
        { journal: preview.journal, files: noFiles() },
        { source: 'trackAndGraph', counting: { measurements: ['measurement'], types: ['measurement_type'] } }
      );
      return { measurementsAdded: added.measurements, typesAdded: added.types };
    },

    async previewPixelsImport(file) {
      return pixelsPreview(file, (await area.snapshot()).journal);
    },

    async commitPixelsImport(preview) {
      const added = await commitImport(
        driver,
        files,
        { journal: preview.journal, files: noFiles() },
        { source: 'pixels', counting: { entries: ['entry'], tags: ['tag'] } }
      );
      return { entriesAdded: added.entries, tagsAdded: added.tags };
    },

    async snapshot() {
      const reading = await readRowContext(driver);
      const archivedFiles = await manifestNames(reading.fileNames);

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
