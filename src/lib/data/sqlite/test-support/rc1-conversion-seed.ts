/* Rows written into a copy of the rc.1 released journal (schema 88) so that every data
   conversion between 88 and 119 has something to convert. The released fixture holds one of
   most things but not the cases those steps were written for: two tapers on one procedure,
   a WEEKLY reminder, a debrief in the checklist columns, a garment tryout, ticks on cut
   roadmap goals, stored preferences, a cost that does not parse, duplicate stock rows.

   The pre-squash chain's output for the seeded copy is frozen in
   schema-v119-rc1-seeded-rows.txt, and the squash is held to it. This text is frozen with
   that file: changing it means the frozen rows no longer describe it.

   Nothing here depends on the device. The WEEKLY reminder's updated_at is noon UTC, so its
   local date is the same in every zone from UTC-11 to UTC+11, and no cost is a bare number
   (which would take the locale's currency). */

export const RC1_CONVERSION_SEED = `
-- 112: two more tapers on procedure 1 (the newest wins) and two tied ones on
-- procedure 2 (the later row wins).
INSERT INTO taper (uuid, procedure_id, start_epoch_day, stages, updated_at) VALUES
  ('seed-taper-old', 1, 19900, '[]', 1791990400000),
  ('seed-taper-new', 1, 19960, '[{"everyNDays":2,"days":10}]', 1791990500000),
  ('seed-taper-tie-a', 2, 20050, '[]', 1791990415000),
  ('seed-taper-tie-b', 2, 20051, '[]', 1791990415000);

-- 109: a WEEKLY reminder becomes every seven days from its local date.
INSERT INTO reminder (uuid, title, type, time, recurrence, interval, anchor_epoch_day, epoch_day, enabled, updated_at, auto_source)
  VALUES ('seed-weekly', 'weekly gel', 'med', '09:00', 'WEEKLY', NULL, NULL, NULL, 1, 1791979200000, NULL);

-- 91: a second stock row for the same drug under another spelling, older,
-- and a stock reminder for each spelling.
INSERT INTO medication_stock (uuid, drug, quantity, unit, recorded_epoch_day, updated_at)
  VALUES ('seed-stock-dup', 'Estradiol Valerate', 2, 'ampoules', 19990, 1791990000000);
INSERT INTO reminder (uuid, title, type, time, recurrence, interval, anchor_epoch_day, epoch_day, enabled, updated_at, auto_source) VALUES
  ('seed-stock-reminder-a', 'restock', 'med', '10:00', NULL, NULL, NULL, 20010, 1, 1791990415000, 'stock:estradiol valerate'),
  ('seed-stock-reminder-b', 'restock', 'med', '10:00', NULL, NULL, NULL, 20011, 1, 1791990416000, 'stock:Estradiol Valerate');

-- 93: an episode whose drug is not HRT keeps the default class.
INSERT INTO regimen_episode (uuid, drug, ester, dose, dose_unit, route, interval, start_epoch_day, updated_at)
  VALUES ('seed-episode-other', 'ibuprofen', NULL, 200, 'mg', 'oral', 'daily', 19500, 1791990415000);

-- 115: a cost that does not parse moves into the note, and blank text adds
-- nothing.
INSERT INTO hair_removal_session (uuid, epoch_day, area, method, pain_rating, cost, provider, updated_at) VALUES
  ('seed-cost-text', 20001, 'chin', 'electrolysis', 3, 'paid with a voucher', 'Studio', 1791990415000),
  ('seed-cost-blank', 20002, 'neck', 'laser', 1, '   ', 'Studio', 1791990415000);

-- 105: a garment and a presentation step are cut, with their photos and
-- readings; a milestone that named one keeps standing, unlinked.
INSERT INTO tryout (uuid, kind, label, description, start_epoch_day, end_epoch_day, updated_at) VALUES
  ('seed-tryout-garment', 'garment', 'skirt', NULL, 19800, NULL, 1791990415000),
  ('seed-tryout-step', 'presentation_step', 'earrings', NULL, 19810, NULL, 1791990415000);
INSERT INTO tryout_photo (uuid, tryout_id, epoch_day, file_path, updated_at)
  SELECT 'seed-tryout-photo', id, 19800, 'seed-garment.enc', 1791990415000 FROM tryout WHERE uuid = 'seed-tryout-garment';
INSERT INTO felt_sense (uuid, tryout_id, milestone_id, epoch_day, mood, note, updated_at)
  SELECT 'seed-felt-garment', id, NULL, 19801, 4, 'twirled', 1791990415000 FROM tryout WHERE uuid = 'seed-tryout-garment';
INSERT INTO milestone (uuid, name, epoch_day, template_key, updated_at, roadmap_goal_key, procedure_id, tryout_id, description) VALUES
  ('seed-milestone-garment', 'first skirt', 19802, NULL, 1791990415000, NULL, NULL, 'seed-tryout-garment', ''),
  ('seed-milestone-procedure', 'surgery day', 19950, NULL, 1791990415000, NULL, 'f861a0f5-9591-43ca-817b-70dc8024d631', NULL, '');

-- 119: uuid-holding *_id columns are renamed with their values.
UPDATE entry_template SET presentation_id = '8d6b68d1-b897-427f-a220-eaa4d9d9d53b' WHERE key = 'euphoria_day';

-- 119: a debrief written, a debrief dismissed, and one appointment both
-- written and dismissed (ON CONFLICT keeps the entry and sets dismissed).
INSERT INTO checklist (uuid, owner_kind, owner_uuid, updated_at, appointment_epoch_day, debrief_entry_id, debrief_dismissed_epoch_day, debrief_entry_appointment_id, debrief_dismissed_appointment_id) VALUES
  ('seed-checklist-written', 'appointment', '6f05bcc4-e6a9-49d2-a743-9ac96df40a2c', 1791990415000, 19950, 1, NULL, '6f05bcc4-e6a9-49d2-a743-9ac96df40a2c', NULL),
  ('seed-checklist-dismissed', 'appointment', 'a8081c39-03f8-4e61-aeb1-f4456154db3e', 1791990415000, 20030, NULL, 20031, NULL, 'a8081c39-03f8-4e61-aeb1-f4456154db3e'),
  ('seed-checklist-both', 'appointment', 'seed-appointment-both', 1791990415000, NULL, 2, 20040, 'seed-appointment-both', 'seed-appointment-both');

-- 111 and 114: ticks on cut tracks, on the institutions step and on a step
-- that became an institution go; paper filed against them is unfiled. A
-- custom goal under a cut track keeps its grouping in a category.
INSERT INTO roadmap_check (pack_key, goal_key, updated_at, status) VALUES
  ('pl', 'pl-social-name-at-work', 1791990415000, 'checked'),
  ('pl', 'pl-medical-endo', 1791990415000, 'checked'),
  ('pl', 'pl-presentational-voice', 1791990415000, 'not-my-path'),
  ('pl', 'pl-legal-institutions', 1791990415000, 'checked'),
  ('pl', 'pl-legal-pesel', 1791990415000, 'checked');
INSERT INTO roadmap_goal (uuid, track, text, status, updated_at) VALUES
  ('seed-goal-medical', 'medical', 'find a surgeon', 'unchecked', 1791990420000),
  ('seed-goal-legal', 'legal', 'ask a lawyer', 'unchecked', 1791990415000);
INSERT INTO roadmap_track (track, updated_at) VALUES ('social', 1791990415000);
INSERT INTO document (uuid, epoch_day, title, file_path, target_kind, target_id, updated_at) VALUES
  ('seed-doc-social', 20000, 'letter', 'seed-doc-social.enc', 'goal', 'pl-social-name-at-work', 1791990415000),
  ('seed-doc-institutions', 20000, 'form', 'seed-doc-institutions.enc', 'goal', 'pl-legal-institutions', 1791990415000),
  ('seed-doc-legal', 20000, 'ruling', 'seed-doc-legal.enc', 'goal', 'pl-legal-court-file', 1791990415000);

-- 97, 108, 111: area states of cut areas go.
INSERT INTO area_state (area, hidden, finished_epoch_day, updated_at, suspended_epoch_day) VALUES
  ('measurementTypes', 1, NULL, 1791990415000, NULL),
  ('journalingPauses', 0, 20000, 1791990415000, NULL),
  ('roadmapTracks', 0, NULL, 1791990415000, NULL);

-- 97, 108, 116, 118: preferences read across or deleted, and one kept.
INSERT INTO pref (key, value) VALUES
  ('measurementUnit', '"cm"'),
  ('pauseActiveBannerEnabled', 'true'),
  ('patchScheduleTileEnabled', 'false'),
  ('entryTryoutPromptEnabled', 'true'),
  ('wearTimerEnabled', 'false'),
  ('wrappedEnabled', 'true'),
  ('lockOnLeave', 'true'),
  ('cycleTrackingEnabled', 'true'),
  ('theme', '"dark"');
`;
