/* Schema version 1: the PRD's Database Schema section (prd.md) with the
   Phase 1 deltas from ticket 02, all ADR-backed:

   - `uuid TEXT NOT NULL UNIQUE` on the purely user-owned tables (entry,
     photo, milestone, lab_result, reminder). `uuid TEXT UNIQUE` (nullable)
     on tag / tag_group / gender_dimension / gender_preset, set only for
     user-created rows; built-ins are identified by `key` instead. ADR-0002.
   - `key TEXT UNIQUE` (nullable) added to tag and gender_preset for
     built-ins; gender_dimension and tag_group keep the NOT NULL key column
     the PRD already gave them.
   - `updated_at INTEGER NOT NULL` on every table above. Nothing reads it
     yet; it exists so adding it later isn't a migration.
   - Dropped: milestone.kind, milestone.order_index, reminder.trigger_time -
     all derived/recomputable state. ADR-0010.
   - `reminder` stores the rule (wall-clock time, a recurrence enum, its
     interval and anchor day for "every N days", or a concrete epoch_day for
     a one-off) instead of a next-fire instant.
   - One `photo` table with nullable entry_id AND milestone_id, CHECK that
     exactly one is set. `milestone.photo_path` is gone.
   - `entry_fts` is contentless (content=''), holding folded text against
     the entry's rowid. Sync triggers land in ticket 09; this ticket only
     shapes the table. ADR-0005.
   - `pref` key-value table (ticket 06 owns reading/writing it). */

export const SCHEMA_V1 = `
CREATE TABLE entry (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid        TEXT NOT NULL UNIQUE,
  epoch_day   INTEGER NOT NULL,
  timestamp   INTEGER NOT NULL,
  mood        INTEGER,
  note        TEXT,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_entry_epoch_day ON entry(epoch_day);

-- Contentless: holds folded text against entry's rowid, not entry.note
-- verbatim. Folding happens in application code (ADR-0005); sync triggers
-- are ticket 09's job.
CREATE VIRTUAL TABLE entry_fts USING fts5(
  folded_text,
  content=''
);

CREATE TABLE milestone (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  epoch_day    INTEGER NOT NULL,
  template_key TEXT,
  updated_at   INTEGER NOT NULL
);

-- One photo table for entries and milestones; exactly one owner is set.
CREATE TABLE photo (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid         TEXT NOT NULL UNIQUE,
  entry_id     INTEGER REFERENCES entry(id) ON DELETE CASCADE,
  milestone_id INTEGER REFERENCES milestone(id) ON DELETE CASCADE,
  file_path    TEXT NOT NULL,
  order_index  INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL,
  CHECK ((entry_id IS NOT NULL) + (milestone_id IS NOT NULL) = 1)
);
CREATE INDEX idx_photo_entry ON photo(entry_id);
CREATE INDEX idx_photo_milestone ON photo(milestone_id);

-- Multi-dimensional gender tracking.
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
  updated_at  INTEGER NOT NULL
);

-- Cascade kept for referential integrity; no code path deletes a dimension
-- today (custom dimensions hide, ticket 07).
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

-- Stores the rule, not the next-fire instant (ADR-0010): a wall-clock time
-- plus either a recurrence (DAILY/WEEKLY need nothing else; EVERY_N_DAYS
-- needs interval + anchor_epoch_day) or a concrete one-off epoch_day.
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

CREATE TABLE lab_result (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  epoch_day  INTEGER NOT NULL,
  analyte    TEXT NOT NULL,
  value      REAL NOT NULL,
  unit       TEXT NOT NULL,
  note       TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_lab_analyte ON lab_result(analyte, epoch_day);

CREATE TABLE pref (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
