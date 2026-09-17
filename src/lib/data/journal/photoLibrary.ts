/* Every photograph in the journal, in one dated list (phase 11 ticket 14).

   "Every photo in your journal, oldest first" is what `/media/photos` has
   always said, over a grid that read one table of six. The journal keeps a
   photograph wherever the record it belongs to keeps its own rows: `photo`
   for an entry's and a milestone's, `hair_photo`, `hair_removal_photo`,
   `tryout_photo` and `procedure_photo` for the four records that grew
   their own, and `video_note` for a note recorded in the editor
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
   browser tier's archive probe counts it across a restore. A hair
   photograph handed to `photos.remove()` deletes no row and leaves its
   files behind, without saying so.

   The shape of the query. Six arms of a UNION ALL rather than six queries
   assembled above the seam: the ordering rule is one rule over the whole
   library (by day, then by source, then by the order its own table was
   written in), and a list sorted in SQL is sorted once by the thing that
   holds the index. `source_rank` is what makes the middle term orderable;
   `owner_order` and `row_id` are the last two, and only the two tables
   that carry an `order_index` have anything to put in the first of them.

   Dates come from whatever each row has. A `photo` row can carry an
   override (ticket 47) over its owner's day; a hair, tryout or procedure
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
      made in a sentence than in SQL nothing can satisfy. Starring a hair
      photograph means a migration, an archive round trip and a control
      that does not exist; it is not this ticket's. */
  starred(): Promise<LibraryPhoto[]>;
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

/** The `photo` table's arm, which both reads below open with: the only one
    with two sources, the only one that can be starred and the only one
    whose day can be overridden. `extra` is the arm's own further
    condition, so the starred read is this same arm and not a second
    spelling of it. */
const PHOTO_ARM = (extra: string) => `
  SELECT p.uuid AS id, p.file_path AS file_name,
         COALESCE(p.epoch_day_override, e.epoch_day, m.epoch_day) AS epoch_day,
         CASE WHEN p.milestone_id IS NULL THEN 'entry' ELSE 'milestone' END AS source,
         m.name AS owner_name, p.starred AS starred,
         COALESCE(m.uuid, CAST(e.id AS TEXT)) AS owner_id,
         0 AS source_rank, p.order_index AS owner_order, p.id AS row_id
  FROM photo p
  LEFT JOIN entry e ON e.id = p.entry_id
  LEFT JOIN milestone m ON m.id = p.milestone_id
  WHERE (p.entry_id IS NULL OR e.trashed_at IS NULL)${extra}`;

const LIBRARY_ORDER = 'ORDER BY epoch_day, source_rank, owner_order, row_id';

const IN_JOURNAL = `${PHOTO_ARM('')}
  UNION ALL
  SELECT h.uuid, h.file_path, h.epoch_day, 'hair', NULL, 0, h.uuid, 1, 0, h.id
  FROM hair_photo h
  UNION ALL
  SELECT r.uuid, r.file_path, s.epoch_day, 'hairRemoval', NULL, 0, s.uuid, 2, 0, r.id
  FROM hair_removal_photo r
  JOIN hair_removal_session s ON s.id = r.session_id
  UNION ALL
  SELECT t.uuid, t.file_path, t.epoch_day, 'tryout', y.label, 0, y.uuid, 3, 0, t.id
  FROM tryout_photo t
  JOIN tryout y ON y.id = t.tryout_id
  UNION ALL
  SELECT c.uuid, c.file_path, c.epoch_day, 'procedure', d.name, 0, d.uuid, 4, 0, c.id
  FROM procedure_photo c
  JOIN procedure d ON d.id = c.procedure_id
  UNION ALL
  SELECT v.uuid, v.file_path, n.epoch_day, 'video', NULL, 0, CAST(n.id AS TEXT), 5, v.order_index, v.id
  FROM video_note v
  JOIN entry n ON n.id = v.entry_id
  WHERE n.trashed_at IS NULL
  ${LIBRARY_ORDER}`;

const STARRED = `${PHOTO_ARM(' AND p.starred = 1')}
  ${LIBRARY_ORDER}`;

export function makePhotoLibraryArea(driver: SqliteDriver): PhotoLibraryArea {
  return {
    async inJournal() {
      return (await driver.query<LibraryRow>(IN_JOURNAL)).map(toLibraryPhoto);
    },

    async starred() {
      return (await driver.query<LibraryRow>(STARRED)).map(toLibraryPhoto);
    }
  };
}
