/* The appointment record (phase 8 features ticket 57, ADR-0066, CONTEXT:
   "Appointment"). One row per appointment: the day, a kind the person names,
   a place, a note, and an optional link to a procedure.

   There is no separate consult. `procedure_consult` was this record with one
   field permanently filled in - `comingBack.ts` said so in as many words,
   calling a consult "an appointment somebody books ahead of" - so v73 grew
   it into the general case. A consult is an appointment whose `procedureId`
   is set, and procedures.ts reads those rows back as the surgery journey's
   own consults rather than owning a table of its own.

   THE KIND SHIPS NOTHING. `getKinds` reads the kinds this journal has
   already used, most used first, and that is the whole suggestion list. A
   built-in list of endocrinologist, psychologist, surgeon is a picture of a
   medical path, and it would need translating into a second language, which
   doubles the claim (ADR-0066). It also means the app has no opinion about
   whether a court hearing is an appointment, which it should not have.

   Blank is not a value here: a kind, place or note that is empty or all
   whitespace is stored as NULL, so "typed nothing" and "cleared it" are one
   state rather than two that read the same and compare differently.

   Not a `flatArea` (flatArea.ts): the procedure link is a rowid resolved
   from a travelling uuid, which is exactly the join that factory says it
   does not do. */

import type { SqliteDriver } from '../sqlite/driver';
import type { Appointment } from '../types';
import { assertChanged, mintUuid, now } from './support';

export interface AppointmentInput {
  /** Absent to create, present to update. Updating an unknown id throws
      (ADR-0053). */
  id?: string;
  epochDay: number;
  /** The procedure this belongs to, or null. Throws if the procedure is
      unknown - the caller acted on something stale. */
  procedureId: string | null;
  kind: string | null;
  place: string | null;
  note: string | null;
}

/** One appointment as a day view reads it: what it was and where, with the
    procedure named where there is one, so the row can say which surgery
    journey a consult belongs to without a second read. */
export interface AppointmentDayRecord {
  id: string;
  kind: string | null;
  place: string | null;
  procedureId: string | null;
  procedureName: string | null;
}

export interface AppointmentsArea {
  /** Every appointment, oldest first. Past and future alike - which end of
      today a row falls on is the screen's question, not this one's. */
  getAppointments(): Promise<Appointment[]>;
  /** One appointment by id, or undefined - the debrief deep link's own read
      (EntryEditor.svelte, ticket 58), which arrives with only an id and
      needs the day it was on to scope its "since then" reads. */
  getAppointment(id: string): Promise<Appointment | undefined>;
  /** Returns the appointment's id. Updating an unknown id throws, as does
      naming a procedure this journal does not hold (ADR-0053). */
  upsertAppointment(input: AppointmentInput): Promise<string>;
  /** Idempotent (ADR-0053). */
  deleteAppointment(id: string): Promise<void>;
  /** The kinds this journal has used, most used first and ties by name.
      Empty on the first appointment, and empty forever if nobody ever names
      one: nothing ships (ADR-0066). */
  getKinds(): Promise<string[]>;
  /** The appointments on one day (day.ts). */
  getDayRecords(epochDay: number): Promise<AppointmentDayRecord[]>;
  /** The most recent appointment at or before `todayEpochDay`, or null
      (lastWrite.ts). One still ahead is a plan rather than a write, which is
      also why this area joins `comingBack.ts`'s planned areas: without that,
      booking a future appointment would close the person's own return gap. */
  lastWriteEpochDay(todayEpochDay: number): Promise<number | null>;
  /** Each procedure's own appointments, keyed by the procedure's travelling
      id and oldest first - what the surgery journey shows as its consults.
      One query for every procedure rather than one per row, the same reason
      `photosByMilestone` (photos.ts) exists. */
  consultsByProcedure(): Promise<Map<string, { id: string; epochDay: number }[]>>;
}

/** Empty, or all whitespace, is nothing written. */
const trimmed = (value: string | null): string | null => {
  const text = value?.trim();
  return text ? text : null;
};

/* The two selectors below are one line drawn through an oldest-first list
   (`getAppointments`'s own order), read from either side: everything before
   the boundary has happened, everything at or after it has not. Today falls
   on the "not yet" side on purpose - an appointment later today has not
   happened, which is the same line the debrief offer has always drawn.
   Sharing the index is what stops the two from ever disagreeing about which
   appointment is which, and it means neither has to copy a list to find one
   row. Both are pure, over an already-fetched list, with the screen's
   `today` as an argument - the same shape `liveTiles.ts`'s `shouldShow*`
   functions take, so they are provable without a driver. */
const firstNotYetHappened = (appointments: Appointment[], todayEpochDay: number): number => {
  const index = appointments.findIndex((appointment) => appointment.epochDay >= todayEpochDay);
  return index === -1 ? appointments.length : index;
};

/** The appointment prep screen's own date (ticket 58): the earliest one at
    or after today, or null. */
export function soonestFutureAppointment(appointments: Appointment[], todayEpochDay: number): Appointment | null {
  return appointments[firstNotYetHappened(appointments, todayEpochDay)] ?? null;
}

/** The debrief's and the clinician summary's own appointment (ticket 58,
    ADR-0066): the latest one strictly before today, or null. Only ever the
    most recent one: back-filling history is entering a record, not living
    through a visit. */
export function mostRecentPastAppointment(appointments: Appointment[], todayEpochDay: number): Appointment | null {
  return appointments[firstNotYetHappened(appointments, todayEpochDay) - 1] ?? null;
}

