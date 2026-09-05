/* The coarse-name-to-SQL-table mapping (phase 8 audit ticket 02).

   writes.ts's TABLE_NAMES are invalidation names, coarser than the schema on
   purpose - 'entry' alone covers the entry row, its dimension values, its
   tag links, its body-region values and its search index, because nothing
   reads one without the others (writes.ts's own header says so). Until this
   ticket that mapping lived only in comments; writes.sql.test.ts drives real
   SQL through the recording driver (ticket 01) and needs it as data.

   Two things a real table name can never be: a coarse name is what a screen
   declares and a driver never sees, so nothing here collides with the other,
   and TABLE_NAMES itself is untouched (ticket 02's own scope line - this is
   an added declaration, not a renaming). */

import type { TableName } from './writes.ts';

/** Every real SQL table each coarse name covers. A table missing here that a
    write's SQL actually touches fails writes.sql.test.ts's per-operation
    check; a table present here that nothing ever writes fails its
    per-coarse-name union check - both directions matter, the same reason
    tablesWrittenBy/tablesReadBy above refuse an unclassified name instead of
    guessing. */
export const SQL_TABLES: Record<TableName, readonly string[]> = {
  /* entry_fts is a virtual table (FTS5) that entries.ts writes to
     explicitly on every path that changes a note (indexEntry, called from
     upsertEntry/restoreEntry) - it is not the trigger-only case below.
     entry_dimension_value/entry_tag/entry_body_region are the joins the
     header comment names; none of the three has a coarse name of its own. */
  entry: ['entry', 'entry_dimension_value', 'entry_tag', 'entry_body_region', 'entry_fts'],
  tag: ['tag', 'tag_group'],
  dimension: ['gender_dimension'],
  preset: ['gender_preset', 'preset_dimension'],
  milestone: ['milestone'],
  photo: ['photo'],
  lab: ['lab_result'],
  measurement: ['measurement'],
  sizeRecord: ['size_record'],
  taper: ['taper', 'taper_session'],
  reminder: ['reminder'],
  tally: ['tally_event'],
  regimen: ['regimen_episode'],
  dose: ['dose_event', 'dose_schedule', 'dose_schedule_weekday', 'dose_schedule_dose_amount', 'dose_pause'],
  stock: ['medication_stock'],
  sideEffect: ['side_effect'],
  personalEffect: ['personal_effect'],
  cycleEvent: ['cycle_event'],
  journalingPause: ['journaling_pause'],
  era: ['era'],
  eraMute: ['era_mute'],
  hairProgress: ['hair_stage', 'hair_photo'],
  hairRemoval: ['hair_removal_session', 'hair_removal_photo'],
  procedure: ['procedure', 'procedure_consult', 'procedure_photo'],
  doubtJournal: ['doubt_snapshot', 'doubt_snapshot_entry'],
  comfortItem: ['comfort_item'],
  tryout: ['tryout', 'tryout_photo'],
  feltSense: ['felt_sense'],
  letter: ['letter'],
  voiceRecording: ['voice_recording'],
  voiceBenchmark: ['voice_benchmark'],
  voicePracticeTake: ['voice_practice_take'],
  videoNote: ['video_note'],
  roadmapCheck: ['roadmap_check', 'roadmap_track'],
  roadmapGoal: ['roadmap_goal'],
  // The recovery checklist is an ordinary checklist row (writes.ts's own
  // comment on `procedures`), so it lives here and not under 'procedure'.
  checklist: ['checklist', 'checklist_item'],
  wearSession: ['wear_session'],
  affirmation: ['affirmation'],
  bodyRegion: ['body_region'],
  measurementType: ['measurement_type'],
  effectCategory: ['effect_category'],
  personalEffectType: ['personal_effect_type'],
  presentation: ['presentation'],
  entryTemplate: ['entry_template', 'entry_template_tag', 'entry_template_dimension_value'],
  importLog: ['import_log'],
  areaState: ['area_state'],
  savedQuestion: ['saved_question'],
  revisit: ['revisit'],
  marginNote: ['margin_note'],
  wordIgnore: ['word_frequency_ignore'],
  document: ['document']
};

/** Tables `SELECT name FROM sqlite_master` returns that no coarse name
    covers, with the reason each is out of `writes.ts`'s reach entirely -
    checked by name in sqlTables.test.ts against a freshly migrated
    database, so a table this repo adds and forgets to place fails there
    rather than nowhere. */
const FTS5_SHADOW_TABLE_REASON = "an FTS5 shadow table SQLite manages itself; app SQL never names it, so 'entry' cannot cover it";

export const UNMAPPED_TABLES: Record<string, string> = {
  // Preferences (ADR-0009): its own store, outside the journal's write
  // registry - nothing in writes.ts classifies a pref write or read.
  pref: 'preferences live outside the journal (ADR-0009); writes.ts never classifies a pref read or write',
  // SQLite's own autoincrement bookkeeping table, never named in app SQL.
  sqlite_sequence: "SQLite's own autoincrement bookkeeping, never referenced by app SQL",
  // FTS5's shadow tables for entry_fts: SQLite manages these itself whenever
  // app SQL touches the virtual table entry_fts, and app SQL never names
  // them directly - a driver that only reads SQL text can never see one.
  entry_fts_data: FTS5_SHADOW_TABLE_REASON,
  entry_fts_idx: FTS5_SHADOW_TABLE_REASON,
  entry_fts_docsize: FTS5_SHADOW_TABLE_REASON,
  entry_fts_config: FTS5_SHADOW_TABLE_REASON
};
