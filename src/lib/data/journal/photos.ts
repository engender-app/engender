/* Use one table and path for entry and milestone photos (ADR-0008).
   On attach write both files, then insert the row. On removal delete
   the row, then its files. A crash can leave an orphan that
   sweepOrphanPhotos() reclaims, while referenced files remain available
   (ADR-0011). Entry and milestone deletion share removeFilesOf(). */

import type { SqliteDriver } from '../sqlite/driver';
import { unownedNames } from './fileOwnership';
import { afterCommit } from '../sqlite/transactor';
import type { Photo } from '../types';
import { filesOf, photoFileName } from '../photos/names';
import { watchJournalWrites } from '../journal-busy';
import type { PhotoFileStore } from '../photos/photo-file-store';
import { readCleanupFileNames } from './fileOwnership';
import { markOrphanSweepComplete, markOrphanSweepDue, orphanSweepRequestVersion } from '../sqlite/orphan-sweep-schedule';
import { assertChanged, bool, mintUuid, now } from './support';

/** A photo that has been through normalize() (ADR-0008/0015): JPEG bytes,
    resized, metadata stripped, with its thumbnail. The journal stores what
    it is handed and never re-encodes - normalizing needs a canvas, which
    the Node tier does not have. */
export interface NormalizedPhoto {
  full: Uint8Array;
  thumb: Uint8Array;
  /** The day this photo shows on, when it differs from whatever its owner (entry or
      milestone) is dated to (ADR-0008/0015). Every photo this app normalizes has already
      had its capture date stripped, so a picked file never carries one to read - this is
      where the add-photo flow's day prompt puts what the person typed. Undefined or null
      leaves the day inherited, exactly as before this column existed (ADR-0010: nothing
      here is derived, and nothing derives from it beyond the read queries below). */
  epochDayOverride?: number | null;
}

/** Exactly one owner, mirroring the photo table's CHECK constraint. An
    entry is addressed by its rowid and a milestone by its uuid, which is
    what each area already speaks (ADR-0002). */
type PhotoOwner = { entryId: number; milestoneId?: never } | { milestoneId: string; entryId?: never };

/** A photo placed in time, for the Progress screen (PRD F27). The date comes
    from whichever owner the row hangs off, and `milestoneName` is that
    owner's name when it was a milestone - the one thing that screen shows
    beyond the picture and the date. */
export interface DatedPhoto extends Photo {
  epochDay: number;
  milestoneName: string | null;
}

export interface PhotosArea {
  /** Returns the photo's uuid. Throws if the owner is unknown, before
      anything is written. */
  attach(owner: PhotoOwner, photo: NormalizedPhoto): Promise<string>;
  /** Idempotent, like the journal's other deletes. */
  remove(id: string): Promise<void>;
  /** Every photo in the journal, oldest first, entry and milestone alike.
      One query rather than a union assembled above the seam: both owners are
      rows in this one table (ADR-0008). */
  inJournal(): Promise<DatedPhoto[]>;
  /** Throws on an unknown id, the same way remove() does not but a toggle
      of curation metadata should: a typo'd id and a successful toggle must
      not look alike. */
  setStarred(id: string, starred: boolean): Promise<void>;
  /** Sets or clears which day this photo shows on (ADR-0008/ 0015): null reverts it to
      whatever its owning entry or milestone is dated to. Throws on an unknown id, the same
      reason setStarred does. */
  setEpochDayOverride(id: string, epochDay: number | null): Promise<void>;
}

type PhotoRow = { uuid: string; file_path: string; starred: number };

export type StagedPhoto = { id: string; fileName: string };
type PhotoColumns = { entryId: number | null; milestoneId: number | null };

const toPhoto = (row: PhotoRow): Photo => ({ id: row.uuid, fileName: row.file_path, starred: bool(row.starred) });

/** Deletes every file the given photo rows owned, thumbnails included.
    Called after the rows are gone, by all three paths that delete photo
    rows - a failure here must not resurrect them, and what it leaves
    behind is the sweep's to reclaim. */
async function removePhotoFiles(files: PhotoFileStore, names: string[]): Promise<void> {
  for (const name of names) await files.remove(name);
}

/** The files of these photo rows that no committed row still names. Read inside the
    deleting transaction, after the rows are gone, so a file two rows share outlives the
    first delete. */
const unownedPhotoFiles = (driver: SqliteDriver, rows: { file_path: string }[]) =>
  unownedNames(driver, rows.flatMap((row) => filesOf(row.file_path)));

export async function removeFilesOf(driver: SqliteDriver, files: PhotoFileStore, rows: { file_path: string }[]): Promise<void> {
  const names = await unownedPhotoFiles(driver, rows);
  await afterCommit(driver, () => removePhotoFiles(files, names), markOrphanSweepDue);
}

