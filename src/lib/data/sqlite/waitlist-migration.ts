/* Waiting lists (functional-audit ticket 26). An appointment can exist
   before it has a day: a referral to a gender clinic, an NFZ queue or a
   surgery list is the same record, waiting. SQLite cannot drop a NOT NULL,
   so `appointment` is rebuilt the way the closed lists were (create the new
   shape, copy, carry the AUTOINCREMENT counter, drop, rename, recreate the
   indexes); the runner holds foreign keys off for the step and checks them
   after.

   `referred_epoch_day` is the day somebody was referred on, the fact a wait
   is counted from. It sits last so a later column (a time, a provider, a
   cost) appends after it without another rebuild.

   `appointment_status` holds the dated updates a wait collects ("letter
   came", "phoned, still on the list"). Its own table because there can be
   any number of them, cascading with the appointment they belong to, and
   with `updated_at` like every user-owned row so archive Merge can classify
   it. Free text with no vocabulary: the app ships no list of what a queue
   can say back. */

export const WAITLIST_REBUILD = `
CREATE TABLE appointment_new (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid               TEXT NOT NULL UNIQUE,
  procedure_id       INTEGER REFERENCES procedure(id) ON DELETE CASCADE,
  epoch_day          INTEGER,
  kind               TEXT,
  place              TEXT,
  note               TEXT,
  updated_at         INTEGER NOT NULL,
  referred_epoch_day INTEGER
);
INSERT INTO appointment_new (id, uuid, procedure_id, epoch_day, kind, place, note, updated_at)
  SELECT id, uuid, procedure_id, epoch_day, kind, place, note, updated_at FROM appointment;
DELETE FROM sqlite_sequence WHERE name = 'appointment_new';
INSERT INTO sqlite_sequence (name, seq) SELECT 'appointment_new', seq FROM sqlite_sequence WHERE name = 'appointment';
DROP TABLE appointment;
ALTER TABLE appointment_new RENAME TO appointment;
CREATE INDEX idx_appointment_procedure ON appointment(procedure_id);
CREATE INDEX idx_appointment_epoch_day ON appointment(epoch_day);

CREATE TABLE appointment_status (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid           TEXT NOT NULL UNIQUE,
  appointment_id INTEGER NOT NULL REFERENCES appointment(id) ON DELETE CASCADE,
  epoch_day      INTEGER NOT NULL,
  status         TEXT NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX idx_appointment_status_appointment ON appointment_status(appointment_id, epoch_day);
CREATE INDEX idx_appointment_status_epoch_day ON appointment_status(epoch_day);
`;
