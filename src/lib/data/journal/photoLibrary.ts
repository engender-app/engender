/* Read visible photos and video notes from media_file across all file-owning tables. Sort
   by day, source, owner order and row ID. Entry photos can override the owner's day. Dated
   photos carry their own day, and other sources inherit the parent day. Trashed entries
   hide their images and recordings.

   Keep writes with the owning area, which enforces file and row ordering.
   photos.inJournal() still returns only photo rows for callers that use photos.remove() or
   compare a count to that table. Progress images and other sources require their own owner
   APIs. */

import type { SqliteDriver } from '../sqlite/driver';
import type { LibraryPhoto, PhotoSource } from '../photos/library';
import { bool } from './support';

export interface PhotoLibraryArea {
  /** Every photograph and video note in the journal, oldest first. */
  inJournal(): Promise<LibraryPhoto[]>;
  /** The starred ones, oldest first - the starred shelf's photo half
      (CONTEXT: "Starred"), in the library's shape so the shelf can say
      where each one came from.

      The `photo` table alone, because `starred` is a column the `photo`
      table alone has. The other five arms would be a provably empty
      contribution to a union, which is a claim about the schema better
      made in a sentence than in SQL nothing can satisfy. Starring a progress
      photograph means a migration, an archive round trip and a control
      that does not exist; it is not this ticket's. */
  starred(): Promise<LibraryPhoto[]>;
  /** Whether the library holds anything at all: the same view filter as
      `inJournal`, asked with one `EXISTS` instead of hydrating every row
      (Home's Getting started row). */
  hasAny(): Promise<boolean>;
}

type LibraryRow = {
  id: string;
  file_name: string;
  epoch_day: number;
  source: PhotoSource;
  owner_name: string | null;
  owner_id: string;
  starred: number;
};

const toLibraryPhoto = (row: LibraryRow): LibraryPhoto => ({
  id: row.id,
  fileName: row.file_name,
  epochDay: row.epoch_day,
  source: row.source,
  ownerName: row.owner_name,
  ownerId: row.owner_id,
  starred: bool(row.starred)
});

const VISIBLE_MEDIA = 'FROM media_file WHERE source_rank IS NOT NULL AND visible = 1';
const LIBRARY_ORDER = 'ORDER BY epoch_day, source_rank, owner_order, row_id';
const IN_JOURNAL = `SELECT id, file_name, epoch_day, source, owner_name, owner_id, starred
  ${VISIBLE_MEDIA} ${LIBRARY_ORDER}`;
const STARRED = `SELECT id, file_name, epoch_day, source, owner_name, owner_id, starred
  ${VISIBLE_MEDIA} AND starred = 1 ${LIBRARY_ORDER}`;

export function makePhotoLibraryArea(driver: SqliteDriver): PhotoLibraryArea {
  return {
    async inJournal() {
      return (await driver.query<LibraryRow>(IN_JOURNAL)).map(toLibraryPhoto);
    },

    async hasAny() {
      const rows = await driver.query<{ found: number }>(`SELECT EXISTS(SELECT 1 ${VISIBLE_MEDIA}) AS found`);
      return bool(rows[0].found);
    },

    async starred() {
      return (await driver.query<LibraryRow>(STARRED)).map(toLibraryPhoto);
    }
  };
}
