/* The forward-only migration list (ADR-0006). Append new versions here;
   never edit a migration once it has shipped.

   Version 88 is the squashed baseline (after-release ticket 42, which
   replaced ticket 34's v78 baseline and the steps 79 to 88 after it), not a
   step: it builds the whole schema in one statement. rc.1 shipped at 88, so
   it stays the baseline, and an rc.1 journal opens on it.

   One step follows it: version 119 (pre-publish ticket 01), which runs what
   were migrations 89 to 119 in their original order, data conversions
   included, inside one transaction. An rc.1 journal updates in place in that
   one step, and a process killed partway leaves it at 88 with its rows, never
   in between. POST_RC1_STEPS below keeps those steps under the numbers
   development builds ran them at, because their comments say what each part
   is for and their tests drive them one at a time; no release ever runs them
   that way.

   From 1.0.0 on nothing is squashed or edited: every released migration
   stays in the chain, appended after 119.

   Two kinds of journal cannot be opened by this build, and only development
   and test builds ever wrote either. One at 1 to 87 is below the baseline,
   refused with JournalBelowBaselineError; one at 89 to 118 sits between the
   baseline and the step at 119, refused with JournalBetweenStepsError. Both
   are refused before anything is copied or written, and the failure screen
   says the journal comes from a development build and offers the way out
   (after-release ticket 09): its content can still be carried over through
   an archive exported by the build that wrote it. Such a journal is behind,
   not ahead, so SchemaTooNewError never fires for it. `baseline: true` is
   what lets the runner tell either apart from a first run. */

import type { Migration } from './migration-runner.ts';
import { CLOSED_LISTS_REBUILD } from './closed-lists-migration.ts';
import { BASELINE_SCHEMA } from './schema.ts';
import { migrateDrugClass } from './drug-class-migration.ts';
import { migrateHairRemovalCost } from './cost-migration.ts';
import { migratePrefsCleanup } from './prefs-cleanup-migration.ts';
import { deviceDefaultCurrency } from '../cost.ts';
import { migrateStockIdentity } from './stock-identity-migration.ts';
import { WAITLIST_REBUILD } from './waitlist-migration.ts';
import { DELETION_LOG } from './deletion-migration.ts';
import { MIGRATION_HYGIENE } from './hygiene-migration.ts';
import { PROGRESS_PHOTOS } from './progress-photo-migration.ts';

/** What were migrations 89 to 119, as development builds ran them. The
    released chain runs them as the one step at 119 (see the header). */
