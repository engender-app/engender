/* The one rebuild of the closed lists (functional-audit ticket 04, CHECK
   policy). SQLite cannot alter a CHECK, so moving a vocabulary out of one
   means rebuilding its table: create the new shape, copy, drop the old table,
   rename. The runner holds foreign keys off for the step and checks them after.

   After this, a CHECK holds a structural invariant only (a rating range, the
   shape of a reminder's rule). Which words a column may hold is rowValues.ts,
   checked by the write path and by archive import, and a stored word the code
   does not know renders as "other".

   The same rebuilds carry the cheap structural changes other tickets need, so
   no table is rebuilt twice: hair_removal_session.pain_rating and .cost become
   nullable and a nullable note column appears; tally_event.context is dropped.
   Each AUTOINCREMENT counter is carried over, so an id that was deleted is not
   handed out again, and each table's indexes (and the reminder trigger) are
   recreated because dropping the old table dropped them. */

export const CLOSED_LISTS_REBUILD = `
CREATE TABLE hair_removal_session_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  epoch_day  INTEGER NOT NULL,
  area       TEXT NOT NULL,
  method     TEXT NOT NULL,
  pain_rating INTEGER CHECK (pain_rating IS NULL OR pain_rating BETWEEN 1 AND 5),
  cost       TEXT,
  provider   TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  note       TEXT
);
INSERT INTO hair_removal_session_new (id, uuid, epoch_day, area, method, pain_rating, cost, provider, updated_at)
  SELECT id, uuid, epoch_day, area, method, pain_rating, cost, provider, updated_at FROM hair_removal_session;
DELETE FROM sqlite_sequence WHERE name = 'hair_removal_session_new';
INSERT INTO sqlite_sequence (name, seq) SELECT 'hair_removal_session_new', seq FROM sqlite_sequence WHERE name = 'hair_removal_session';
DROP TABLE hair_removal_session;
ALTER TABLE hair_removal_session_new RENAME TO hair_removal_session;
CREATE INDEX idx_hair_removal_session_epoch_day ON hair_removal_session(epoch_day);
CREATE INDEX idx_hair_removal_session_area ON hair_removal_session(area);

CREATE TABLE tryout_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid            TEXT NOT NULL UNIQUE,
  kind            TEXT NOT NULL,
  label           TEXT NOT NULL,
  description     TEXT,
  start_epoch_day INTEGER NOT NULL,
  end_epoch_day   INTEGER,
  updated_at      INTEGER NOT NULL
);
INSERT INTO tryout_new (id, uuid, kind, label, description, start_epoch_day, end_epoch_day, updated_at)
  SELECT id, uuid, kind, label, description, start_epoch_day, end_epoch_day, updated_at FROM tryout;
DELETE FROM sqlite_sequence WHERE name = 'tryout_new';
INSERT INTO sqlite_sequence (name, seq) SELECT 'tryout_new', seq FROM sqlite_sequence WHERE name = 'tryout';
DROP TABLE tryout;
ALTER TABLE tryout_new RENAME TO tryout;
CREATE INDEX idx_tryout_start ON tryout(start_epoch_day);

CREATE TABLE tally_event_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  epoch_day  INTEGER NOT NULL,
  kind       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO tally_event_new (id, uuid, epoch_day, kind, updated_at)
  SELECT id, uuid, epoch_day, kind, updated_at FROM tally_event;
DELETE FROM sqlite_sequence WHERE name = 'tally_event_new';
INSERT INTO sqlite_sequence (name, seq) SELECT 'tally_event_new', seq FROM sqlite_sequence WHERE name = 'tally_event';
DROP TABLE tally_event;
ALTER TABLE tally_event_new RENAME TO tally_event;
CREATE INDEX idx_tally_kind_day ON tally_event(kind, epoch_day);

CREATE TABLE cycle_event_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT NOT NULL UNIQUE,
  epoch_day  INTEGER NOT NULL,
  kind       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO cycle_event_new (id, uuid, epoch_day, kind, updated_at)
  SELECT id, uuid, epoch_day, kind, updated_at FROM cycle_event;
DELETE FROM sqlite_sequence WHERE name = 'cycle_event_new';
INSERT INTO sqlite_sequence (name, seq) SELECT 'cycle_event_new', seq FROM sqlite_sequence WHERE name = 'cycle_event';
DROP TABLE cycle_event;
ALTER TABLE cycle_event_new RENAME TO cycle_event;
CREATE INDEX idx_cycle_event_epoch_day ON cycle_event(epoch_day);

CREATE TABLE reminder_new (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid             TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  type             TEXT NOT NULL,
  time             TEXT NOT NULL,
  recurrence       TEXT CHECK (recurrence IN ('DAILY','WEEKLY','EVERY_N_DAYS')),
  interval         INTEGER,
  anchor_epoch_day INTEGER,
  epoch_day        INTEGER,
  enabled          INTEGER NOT NULL DEFAULT 1,
  updated_at       INTEGER NOT NULL,
  auto_source      TEXT,
  CHECK (
    (recurrence IS NULL AND epoch_day IS NOT NULL AND interval IS NULL AND anchor_epoch_day IS NULL)
    OR (recurrence IS 'EVERY_N_DAYS' AND interval IS NOT NULL AND anchor_epoch_day IS NOT NULL AND epoch_day IS NULL)
    OR ((recurrence IS 'DAILY' OR recurrence IS 'WEEKLY') AND interval IS NULL AND anchor_epoch_day IS NULL AND epoch_day IS NULL)
  )
);
INSERT INTO reminder_new (id, uuid, title, type, time, recurrence, interval, anchor_epoch_day, epoch_day, enabled, updated_at, auto_source)
  SELECT id, uuid, title, type, time, recurrence, interval, anchor_epoch_day, epoch_day, enabled, updated_at, auto_source FROM reminder;
DELETE FROM sqlite_sequence WHERE name = 'reminder_new';
INSERT INTO sqlite_sequence (name, seq) SELECT 'reminder_new', seq FROM sqlite_sequence WHERE name = 'reminder';
DROP TABLE reminder;
ALTER TABLE reminder_new RENAME TO reminder;
CREATE TRIGGER reminder_anchor_legacy_weekly AFTER INSERT ON reminder
WHEN NEW.recurrence = 'WEEKLY'
BEGIN
  UPDATE reminder
  SET recurrence = 'EVERY_N_DAYS', interval = 7,
      anchor_epoch_day = CAST(strftime('%s', date(updated_at / 1000, 'unixepoch', 'localtime')) AS INTEGER) / 86400
  WHERE id = NEW.id;
END;
`;
