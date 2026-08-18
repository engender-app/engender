/* The photos area (PRD F5/F27, ADR-0008). One table and one code path for
   both owners: an entry's photos and a milestone's photo differ only in
   which column the row hangs off, so there is no second implementation for
   milestones to drift from this one.

   Order is the rule that carries this module. Files land before the row
   that names them, and the row goes before the files are forgotten:

     attach  - write both files, then insert the row.
     remove  - delete the row, then delete the files.

   Either way a crash in the gap leaves a file no row references, never a
   row pointing at a file that is not there. The first is reclaimed by
   sweepOrphanPhotos() below; the second would be a photo the user can see
   in the list and never open. That asymmetry is ADR-0011's rule - import
   writes files first and never deletes - applied to the ordinary path.

   deleteEntry and deleteMilestone follow the same order for the rows they
   own, and hand their file paths to removeFilesOf() here so the rule about
   what a photo's files are lives in one place. */

import type { SqliteDriver } from '../sqlite/driver';
import type { Photo } from '../types';
import { filesOf, photoFileName } from '../photos/names';
import type { PhotoFileStore } from './journal';
import { mintUuid, now } from './support';

/** A photo that has been through normalize() (ADR-0008/0015): JPEG bytes,
    resized, metadata stripped, with its thumbnail. The journal stores what
    it is handed and never re-encodes - normalizing needs a canvas, which
    the Node tier does not have. */
export interface NormalizedPhoto {
  full: Uint8Array;
  thumb: Uint8Array;
}

/** Exactly one owner, mirroring the photo table's CHECK constraint. An
    entry is addressed by its rowid and a milestone by its uuid, which is
    what each area already speaks (ADR-0002). */
export type PhotoOwner = { entryId: number; milestoneId?: never } | { milestoneId: string; entryId?: never };

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
}

type PhotoRow = { uuid: string; file_path: string };

export type StagedPhoto = { id: string; fileName: string };
export type PhotoColumns = { entryId: number | null; milestoneId: number | null };

const toPhoto = (row: PhotoRow): Photo => ({ id: row.uuid, fileName: row.file_path });

/** Deletes every file the given photo rows owned, thumbnails included.
    Called after the rows are gone, by all three paths that delete photo
    rows - a failure here must not resurrect them, and what it leaves
    behind is the sweep's to reclaim. */
export async function removeFilesOf(
  files: PhotoFileStore,
  rows: { file_path: string }[]
): Promise<void> {
  for (const row of rows) for (const name of filesOf(row.file_path)) await files.remove(name);
}

/** Best-effort cleanup after an owner save has committed. The rows are
    already gone, so reporting a file-store failure would make a completed
    save look unsuccessful. The boot orphan sweep will retry the leftovers. */
export async function removeFilesAfterCommit(
  files: PhotoFileStore,
  rows: { file_path: string }[]
): Promise<void> {
  try {
    await removeFilesOf(files, rows);
  } catch {
    // A committed save stays successful; sweepOrphanPhotos() owns retries.
  }
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
    `SELECT entry_id, uuid, file_path FROM photo
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
    would be a bug elsewhere, and the earliest wins rather than throwing. */
export async function photosByMilestone(driver: SqliteDriver): Promise<Map<number, Photo>> {
  const rows = await driver.query<PhotoRow & { milestone_id: number }>(
    'SELECT milestone_id, uuid, file_path FROM photo WHERE milestone_id IS NOT NULL ORDER BY order_index, id'
  );
  const byMilestone = new Map<number, Photo>();
  for (const row of rows) if (!byMilestone.has(row.milestone_id)) byMilestone.set(row.milestone_id, toPhoto(row));
  return byMilestone;
}

/* Deletes every file in the store that no photo row references, on boot,
   after the database opens (ADR-0008). This is the other half of the
   ordering rule at the top of this file: attach, remove, deleteEntry and
   ticket 14's import are all free to leave a loose file behind, because
   this reclaims it on the next start. It is the only code that deletes a
   file nobody asked to delete, which is why it reads the rows itself
   rather than trusting a caller's list.

   A row names only its full photo; the thumbnail's name is derived
   (names.ts), so both sides of the comparison have to be expanded or
   every thumbnail would look like an orphan.

   It is also why the store's root is a directory of its own and never the
   OPFS root: the database file lives in OPFS too, and no row references
   it.

   Reads `hair_photo` (migrations.ts v13) as well as `photo`: a hair-progress
   photo's row lives in its own table (journal/hairProgress.ts), not as a
   third owner here, but its files sit in the same store and would otherwise
   look orphaned the moment this ran.

   Precondition: nothing may attach a photo while this runs. It reads the
   rows and then lists the files, so a photo whose files landed after the
   read but whose row landed before the list would look like an orphan.
   Boot is the only caller and runs before any screen can write. */
export async function sweepOrphanPhotos(driver: SqliteDriver, files: PhotoFileStore): Promise<void> {
  const [photoRows, hairPhotoRows] = await Promise.all([
    driver.query<{ file_path: string }>('SELECT file_path FROM photo'),
    driver.query<{ file_path: string }>('SELECT file_path FROM hair_photo')
  ]);
  const referenced = new Set([...photoRows, ...hairPhotoRows].flatMap((row) => filesOf(row.file_path)));
  for (const name of await files.list()) {
    if (!referenced.has(name)) await files.remove(name);
  }
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
  photo: StagedPhoto
): Promise<string> {
  const orderIndex = await nextOrderIndex(driver, columns);
  await driver.run(
    `INSERT INTO photo (uuid, entry_id, milestone_id, file_path, order_index, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [photo.id, columns.entryId, columns.milestoneId, photo.fileName, orderIndex, now()]
  );
  return photo.id;
}

export async function attachPhoto(
  driver: SqliteDriver,
  files: PhotoFileStore,
  owner: PhotoOwner,
  photo: NormalizedPhoto
): Promise<string> {
  const columns = await columnsFor(driver, owner);
  const staged = await stagePhoto(files, photo);
  return insertStagedPhoto(driver, columns, staged);
}

export function makePhotosArea(driver: SqliteDriver, files: PhotoFileStore): PhotosArea {
  return {
    attach: (owner, photo) => attachPhoto(driver, files, owner, photo),

    async remove(id) {
      const rows = await driver.query<{ file_path: string }>('SELECT file_path FROM photo WHERE uuid = ?', [id]);
      await driver.run('DELETE FROM photo WHERE uuid = ?', [id]);
      await removeFilesOf(files, rows);
    },

    async inJournal() {
      /* Two left joins rather than two queries: exactly one of the owner
         columns is set (the table's CHECK), so COALESCE picks whichever day
         applies and the other side contributes nothing. */
      const rows = await driver.query<PhotoRow & { epoch_day: number; milestone_name: string | null }>(
        `SELECT p.uuid, p.file_path,
                COALESCE(e.epoch_day, m.epoch_day) AS epoch_day,
                m.name AS milestone_name
         FROM photo p
         LEFT JOIN entry e ON e.id = p.entry_id
         LEFT JOIN milestone m ON m.id = p.milestone_id
         ORDER BY epoch_day, p.order_index, p.id`
      );
      return rows.map((row) => ({
        ...toPhoto(row),
        epochDay: row.epoch_day,
        milestoneName: row.milestone_name
      }));
    }
  };
}
