/* The forward-only migration list (ADR-0006). Append new versions here;
   never edit a migration once it has shipped.

   Version 88 is the squashed baseline (after-release ticket 42, which
   replaced ticket 34's v78 baseline and the steps 79 to 88 after it), not a
   step: it builds the whole schema in one statement. It keeps the number the
   chain had reached, so a journal already on the current schema opens with
   nothing running against it - the runner sees `current === latestVersion`
   and never even loads this list.

   A journal left anywhere from 1 to 87 cannot be opened by this build. Only
   development builds ever wrote one, since no release had shipped, and that
   was the price of squashing before the 1.0.0 cutoff. From 1.0.0 on, every
   released migration stays in the chain and cannot be edited or squashed.
   Such a journal is behind, not ahead, so SchemaTooNewError never fires for
   it. `baseline: true` is what lets the runner tell it apart from a first run:
   a journal with a schema below the baseline is refused with
   JournalBelowBaselineError before anything is copied or written, and the
   failure screen says it comes from a development build and offers the way
   out (after-release ticket 09). The journal is intact. Its content can still
   be carried over through an archive exported by the build that wrote it. */

import type { Migration } from './migration-runner.ts';
import { CLOSED_LISTS_REBUILD } from './closed-lists-migration.ts';
import { BASELINE_SCHEMA } from './schema.ts';
import { migrateDrugClass } from './drug-class-migration.ts';
import { migrateStockIdentity } from './stock-identity-migration.ts';

export const migrations: Migration[] = [
  { version: 88, sql: BASELINE_SCHEMA, baseline: true },
  { version: 89, sql: 'ALTER TABLE roadmap_check ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;' },
  { version: 90, sql: `
ALTER TABLE dose_event ADD COLUMN auto_log_episode_uuid TEXT;
ALTER TABLE dose_event ADD COLUMN auto_log_epoch_day INTEGER;
ALTER TABLE dose_event ADD COLUMN auto_log_index INTEGER CHECK (
  (auto_log_episode_uuid IS NULL AND auto_log_epoch_day IS NULL AND auto_log_index IS NULL)
  OR (source = 'schedule' AND typeof(auto_log_episode_uuid) = 'text'
      AND length(trim(auto_log_episode_uuid)) > 0 AND typeof(auto_log_epoch_day) = 'integer'
      AND typeof(auto_log_index) = 'integer' AND auto_log_index >= 0)
);
CREATE INDEX idx_dose_event_auto_log_day ON dose_event(auto_log_epoch_day)
  WHERE auto_log_epoch_day IS NOT NULL;
CREATE UNIQUE INDEX idx_dose_event_auto_log_slot
  ON dose_event(auto_log_episode_uuid, auto_log_epoch_day, auto_log_index)
  WHERE auto_log_episode_uuid IS NOT NULL;
` },
  { version: 91, sql: "ALTER TABLE medication_stock ADD COLUMN drug_key TEXT NOT NULL DEFAULT '';", apply: migrateStockIdentity },
  { version: 92, sql: `
DROP INDEX idx_entry_trashed_at;
CREATE INDEX idx_entry_trashed_at ON entry(trashed_at) WHERE trashed_at IS NOT NULL;
` },
  /* Functional audit ticket 18: HRT or another drug. No CHECK, by the audit's
     CHECK policy (vocabularies live in code, drugClass.ts reads anything but
     'hrt' as 'other'). */
  { version: 93, sql: "ALTER TABLE regimen_episode ADD COLUMN drug_class TEXT NOT NULL DEFAULT 'other';", apply: migrateDrugClass },
  { version: 94, sql: CLOSED_LISTS_REBUILD },
  /* Functional audit ticket 10: saved questions are cut. Rows are dropped,
     not converted, and restore skips the archive section by name. */
  { version: 95, sql: 'DROP TABLE saved_question;' },
  /* Functional audit ticket 09: counterevidence snapshots are cut. They
     copied a good-moment entry's note with no link back, so the text
     outlived the entry once it was deleted. Rows are dropped, not
     converted; archives that still carry the section skip it on restore
     (DROPPED_ARCHIVE_SECTION_NAMES). The child goes first so no foreign key
     points at a dropped parent. */
  { version: 96, sql: `
DROP TABLE doubt_snapshot_entry;
DROP TABLE doubt_snapshot;
` },
  { version: 97, sql: `
DROP TABLE measurement;
DROP TABLE measurement_type;
DROP TABLE size_record;
DELETE FROM area_state WHERE area IN ('measurementTypes', 'measurements', 'sizeRecords');
DELETE FROM pref WHERE key IN ('measurementUnit', 'measurementsNudgeEnabled', 'measurementProtocolDismissed');
` },
  { version: 98, sql: 'DROP TABLE affirmation; DROP TABLE revisit;' },
  { version: 99, sql: `
UPDATE milestone SET tryout_id = NULL
  WHERE tryout_id IN (SELECT uuid FROM tryout WHERE kind IN ('garment', 'presentation_step'));
DELETE FROM felt_sense WHERE tryout_id IN
  (SELECT id FROM tryout WHERE kind IN ('garment', 'presentation_step'));
DELETE FROM tryout_photo WHERE tryout_id IN
  (SELECT id FROM tryout WHERE kind IN ('garment', 'presentation_step'));
DELETE FROM tryout WHERE kind IN ('garment', 'presentation_step');
` }
];