/** The visit somebody is at today, or null (ticket 60): the in-the-room
    view's own appointment, and the appointments screen's own reason to
    offer a way into it. The first one on the day where there are two,
    since the boundary index above is the head of the not-yet-happened
    half and that half is in day order. Off the same index as the other
    two, so the row that leads into the room and the room itself can never
    disagree about which appointment they mean. */
export function appointmentOnDay(appointments: Appointment[], epochDay: number): Appointment | null {
  const next = soonestFutureAppointment(appointments, epochDay);
  return next?.epochDay === epochDay ? next : null;
}

/** The `appointment`/`procedure` join every `getAppointments`/`getAppointment`
    row shares, so the two differ only in their `WHERE`, not in what a row
    means. */
type AppointmentRow = {
  uuid: string;
  epoch_day: number;
  procedure_uuid: string | null;
  kind: string | null;
  place: string | null;
  note: string | null;
};

const APPOINTMENT_SELECT = `SELECT a.uuid AS uuid, a.epoch_day AS epoch_day, r.uuid AS procedure_uuid,
                a.kind AS kind, a.place AS place, a.note AS note
           FROM appointment a LEFT JOIN procedure r ON r.id = a.procedure_id`;

const toAppointment = (row: AppointmentRow): Appointment => ({
  id: row.uuid,
  epochDay: row.epoch_day,
  procedureId: row.procedure_uuid,
  kind: row.kind,
  place: row.place,
  note: row.note
});

export function makeAppointmentsArea(driver: SqliteDriver): AppointmentsArea {
  const procedureRowid = async (procedureId: string | null): Promise<number | null> => {
    if (procedureId === null) return null;
    const rows = await driver.query<{ id: number }>('SELECT id FROM procedure WHERE uuid = ?', [procedureId]);
    if (rows.length === 0) throw new Error(`unknown procedure: ${procedureId}`);
    return rows[0].id;
  };

  return {
    async getAppointments() {
      const rows = await driver.query<AppointmentRow>(`${APPOINTMENT_SELECT} ORDER BY a.epoch_day, a.id`);
      return rows.map(toAppointment);
    },

    async getAppointment(id) {
      const rows = await driver.query<AppointmentRow>(`${APPOINTMENT_SELECT} WHERE a.uuid = ?`, [id]);
      const row = rows[0];
      return row ? toAppointment(row) : undefined;
    },

    async upsertAppointment(input) {
      // Resolved before either branch writes, so an unknown procedure fails
      // without having changed a day or a note first.
      const rowid = await procedureRowid(input.procedureId);
      const values = [rowid, input.epochDay, trimmed(input.kind), trimmed(input.place), trimmed(input.note)];

      if (input.id) {
        const result = await driver.run(
          `UPDATE appointment SET procedure_id = ?, epoch_day = ?, kind = ?, place = ?, note = ?, updated_at = ?
            WHERE uuid = ?`,
          [...values, now(), input.id]
        );
        assertChanged(result, `appointment: ${input.id}`);
        return input.id;
      }

      const uuid = mintUuid();
      await driver.run(
        `INSERT INTO appointment (uuid, procedure_id, epoch_day, kind, place, note, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuid, ...values, now()]
      );
      return uuid;
    },

    async deleteAppointment(id) {
      await driver.run('DELETE FROM appointment WHERE uuid = ?', [id]);
    },

    async getKinds() {
      const rows = await driver.query<{ kind: string }>(
        `SELECT kind FROM appointment
          WHERE kind IS NOT NULL AND TRIM(kind) <> ''
          GROUP BY kind
          ORDER BY COUNT(*) DESC, kind`
      );
      return rows.map((row) => row.kind);
    },

    async getDayRecords(epochDay) {
      const rows = await driver.query<{
        uuid: string;
        kind: string | null;
        place: string | null;
        procedure_uuid: string | null;
        procedure_name: string | null;
      }>(
        `SELECT a.uuid AS uuid, a.kind AS kind, a.place AS place,
                r.uuid AS procedure_uuid, r.name AS procedure_name
           FROM appointment a LEFT JOIN procedure r ON r.id = a.procedure_id
          WHERE a.epoch_day = ?
          ORDER BY a.id`,
        [epochDay]
      );
      return rows.map(
        (row): AppointmentDayRecord => ({
          id: row.uuid,
          kind: row.kind,
          place: row.place,
          procedureId: row.procedure_uuid,
          procedureName: row.procedure_name
        })
      );
    },

    async lastWriteEpochDay(todayEpochDay) {
      const rows = await driver.query<{ day: number | null }>(
        'SELECT MAX(epoch_day) AS day FROM appointment WHERE epoch_day <= ?',
        [todayEpochDay]
      );
      return rows[0]?.day ?? null;
    },

    async consultsByProcedure() {
      const rows = await driver.query<{ uuid: string; procedure_uuid: string; epoch_day: number }>(
        `SELECT a.uuid AS uuid, r.uuid AS procedure_uuid, a.epoch_day AS epoch_day
           FROM appointment a JOIN procedure r ON r.id = a.procedure_id
          ORDER BY a.epoch_day, a.id`
      );
      const byProcedure = new Map<string, { id: string; epochDay: number }[]>();
      for (const row of rows) {
        const consult = { id: row.uuid, epochDay: row.epoch_day };
        const found = byProcedure.get(row.procedure_uuid);
        if (found) found.push(consult);
        else byProcedure.set(row.procedure_uuid, [consult]);
      }
      return byProcedure;
    }
  };
}
