/* Version 123: the tally is removed, and hair progress folds into progress
   photos.

   `tally_event` held the misgendered / correctly-gendered counter. The
   misgendered tag on an entry is the one way to record it now, so the
   table is dropped with its rows: nothing reads them. SQLite drops a
   table's triggers and indexes with it, which takes the deletion-log
   trigger that version 117 gave it. The log's own rows for the table, and
   the `area_state` row that said the area was finished, name something
   that no longer exists, so they go too. An archive that still carries
   the `tallyEvents` section skips it on restore
   (DROPPED_ARCHIVE_SECTION_NAMES). */

export const TALLY_AND_HAIR_FOLD = `
DROP TABLE tally_event;
DELETE FROM deletion WHERE tbl = 'tally_event';
DELETE FROM area_state WHERE area = 'tallyEvents';
`;
