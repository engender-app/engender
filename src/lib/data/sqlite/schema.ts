/* The whole schema in one statement (ticket 34).

   This used to be 78 forward-only migrations, `SCHEMA_V1` through
   `SCHEMA_V78`, applied in order against `PRAGMA user_version` (ADR-0006).
   Nothing had ever run them from anywhere but empty - no release has shipped,
   so every installed copy of this app had migrated from nothing - and that is
   a window that shuts the moment somebody outside this repo has a build. It
   was shut deliberately here instead, while it was still free.

   The 78 steps are in git history at the commit that retired them, which is
   where to look for how a column came to be there. What each one still means
   is below, next to the column. The dump the chain produced is frozen in
   `test-support/pre-squash-schema.txt`, and schema.test.ts holds this file to
   it: the two must build the same tables, columns, types, indexes, triggers
   and defaults, and nothing about that is allowed to drift.

   Adding a migration from here on is the ordinary ADR-0006 thing again: a new
   entry in migrations.ts numbered above this baseline, never an edit to the
   SQL below. Editing this string changes what a fresh install gets and what
   an existing one already has, which are then two different schemas wearing
   the same version number. */

export const BASELINE_SCHEMA = `
-- ENTRY AND ITS CONTENT ------------------------------------------------------

-- \`trashed_at\` marks rather than moves: a trashed entry stays on this row, so
-- it stays covered by the same whole-database encryption every other row has
-- (ADR-0020) - no second table and no second crypto layer. NULL means "in the
-- journal", and every entry-reading query filters on it, the way a hidden tag
-- stays out of the pickers rather than being deleted. Its photos and
-- recordings are not touched and come back with it on restore; the sweep that
-- turns an expired trash row into a real delete runs at boot
-- (entries.ts's purgeExpiredTrash).
--
-- \`starred\` is curation metadata, the same category the identity fields are -
-- not one of Entry's seven content fields (CONTEXT: "Entry"), so it never
-- enters entryContent.ts's closure check and starring an entry can never be
-- what keeps an otherwise-empty one from counting as deleted.
--
-- \`presentation_id\` carries a presentation's uuid directly rather than
-- resolving to a rowid (ADR-0048), the same shape milestone.procedure_id
-- takes. Existing entries stay null, which is a resting state and not a gap.
CREATE TABLE entry (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT NOT NULL UNIQUE,
  epoch_day       INTEGER NOT NULL,
  timestamp       INTEGER NOT NULL,
  mood            INTEGER,
  note            TEXT,
  updated_at      INTEGER NOT NULL,
  trashed_at      INTEGER,
  starred         INTEGER NOT NULL DEFAULT 0,
  presentation_id TEXT REFERENCES presentation(uuid)
);
CREATE INDEX idx_entry_epoch_day ON entry(epoch_day);
CREATE INDEX idx_entry_trashed_at ON entry(trashed_at);
CREATE INDEX idx_entry_presentation_id ON entry(presentation_id, timestamp);

-- Contentless: holds folded text against entry's rowid, not entry.note
-- verbatim. Folding happens in application code (ADR-0005), so inserts and
-- updates stay there too - SQL cannot call foldText().
--
-- \`contentless_delete=1\` (SQLite 3.43+; Node ships 3.51.2 and SQLocal's WASM
-- build 3.48.0) is what makes a delete a plain DELETE. A plain contentless
-- FTS5 table can only forget a row through
-- \`INSERT INTO entry_fts(entry_fts, rowid, folded_text) VALUES('delete', ...)\`,
-- which needs the exact text the row was indexed under - so every edit would
-- have to re-fold the old note and hope the fold function had not changed
-- since, and a mismatch does not fail, it quietly decrements token counts that
-- were never there.
--
-- A delete needs no folded text, so it is a trigger, which is what makes the
-- index survive delete paths written later that know nothing about it.
CREATE VIRTUAL TABLE entry_fts USING fts5(
  folded_text,
  content='',
  contentless_delete=1
);
CREATE TRIGGER entry_fts_after_delete AFTER DELETE ON entry BEGIN
  DELETE FROM entry_fts WHERE rowid = old.id;
END;

-- No \`kind\` and no \`order_index\`: both are derived state (ADR-0010), and
-- \`kind\` in particular goes stale the day its date passes.
--
-- The three link columns each name where a milestone came from, all nullable,
-- all holding a uuid rather than a rowid, and none carrying a foreign key:
-- \`roadmap_goal_key\` can name a bundled goal from a country pack or a custom
-- goal's uuid, and \`procedure_id\`/\`tryout_id\` are cleared by their own
-- deletes before the parent row goes (ADR-0045), so a milestone never carries
-- a dangling reference and a deleted milestone leaves its roadmap tick
-- checked.
CREATE TABLE milestone (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  epoch_day        INTEGER NOT NULL,
  template_key     TEXT,
  updated_at       INTEGER NOT NULL,
  roadmap_goal_key TEXT,
  procedure_id     TEXT REFERENCES procedure(uuid),
  tryout_id        TEXT REFERENCES tryout(uuid),
  description      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_milestone_epoch_day ON milestone(epoch_day);

-- One photo table for entries and milestones; exactly one owner is set. That
-- CHECK is why every later file-carrying record got a table of its own instead
-- of a third arm here: SQLite cannot ALTER a table-level CHECK in place, so
-- widening this one means rebuilding the table every entry and milestone
-- already depends on.
--
-- \`epoch_day_override\` is the only day a photo can carry: normalization
-- strips EXIF/XMP/IPTC on import (ADR-0015), so a photo's day is read off its
-- owner unless this says otherwise. photos.ts's reads put it first in their
-- COALESCE; nothing derives from it and it derives from nothing.
CREATE TABLE photo (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid               TEXT NOT NULL UNIQUE,
  entry_id           INTEGER REFERENCES entry(id) ON DELETE CASCADE,
  milestone_id       INTEGER REFERENCES milestone(id) ON DELETE CASCADE,
  file_path          TEXT NOT NULL,
  order_index        INTEGER NOT NULL DEFAULT 0,
  updated_at         INTEGER NOT NULL,
  starred            INTEGER NOT NULL DEFAULT 0,
  epoch_day_override INTEGER,
  CHECK ((entry_id IS NOT NULL) + (milestone_id IS NOT NULL) = 1)
);
CREATE INDEX idx_photo_entry ON photo(entry_id);
CREATE INDEX idx_photo_milestone ON photo(milestone_id);

-- Entry-only, one file each, and their own tables rather than owner arms on
-- \`photo\` for the CHECK reason above. Neither gets a thumbnail pair: a
-- recording has one file, and a video note's poster frame would be derived
-- state (ADR-0010), so playback reads the video itself. Both share photo's
-- file store, so the boot orphan sweep reads these tables too
-- (sweepOrphanPhotos, journal/photos.ts) or every saved one looks orphaned the
-- moment it runs.
CREATE TABLE voice_recording (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid        TEXT NOT NULL UNIQUE,
  entry_id    INTEGER NOT NULL REFERENCES entry(id) ON DELETE CASCADE,
  file_path   TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_voice_recording_entry ON voice_recording(entry_id);

CREATE TABLE video_note (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid        TEXT NOT NULL UNIQUE,
  entry_id    INTEGER NOT NULL REFERENCES entry(id) ON DELETE CASCADE,
  file_path   TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_video_note_entry ON video_note(entry_id);

-- The day the person looked back, stored rather than derived (ADR-0010):
-- nothing else in the schema could produce it. Cascades on delete because a
-- margin note has no files to clean up, so there is no ordering rule for the
-- database to get wrong - and trashing an entry only flags it, so a trashed
-- entry's notes survive until the purge or an untrash.
CREATE TABLE margin_note (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  entry_id   INTEGER NOT NULL REFERENCES entry(id) ON DELETE CASCADE,
  epoch_day  INTEGER NOT NULL,
  text       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_margin_note_entry_id ON margin_note(entry_id);

-- A region key is plain TEXT validated against \`body_region\` below, not a
-- CHECK and not a rowid join.
--
-- Two independent intensities, both nullable. One unsigned \`intensity\` meant
-- the strongest thing a person could say about a part of their body they are
-- at peace with was 0, which reads the same as never having logged it. Now
-- "this hurt", "this felt good" and "both at once" are each sayable and none
-- of them is the absence of another. The CHECK keeps the row meaningful: a
-- region present with neither says nothing its absence does not already say.
--
-- Whole-set replace on write, like entry_tag rather than
-- entry_dimension_value: the picker shows every region every time, so a region
-- missing from a save is the user deselecting it.
CREATE TABLE entry_body_region (
  entry_id  INTEGER NOT NULL REFERENCES entry(id) ON DELETE CASCADE,
  region    TEXT NOT NULL,
  dysphoria INTEGER,
  euphoria  INTEGER,
  PRIMARY KEY (entry_id, region),
  CHECK (dysphoria IS NOT NULL OR euphoria IS NOT NULL)
);
CREATE INDEX idx_ebr_region ON entry_body_region(region);

-- GENDER SCALES, TAGS AND THE REFERENCE DATA AROUND THEM ----------------------

-- Built-ins are identified by \`key\`, the person's own rows by a minted
-- \`uuid\` (ADR-0002). \`hidden\` because a custom dimension hides and is never
-- deleted: hiding takes it out of every preset, the editor and the charts while
-- its entry_dimension_value rows survive, and absence from every preset cannot
-- say "hidden" - a dimension outside any preset still appears in the metric
-- picker.
CREATE TABLE gender_dimension (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid        TEXT UNIQUE,
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  low_label   TEXT NOT NULL,
  high_label  TEXT NOT NULL,
  min_value   INTEGER NOT NULL DEFAULT 0,
  max_value   INTEGER NOT NULL DEFAULT 100,
  is_built_in INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL,
  hidden      INTEGER NOT NULL DEFAULT 0
);

-- Cascade kept for referential integrity; no code path deletes a dimension
-- today.
CREATE TABLE entry_dimension_value (
  entry_id     INTEGER NOT NULL REFERENCES entry(id) ON DELETE CASCADE,
  dimension_id INTEGER NOT NULL REFERENCES gender_dimension(id) ON DELETE CASCADE,
  value        INTEGER NOT NULL,
  PRIMARY KEY (entry_id, dimension_id)
);
CREATE INDEX idx_edv_dimension ON entry_dimension_value(dimension_id);

CREATE TABLE gender_preset (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid        TEXT UNIQUE,
  key         TEXT UNIQUE,
  name        TEXT NOT NULL,
  is_built_in INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE preset_dimension (
  preset_id    INTEGER NOT NULL REFERENCES gender_preset(id) ON DELETE CASCADE,
  dimension_id INTEGER NOT NULL REFERENCES gender_dimension(id) ON DELETE CASCADE,
  order_index  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (preset_id, dimension_id)
);

CREATE TABLE tag_group (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid        TEXT UNIQUE,
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  order_index INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE tag (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid        TEXT UNIQUE,
  key         TEXT UNIQUE,
  group_id    INTEGER NOT NULL REFERENCES tag_group(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  hidden      INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE entry_tag (
  entry_id INTEGER NOT NULL REFERENCES entry(id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, tag_id)
);
CREATE INDEX idx_entry_tag_tag_id ON entry_tag(tag_id);

-- What a region key is validated against, in place of a constant in code.
-- \`key\` seeds the built-in regions, \`uuid\` mints a custom one's travelling
-- identity, and a row is built-in exactly when its key is not null. No
-- \`language\` - nothing here is per-locale - and no \`order_index\`: hide and
-- add, never reorder.
CREATE TABLE body_region (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT UNIQUE,
  key        TEXT UNIQUE,
  name       TEXT NOT NULL DEFAULT '',
  hidden     INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- A template is the person's own (ADR-0002): built-ins carry \`key\` and never
-- a uuid, authored ones the reverse, and neither column is ever NOT NULL
-- because either can be the row's only identity.
--
-- \`presentation_id\` is free text with no REFERENCES clause at all - not
-- because a presentation might be deleted (it hides, ADR-0057) but because the
-- two travel in separate archive sections (ADR-0027) and restore
-- independently, so an archive whose templates outlive its modes still has to
-- apply. Applying a template resolves the id against what this install
-- currently shows and drops it when it does not resolve.
--
-- Tags and dimension values are child tables mirroring entry_tag and
-- entry_dimension_value down to the FK shape, because a template's tag list is
-- exactly that kind of link - a set of rows a real tag is deleted out from
-- under.
CREATE TABLE entry_template (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT UNIQUE,
  key             TEXT UNIQUE,
  name            TEXT NOT NULL,
  note_scaffold   TEXT NOT NULL DEFAULT '',
  presentation_id TEXT,
  hidden          INTEGER NOT NULL DEFAULT 0,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE entry_template_tag (
  template_id INTEGER NOT NULL REFERENCES entry_template(id) ON DELETE CASCADE,
  tag_id      INTEGER NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  PRIMARY KEY (template_id, tag_id)
);

CREATE TABLE entry_template_dimension_value (
  template_id  INTEGER NOT NULL REFERENCES entry_template(id) ON DELETE CASCADE,
  dimension_id INTEGER NOT NULL REFERENCES gender_dimension(id) ON DELETE CASCADE,
  value        INTEGER NOT NULL,
  PRIMARY KEY (template_id, dimension_id)
);

-- A grouping key, never a set of scales (ADR-0048). No \`key\` column: nothing
-- ships built in, so every row is the person's own and \`uuid\` alone is its
-- travelling identity. \`role_index\` is a role into the active flag
-- (roles.ts's roleAt resolves any stored value by modulo), never a hex, so
-- switching palette recolours every presentation for free. \`hidden\` is the
-- only way a presentation stops offering itself; there is no delete.
CREATE TABLE presentation (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  role_index  INTEGER NOT NULL,
  hidden      INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL
);

-- REMINDERS, PREFERENCES AND THE FLAT LOGS ------------------------------------

-- Stores the rule, not the next-fire instant (ADR-0010): a wall-clock time
-- plus either a recurrence (DAILY/WEEKLY need nothing else; EVERY_N_DAYS needs
-- interval + anchor_epoch_day) or a concrete one-off epoch_day.
--
-- \`auto_source\` marks a reminder this app manages on someone's behalf - a
-- stock run-out prompt, a wear-session nudge. Nullable, and left alone by every
-- write except the feature's own, so a person saving a reminder through the
-- ordinary editor clears it purely by never knowing it exists: the moment they
-- touch their own copy, the feature stops touching it too.
CREATE TABLE reminder (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid             TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('med','injection','appointment','other')),
  time             TEXT NOT NULL,
  recurrence       TEXT CHECK (recurrence IN ('DAILY','WEEKLY','EVERY_N_DAYS')),
  interval         INTEGER,
  anchor_epoch_day INTEGER,
  epoch_day        INTEGER,
  enabled          INTEGER NOT NULL DEFAULT 1,
  updated_at       INTEGER NOT NULL,
  auto_source      TEXT,
  -- Written with IS instead of = / IN on purpose: with a NULL recurrence,
  -- recurrence = 'EVERY_N_DAYS' and recurrence IN (...) both evaluate to
  -- NULL rather than 0, and SQLite treats a NULL CHECK result as satisfied -
  -- which would silently let a row with no rule and no one-off day through.
  CHECK (
    (recurrence IS NULL AND epoch_day IS NOT NULL AND interval IS NULL AND anchor_epoch_day IS NULL)
    OR (recurrence IS 'EVERY_N_DAYS' AND interval IS NOT NULL AND anchor_epoch_day IS NOT NULL AND epoch_day IS NULL)
    OR ((recurrence IS 'DAILY' OR recurrence IS 'WEEKLY') AND interval IS NULL AND anchor_epoch_day IS NULL AND epoch_day IS NULL)
  )
);

CREATE TABLE pref (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- The check-in's affirming line: the same built-in/custom split tags have
-- (ADR-0002), so a person can add their own and hide an individual built-in.
-- A built-in is seeded with \`text = ''\` and its wording looked up by key in
-- the message catalogue; a custom carries a minted uuid and the line the person
-- wrote. No \`order_index\`: the check-in picks a line by \`epochDay %
-- pool.length\`, never by a position anyone chose.
--
-- \`language\` is null for a built-in, whose wording is looked up fresh in
-- whatever language is active, and 'en' or 'pl' for a custom, which is authored
-- once and never translated. Nothing here enforces language and key/uuid moving
-- together; the write path is what keeps a built-in's language null, the same
-- way \`tag\` leaves that pairing to tags.ts.
CREATE TABLE affirmation (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT UNIQUE,
  key        TEXT UNIQUE,
  language   TEXT CHECK (language IN ('en', 'pl')),
  text       TEXT NOT NULL DEFAULT '',
  hidden     INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_affirmation_language ON affirmation(language);

-- Its own record type, not entry content: it carries no mood, dimension
-- values, tags or note, only which of the two counters was tapped and an
-- optional free-text context. \`kind\` is a fixed two-value CHECK because the
-- counters are never extended or user-defined.
CREATE TABLE tally_event (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  epoch_day  INTEGER NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('misgendered', 'correctly_gendered')),
  context    TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_tally_kind_day ON tally_event(kind, epoch_day);

-- A menstrual event for people on testosterone. No episode reference, so it
-- works whether or not a regimen episode exists - the same rule side_effect and
-- wear_session below follow. "Nothing this month" is a real, loggable state
-- here, not the absence of a row. epoch_day rather than a timestamp (ADR-0001):
-- noticed on a day, with none of a dose event's intraday timing to keep.
CREATE TABLE cycle_event (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  epoch_day  INTEGER NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('period_occurred', 'spotting', 'nothing_this_month')),
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_cycle_event_epoch_day ON cycle_event(epoch_day);

-- \`severity\` is nullable: the screen introduces itself as "no grading and no
-- advice", so an unanswered severity says nothing rather than saying three.
-- The CHECK is the backstop; the area validates before the write.
CREATE TABLE side_effect (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  severity   INTEGER CHECK (severity IS NULL OR severity BETWEEN 1 AND 5),
  epoch_day  INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_side_effect_epoch_day ON side_effect(epoch_day);

-- \`duration_ms\` is nullable to hold a live session's running state - started,
-- not yet stopped - the same way dose_pause.end_epoch_day is null for a pause
-- still running. A backfilled session never has a null duration: its day and
-- duration are both known at save time.
--
-- \`kind\` is NOT NULL because every user-facing string on that screen is
-- picked by it (ADR-0064), and the default is what rows written before the
-- column existed became. No CHECK: wearSessions.ts is the one writer, and a
-- CHECK would refuse to even read back a row arriving from an older archive.
CREATE TABLE wear_session (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT NOT NULL UNIQUE,
  start_timestamp INTEGER NOT NULL,
  duration_ms     INTEGER,
  note            TEXT,
  updated_at      INTEGER NOT NULL,
  kind            TEXT NOT NULL DEFAULT 'binder'
);
CREATE INDEX idx_wear_session_start ON wear_session(start_timestamp);

-- A declared, dated break from journaling, open while \`end_epoch_day\` is
-- null. No \`reason\`: nothing reading a pause cares why it was declared.
CREATE TABLE journaling_pause (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT NOT NULL UNIQUE,
  start_epoch_day INTEGER NOT NULL,
  end_epoch_day   INTEGER,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_journaling_pause_start ON journaling_pause(start_epoch_day);

-- A free-write note to the person's future self. No \`sealed\` column: whether
-- a letter is readable is a question about today (ADR-0010), so screens compare
-- \`unlock_epoch_day\` against today and refuse to render the text before it.
-- No reference to a milestone either - a letter sealed against "two years on
-- hormones" still means that day if the milestone is renamed or deleted - and
-- no second cryptographic layer, since the journal is already encrypted whole
-- (ADR-0020).
CREATE TABLE letter (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid             TEXT NOT NULL UNIQUE,
  epoch_day        INTEGER NOT NULL,
  text             TEXT NOT NULL,
  unlock_epoch_day INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX idx_letter_epoch_day ON letter(epoch_day);

-- The person's own list of words to drop from every word-frequency read, on
-- top of whichever stopword list already applied - a third language, or a name,
-- has nowhere else to go and inflates the count as if it were content.
-- Presence is the whole of the state, so unignoring deletes the row. Stored
-- case-folded the same way tokenize() folds a note, so "Kraków" and "kraków"
-- are one entry.
CREATE TABLE word_frequency_ignore (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  word       TEXT NOT NULL UNIQUE,
  updated_at INTEGER NOT NULL
);

CREATE TABLE saved_question (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  query_text      TEXT NOT NULL DEFAULT '',
  tag_ids         TEXT NOT NULL DEFAULT '',
  moods           TEXT NOT NULL DEFAULT '',
  start_epoch_day INTEGER,
  end_epoch_day   INTEGER,
  has_note        INTEGER NOT NULL DEFAULT 0,
  has_photo       INTEGER NOT NULL DEFAULT 0,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE import_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid        TEXT UNIQUE NOT NULL,
  source      TEXT NOT NULL,
  counts      TEXT NOT NULL,
  imported_at INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- MEDICAL: REGIMEN, DOSES, STOCK AND LABS -------------------------------------

-- \`end_epoch_day\` is set by the person ending an episode explicitly, not
-- derived from whichever episode sorts next: that derivation stops being able
-- to answer the question at all once two episodes for different drugs may
-- overlap on purpose. \`end_reason\` is the person's own assertion, set only
-- alongside that day and cleared whenever it is. No CHECK tying the two -
-- regimen.ts is the one writer, and a CHECK would refuse to even read back a
-- row arriving from an older archive.
CREATE TABLE regimen_episode (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT NOT NULL UNIQUE,
  drug            TEXT NOT NULL,
  ester           TEXT,
  dose            REAL NOT NULL,
  dose_unit       TEXT NOT NULL,
  route           TEXT NOT NULL,
  interval        TEXT NOT NULL,
  start_epoch_day INTEGER NOT NULL,
  hidden          INTEGER NOT NULL DEFAULT 0,
  updated_at      INTEGER NOT NULL,
  end_epoch_day   INTEGER,
  end_reason      TEXT
);
CREATE INDEX idx_regimen_episode_start ON regimen_episode(start_epoch_day);

-- No episode column, deliberately: which regimen episode a dose belongs to is
-- resolved from its own timestamp (regimenEpisode.ts) every time it is asked,
-- so backdating a dose - or inserting a corrective episode underneath one -
-- changes the answer with nothing to rewrite. A stored link would be the
-- migration ADR-0010 exists to avoid.
--
-- \`timestamp\` is epoch milliseconds, not an epoch day: hours-since-last-dose
-- is derived from it and sublingual estradiol peaks in one to two hours, so a
-- day would round away the thing being derived.
--
-- The route-conditional fields are nullable columns because SQLite has no union
-- type; the domain type is a union on route (types.ts) and doses.ts is what
-- turns one into the other, so an oral dose never surfaces a null site.
--
-- \`drug\` is nullable and starts null: a dose needs its own drug only once
-- more than one episode can be active on the day it was logged.
CREATE TABLE dose_event (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid                TEXT NOT NULL UNIQUE,
  timestamp           INTEGER NOT NULL,
  route               TEXT NOT NULL,
  dose                REAL NOT NULL,
  dose_unit           TEXT NOT NULL,
  injection_site      TEXT,
  vehicle             TEXT,
  application_site    TEXT,
  status              TEXT NOT NULL,
  scheduled_dose      REAL,
  scheduled_route     TEXT,
  scheduled_timestamp INTEGER,
  updated_at          INTEGER NOT NULL,
  drug                TEXT
);
CREATE INDEX idx_dose_event_timestamp ON dose_event(timestamp);

CREATE TABLE dose_pause (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT NOT NULL UNIQUE,
  episode_id      INTEGER NOT NULL REFERENCES regimen_episode(id) ON DELETE CASCADE,
  start_epoch_day INTEGER NOT NULL,
  end_epoch_day   INTEGER,
  reason          TEXT NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_dose_pause_episode ON dose_pause(episode_id);

-- \`episode_id\` is UNIQUE: an episode expects one rhythm at a time, and a
-- second row would leave "how often" ambiguous.
--
-- \`recurrence_kind\` names which shape a row is, and the CHECK keeps
-- \`every_n_days\` present for exactly the arm that uses it - the same
-- discriminated union DoseScheduleRecurrence gives in code, enforced again here
-- so a row cannot claim one shape while carrying the other's data.
--
-- Weekdays and dose amounts are child tables, not columns: a schedule has zero
-- or more of each, and both are empty for a schedule that does not use the
-- shape they belong to. \`weekday\` is Monday-first (0-6, epochDay.ts's
-- weekdayOfEpochDay), and \`position\` is the cycle order expectedSlots reads
-- the amounts back in.
CREATE TABLE dose_schedule (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT NOT NULL UNIQUE,
  episode_id      INTEGER NOT NULL UNIQUE REFERENCES regimen_episode(id) ON DELETE CASCADE,
  recurrence_kind TEXT NOT NULL DEFAULT 'everyNDays' CHECK (recurrence_kind IN ('everyNDays', 'weekdays')),
  every_n_days    INTEGER,
  doses_per_day   INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  CHECK ((recurrence_kind = 'everyNDays') = (every_n_days IS NOT NULL))
);

CREATE TABLE dose_schedule_weekday (
  schedule_id INTEGER NOT NULL REFERENCES dose_schedule(id) ON DELETE CASCADE,
  weekday     INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  PRIMARY KEY (schedule_id, weekday)
);

CREATE TABLE dose_schedule_dose_amount (
  schedule_id INTEGER NOT NULL REFERENCES dose_schedule(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  dose        REAL NOT NULL,
  dose_unit   TEXT NOT NULL,
  PRIMARY KEY (schedule_id, position)
);

-- What the person reported, not a decremented number (ADR-0046): one row per
-- drug, matched exactly the way an analyte's unit is, not per regimen episode -
-- a dose or route change starts a new episode and an episode-scoped count would
-- go stale on the next adjustment. "Remaining" is \`quantity\` minus every
-- non-skipped dose logged against that drug since \`recorded_epoch_day\`,
-- worked out on read.
--
-- The two reminder columns are bookkeeping for the run-out prompt, not the
-- projection: \`reminder_ever_created\` records that this drug has had an
-- auto-managed reminder, and \`reminder_dismissed\` that a person's own edit or
-- delete took it over. Both live here rather than on the reminder row because a
-- person deleting that row is exactly the event this has to survive - if the
-- marker went with it, the next dose write would recreate the prompt they just
-- silenced. Saving a fresh count clears both: that is a deliberate act, and
-- re-arming there is not a background dose write conjuring it back up.
--
-- The three in-use columns are an opened date and either a window in days or an
-- explicit end date, whichever a person types - stored as typed rather than one
-- derived from the other, because they are two different things a label can
-- say.
CREATE TABLE medication_stock (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid                  TEXT NOT NULL UNIQUE,
  drug                  TEXT NOT NULL UNIQUE,
  quantity              REAL NOT NULL,
  unit                  TEXT NOT NULL,
  recorded_epoch_day    INTEGER NOT NULL,
  reminder_ever_created INTEGER NOT NULL DEFAULT 0,
  reminder_dismissed    INTEGER NOT NULL DEFAULT 0,
  updated_at            INTEGER NOT NULL,
  opened_epoch_day      INTEGER,
  in_use_window_days    INTEGER,
  in_use_end_epoch_day  INTEGER
);

-- \`provider\` is free text with no list behind it, exactly as free as an
-- analyte's \`unit\`: normalizing it would mean deciding that two spellings
-- name one lab, and the step after that is deciding whose numbers are
-- comparable with whose. \`draw_time\` is a local wall-clock 'HH:MM' like
-- reminder.time, nullable because a lab slip often carries none.
--
-- THE TIMING COLUMNS STORE A DERIVED FIGURE, WHICH ADR-0010 FORBIDS. The
-- exception is deliberate; read this before removing them in ADR-0010's name.
-- ADR-0010's case is about columns that drift out of agreement with the rows
-- they were computed from, which is why the stored copy is the wrong one -
-- \`milestone.kind\` goes stale the day its date passes. This figure has no
-- such input. It is measured against the dose log as it stood when the draw was
-- recorded, and that log is not recoverable later: a dose corrected in November
-- changes what a recomputation would say about a draw in August, silently
-- rewriting the context on a result someone has already discussed at an
-- appointment. So it cannot drift out of agreement with anything - it is a
-- recorded observation about a moment, in the same category as the value beside
-- it. Editing a dose event never touches a saved context; correcting the draw's
-- own day or time does recompute it, since that voids the figure outright
-- rather than adjusting its input.
--
-- \`timing_hours\` is REAL and keeps its fraction, since sublingual estradiol
-- peaks inside two hours.
CREATE TABLE lab_result (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid                   TEXT NOT NULL UNIQUE,
  epoch_day              INTEGER NOT NULL,
  analyte                TEXT NOT NULL,
  value                  REAL NOT NULL,
  unit                   TEXT NOT NULL,
  note                   TEXT,
  updated_at             INTEGER NOT NULL,
  provider               TEXT NOT NULL DEFAULT '',
  draw_time              TEXT,
  timing_route           TEXT,
  timing_hours           REAL,
  timing_day_of_interval INTEGER
);
CREATE INDEX idx_lab_analyte ON lab_result(analyte, epoch_day);

-- BODY: MEASUREMENTS, HAIR, SIZES AND EFFECTS ---------------------------------

-- A measurement type's own vocabulary row, the same \`key\` NOT NULL / \`uuid\`
-- nullable shape gender_dimension uses (ADR-0002): a built-in has a null uuid
-- and a stable key, a custom mints a uuid that doubles as both. No
-- name/min/max split like a dimension's - a measurement type has one number,
-- not a scale between two ends.
CREATE TABLE measurement_type (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid        TEXT UNIQUE,
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  is_built_in INTEGER NOT NULL DEFAULT 0,
  hidden      INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL
);

-- A dated value in whatever unit the person measures in (ADR-0012, never
-- converted). \`type\` carries no CHECK: the set is open past the built-in four
-- to whatever measurement_type holds, so validation is a layer up. No
-- regimen-episode reference - a measurement has to work whether or not an
-- episode exists.
CREATE TABLE measurement (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  epoch_day  INTEGER NOT NULL,
  type       TEXT NOT NULL,
  value      REAL NOT NULL,
  unit       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_measurement_type ON measurement(type, epoch_day);
CREATE INDEX idx_measurement_epoch_day ON measurement(epoch_day);

-- \`category\` is a closed, built-in vocabulary (garmentCategories.ts holds the
-- list this CHECK enforces). \`size\` is required - there is nothing to log
-- without one - while \`brand\` and \`fit_note\` default to '' since neither is
-- ever normalized.
CREATE TABLE size_record (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  epoch_day  INTEGER NOT NULL,
  category   TEXT NOT NULL CHECK (category IN ('shirts','pants','dresses','skirts','bras','underwear','shoes','outerwear')),
  size       TEXT NOT NULL,
  brand      TEXT NOT NULL DEFAULT '',
  fit_note   TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_size_record_epoch_day ON size_record(epoch_day);
CREATE INDEX idx_size_record_category ON size_record(category);

-- A dated series, not a single replaced value: a person re-stages over time.
-- \`scale\` says which published classification a row's \`stage\` is a grade of
-- (hairStageScales.ts carries the citations), so two scales' stages are never
-- read as one series and nothing converts between them.
--
-- The CHECK pairs the two columns rather than checking each alone, because '1'
-- through '5' are grade codes on both scales and mean different things on each
-- - a bare \`stage IN (...)\` would let a Norwood-Hamilton '3v' through as a
-- Sinclair grade. \`description\` is the escape hatch's free text and the same
-- CHECK keeps it to \`scale = 'other'\`: a graded staging has nothing to write
-- prose about, and allowing it on one would invite a note that reinterprets a
-- published grade.
CREATE TABLE hair_stage (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid        TEXT NOT NULL UNIQUE,
  epoch_day   INTEGER NOT NULL,
  scale       TEXT NOT NULL,
  stage       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  updated_at  INTEGER NOT NULL,
  CHECK (
    (scale = 'norwood_hamilton' AND description = ''
      AND stage IN ('1','2','2a','3','3v','3a','4','4a','5','5a','6','7'))
    OR (scale = 'sinclair' AND description = '' AND stage IN ('1','2','3','4','5'))
    OR (scale = 'other' AND stage = '')
  )
);
CREATE INDEX idx_hair_stage_epoch_day ON hair_stage(epoch_day);
CREATE INDEX idx_hair_stage_scale ON hair_stage(scale, epoch_day);

-- Its own dated series rather than an owner arm on \`photo\` (the CHECK reason
-- photo's own comment gives) and with no anchor or episode reference: what
-- these are read against is resolved above this seam (hairAnchor.ts).
CREATE TABLE hair_photo (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  epoch_day  INTEGER NOT NULL,
  file_path  TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_hair_photo_epoch_day ON hair_photo(epoch_day);

-- \`area\` is a closed CHECK over hairRemovalAreas.ts's own vocabulary,
-- deliberately separate from \`entry_body_region.region\`: a treatment area is
-- finer-grained and procedural, not a dysphoria hotspot, so this never reuses
-- or widens that list. \`cost\` and \`provider\` are plain TEXT, the same free
-- text lab_result.provider gets.
--
-- Unlike hair_photo, a session photo belongs to one session - a before/after
-- picture of that treatment - so it carries a \`session_id\` rather than
-- standing as its own dated series.
CREATE TABLE hair_removal_session (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  epoch_day  INTEGER NOT NULL,
  area       TEXT NOT NULL
             CHECK (area IN ('upper_lip','chin','neck','underarms','chest','abdomen','back','arms','legs','bikini_line')),
  method     TEXT NOT NULL CHECK (method IN ('laser','electrolysis','other')),
  pain_rating INTEGER NOT NULL CHECK (pain_rating BETWEEN 1 AND 5),
  cost       TEXT NOT NULL,
  provider   TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_hair_removal_session_epoch_day ON hair_removal_session(epoch_day);
CREATE INDEX idx_hair_removal_session_area ON hair_removal_session(area);

CREATE TABLE hair_removal_photo (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  session_id INTEGER NOT NULL REFERENCES hair_removal_session(id) ON DELETE CASCADE,
  file_path  TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_hair_removal_photo_session ON hair_removal_photo(session_id);

-- A named, toggleable collection over the effect catalogue - "body shape and
-- composition", "skin and hair" and so on. Built-in only, so it carries just
-- key/name/enabled rather than tag_group's fuller shape.
CREATE TABLE effect_category (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  key        TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL DEFAULT '',
  enabled    INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

-- An effect's own vocabulary row, the same shape measurement_type takes: a
-- built-in's \`name\` stays '' and is looked up by key at display time, a
-- custom's minted uuid doubles as both columns. \`category_key\` is nullable
-- because a custom effect may be added uncategorised, and \`direction\` for the
-- same reason: only a built-in's direction is a claim from the source material,
-- and a custom effect gets no direction pushed onto it that nobody asked for.
CREATE TABLE personal_effect_type (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid         TEXT UNIQUE,
  key          TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL DEFAULT '',
  is_built_in  INTEGER NOT NULL DEFAULT 0,
  category_key TEXT REFERENCES effect_category(key),
  direction    TEXT CHECK (direction IN ('feminizing', 'masculinizing') OR direction IS NULL),
  hidden       INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL
);

-- One row per effect (\`effect\` UNIQUE), the same way medication_stock is one
-- row per drug: a person answers "when did I first notice this", never "how
-- much have I noticed since last time", so a fresh date replaces the old one
-- rather than appending to a log. No row at all means the effect has not been
-- marked yet, which is why the day is NOT NULL rather than nullable - there is
-- nothing to store until a person marks it.
--
-- \`effect\` carries no CHECK: the catalogue is open to whatever
-- personal_effect_type holds, so validation is a layer up. No regimen-episode
-- reference either - the anchor these are read against is the earliest
-- episode's start day, resolved at read time.
CREATE TABLE personal_effect (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid                    TEXT NOT NULL UNIQUE,
  effect                  TEXT NOT NULL UNIQUE,
  first_noticed_epoch_day INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL
);

-- VOICE -----------------------------------------------------------------------

-- A separate table from voice_recording rather than a flag on it: a recording
-- is a memo hanging off one entry, while a benchmark hangs off a day and its
-- numbers only mean anything because the conditions were fixed - same passage,
-- same vowel, same quality floor - which is what makes two of them six months
-- apart comparable at all. Putting these columns on voice_recording would make
-- every memo carry a dozen null acoustic fields to say it was never one.
--
-- The acoustic figures are stored rather than derived, which ADR-0010 would
-- otherwise argue against. They are not derived state: they are a measurement
-- of a file, taken once under a known analyzer, and the audio a benchmark was
-- measured from is deletable while the benchmark stays. The alternative is
-- re-running YIN and LPC over every stored take on every chart render.
--
-- \`passage_key\` is here because a benchmark read from a custom passage is
-- comparable only to others read from the same one, and the compare surface has
-- no way to know that without the row saying so. \`capture_chain\` is the same
-- argument one layer down (ADR-0061): device-sensitive figures compare only
-- within one chain.
--
-- \`vowel_file_path\`, \`f1_hz\`, \`f2_hz\` and \`snr_db\` are nullable on
-- purpose. A session where the vowel step was skipped, or where it never
-- cleared the gate, is a valid benchmark with a passage and no resonance - not
-- a failed one, and not a row to refuse.
--
-- The last of the original columns is \`updated_at\` rather than
-- \`created_at\`: every table here names it that, and the flat archive path
-- writes it by that name on the way back in. A benchmark is never edited, so
-- the two would have held the same value anyway.
CREATE TABLE voice_benchmark (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid              TEXT NOT NULL UNIQUE,
  epoch_day         INTEGER NOT NULL,
  timestamp         INTEGER NOT NULL,
  passage_key       TEXT NOT NULL,
  passage_file_path TEXT NOT NULL,
  vowel_file_path   TEXT,
  f0_median_hz      REAL NOT NULL,
  f0_p10_hz         REAL NOT NULL,
  f0_p90_hz         REAL NOT NULL,
  semitone_sd       REAL NOT NULL,
  words_per_minute  REAL NOT NULL,
  f1_hz             REAL,
  f2_hz             REAL,
  snr_db            REAL,
  note              TEXT,
  updated_at        INTEGER NOT NULL,
  pitch_track       TEXT,
  capture_chain     TEXT,
  resonance_scale   REAL
);
CREATE INDEX idx_voice_benchmark_epoch_day ON voice_benchmark(epoch_day);

CREATE TABLE voice_practice_take (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  epoch_day  INTEGER NOT NULL,
  min_hz     REAL NOT NULL,
  max_hz     REAL NOT NULL,
  median_hz  REAL NOT NULL,
  felt_sense INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_voice_practice_take_epoch_day ON voice_practice_take(epoch_day);

-- TRYOUTS, PROCEDURES, APPOINTMENTS AND PAPER ---------------------------------

-- One record type covering whatever someone is trying, not a name/pronoun
-- specific one with a second type forked alongside it. No "current tryout"
-- column or flag: several can be in progress at once or entirely in the past,
-- and nothing here may force exactly one to be it. \`end_epoch_day\` nullable
-- means still going, not "forgot to close it out".
--
-- No entry link of any kind: which entries fall inside a tryout's range is read
-- at query time against the two day columns (ADR-0010). A stored link would
-- drift the moment a tryout's dates were corrected after entries had been
-- logged against it.
--
-- \`description\` is free text alongside \`label\`, nullable, because a style
-- or garment tryout needs more than the short field a name or pronoun set gets.
CREATE TABLE tryout (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT NOT NULL UNIQUE,
  kind            TEXT NOT NULL
                  CHECK (kind IN ('name', 'pronouns', 'style', 'garment', 'makeup', 'presentation_step')),
  label           TEXT NOT NULL,
  description     TEXT,
  start_epoch_day INTEGER NOT NULL,
  end_epoch_day   INTEGER,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_tryout_start ON tryout(start_epoch_day);

CREATE TABLE tryout_photo (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  tryout_id  INTEGER NOT NULL REFERENCES tryout(id) ON DELETE CASCADE,
  epoch_day  INTEGER NOT NULL,
  file_path  TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_tryout_photo_tryout ON tryout_photo(tryout_id, epoch_day);

-- Two nullable owners and a CHECK that exactly one is set, following \`photo\`
-- rather than the per-owner tables the photo arms became: a felt-sense row
-- needs only a second arm, not a third. Its own uuid and updated_at, unlike
-- doubt_snapshot_entry below, because a felt-sense observation is addressed,
-- edited and deleted on its own rather than written and forgotten alongside its
-- parent. \`mood\` reuses the app's one five-level scale and is required: a row
-- with no rating is the one thing this table exists to hold.
CREATE TABLE felt_sense (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid         TEXT NOT NULL UNIQUE,
  tryout_id    INTEGER REFERENCES tryout(id) ON DELETE CASCADE,
  milestone_id INTEGER REFERENCES milestone(id) ON DELETE CASCADE,
  epoch_day    INTEGER NOT NULL,
  mood         INTEGER NOT NULL CHECK (mood BETWEEN 1 AND 5),
  note         TEXT,
  updated_at   INTEGER NOT NULL,
  CHECK ((tryout_id IS NOT NULL) + (milestone_id IS NOT NULL) = 1)
);
CREATE INDEX idx_felt_sense_tryout ON felt_sense(tryout_id);
CREATE INDEX idx_felt_sense_milestone ON felt_sense(milestone_id);
CREATE INDEX idx_felt_sense_epoch_day ON felt_sense(epoch_day);

-- One row per procedure someone is going through, and nothing assumes exactly
-- one is active. \`name\` is free text: the set of procedures a trans person
-- may have is not something this app gets to enumerate.
-- \`surgery_epoch_day\` is nullable because a procedure record usually starts
-- life at the consult with no date set, and the day counter over it is derived,
-- never stored (ADR-0010). Its recovery checklist is an ordinary \`checklist\`
-- owned by the (kind, uuid) pair, which is why no checklist column is here.
CREATE TABLE procedure (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  surgery_epoch_day INTEGER,
  notes             TEXT NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX idx_procedure_surgery_epoch_day ON procedure(surgery_epoch_day);

-- Both a \`procedure_id\` and its own \`epoch_day\`, unlike either other photo
-- table: a recovery photo belongs to one procedure and is dated in its own
-- right, because when in recovery it was taken is the whole point of it.
CREATE TABLE procedure_photo (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid         TEXT NOT NULL UNIQUE,
  procedure_id INTEGER NOT NULL REFERENCES procedure(id) ON DELETE CASCADE,
  epoch_day    INTEGER NOT NULL,
  file_path    TEXT NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_procedure_photo_procedure ON procedure_photo(procedure_id, epoch_day);

-- One appointment record, and a consult is a case of it (ADR-0066): the concept
-- existed on four surfaces and had a row in none. A consult differs from any
-- other appointment in exactly one way, that it is attached to a procedure,
-- which is \`procedure_id\` being nullable rather than a different kind of row.
-- The cascade is kept: an appointment that named a procedure still goes with
-- it.
--
-- \`kind\`, \`place\` and \`note\` are nullable with no default, and nothing
-- ships in either language for \`kind\` in particular - its suggestions are the
-- kinds this person has typed before, read off their own rows, because a
-- built-in list of endocrinologist, psychologist, surgeon is a picture of a
-- medical path the app has no business drawing.
CREATE TABLE appointment (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid         TEXT NOT NULL UNIQUE,
  procedure_id INTEGER REFERENCES procedure(id) ON DELETE CASCADE,
  epoch_day    INTEGER NOT NULL,
  kind         TEXT,
  place        TEXT,
  note         TEXT,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_appointment_procedure ON appointment(procedure_id);
CREATE INDEX idx_appointment_epoch_day ON appointment(epoch_day);

-- A checklist's owner is a nullable (kind, uuid) pair rather than a foreign
-- key, so any owner kind reuses this table with no migration of its own. Both
-- columns are NULL together for a standalone checklist or set together for an
-- owned one; the CHECK rules out the half-set case a typo could write silently.
--
-- The four debrief columns are device-local bookkeeping and deliberately not
-- part of what a checklist travels in an archive: they name a row this device
-- happens to hold, not a fact an importing device should adopt.
-- \`debrief_entry_id\` references \`entry(id)\`, the plain integer FK every
-- other row that belongs to one entry uses - not \`entry.uuid\`, which is what
-- a cross-device pointer reaches for instead, because this one never leaves the
-- device it was written on. \`ON DELETE SET NULL\` so a purged debrief entry
-- leaves the appointment looking un-debriefed again rather than pointing at
-- nothing.
CREATE TABLE checklist (
  id                               INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid                             TEXT NOT NULL UNIQUE,
  owner_kind                       TEXT,
  owner_uuid                       TEXT,
  updated_at                       INTEGER NOT NULL,
  appointment_epoch_day            INTEGER,
  debrief_entry_id                 INTEGER REFERENCES entry(id) ON DELETE SET NULL,
  debrief_dismissed_epoch_day      INTEGER,
  debrief_entry_appointment_id     TEXT,
  debrief_dismissed_appointment_id TEXT,
  CHECK ((owner_kind IS NULL) = (owner_uuid IS NULL))
);
CREATE INDEX idx_checklist_owner ON checklist(owner_kind, owner_uuid);

CREATE TABLE checklist_item (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT NOT NULL UNIQUE,
  checklist_id    INTEGER NOT NULL REFERENCES checklist(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  checked         INTEGER NOT NULL DEFAULT 0,
  carried_forward INTEGER NOT NULL DEFAULT 0,
  order_index     INTEGER NOT NULL DEFAULT 0,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_checklist_item_checklist ON checklist_item(checklist_id);

-- Paper the person keeps, and the app never reads it (ADR-0065). Flat and small
-- on purpose: no child table, no folder, no tag, no category - every filing
-- system grows a taxonomy the person then has to maintain.
--
-- \`title\` is NOT NULL with no default because search matches a document by
-- its title and by nothing else, so an untitled row would be unfindable by the
-- one handle it has. \`epoch_day\` is the day the paper is from, which for a
-- diagnosis from 1994 is nothing to do with when it was scanned in.
-- \`file_path\` holds the same opaque name a photo row does, because an image
-- document goes through the same normalisation and metadata strip (ADR-0015).
--
-- \`target_kind\`/\`target_id\` are the optional link: at most one, to a
-- roadmap goal, milestone, procedure or regimen episode, both set or both null.
-- No foreign key on \`target_id\` - it names a row in whichever of four tables
-- \`target_kind\` says, which one REFERENCES clause cannot express, and a
-- built-in roadmap goal is not a row at all (a pack-and-key string compiled
-- from roadmap.ts). The link is nulled by every delete that can reach it, in
-- the same UPDATE-before-DELETE order milestone.procedure_id already uses; what
-- is left cannot dangle, since episodes are never deleted and a built-in goal
-- has no row to delete.
CREATE TABLE document (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid        TEXT NOT NULL UNIQUE,
  epoch_day   INTEGER NOT NULL,
  title       TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  target_kind TEXT CHECK (target_kind IN ('goal', 'milestone', 'procedure', 'episode')),
  target_id   TEXT,
  updated_at  INTEGER NOT NULL,
  CHECK ((target_kind IS NULL) = (target_id IS NULL))
);
CREATE INDEX idx_document_epoch_day ON document(epoch_day);

CREATE TABLE taper (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid              TEXT NOT NULL UNIQUE,
  surgery_epoch_day INTEGER NOT NULL,
  start_epoch_day   INTEGER NOT NULL,
  stages            TEXT NOT NULL,
  updated_at        INTEGER NOT NULL
);

CREATE TABLE taper_session (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  epoch_day  INTEGER NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_taper_session_epoch_day ON taper_session(epoch_day);

-- ROADMAP ---------------------------------------------------------------------

-- A pack's content is not here and never will be: a country pack is a bundled
-- content module read off the bundle (roadmap.ts), so what a person is working
-- through is a build artifact and what they have recorded is the only part that
-- is theirs. A row exists exactly when a bundled goal has something recorded
-- against it, and unchecking deletes it - so no row is seeded per goal per
-- pack, which would need migrating every time a pack gained an item.
--
-- No uuid: a tick is named by which pack and which goal, both of which name
-- bundled content and so mean the same thing on every device (ADR-0002's
-- amendment), so an archive matches on the pair and a merge has nothing to
-- reconcile. \`status\` widens what the row's existence can mean - checked, or
-- not-my-path - without touching the pair it is keyed on.
--
-- \`pack_key\` is not constrained to a list of packs, which is what lets a
-- second country ship as content alone. The price is that a row can outlive a
-- pack that stops being bundled, which is the right way round: a stale row is
-- invisible and harmless, whereas a CHECK would make removing a pack a
-- migration too.
CREATE TABLE roadmap_check (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pack_key   TEXT NOT NULL,
  goal_key   TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'checked',
  UNIQUE (pack_key, goal_key)
);

-- A custom goal cannot reuse a tick's row shape: a tick is safe with no uuid
-- only because it carries no data of its own, and a custom goal is nothing but
-- the person's free text and a track. So it gets the ordinary uuid treatment
-- and its own \`status\` on the same row - unlike a tick, its row exists
-- whether or not it is checked, so 'unchecked' is an ordinary value here rather
-- than a row's absence. Ordered by \`id\` alone: appended to the end of its
-- track on creation and never reordered.
CREATE TABLE roadmap_goal (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  track      TEXT NOT NULL,
  text       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'unchecked',
  updated_at INTEGER NOT NULL
);

-- "Not my path" one grain out, at the track. Presence is the whole of the
-- state, so undoing it is a DELETE and there is no third value to read back -
-- which is also what makes it safe against a track this build does not have.
-- Not keyed by pack: a track is the app's own structure and a pack populates
-- it, so dismissing "medical" is a statement about the person's path rather
-- than about one country's procedure. roadmap_check is keyed by pack for the
-- opposite reason - a goal key only means anything inside the pack that defines
-- it.
CREATE TABLE roadmap_track (
  track      TEXT PRIMARY KEY,
  updated_at INTEGER NOT NULL
);

-- ERAS, RESURFACING AND THE SAFE-SPACE READS ----------------------------------

-- A named span, and it owns nothing else (ADR-0049): no colour, no mute flag,
-- no photo policy. The ADR exists to refuse the column the next feature will
-- want, because the second one makes this table the only place two rules can be
-- read together.
--
-- Both bounds are nullable and neither is defaulted. A null start reaches back
-- before the journal does - "before I knew" is a real era with no day that
-- begins it - and a null end is still running.
--
-- No CHECK guards the three invariants (at most one open start, at most one
-- open end, no two eras overlapping). None is expressible over a single row,
-- and a violation surfacing from the driver would name a table rather than the
-- era it collided with, so all three are enforced in eras.ts.
CREATE TABLE era (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  start_epoch_day INTEGER,
  end_epoch_day   INTEGER,
  updated_at      INTEGER NOT NULL
);

-- Rows here, never a column on era - ADR-0049 names this exact table as the
-- reason era owns nothing else. \`era_uuid\` is free text rather than a foreign
-- key, the same reason roadmap_check.pack_key is: a row naming a deleted era is
-- stale and harmless rather than a dangling reference needing a cleanup job,
-- because eraForDay never returns that era again for anything to check the mute
-- against. Presence is the whole of the state.
CREATE TABLE era_mute (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  era_uuid   TEXT NOT NULL UNIQUE,
  updated_at INTEGER NOT NULL
);

-- Who to text, which walk, which playlist, in the person's own words. Nothing
-- bundled behind it, so \`uuid\` alone is the row's travelling identity and
-- there is no \`key\` column for a built-in that will never exist - a starter
-- list is forbidden on purpose, so nothing here is ever seeded.
CREATE TABLE comfort_item (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  text       TEXT NOT NULL,
  position   INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- A one-tap capture of which euphoria-tagged entries were on screen as
-- counterevidence when a person tapped save, copied in rather than referenced
-- by the source entry's id.
--
-- THIS PAIR STORES DERIVED DATA, WHICH ADR-0010 FORBIDS ON ITS FACE. The
-- exception is the one lab_result's timing columns argue above: the figure is
-- measured against a moment - the list as it read when "save" was tapped - that
-- is not recoverable later, since the source entry can be edited, untagged or
-- deleted afterwards. Re-deriving it from a live join on every read would let
-- exactly those edits silently rewrite what a past snapshot showed, defeating
-- the feature's own point, which is rereading later what convinced someone
-- then.
--
-- \`doubt_snapshot_entry\` carries no identity of its own and no link back to
-- the source entry's row: like entry_dimension_value, it is a detail row that
-- lives and dies with its parent, never a thing addressed on its own.
CREATE TABLE doubt_snapshot (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  epoch_day  INTEGER NOT NULL,
  timestamp  INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_doubt_snapshot_epoch_day ON doubt_snapshot(epoch_day);

CREATE TABLE doubt_snapshot_entry (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL REFERENCES doubt_snapshot(id),
  order_index INTEGER NOT NULL,
  epoch_day   INTEGER NOT NULL,
  mood        INTEGER,
  note        TEXT NOT NULL
);
CREATE INDEX idx_doubt_snapshot_entry_snapshot ON doubt_snapshot_entry(snapshot_id);

-- A day chosen to see one entry again. \`entry_id\` holds the owning entry's
-- uuid, not its local row id, for the reason milestone.procedure_id gives: a
-- raw integer FK would have to be resolved against a rowid that can differ
-- after an archive restore or merge. UNIQUE on it, so choosing a new day
-- replaces the old offer rather than piling up a second one for the same entry.
-- \`entry_epoch_day\` rides along so a read of what is due needs no second join
-- back to \`entry\` to say when the entry itself was written.
CREATE TABLE revisit (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid              TEXT NOT NULL UNIQUE,
  entry_id          TEXT NOT NULL UNIQUE REFERENCES entry(uuid),
  entry_epoch_day   INTEGER NOT NULL,
  created_epoch_day INTEGER NOT NULL,
  target_epoch_day  INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX idx_revisit_target_epoch_day ON revisit(target_epoch_day);

-- Which areas a person has hidden, which they have said are finished, and which
-- they have paused (ADR-0052). \`area\` is the primary key and is an
-- \`ArchiveSectionName\`, so it is a wire key already - the natural-key
-- identity personal_effect.effect travels by.
--
-- \`hidden\` and not \`visible\`, because a positive flag defaulting to shown is
-- what would reverse ADR-0043, and because hidden is already the column name on
-- tag, gender_dimension and measurement_type.
--
-- The two day columns are nullable and dated rather than flags (ADR-0010: the
-- day is the person's own assertion and is not derivable), and sparse - there
-- is no row for an area that has said nothing, so no DEFAULT here stands for a
-- resting state. No CHECK tying any of the three together: areaStates.ts's
-- writers keep finished and suspended mutually exclusive, and a constraint here
-- would refuse to even read back an inconsistent row arriving from an older
-- archive that areaState.ts can treat as quiet either way.
CREATE TABLE area_state (
  area                TEXT PRIMARY KEY,
  hidden              INTEGER NOT NULL DEFAULT 0,
  finished_epoch_day  INTEGER,
  updated_at          INTEGER NOT NULL,
  suspended_epoch_day INTEGER
);
`;
