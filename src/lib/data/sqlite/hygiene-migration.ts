/* Version 119 removes unused checklist dates and moves its device-local
   debrief fields to appointment_debrief. Each appointment has one row for
   the debrief entry and dismissal. Both stay local because they refer to
   records on this device.

   Drop hair_removal_session.cost after v115 filled the typed cost columns.
   Rename the UUID-bearing columns on entry, entry_template and milestone
   to *_uuid. RENAME COLUMN keeps foreign keys, indexes and triggers
   attached, including entry's search triggers. Archive field names stay
   stable. Add nullable voice_benchmark.analyzer_version for future takes.

   Recreate the rebuilt tables' deletion triggers. Drop and restore
   media_file unchanged from v106 so it can resolve the rebuilt
   hair_removal_session. Keep regimen_episode.hidden for Care, dose
   attribution and clinician summaries. */

import { deletionTrigger } from './deletion-migration.ts';

export const MIGRATION_HYGIENE = `
DROP VIEW media_file;

CREATE TABLE appointment_debrief (
  appointment_uuid TEXT PRIMARY KEY,
  entry_id         INTEGER REFERENCES entry(id) ON DELETE SET NULL,
  dismissed        INTEGER NOT NULL DEFAULT 0
);
INSERT INTO appointment_debrief (appointment_uuid, entry_id, dismissed)
  SELECT debrief_entry_appointment_id, debrief_entry_id, 0 FROM checklist
    WHERE debrief_entry_appointment_id IS NOT NULL AND debrief_entry_id IS NOT NULL;
INSERT INTO appointment_debrief (appointment_uuid, entry_id, dismissed)
  SELECT debrief_dismissed_appointment_id, NULL, 1 FROM checklist
    WHERE debrief_dismissed_appointment_id IS NOT NULL
  ON CONFLICT (appointment_uuid) DO UPDATE SET dismissed = 1;

CREATE TABLE checklist_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  owner_kind TEXT,
  owner_uuid TEXT,
  updated_at INTEGER NOT NULL,
  CHECK ((owner_kind IS NULL) = (owner_uuid IS NULL))
);
INSERT INTO checklist_new (id, uuid, owner_kind, owner_uuid, updated_at)
  SELECT id, uuid, owner_kind, owner_uuid, updated_at FROM checklist;
DELETE FROM sqlite_sequence WHERE name = 'checklist_new';
INSERT INTO sqlite_sequence (name, seq) SELECT 'checklist_new', seq FROM sqlite_sequence WHERE name = 'checklist';
DROP TABLE checklist;
ALTER TABLE checklist_new RENAME TO checklist;
CREATE INDEX idx_checklist_owner ON checklist(owner_kind, owner_uuid);
${deletionTrigger('checklist', 'OLD.uuid')}

CREATE TABLE hair_removal_session_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid          TEXT NOT NULL UNIQUE,
  epoch_day     INTEGER NOT NULL,
  area          TEXT NOT NULL,
  method        TEXT NOT NULL,
  pain_rating   INTEGER CHECK (pain_rating IS NULL OR pain_rating BETWEEN 1 AND 5),
  provider      TEXT NOT NULL,
  updated_at    INTEGER NOT NULL,
  note          TEXT,
  minutes       INTEGER,
  cost_amount   REAL,
  cost_currency TEXT,
  cost_refunded INTEGER NOT NULL DEFAULT 0
);
INSERT INTO hair_removal_session_new (id, uuid, epoch_day, area, method, pain_rating, provider, updated_at, note,
    minutes, cost_amount, cost_currency, cost_refunded)
  SELECT id, uuid, epoch_day, area, method, pain_rating, provider, updated_at, note,
    minutes, cost_amount, cost_currency, cost_refunded FROM hair_removal_session;
DELETE FROM sqlite_sequence WHERE name = 'hair_removal_session_new';
INSERT INTO sqlite_sequence (name, seq)
  SELECT 'hair_removal_session_new', seq FROM sqlite_sequence WHERE name = 'hair_removal_session';
DROP TABLE hair_removal_session;
ALTER TABLE hair_removal_session_new RENAME TO hair_removal_session;
CREATE INDEX idx_hair_removal_session_epoch_day ON hair_removal_session(epoch_day);
CREATE INDEX idx_hair_removal_session_area ON hair_removal_session(area);
${deletionTrigger('hair_removal_session', 'OLD.uuid')}

ALTER TABLE entry RENAME COLUMN presentation_id TO presentation_uuid;
ALTER TABLE entry_template RENAME COLUMN presentation_id TO presentation_uuid;
ALTER TABLE milestone RENAME COLUMN procedure_id TO procedure_uuid;
ALTER TABLE milestone RENAME COLUMN tryout_id TO tryout_uuid;
DROP INDEX idx_entry_presentation_id;
CREATE INDEX idx_entry_presentation_uuid ON entry(presentation_uuid, timestamp);

ALTER TABLE voice_benchmark ADD COLUMN analyzer_version INTEGER;

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
`;
