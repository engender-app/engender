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

import { filesOf, thumbFileName } from '../photos/names';
import { documentFilesOf } from './documents';
import type { RestoreContents, RestoreMode } from './restore';
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
import { IMPORT_LOG_COLUMNS, importLogRow } from './archiveApply';
import { mintUuid, now } from './support';

export interface TransTracksCommitResult {
  milestonesAdded: number;
  photosAdded: number;
}

export interface DayOneCommitResult {
  entriesAdded: number;
  photosAdded: number;
}

export interface TrackAndGraphCommitResult {
  measurementsAdded: number;
  typesAdded: number;
}

export interface PixelsCommitResult {
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

/** What a committed backup import added, taken from the preview rather
    than measured again afterwards: the preview is defined as the exact
    work a commit performs, and re-reading the whole journal twice to
    subtract seven numbers would be a second answer to a question that
    already has one. */
export interface DaylioBackupCommitResult {
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
  commitDaylioImport(preview: DaylioPreview): Promise<DaylioCommitResult>;
  /** The same two steps for a `.daylio` backup rather than a CSV export
      (phase 7 ticket 09), which carries milestones, tag groups, custom
      scales, writing templates, photos and voice notes as well. */
  previewDaylioBackupImport(file: Uint8Array, naming: DaylioNaming): Promise<DaylioBackupPreview>;
  /** Always Merge. `normalize` is the photo pipeline (photos/normalize.ts),
      passed in rather than imported: it needs a canvas, and this seam is
      Node-tested. */
  commitDaylioBackupImport(
    preview: DaylioBackupPreview,
    normalize: (bytes: Uint8Array) => Promise<NormalizedPhoto>
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
  replace(contents: RestoreContents): Promise<void>;
  /** Adds what this device does not have and leaves matched rows alone, so
      importing the same archive twice is a no-op the second time. */
  merge(contents: RestoreContents): Promise<void>;
}

/** restore.ts behind a dynamic import: it drags in pack.ts/codec.ts/
    payload.ts, an 82KB chunk that otherwise rides every eager path into this
    file (ticket 21's audit, ticket 27). One wrapper rather than repeating
    `await import('./restore')` at each of the eight call sites below - a
    dynamic import of the same specifier already resolves from the module
    loader's own cache, so there is nothing here worth memoizing by hand. */
async function restoreArchive(
  driver: SqliteDriver,
  files: PhotoFileStore,
  mode: RestoreMode,
  contents: RestoreContents
): Promise<void> {
  const restore = await import('./restore');
  return restore.restoreArchive(driver, files, mode, contents);
}

/** One import_log row, direct rather than through the ordinary merge: this
    record is not content a device might already have and skip (ADR-0002's
    own insert-if-absent shape) - it is a new fact every time, minted here
    the way any other user-owned row is (ticket 03). */
async function recordImport(driver: SqliteDriver, source: string, counts: Record<string, number>): Promise<void> {
  const ts = now();
  await driver.run(
    `INSERT INTO import_log (${IMPORT_LOG_COLUMNS}) VALUES (?, ?, ?, ?, ?)`,
    importLogRow({ id: mintUuid(), source, counts, importedAt: ts }, ts)
  );
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
      const result = {
        entriesAdded: after.journal.entries.length - before.journal.entries.length,
        tagsAdded:
          after.journal.tagGroups.flatMap((group) => group.tags).length -
          before.journal.tagGroups.flatMap((group) => group.tags).length
      };
      await recordImport(driver, 'daylio', { entries: result.entriesAdded, tags: result.tagsAdded });
      return result;
    },

    async importLog() {
      return (await readImportLog(driver)).toReversed();
    },

    async previewDaylioBackupImport(file, naming) {
      return daylioBackupPreview(file, (await area.snapshot()).journal, naming);
    },

    async commitDaylioBackupImport(preview, normalize) {
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

      await restoreArchive(driver, files, 'merge', { journal: preview.journal, files: assetFiles() });
      /* The source name is the registry's own (archive/sources.ts), so the
         log names what read the file rather than a second spelling of it.
         Written after restore and never before: a preview somebody
         abandoned, and an import that threw on an undecodable photo, both
         leave no record because neither reached here (ticket 03). */
      await recordImport(driver, 'daylio-backup', {
        entries: preview.entryCount,
        milestones: preview.milestoneCount,
        tags: preview.newTagCount,
        attachments: preview.photoCount + preview.audioCount
      });
      return {
        entriesAdded: preview.entryCount,
        milestonesAdded: preview.milestoneCount,
        tagsAdded: preview.newTagCount,
        attachmentsAdded: preview.photoCount + preview.audioCount
      };
    },

    async previewTransTracksImport(bytes) {
      return transTracksPreview(bytes, (await area.snapshot()).journal);
    },

