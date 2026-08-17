/* The forward-only migration list (ADR-0006). Append new versions here;
   never edit a migration once it has shipped. */

import type { Migration } from './migration-runner.ts';
import { SCHEMA_V1 } from './schema.ts';

/* v2: custom gender dimensions hide, never delete (ticket 07, same F17
   rule as tags). Hiding takes a dimension out of everywhere a user picks
   things - presets, the editor, the charts - while its
   entry_dimension_value rows survive, so it needs its own flag: absence
   from every preset cannot say "hidden", because a dimension outside any
   preset still appears in the metric picker. */
const SCHEMA_V2 = `
ALTER TABLE gender_dimension ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
`;

/* v3: the search index becomes writable (ticket 09, ADR-0005).

   v1 shaped `entry_fts` but nothing ever wrote to it, and as shipped it
   could not forget a row: a plain contentless FTS5 table only deletes via
   `INSERT INTO entry_fts(entry_fts, rowid, folded_text) VALUES('delete',
   ...)`, which needs the exact text the row was indexed under. Every edit
   would therefore have to re-fold the old note and hope the fold function
   had not changed since - and a mismatch does not fail, it quietly
   decrements token counts that were never there. `contentless_delete=1`
   (SQLite 3.43+; Node ships 3.51.2 and SQLocal's WASM build 3.48.0) makes
   a delete a plain DELETE, so an edit is delete-then-insert.

   FTS5 options cannot be altered, hence the drop and recreate. There is
   nothing to carry across: the index has never held a row.

   Inserts and updates stay in application code because the folding does
   (ADR-0005) and SQL cannot call foldText(). Deletes do not need the
   folded text, so they become a trigger - which is what makes the index
   survive delete paths written later that know nothing about it, ticket
   14's Replace import first among them.

   Entries written before this migration are not in the index. Nothing had
   ever indexed them either, so this loses nothing, but it does mean a
   pre-v3 dev journal has notes that search will not find until they are
   saved again. No release has shipped, so no user is in that position. */
const SCHEMA_V3 = `
DROP TABLE entry_fts;
CREATE VIRTUAL TABLE entry_fts USING fts5(
  folded_text,
  content='',
  contentless_delete=1
);
CREATE TRIGGER entry_fts_after_delete AFTER DELETE ON entry BEGIN
  DELETE FROM entry_fts WHERE rowid = old.id;
END;
`;

/* v4: body regions (ticket 09). A region is a fixed, built-in key
   (bodyMap.ts) rather than a stored reference-data row like
   gender_dimension - there is no per-install customisation to persist, so
   the column is plain TEXT with no table to join against and no CHECK: the
   allowlist lives in application code, the same free-text treatment
   lab_result.analyte already gets.

   Whole-set replace on write, like entry_tag rather than
   entry_dimension_value: the picker shows every region every time, so a
   region missing from a save is the user deselecting it, not a preset
   narrowing what is on screen. */
const SCHEMA_V4 = `
CREATE TABLE entry_body_region (
  entry_id  INTEGER NOT NULL REFERENCES entry(id) ON DELETE CASCADE,
  region    TEXT NOT NULL,
  intensity INTEGER NOT NULL,
  PRIMARY KEY (entry_id, region)
);
CREATE INDEX idx_ebr_region ON entry_body_region(region);
`;

export const migrations: Migration[] = [
  { version: 1, sql: SCHEMA_V1 },
  { version: 2, sql: SCHEMA_V2 },
  { version: 3, sql: SCHEMA_V3 },
  { version: 4, sql: SCHEMA_V4 }
];

/** The newest schema this build can produce. Two things refuse a database
    numbered higher than this rather than guessing at it (ADR-0006): the
    migration runner, which computes it from whatever array it was handed,
    and ticket 10's conversion, which has no array to hand and asks here. */
export const LATEST_SCHEMA_VERSION = Math.max(...migrations.map((migration) => migration.version));
