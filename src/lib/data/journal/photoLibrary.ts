/* Every photograph in the journal, in one dated list (phase 11 ticket 14).

   "Every photo in your journal, oldest first" is what `/media/photos` has
   always said, over a grid that read one table of six. The journal keeps a
   photograph wherever the record it belongs to keeps its own rows: `photo`
   for an entry's and a milestone's, `hair_removal_photo`,
   `tryout_photo`, `procedure_photo` and `progress_photo` for the records
   that grew their own, and `video_note` for a note recorded in the editor
   (ADR-0034). Six tables, one `PhotoFileStore`, one normalisation
   (ADR-0008/0015) - and, until this, five of them with no way to be found
   again except through the day they hang off.

   THIS IS A READ AND ONLY A READ. Every one of those tables keeps its own
   area, its own writes and its own file ordering: a photograph is attached
   and deleted where its record lives, because the order that makes a crash
   safe (files before the row, the row before the files) is a property of
   the table rather than of the list. Nothing here writes anything, and
   nothing here is an owner.

   Which is also why this is not `photos.inJournal()`, where the ticket
   first asked for it. That read is the `photo` table's own, and four
   callers depend on every row it returns being a `photo` row they can hand
   straight back to `photos.remove()`, `photos.setStarred()` or a count
   they compare against the table: `demo/journal-seed.ts` clears the table
   by looping over it, `demo/fullFixture.ts` stars the first of each owner,
   `tests/long-journal/generate.test.ts` asserts its length, and the
   browser tier's archive probe counts it across a restore. A progress
   photograph handed to `photos.remove()` deletes no row and leaves its
   files behind, without saying so.

   The media_file view owns the UNION ALL over file-owning tables. This read
   selects visible photo and video sources from it. The ordering rule is one
   rule over the whole library (by day, source, then owner row order).
   `source_rank` is what makes the middle term orderable;
   `owner_order` and `row_id` are the last two, and only the two tables
   that carry an `order_index` have anything to put in the first of them.

   Dates come from whatever each row has. A `photo` row can carry an
   override (ticket 47) over its owner's day; a progress, tryout or procedure
   photograph is dated in its own right; a hair-removal photograph has only
   its session's day, and a video note only its entry's. A trashed entry
   hides both the photographs and the notes hanging off it, the same way
   every other entry-owned read does (phase 5 ticket 19); the other four
   owners have no trash state to check. */

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
