/* The photos area (PRD F5/F27, ADR-0008). One table and one code path for
   both owners: an entry's photos and a milestone's photo differ only in
   which column the row hangs off, so there is no second implementation for
   milestones to drift from this one.

   Order is the rule that carries this module. Files land before the row
   that names them, and the row goes before the files are forgotten:

     attach  - write both files, then insert the row.
     remove  - delete the row in a transaction, then delete the files.

   Either way a crash in the gap leaves a file no row references, never a
   row pointing at a file that is not there. The first is reclaimed by the
   boot sweep (sweep.ts); the second would be a photo the user can see in
   the list and never open. That asymmetry is ADR-0011's rule - import
   writes files first and never deletes - applied to the ordinary path. */

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

export interface PhotosArea {
  /** Returns the photo's uuid. Throws if the owner is unknown, before
      anything is written. */
  attach(owner: PhotoOwner, photo: NormalizedPhoto): Promise<string>;
  listFor(owner: PhotoOwner): Promise<Photo[]>;
  /** Idempotent, like the journal's other deletes. */
  remove(id: string): Promise<void>;
}

type PhotoRow = { uuid: string; file_path: string };

const toPhoto = (row: PhotoRow): Photo => ({ id: row.uuid, fileName: row.file_path });

/** The owner's photo rows, oldest first. Shared with the entries and
    milestones areas so a photo is read the same way wherever it is read. */
export async function photosOfEntry(driver: SqliteDriver, entryId: number): Promise<Photo[]> {
  const rows = await driver.query<PhotoRow>(
    'SELECT uuid, file_path FROM photo WHERE entry_id = ? ORDER BY order_index, id',
    [entryId]
  );
  return rows.map(toPhoto);
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
   it. */
export async function sweepOrphanPhotos(driver: SqliteDriver, files: PhotoFileStore): Promise<void> {
  const rows = await driver.query<{ file_path: string }>('SELECT file_path FROM photo');
  const referenced = new Set(rows.flatMap((row) => filesOf(row.file_path)));
  for (const name of await files.list()) {
    if (!referenced.has(name)) await files.remove(name);
  }
}

export function makePhotosArea(driver: SqliteDriver, files: PhotoFileStore): PhotosArea {
  /* Both owner columns, resolved before anything is written: an unknown
     milestone has to fail without leaving two files behind for the sweep
     to clean up after it. */
  const columnsFor = async (owner: PhotoOwner): Promise<{ entryId: number | null; milestoneId: number | null }> => {
    if (owner.entryId != null) {
      const rows = await driver.query<{ id: number }>('SELECT id FROM entry WHERE id = ?', [owner.entryId]);
      if (rows.length === 0) throw new Error(`unknown entry: ${owner.entryId}`);
      return { entryId: rows[0].id, milestoneId: null };
    }
    const rows = await driver.query<{ id: number }>('SELECT id FROM milestone WHERE uuid = ?', [owner.milestoneId]);
    if (rows.length === 0) throw new Error(`unknown milestone: ${owner.milestoneId}`);
    return { entryId: null, milestoneId: rows[0].id };
  };

  const nextOrderIndex = async (columns: { entryId: number | null; milestoneId: number | null }): Promise<number> => {
    const rows = await driver.query<{ next: number }>(
      `SELECT COALESCE(MAX(order_index) + 1, 0) AS next FROM photo
       WHERE ${columns.entryId != null ? 'entry_id = ?' : 'milestone_id = ?'}`,
      [columns.entryId ?? columns.milestoneId]
    );
    return rows[0].next;
  };

  return {
    async attach(owner, photo) {
      const columns = await columnsFor(owner);
      const uuid = mintUuid();
      const fileName = photoFileName(uuid);
      const [full, thumb] = filesOf(fileName);

      // Files first (see the header): the row must never name a file that
      // has not landed. A failure here leaves at most one loose file.
      await files.write(full, photo.full);
      await files.write(thumb, photo.thumb);

      const orderIndex = await nextOrderIndex(columns);
      await driver.run(
        `INSERT INTO photo (uuid, entry_id, milestone_id, file_path, order_index, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uuid, columns.entryId, columns.milestoneId, fileName, orderIndex, now()]
      );
      return uuid;
    },

    async listFor(owner) {
      if (owner.entryId != null) return photosOfEntry(driver, owner.entryId);
      const rows = await driver.query<PhotoRow>(
        `SELECT p.uuid, p.file_path FROM photo p JOIN milestone m ON m.id = p.milestone_id
         WHERE m.uuid = ? ORDER BY p.order_index, p.id`,
        [owner.milestoneId]
      );
      return rows.map(toPhoto);
    },

    async remove(id) {
      const rows = await driver.query<{ file_path: string }>('SELECT file_path FROM photo WHERE uuid = ?', [id]);
      await driver.run('DELETE FROM photo WHERE uuid = ?', [id]);
      // After the row is gone, matching deleteEntry: a failed file removal
      // must not resurrect the row, and the leftover is the sweep's.
      for (const row of rows) for (const name of filesOf(row.file_path)) await files.remove(name);
    }
  };
}