/** Best-effort cleanup after an owner save has committed. The rows are
    already gone, so reporting a file-store failure would make a completed
    save look unsuccessful. The boot orphan sweep will retry the leftovers. */
export async function removeFilesAfterCommit(
  driver: SqliteDriver,
  files: PhotoFileStore,
  rows: { file_path: string }[]
): Promise<void> {
  const names = await unownedPhotoFiles(driver, rows);
  await afterCommit(driver, async () => {
    try {
      await removePhotoFiles(files, names);
    } catch {
      markOrphanSweepDue();
    }
  });
}

/** Photo rows by entry, oldest first within each entry - one query for a
    whole page rather than one per row, the same rule photosByMilestone
    follows below and for the same reason. Entries with no photos are absent
    from the map rather than present and empty; the caller supplies the empty
    list. */
export async function photosByEntry(
  driver: SqliteDriver,
  entryIds: number[]
): Promise<Map<number, Photo[]>> {
  const byEntry = new Map<number, Photo[]>();
  if (entryIds.length === 0) return byEntry;
  const rows = await driver.query<PhotoRow & { entry_id: number }>(
    `SELECT entry_id, uuid, file_path, starred FROM photo
     WHERE entry_id IN (${entryIds.map(() => '?').join(', ')})
     ORDER BY order_index, id`,
    entryIds
  );
  for (const row of rows) {
    const photos = byEntry.get(row.entry_id);
    if (photos) photos.push(toPhoto(row));
    else byEntry.set(row.entry_id, [toPhoto(row)]);
  }
  return byEntry;
}

/** Every milestone's photo, by milestone rowid - one query for the whole
    list, so rendering the milestones screen does not cost a round trip per
    row. A milestone shows one photo; a second row for the same milestone
    would be a bug elsewhere, and the earliest wins rather than throwing.

    `milestoneIds` narrows it to the rows a caller actually holds, the same
    shape `photosByEntry` above already takes and for a reason that only
    appeared with a second caller: the day view
    reads the milestones dated to one day, and the whole-table read would
    grow with the journal on every day anyone opened. Omitted, it is every
    milestone, which is what the milestones screen wants. */
export async function photosByMilestone(
  driver: SqliteDriver,
  milestoneIds?: number[]
): Promise<Map<number, Photo>> {
  if (milestoneIds?.length === 0) return new Map();
  const rows = await driver.query<PhotoRow & { milestone_id: number }>(
    milestoneIds
      ? `SELECT milestone_id, uuid, file_path, starred FROM photo
         WHERE milestone_id IN (${milestoneIds.map(() => '?').join(', ')})
         ORDER BY order_index, id`
      : 'SELECT milestone_id, uuid, file_path, starred FROM photo WHERE milestone_id IS NOT NULL ORDER BY order_index, id',
    milestoneIds
  );
  const byMilestone = new Map<number, Photo>();
  for (const row of rows) if (!byMilestone.has(row.milestone_id)) byMilestone.set(row.milestone_id, toPhoto(row));
  return byMilestone;
}

/* Reclaim media files that no owner references after restore or a due
   housekeeping pass (ADR-0008). Read live ownership, including derived
   thumbnails and optional benchmark recordings. Limit the scan to the
   media directory, since the database also lives in OPFS.

   A concurrent write could put bytes in the store before this scan sees
   their row. watchJournalWrites stops the pass when a write begins. Defer
   remaining files until the next pass. */
export async function sweepOrphanPhotos(driver: SqliteDriver, files: PhotoFileStore): Promise<void> {
  const writes = watchJournalWrites();
  const startedAt = orphanSweepRequestVersion();
  try {
    if (await sweepUnreferencedFiles(driver, files, writes.sawWrite)) {
      markOrphanSweepComplete(Date.now(), undefined, startedAt);
    }
  } finally {
    writes.stop();
  }
}

async function sweepUnreferencedFiles(
  driver: SqliteDriver,
  files: PhotoFileStore,
  sawWrite: () => boolean
): Promise<boolean> {
  if (sawWrite()) return false;
  const referenced = new Set(await readCleanupFileNames(driver));
  for (const name of await files.list()) {
    // Asked per file rather than once: a write that starts halfway through
    // must not have the rest of the listing deleted out from under it.
    if (sawWrite()) return false;
    if (!referenced.has(name)) await files.remove(name);
  }
  return !sawWrite();
}

/* Both owner columns, resolved before anything is written: an unknown
   milestone has to fail without leaving two files behind for the sweep to
   clean up after it. */
