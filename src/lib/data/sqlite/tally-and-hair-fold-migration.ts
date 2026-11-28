/* Version 124 drops tally_event and hair_stage, including their stored rows.
   The misgendered entry tag remains. Move hair photos to the fourth built-in
   progress pose, 'hair', preserving uuid, day, filename, clock and file bytes.
   Boot seeds the pose before the first read; until then it falls back to front.

   Dropping the old tables also removes their indexes and deletion triggers
   (v117). Rebuild media_file with v120's remaining arms; the copied photos
   now appear in its progress arm. Remove stale deletion log and area_state
   rows for tallyEvents, hairStages and hairPhotos, and the dismissed hair
   photo protocol preference. Restore skips those legacy Archive sections. */

export const TALLY_AND_HAIR_FOLD = `
INSERT INTO progress_photo (uuid, epoch_day, pose, file_path, updated_at)
  SELECT uuid, epoch_day, 'hair', file_path, updated_at FROM hair_photo ORDER BY id;

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

DROP TABLE hair_photo;
DROP TABLE hair_stage;
DROP TABLE tally_event;
DELETE FROM deletion WHERE tbl IN ('tally_event', 'hair_stage', 'hair_photo');
DELETE FROM area_state WHERE area IN ('tallyEvents', 'hairStages', 'hairPhotos');
DELETE FROM pref WHERE key = 'hairPhotoProtocolDismissed';
`;