    async commitTransTracksImport(preview, normalize) {
      const before = await area.snapshot();
      await restoreArchive(driver, files, 'merge', {
        journal: preview.journal,
        files: (async function* () {
          for (const [fileName, raw] of preview.rawPhotos) {
            const normalized = await normalize(raw);
            yield { name: fileName, bytes: normalized.full };
            yield { name: thumbFileName(fileName), bytes: normalized.thumb };
          }
        })()
      });
      const after = await area.snapshot();
      const result = {
        milestonesAdded: after.journal.milestones.length - before.journal.milestones.length,
        // Every TransTracks photo becomes exactly one synthetic entry
        // (transtracks.ts), so diffing entries is diffing photos here.
        photosAdded: after.journal.entries.length - before.journal.entries.length
      };
      await recordImport(driver, 'transtracks', { milestones: result.milestonesAdded, photos: result.photosAdded });
      return result;
    },

    async previewDayOneImport(bytes, naming) {
      return dayonePreview(bytes, (await area.snapshot()).journal, naming);
    },

    async commitDayOneImport(preview, normalize) {
      const photosOf = (journal: ArchiveJournal) => journal.entries.reduce((n, e) => n + e.photos.length, 0);
      const before = await area.snapshot();
      await restoreArchive(driver, files, 'merge', {
        journal: preview.journal,
        files: (async function* () {
          for (const [fileName, raw] of preview.rawPhotos) {
            const normalized = await normalize(raw);
            yield { name: fileName, bytes: normalized.full };
            yield { name: thumbFileName(fileName), bytes: normalized.thumb };
          }
        })()
      });
      const after = await area.snapshot();
      const result = {
        entriesAdded: after.journal.entries.length - before.journal.entries.length,
        photosAdded: photosOf(after.journal) - photosOf(before.journal)
      };
      await recordImport(driver, 'dayone', { entries: result.entriesAdded, photos: result.photosAdded });
      return result;
    },

    async previewTrackAndGraphImport(csv) {
      return trackAndGraphPreview(csv, (await area.snapshot()).journal);
    },

    async commitTrackAndGraphImport(preview) {
      const before = await area.snapshot();
      await restoreArchive(driver, files, 'merge', {
        journal: preview.journal,
        files: (async function* () {})()
      });
      const after = await area.snapshot();
      const result = {
        measurementsAdded: after.journal.measurements.length - before.journal.measurements.length,
        typesAdded: after.journal.measurementTypes.length - before.journal.measurementTypes.length
      };
      await recordImport(driver, 'trackAndGraph', { measurements: result.measurementsAdded, types: result.typesAdded });
      return result;
    },

    async previewPixelsImport(file) {
      return pixelsPreview(file, (await area.snapshot()).journal);
    },

    async commitPixelsImport(preview) {
      const before = await area.snapshot();
      await restoreArchive(driver, files, 'merge', {
        journal: preview.journal,
        files: (async function* () {})()
      });
      const after = await area.snapshot();
      const result = {
        entriesAdded: after.journal.entries.length - before.journal.entries.length,
        tagsAdded:
          after.journal.tagGroups.flatMap((group) => group.tags).length -
          before.journal.tagGroups.flatMap((group) => group.tags).length
      };
      await recordImport(driver, 'pixels', { entries: result.entriesAdded, tags: result.tagsAdded });
      return result;
    },

    async snapshot() {
      // One read of the photo, hair photo, hair-removal photo, recovery
      // photo, tryout photo, recording, video-note, benchmark and document
      // tables for the rows,
      // their owners and the manifest: several passes over the same
      // lists, never several queries (archiveRead.ts).
      const reading = await readRowContext(driver);

      const archivedFiles = [
        ...(await manifest([
          ...reading.photos,
          ...reading.hairPhotos,
          ...reading.hairRemovalPhotos,
          ...reading.procedurePhotos,
          ...reading.tryoutPhotos
        ])),
        /* A document's own manifestNames() call rather than folded into
           `manifest()` above: every other owner there is an image and
           `filesOf` is always right for it, but a document can be a PDF
           with no derived thumbnail (phase 8 features ticket 53) -
           `documentFilesOf` is what tells the two kinds apart. Without
           this a document travels as a row with no bytes and restores
           into a broken reference (phase 8 features ticket 52). */
        ...(await manifestNames(reading.documentFiles.flatMap((d) => documentFilesOf(d.file_path)))),
        ...(await manifestNames(reading.recordings.map((r) => r.file_path))),
        ...(await manifestNames(reading.videos.map((v) => v.file_path))),
        // Two per benchmark, one where the vowel step was skipped (ticket 15).
        ...(await manifestNames(
          reading.benchmarkFiles.flatMap((b) =>
            b.vowel_file_path ? [b.passage_file_path, b.vowel_file_path] : [b.passage_file_path]
          )
        ))
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
