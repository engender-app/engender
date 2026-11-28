/* Rebuild appointment to allow an undated wait. Copy rows and
   AUTOINCREMENT state, then recreate indexes. The migration runner
   disables foreign keys for the step and checks them afterwards.
   Append referred_epoch_day for the start of each wait.

   appointment_status stores free-text dated updates and cascades
   with its appointment. Keep updated_at for archive Merge. */

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
