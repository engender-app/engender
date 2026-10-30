/* Version 116 (functional audit ticket 48): what a deletion leaves behind,
   so an archive Merge can carry it to another device.

   Only an entry is soft-deleted, and the audit ruled out soft-delete
   columns anywhere else (undoableDelete.ts), so every other deletion is a
   hard delete that left nothing to export. `deletion` now keeps one row per
   deleted record: the table, the record's merge identity (the value a Merge
   matches it by, journal/archiveMerge.ts) and when it went. A trigger per
   table writes it, so every delete path records one - an area's own
   function, a cascade, the trash purge, a Merge applying another device's
   deletion - without any of them having to remember to.

   The list below is frozen with this migration, like any other migration's
   SQL: a table added later gets its trigger in its own migration, and a
   rebuilt table (which drops its triggers with it) recreates its own.
   archiveMerge.test.ts fails on a table whose trigger is missing, so
   neither can be forgotten.

   No row is ever pruned. A row holds a table name, a uuid or key and a
   time, never content (deleted-entry-leaves-no-copy.test.ts reads every
   table for a deleted note), and a device that keeps it can still refuse
   to resurrect a record an archive from long ago carries.

   The clock is SQLite's, in milliseconds since the epoch: the same clock
   every `updated_at` is written from (Date.now() reads the same system
   time), and the only one a trigger can read. */

/** The table and the expression its identity is read by, inside the
    trigger. Frozen with version 116; archiveMerge.ts keeps the live list. */
const RECORDED: readonly (readonly [string, string])[] = [
  ['appointment', 'OLD.uuid'],
  ['appointment_status', 'OLD.uuid'],
  ['area_state', 'OLD.area'],
  ['body_region', 'COALESCE(OLD.key, OLD.uuid)'],
  ['checklist', 'OLD.uuid'],
  ['checklist_item', 'OLD.uuid'],
  ['comfort_item', 'OLD.uuid'],
  ['cycle_event', 'OLD.uuid'],
  ['document', 'OLD.uuid'],
  ['dose_event', 'OLD.uuid'],
  ['dose_pause', 'OLD.uuid'],
  ['dose_schedule', 'OLD.uuid'],
  ['effect_category', 'OLD.key'],
  ['entry', 'OLD.uuid'],
  ['entry_template', 'COALESCE(OLD.key, OLD.uuid)'],
  ['era', 'OLD.uuid'],
  ['era_mute', 'OLD.era_uuid'],
  ['felt_sense', 'OLD.uuid'],
  ['gender_dimension', 'OLD.key'],
  ['gender_preset', 'COALESCE(OLD.key, OLD.uuid)'],
  ['hair_photo', 'OLD.uuid'],
  ['hair_removal_photo', 'OLD.uuid'],
  ['hair_removal_session', 'OLD.uuid'],
  ['hair_stage', 'OLD.uuid'],
  ['import_log', 'OLD.uuid'],
  ['lab_result', 'OLD.uuid'],
  ['letter', 'OLD.uuid'],
  ['margin_note', 'OLD.uuid'],
  ['medication_stock', 'OLD.drug_key'],
  ['milestone', 'OLD.uuid'],
  ['personal_effect', 'OLD.effect'],
  ['personal_effect_type', 'OLD.key'],
  ['photo', 'OLD.uuid'],
  ['presentation', 'OLD.uuid'],
  ['procedure', 'OLD.uuid'],
  ['procedure_photo', 'OLD.uuid'],
  ['provider', 'OLD.uuid'],
  ['regimen_episode', 'OLD.uuid'],
  ['reminder', 'OLD.uuid'],
  ['roadmap_category', 'OLD.uuid'],
  ['roadmap_check', "OLD.pack_key || char(10) || OLD.goal_key"],
  ['roadmap_goal', 'OLD.uuid'],
  ['roadmap_institution', 'OLD.uuid'],
  ['roadmap_institution_change', 'OLD.uuid'],
  ['side_effect', 'OLD.uuid'],
  ['tag', 'COALESCE(OLD.key, OLD.uuid)'],
  ['tag_group', 'OLD.key'],
  ['taper', 'OLD.uuid'],
  ['tally_event', 'OLD.uuid'],
  ['taper_session', 'OLD.uuid'],
  ['tryout', 'OLD.uuid'],
  ['tryout_photo', 'OLD.uuid'],
  ['video_note', 'OLD.uuid'],
  ['voice_benchmark', 'OLD.uuid'],
  ['voice_practice_take', 'OLD.uuid'],
  ['voice_recording', 'OLD.uuid'],
  ['wear_session', 'OLD.uuid']
];

/** Milliseconds since the epoch, as SQLite reads the clock. */
export const SQL_NOW_MS = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";

/** The trigger that records a deletion from `table`. Exported for the
    migration that will one day rebuild one of these tables and has to put
    it back. */
export function deletionTrigger(table: string, identity: string): string {
  return `CREATE TRIGGER deletion_${table} AFTER DELETE ON ${table} BEGIN
  INSERT INTO deletion (tbl, row_key, deleted_at) VALUES ('${table}', ${identity}, ${SQL_NOW_MS})
    ON CONFLICT (tbl, row_key) DO UPDATE SET deleted_at = MAX(deleted_at, excluded.deleted_at);
END;`;
}

/* A built-in row nobody has edited carries the time it was seeded, which
   reads to a Merge as an edit made then: a device installed after another
   one hid a built-in tag would bring the tag back. Seeding stamps 0 from
   this version on (reconcile.ts), and a built-in row still holding the
   stamp it was seeded with is reset to 0 here. Seeding writes every row of
   a batch with one stamp, so a stamp two or more built-in rows of a table
   share is a seeding batch; an edit is one row at a time. Where that guess
   is wrong the row only loses its claim to be newer than another device's
   edit of the same built-in, never its content. */
const BUILT_IN: readonly (readonly [string, string])[] = [
  ['gender_dimension', 'is_built_in = 1'],
  ['gender_preset', 'key IS NOT NULL'],
  ['tag_group', 'uuid IS NULL'],
  ['tag', 'key IS NOT NULL'],
  ['body_region', 'key IS NOT NULL'],
  ['effect_category', '1'],
  ['personal_effect_type', 'is_built_in = 1'],
  ['entry_template', 'key IS NOT NULL']
];

const resetSeedStamp = ([table, builtIn]: readonly [string, string]) =>
  `UPDATE ${table} SET updated_at = 0 WHERE ${builtIn} AND updated_at IN
  (SELECT updated_at FROM ${table} WHERE ${builtIn} GROUP BY updated_at HAVING COUNT(*) > 1);`;

export const DELETION_LOG = `
CREATE TABLE deletion (
  id         INTEGER PRIMARY KEY,
  tbl        TEXT NOT NULL,
  row_key    TEXT NOT NULL,
  deleted_at INTEGER NOT NULL,
  UNIQUE (tbl, row_key)
);
${RECORDED.map(([table, identity]) => deletionTrigger(table, identity)).join('\n')}
${BUILT_IN.map(resetSeedStamp).join('\n')}
`;