export const POST_RC1_STEPS: Migration[] = [
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
  /* Functional audit ticket 47: when the supply held now expires and a free
     note about where it came from. Both describe the row's current supply
     (there is no purchase log) and both are nullable. Ticket 30's cost
     column joins them on this row after this one. */
  { version: 99, sql: `
ALTER TABLE medication_stock ADD COLUMN expiry_epoch_day INTEGER;
ALTER TABLE medication_stock ADD COLUMN pharmacy_note TEXT;
` },
  /* Functional audit ticket 26: an appointment can wait without a day. */
  { version: 100, sql: WAITLIST_REBUILD },
  /* Functional audit ticket 23: a side effect is ongoing (NULL) until the
     person marks the day it resolved. sideEffects.ts refuses a day before
     the start; no CHECK, so an archive row is judged by the same code. */
  { version: 101, sql: 'ALTER TABLE side_effect ADD COLUMN resolved_epoch_day INTEGER;' },
  /* Functional audit ticket 23: hair staging is free text. A grade becomes
     the text hairStageScales.ts's legacyHairStagingText gives it, so a
     migrated row and a restored one read alike; scale and stage go, and so
     does the CHECK that tied them. A rebuild, since SQLite cannot drop a
     column a CHECK names. */
  { version: 102, sql: `
CREATE TABLE hair_stage_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid        TEXT NOT NULL UNIQUE,
  epoch_day   INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  updated_at  INTEGER NOT NULL
);
INSERT INTO hair_stage_new (id, uuid, epoch_day, description, updated_at)
  SELECT id, uuid, epoch_day,
    CASE scale
      WHEN 'norwood_hamilton' THEN 'Norwood-Hamilton ' || upper(stage)
      WHEN 'sinclair' THEN 'Sinclair ' || upper(stage)
      ELSE description
    END,
    updated_at
  FROM hair_stage;
DELETE FROM sqlite_sequence WHERE name = 'hair_stage_new';
INSERT INTO sqlite_sequence (name, seq) SELECT 'hair_stage_new', seq FROM sqlite_sequence WHERE name = 'hair_stage';
DROP TABLE hair_stage;
ALTER TABLE hair_stage_new RENAME TO hair_stage;
CREATE INDEX idx_hair_stage_epoch_day ON hair_stage(epoch_day);
` },
  /* Functional audit ticket 12: the Words reading is cut, and with it the
     list of words it was told to skip. Rows are dropped, not converted;
     archives that still carry the wordIgnore section skip it on restore
     (DROPPED_ARCHIVE_SECTION_NAMES). */
  { version: 103, sql: 'DROP TABLE word_frequency_ignore;' },
  /* Functional audit ticket 32. A milestone can be set not to be
     celebrated on Home; every milestone already recorded keeps its
     celebration. No CHECK, like roadmap_check.hidden: 0 is off and
     anything else reads as on.

     And a milestone no longer holds felt-sense readings: they were asked
     for and never shown. A cut removes rather than converts, so the
     milestone rows are dropped and felt_sense is rebuilt with the tryout
     as its one owner. Its AUTOINCREMENT counter is carried over, the way
     CLOSED_LISTS_REBUILD carries its tables'. */
  { version: 104, sql: `
ALTER TABLE milestone ADD COLUMN celebrate INTEGER NOT NULL DEFAULT 1;
CREATE TABLE felt_sense_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  tryout_id  INTEGER NOT NULL REFERENCES tryout(id) ON DELETE CASCADE,
  epoch_day  INTEGER NOT NULL,
  mood       INTEGER NOT NULL CHECK (mood BETWEEN 1 AND 5),
  note       TEXT,
  updated_at INTEGER NOT NULL
);
INSERT INTO felt_sense_new (id, uuid, tryout_id, epoch_day, mood, note, updated_at)
  SELECT id, uuid, tryout_id, epoch_day, mood, note, updated_at FROM felt_sense WHERE tryout_id IS NOT NULL;
DELETE FROM sqlite_sequence WHERE name = 'felt_sense_new';
INSERT INTO sqlite_sequence (name, seq) SELECT 'felt_sense_new', seq FROM sqlite_sequence WHERE name = 'felt_sense';
DROP TABLE felt_sense;
ALTER TABLE felt_sense_new RENAME TO felt_sense;
CREATE INDEX idx_felt_sense_tryout ON felt_sense(tryout_id);
CREATE INDEX idx_felt_sense_epoch_day ON felt_sense(epoch_day);
` },
  { version: 105, sql: `
UPDATE milestone SET tryout_id = NULL
  WHERE tryout_id IN (SELECT uuid FROM tryout WHERE kind IN ('garment', 'presentation_step'));
DELETE FROM felt_sense WHERE tryout_id IN
  (SELECT id FROM tryout WHERE kind IN ('garment', 'presentation_step'));
DELETE FROM tryout_photo WHERE tryout_id IN
  (SELECT id FROM tryout WHERE kind IN ('garment', 'presentation_step'));
DELETE FROM tryout WHERE kind IN ('garment', 'presentation_step');
` },
  /* Functional audit ticket 51: one read surface for every stored attachment
     reference. Owner tables and their cascades remain unchanged. */
  { version: 106, sql: `
CREATE VIEW media_file AS
SELECT p.uuid AS id, p.file_path AS file_name,
  CASE WHEN p.milestone_id IS NULL THEN 'entry' ELSE 'milestone' END AS source,
  COALESCE(p.epoch_day_override, e.epoch_day, m.epoch_day) AS epoch_day,
  m.name AS owner_name, COALESCE(m.uuid, CAST(e.id AS TEXT)) AS owner_id,
  p.starred AS starred, 0 AS source_rank, p.order_index AS owner_order, p.id AS row_id,
  CASE WHEN e.trashed_at IS NULL THEN 1 ELSE 0 END AS visible
FROM photo p LEFT JOIN entry e ON e.id = p.entry_id
  LEFT JOIN milestone m ON m.id = p.milestone_id
UNION ALL
SELECT h.uuid, h.file_path, 'hair', h.epoch_day, NULL, h.uuid, 0, 1, 0, h.id, 1
FROM hair_photo h
UNION ALL
SELECT r.uuid, r.file_path, 'hairRemoval', s.epoch_day, NULL, s.uuid, 0, 2, 0, r.id, 1
FROM hair_removal_photo r JOIN hair_removal_session s ON s.id = r.session_id
UNION ALL
SELECT t.uuid, t.file_path, 'tryout', t.epoch_day, y.label, y.uuid, 0, 3, 0, t.id, 1
FROM tryout_photo t JOIN tryout y ON y.id = t.tryout_id
UNION ALL
SELECT c.uuid, c.file_path, 'procedure', c.epoch_day, d.name, d.uuid, 0, 4, 0, c.id, 1
FROM procedure_photo c JOIN procedure d ON d.id = c.procedure_id
UNION ALL
SELECT v.uuid, v.file_path, 'video', n.epoch_day, NULL, CAST(n.id AS TEXT), 0,
  5, v.order_index, v.id, CASE WHEN n.trashed_at IS NULL THEN 1 ELSE 0 END
FROM video_note v JOIN entry n ON n.id = v.entry_id
UNION ALL
SELECT a.uuid, a.file_path, 'voiceRecording', NULL, NULL, CAST(a.entry_id AS TEXT),
  0, NULL, a.order_index, a.id, 1
FROM voice_recording a
UNION ALL
SELECT d.uuid, d.file_path, 'document', d.epoch_day, NULL, d.uuid,
  0, NULL, 0, d.id, 1
FROM document d
UNION ALL
SELECT b.uuid, b.passage_file_path, 'voiceBenchmarkPassage', b.epoch_day, NULL, b.uuid,
  0, NULL, 0, b.id, 1
FROM voice_benchmark b
UNION ALL
SELECT b.uuid, b.vowel_file_path, 'voiceBenchmarkVowel', b.epoch_day, NULL, b.uuid,
  0, NULL, 0, b.id, 1
FROM voice_benchmark b WHERE b.vowel_file_path IS NOT NULL;
` },
  /* Functional audit ticket 28: a hair-removal session can say how long it ran
     (electrolysis is booked by the hour). NULL until written; hairRemoval.ts
     refuses a length outside 1 to 1440 and archiveRowValidation.ts judges an
     archive row by the same range, so no CHECK. Pain was made nullable by
     version 94's rebuild. */
  { version: 107, sql: 'ALTER TABLE hair_removal_session ADD COLUMN minutes INTEGER;' },
  /* Functional audit ticket 08: the journaling pause is cut. The check-in
     it silenced has its own pause now, one date in the checkInPausedThrough
     preference, and the streak it bridged is gone. Rows are dropped, not
     converted; archives that still carry the section skip it on restore
     (DROPPED_ARCHIVE_SECTION_NAMES). */
  { version: 108, sql: `
DROP TABLE journaling_pause;
DELETE FROM area_state WHERE area = 'journalingPauses';
DELETE FROM pref WHERE key = 'pauseActiveBannerEnabled';
` },
  /* Functional audit ticket 08: a reminder has no type (it only ever picked
     an icon), and the pre-rc WEEKLY recurrence has no reader left. SQLite
     cannot drop a column or change a CHECK in place, so the table is rebuilt,
     its AUTOINCREMENT counter carried over, and the trigger that anchored a
     WEEKLY insert goes with the old table. A row could only hold WEEKLY
     between that trigger's insert and its update, so none should exist; one
     that does becomes the seven-day progression the trigger would have made. */
  { version: 109, sql: `
CREATE TABLE reminder_new (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid             TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  time             TEXT NOT NULL,
  recurrence       TEXT CHECK (recurrence IN ('DAILY','EVERY_N_DAYS')),
  interval         INTEGER,
  anchor_epoch_day INTEGER,
  epoch_day        INTEGER,
  enabled          INTEGER NOT NULL DEFAULT 1,
  updated_at       INTEGER NOT NULL,
  auto_source      TEXT,
  CHECK (
    (recurrence IS NULL AND epoch_day IS NOT NULL AND interval IS NULL AND anchor_epoch_day IS NULL)
    OR (recurrence IS 'EVERY_N_DAYS' AND interval IS NOT NULL AND anchor_epoch_day IS NOT NULL AND epoch_day IS NULL)
    OR (recurrence IS 'DAILY' AND interval IS NULL AND anchor_epoch_day IS NULL AND epoch_day IS NULL)
  )
);
INSERT INTO reminder_new (id, uuid, title, time, recurrence, interval, anchor_epoch_day, epoch_day, enabled, updated_at, auto_source)
  SELECT id, uuid, title, time,
    CASE recurrence WHEN 'WEEKLY' THEN 'EVERY_N_DAYS' ELSE recurrence END,
    CASE recurrence WHEN 'WEEKLY' THEN 7 ELSE interval END,
    CASE recurrence
      WHEN 'WEEKLY' THEN CAST(strftime('%s', date(updated_at / 1000, 'unixepoch', 'localtime')) AS INTEGER) / 86400
      ELSE anchor_epoch_day
    END,
    epoch_day, enabled, updated_at, auto_source
  FROM reminder;
DELETE FROM sqlite_sequence WHERE name = 'reminder_new';
INSERT INTO sqlite_sequence (name, seq) SELECT 'reminder_new', seq FROM sqlite_sequence WHERE name = 'reminder';
DROP TABLE reminder;
ALTER TABLE reminder_new RENAME TO reminder;
` },
  /* Functional audit ticket 27: an appointment's time of day, and the
     person's own notes on the people they see. Plain ADD COLUMNs after
     ticket 26's rebuild, as its own comment planned. `time_of_day` is
     `HH:MM` or NULL, checked in appointments.ts rather than by a CHECK
     (the audit's CHECK policy). A provider is never shared, so deleting
     one leaves its appointments standing with nobody named. `competence`
     has no CHECK either: providers.ts reads anything it does not know as
     not said. */
  { version: 110, sql: `
CREATE TABLE provider (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  contact     TEXT,
  competence  TEXT,
  impressions TEXT,
  updated_at  INTEGER NOT NULL
);
ALTER TABLE appointment ADD COLUMN time_of_day TEXT;
ALTER TABLE appointment ADD COLUMN provider_id INTEGER REFERENCES provider(id) ON DELETE SET NULL;
CREATE INDEX idx_appointment_provider ON appointment(provider_id);
` },
  /* Functional audit ticket 34: the roadmap keeps only its legal track.
     Ticks against the social, presentational and medical goals are dropped,
     not converted, and so is the per-track "not my path" table, which one
     track and the "Polish legal steps" switch leave nothing to do. A
     document filed against a cut goal is unfiled, the way deleting a custom
     goal unfiles one.

     Round two gave the person categories of their own (roadmap_category):
     a uuid, a name, and the goals whose track holds that uuid. A custom goal
     written under a cut track keeps its grouping in a category whose uuid
     is the old track key and whose name is empty, which the screen fills
     with the old track's name in the language it runs in until somebody
     renames it. Goals under 'legal' sit with the Polish legal steps. */
  { version: 111, sql: `
UPDATE document SET target_kind = NULL, target_id = NULL
  WHERE target_kind = 'goal'
    AND (target_id LIKE 'pl-social-%' OR target_id LIKE 'pl-presentational-%' OR target_id LIKE 'pl-medical-%');
DELETE FROM roadmap_check
  WHERE pack_key = 'pl'
    AND (goal_key LIKE 'pl-social-%' OR goal_key LIKE 'pl-presentational-%' OR goal_key LIKE 'pl-medical-%');
DROP TABLE roadmap_track;
DELETE FROM area_state WHERE area = 'roadmapTracks';
CREATE TABLE roadmap_category (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO roadmap_category (uuid, name, updated_at)
  SELECT track, '', MAX(updated_at) FROM roadmap_goal
    WHERE track IN ('social', 'presentational', 'medical')
    GROUP BY track ORDER BY MIN(id);
` },
  /* Functional audit ticket 25: one taper per procedure. The app reads the
     taper as a single row, but the schema never said so, and a merge or a
     stray write could leave a procedure with two. The newest of each
     procedure's tapers is kept (by updated_at, then the later row), and a
     UNIQUE index stands in for the constraint a rebuild would add: SQLite
     enforces both the same way, and an index needs no copy of the table. */
  { version: 112, sql: `
DELETE FROM taper WHERE id NOT IN (
  SELECT (SELECT newest.id FROM taper newest
           WHERE newest.procedure_id = t.procedure_id
           ORDER BY newest.updated_at DESC, newest.id DESC LIMIT 1)
    FROM taper t GROUP BY t.procedure_id
);
CREATE UNIQUE INDEX idx_taper_procedure ON taper(procedure_id);
` },
  /* Functional audit ticket 20: a medication reminder names the drug it is
     for, in the regimen's own words, so its notification can open that
     drug's dose log and carry Taken and Skip. Null for every other reminder,
     which is every reminder stored before this. */
  { version: 113, sql: 'ALTER TABLE reminder ADD COLUMN drug TEXT;' },
  /* Functional audit ticket 35: the post-ruling steps that each named an
     office became a list of institutions, moved through submitted, waiting
     and done on dated changes. A tick on one of the six steps that became an
     institution is dropped, since a tick has no date to give a change; a
     hidden flag stays (the institution keeps the step's key), so a row the
     person hid stays hidden. The "bank, insurers, clinic, phone operator"
     step is retired, so its tick goes and paper filed against it is
     unfiled. Paper filed against the six stays filed: same key.

     `roadmap_institution` holds the ones the person adds. A change names
     its institution by a built-in key or such a row's uuid in one column,
     the way roadmap_goal.track names 'legal' or a category, so no foreign
     key; deleting an institution deletes its changes in the same
     transaction (journal/roadmap.ts). `status` has no CHECK (the audit's
     CHECK policy): rowValues.ts's INSTITUTION_STATUSES is the vocabulary. */
  { version: 114, sql: `
UPDATE document SET target_kind = NULL, target_id = NULL
  WHERE target_kind = 'goal' AND target_id = 'pl-legal-institutions';
DELETE FROM roadmap_check
  WHERE pack_key = 'pl' AND (goal_key = 'pl-legal-institutions'
    OR (hidden = 0 AND goal_key IN ('pl-legal-pesel', 'pl-legal-id-card', 'pl-legal-passport',
      'pl-legal-driving-licence', 'pl-legal-zus-ceidg', 'pl-legal-diplomas')));
UPDATE roadmap_check SET status = 'unchecked'
  WHERE pack_key = 'pl' AND goal_key IN ('pl-legal-pesel', 'pl-legal-id-card', 'pl-legal-passport',
    'pl-legal-driving-licence', 'pl-legal-zus-ceidg', 'pl-legal-diplomas');
CREATE TABLE roadmap_institution (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE roadmap_institution_change (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid        TEXT NOT NULL UNIQUE,
  institution TEXT NOT NULL,
  status      TEXT NOT NULL,
  epoch_day   INTEGER NOT NULL,
  note        TEXT,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_roadmap_institution_change ON roadmap_institution_change(institution, epoch_day);
CREATE INDEX idx_roadmap_institution_change_epoch_day ON roadmap_institution_change(epoch_day);
` },
  /* Functional audit ticket 30: a cost on the records that cost money - an
     amount, its currency and whether it was refunded. Plain ADD COLUMNs:
     nullable amount and currency, cost.ts's assertValidCost is the rule (no
     CHECK, the audit's CHECK policy). On the stock row it is the cost of the
     supply held now, next to ticket 47's expiry and pharmacy note; there is
     no purchase log. Hair removal's free-text cost is read into the new
     columns, or into the session's note when it does not parse
     (cost-migration.ts), and the old column is left null for ticket 50 to
     drop. */
  { version: 115, sql: `
ALTER TABLE hair_removal_session ADD COLUMN cost_amount REAL;
ALTER TABLE hair_removal_session ADD COLUMN cost_currency TEXT;
ALTER TABLE hair_removal_session ADD COLUMN cost_refunded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE appointment ADD COLUMN cost_amount REAL;
ALTER TABLE appointment ADD COLUMN cost_currency TEXT;
ALTER TABLE appointment ADD COLUMN cost_refunded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE procedure ADD COLUMN cost_amount REAL;
ALTER TABLE procedure ADD COLUMN cost_currency TEXT;
ALTER TABLE procedure ADD COLUMN cost_refunded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lab_result ADD COLUMN cost_amount REAL;
ALTER TABLE lab_result ADD COLUMN cost_currency TEXT;
ALTER TABLE lab_result ADD COLUMN cost_refunded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE medication_stock ADD COLUMN cost_amount REAL;
ALTER TABLE medication_stock ADD COLUMN cost_currency TEXT;
ALTER TABLE medication_stock ADD COLUMN cost_refunded INTEGER NOT NULL DEFAULT 0;
`, apply: (db) => migrateHairRemovalCost(db, deviceDefaultCurrency()) },
  /* Functional audit ticket 15: the patch-schedule tile is folded into the
     dose panel, so the switch that turned it off has nothing left to turn
     off. The dose panel's own switch is untouched. */
  { version: 116, sql: "DELETE FROM pref WHERE key = 'patchScheduleTileEnabled';" },
  /* Functional audit ticket 48: a deletion leaves a row behind for an
     archive Merge to carry, and seeded built-ins stop reading as edits
     (deletion-migration.ts). */
  { version: 117, sql: DELETION_LOG },
  /* Functional audit ticket 44: the preference catalogue sheds its dead and
     legacy keys before 1.0 makes every rename a permanent shim. The eight
     per-surface switches become one `surfaceOverrides` map, `lockOnLeave`
     and the legacy cycle opt-in are read into their replacements, and the
     entry editor's four never-written card switches go. Done in code
     (prefs-cleanup-migration.ts) because it reads and rewrites JSON values. */
  { version: 118, sql: `
DELETE FROM pref WHERE key IN ('entryTryoutPromptEnabled', 'entryDoseQuickLogEnabled',
  'entryProcedureRecoveryEnabled', 'entryHrtEffectsEnabled');
`, apply: migratePrefsCleanup },
  /* Functional audit ticket 50: the writerless columns go, the uuid-holding
     `*_id` columns become `*_uuid`, the debrief state leaves `checklist`, and
     a voice benchmark names its analyzer (hygiene-migration.ts). */
  { version: 119, sql: MIGRATION_HYGIENE }
];

/** `steps` as one migration numbered `version`: the first step's SQL is the
    migration's own, and the rest run from its `apply`, in order, each data
    conversion right after the SQL it was written against. The runner wraps
    the whole of it in one transaction and sets the version once, at the end. */
function asOneStep(version: number, steps: Migration[]): Migration {
  const [first, ...rest] = steps;
  return {
    version,
    sql: first.sql,
    apply: async (db) => {
      await first.apply?.(db);
      for (const step of rest) {
        await db.exec(step.sql);
        await step.apply?.(db);
      }
    }
  };
}

export const migrations: Migration[] = [
  { version: 88, sql: BASELINE_SCHEMA, baseline: true },
  asOneStep(119, POST_RC1_STEPS),
  /* Pre-release-human 12, bug 25: progress photos, a pose-by-pose record
     of shots taken on purpose (progress-photo-migration.ts). */
  { version: 120, sql: PROGRESS_PHOTOS }
];
