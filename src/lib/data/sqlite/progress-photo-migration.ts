/* Schema 120 adds a dated table for progress photos. Keep pose as text
   without a CHECK. Unknown values read as Front in progressPhotos.ts.

   Recreate `media_file` with the v119 arms unchanged. Append progress
   photos after video so earlier same-day sorting stays stable. The view
   serves the photo library and orphan sweep. Add the table's deletion
   trigger for Archive Merge. */

import { deletionTrigger } from './deletion-migration.ts';

export const PROGRESS_PHOTOS = `
CREATE TABLE progress_photo (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  epoch_day  INTEGER NOT NULL,
  pose       TEXT NOT NULL,
  file_path  TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_progress_photo_pose ON progress_photo(pose, epoch_day);
${deletionTrigger('progress_photo', 'OLD.uuid')}

DROP VIEW media_file;
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
FROM voice_benchmark b WHERE b.vowel_file_path IS NOT NULL
UNION ALL
SELECT g.uuid, g.file_path, 'progress', g.epoch_day, NULL, g.uuid, 0, 6, 0, g.id, 1
FROM progress_photo g;
`;