async function columnsFor(
  driver: SqliteDriver,
  owner: PhotoOwner
): Promise<PhotoColumns> {
  if (owner.entryId != null) {
    const rows = await driver.query<{ id: number }>('SELECT id FROM entry WHERE id = ?', [owner.entryId]);
    if (rows.length === 0) throw new Error(`unknown entry: ${owner.entryId}`);
    return { entryId: rows[0].id, milestoneId: null };
  }
  const rows = await driver.query<{ id: number }>('SELECT id FROM milestone WHERE uuid = ?', [owner.milestoneId]);
  if (rows.length === 0) throw new Error(`unknown milestone: ${owner.milestoneId}`);
  return { entryId: null, milestoneId: rows[0].id };
}

async function nextOrderIndex(
  driver: SqliteDriver,
  columns: PhotoColumns
): Promise<number> {
  const rows = await driver.query<{ next: number }>(
    `SELECT COALESCE(MAX(order_index) + 1, 0) AS next FROM photo
     WHERE ${columns.entryId != null ? 'entry_id = ?' : 'milestone_id = ?'}`,
    [columns.entryId ?? columns.milestoneId]
  );
  return rows[0].next;
}

/** Stores one photo against one owner, and returns its uuid. A function
    rather than only a method on the area, because saving an entry attaches
    the photos picked in the same edit (entries.ts) and there must not be a
    second implementation of the file-before-row order for it to drift from. */
export async function stagePhoto(
  files: PhotoFileStore,
  photo: NormalizedPhoto
): Promise<StagedPhoto> {
  const uuid = mintUuid();
  const fileName = photoFileName(uuid);
  const [full, thumb] = filesOf(fileName);

  // Files first (see the header): the row must never name a file that has not
  // landed. A failure here leaves at most one loose file.
  await files.write(full, photo.full);
  await files.write(thumb, photo.thumb);

  return { id: uuid, fileName };
}

export async function insertStagedPhoto(
  driver: SqliteDriver,
  columns: PhotoColumns,
  photo: StagedPhoto,
  epochDayOverride: number | null = null
): Promise<string> {
  const orderIndex = await nextOrderIndex(driver, columns);
  await driver.run(
    `INSERT INTO photo (uuid, entry_id, milestone_id, file_path, order_index, epoch_day_override, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [photo.id, columns.entryId, columns.milestoneId, photo.fileName, orderIndex, epochDayOverride, now()]
  );
  return photo.id;
}

async function attachPhoto(
  driver: SqliteDriver,
  files: PhotoFileStore,
  owner: PhotoOwner,
  photo: NormalizedPhoto
): Promise<string> {
  const columns = await columnsFor(driver, owner);
  const staged = await stagePhoto(files, photo);
  return insertStagedPhoto(driver, columns, staged, photo.epochDayOverride ?? null);
}

export function makePhotosArea(driver: SqliteDriver, files: PhotoFileStore): PhotosArea {
  return {
    attach: (owner, photo) => attachPhoto(driver, files, owner, photo),

    async remove(id) {
      const removeRows = async (driver: SqliteDriver) => {
        const rows = await driver.query<{ file_path: string }>('SELECT file_path FROM photo WHERE uuid = ?', [id]);
        await driver.run('DELETE FROM photo WHERE uuid = ?', [id]);
        return rows;
      };
      const rows = driver.deferUntilCommit ? await removeRows(driver) : await driver.transaction(removeRows);
      await removeFilesOf(driver, files, rows);
    },

    async inJournal() {
      /* Two left joins rather than two queries: exactly one of the owner
         columns is set (the table's CHECK), so COALESCE picks whichever day
         applies and the other side contributes nothing. A trashed entry's
         photo is excluded the same way every other entry-owned read is;
         a milestone's has no such state to check. */
      const rows = await driver.query<PhotoRow & { epoch_day: number; milestone_name: string | null }>(
        `SELECT p.uuid, p.file_path, p.starred,
                COALESCE(p.epoch_day_override, e.epoch_day, m.epoch_day) AS epoch_day,
                m.name AS milestone_name
         FROM photo p
         LEFT JOIN entry e ON e.id = p.entry_id
         LEFT JOIN milestone m ON m.id = p.milestone_id
         WHERE p.entry_id IS NULL OR e.trashed_at IS NULL
         ORDER BY epoch_day, p.order_index, p.id`
      );
      return rows.map((row) => ({
        ...toPhoto(row),
        epochDay: row.epoch_day,
        milestoneName: row.milestone_name
      }));
    },

    async setStarred(id, starred) {
      const result = await driver.run('UPDATE photo SET starred = ?, updated_at = ? WHERE uuid = ?', [
        starred ? 1 : 0,
        now(),
        id
      ]);
      assertChanged(result, `photo: ${id}`);
    },

    async setEpochDayOverride(id, epochDay) {
      const result = await driver.run('UPDATE photo SET epoch_day_override = ?, updated_at = ? WHERE uuid = ?', [
        epochDay,
        now(),
        id
      ]);
      assertChanged(result, `photo: ${id}`);
    }
  };
}
