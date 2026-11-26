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
   does not do.

   A WAIT IS THE SAME RECORD BEFORE ITS DAY (functional-audit ticket 26). A
   referral to a gender clinic, an NFZ queue or a surgery list is an
   appointment with no day yet: the kind is the service, plus the day it was
   referred on, dated status updates and the note. Giving it a day later
   edits the same row. `getAppointments` reads visits only (rows with a day),
   because every reader of it - the next visit, the debrief, the room, the
   clinician summary, the day-ahead marks - is asking about a day;
   `getWaiting` reads the rest. How long somebody has waited is stated as
   elapsed time and never as an estimate of what is left (`waitingSince`).

   A TIME AND A WHO (functional-audit ticket 27). A visit can keep its time
   of day, `HH:MM` or nothing, which the calendar hand-off then uses rather
   than asking for one on every share. A wait has no day, so it has no time
   either. And a visit or a wait can name its provider: the person's own
   record of somebody they see, with a contact, how trans-competent they
   were and their impressions. Providers live here rather than in an area
   of their own because nothing reads one except as an appointment's who;
   they are a flat table (flatArea.ts) and never leave the journal except
   in the person's own backup. Deleting one leaves its appointments with
   nobody named (`ON DELETE SET NULL`). */

import type { SqliteDriver } from '../sqlite/driver';
import { calendarDuration, type CalendarDuration } from '../epochDay';
import type { Appointment, AppointmentStatusUpdate, Provider, ProviderCompetence, WaitingAppointment } from '../types';
import { flatArea, type FlatInput } from './flatArea';
import { assertChanged, mintUuid, now } from './support';
import { assertValidCost, costColumns, costFromRow, normalizeCost, type CostInput, type CostRow } from '../cost';

export interface AppointmentInput {
  /** Absent to create, present to update. Updating an unknown id throws
      (ADR-0053). */
  id?: string;
  /** Null while it waits for a day (ticket 26). */
  epochDay: number | null;
  /** The day it was referred on, or null. Absent is null, on an update as
      on a create: the one screen that edits a wait always passes it. */
  referredEpochDay?: number | null;
  /** `HH:MM`, or empty or absent for none (ticket 27). Refused on a wait
      with no day, and refused when it is not a 24-hour clock time. */
  time?: string | null;
  /** The provider this is with, or null; absent is null. Throws if the
      provider is unknown. */
  providerId?: string | null;
  /** The procedure this belongs to, or null. Throws if the procedure is
      unknown - the caller acted on something stale. */
  procedureId: string | null;
  kind: string | null;
  place: string | null;
  note: string | null;
  /** What it cost (FA 30). Absent is none, on an update as on a create, like
      `referredEpochDay`: the editor always passes it. Throws if invalid. */
  cost?: CostInput;
}

/** One appointment as a day view reads it: what it was and where, with the
    procedure named where there is one, so the row can say which surgery
    journey a consult belongs to without a second read. */
export interface AppointmentDayRecord {
  /** The appointment's id for a visit or a referral, the update's own for a
      status update. */
  id: string;
  /** What happened on the day: the visit itself, the referral, or one
      update on the wait (ticket 26). */
  event: 'visit' | 'referred' | 'status';
  /** The update's text, on a status update only. */
  status: string | null;
  kind: string | null;
  place: string | null;
  procedureId: string | null;
  procedureName: string | null;
  /** The appointment the row is about - for a status update, the one its
      wait belongs to - so the row can open that appointment's own screen. */
  appointmentId: string;
}

export interface AppointmentsArea {
  /** Every appointment that has a day, oldest first. Past and future alike -
      which end of today a row falls on is the screen's question, not this
      one's. A wait with no day yet is `getWaiting`'s. */
  getAppointments(): Promise<Appointment[]>;
  /** Every appointment still waiting for a day (ticket 26), the longest wait
      first and an unknown referred-on day last. */
  getWaiting(): Promise<WaitingAppointment[]>;
  /** Every status update on every appointment, oldest first. A small table
      read whole, the way `getAppointments` reads its own. */
  getStatusUpdates(): Promise<AppointmentStatusUpdate[]>;
  /** Returns the update's id. Blank text, or an appointment this journal does
      not hold, throws (ADR-0053). */
  addStatusUpdate(input: { appointmentId: string; epochDay: number; status: string }): Promise<string>;
  /** Idempotent (ADR-0053). */
  deleteStatusUpdate(id: string): Promise<void>;
  /** One appointment with a day by id, or undefined - the debrief deep link's own read
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
  /** What the appointments hold on one day (day.ts): visits on it,
      referrals made on it, status updates dated on it. */
  getDayRecords(epochDay: number): Promise<AppointmentDayRecord[]>;
  /** The most recent appointment, referral or status update at or before
      `todayEpochDay`, or null
      (lastWrite.ts). One still ahead is a plan rather than a write, which is
      also why this area joins `comingBack.ts`'s planned areas: without that,
      booking a future appointment would close the person's own return gap. */
  lastWriteEpochDay(todayEpochDay: number): Promise<number | null>;
  /** Each procedure's own appointments, keyed by the procedure's travelling
      id and oldest first - what the surgery journey shows as its consults.
      One query for every procedure rather than one per row, the same reason
      `photosByMilestone` (photos.ts) exists. */
  consultsByProcedure(): Promise<Map<string, { id: string; epochDay: number }[]>>;
  /** Every provider, by name (ticket 27). */
  getProviders(): Promise<Provider[]>;
  /** Returns the provider's id. A blank name throws; updating an unknown id
      throws (ADR-0053). Contact and impressions left blank are stored as
      nothing. */
  upsertProvider(input: FlatInput<Provider>): Promise<string>;
  /** Idempotent (ADR-0053). Its appointments stay, with nobody named. */
  deleteProvider(id: string): Promise<void>;
}

/** The three answers to "how were they with trans care", in the order the
    editor offers them. */
export const PROVIDER_COMPETENCES: readonly ProviderCompetence[] = ['good', 'mixed', 'poor'];

const competenceOf = (value: unknown): ProviderCompetence | null =>
  PROVIDER_COMPETENCES.find((known) => known === value) ?? null;

/** `HH:MM` on a 24-hour clock - the TimePicker's own value, and the only
    shape an archive's appointment time is accepted in. */
const isClockTime = (value: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

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

/** How long somebody has waited: the calendar time from the referred-on day
    to today, or null when that day is unknown or still ahead. Elapsed time
    only, by design (ticket 26): the app has nothing to predict a queue from,
    and a guess at the rest of a wait is the kind of claim it never makes. */
export function waitingSince(referredEpochDay: number | null, todayEpochDay: number): CalendarDuration | null {
  if (referredEpochDay === null || referredEpochDay > todayEpochDay) return null;
  return calendarDuration(referredEpochDay, todayEpochDay);
}

/** All visits on this day, in the journal's order. */
export function appointmentsOnDay(appointments: Appointment[], epochDay: number): Appointment[] {
  return appointments.filter((appointment) => appointment.epochDay === epochDay);
}

/** Resolve an explicit choice, or the day's only visit when none was made.
    A deleted or moved selection must never fall back to another visit. */
export function chosenAppointmentOnDay(
  appointments: Appointment[],
  epochDay: number,
  chosenId: string | null
): Appointment | null {
  const onDay = appointmentsOnDay(appointments, epochDay);
  if (chosenId !== null) {
    return onDay.find((appointment) => appointment.id === chosenId) ?? null;
  }
  return onDay.length === 1 ? onDay[0] : null;
}

/** The `appointment`/`procedure` join every `getAppointments`/`getAppointment`
    row shares, so the two differ only in their `WHERE`, not in what a row
    means. */
type AppointmentRow = CostRow & {
  uuid: string;
  epoch_day: number | null;
  referred_epoch_day: number | null;
  procedure_uuid: string | null;
  kind: string | null;
  place: string | null;
  note: string | null;
  time_of_day: string | null;
  provider_uuid: string | null;
};

const APPOINTMENT_SELECT = `SELECT a.uuid AS uuid, a.epoch_day AS epoch_day, r.uuid AS procedure_uuid,
                a.kind AS kind, a.place AS place, a.note AS note, a.referred_epoch_day AS referred_epoch_day,
                a.time_of_day AS time_of_day, p.uuid AS provider_uuid,
                a.cost_amount AS cost_amount, a.cost_currency AS cost_currency, a.cost_refunded AS cost_refunded
           FROM appointment a LEFT JOIN procedure r ON r.id = a.procedure_id
           LEFT JOIN provider p ON p.id = a.provider_id`;

const fieldsOf = (row: AppointmentRow) => ({
  id: row.uuid,
  procedureId: row.procedure_uuid,
  kind: row.kind,
  place: row.place,
  note: row.note,
  referredEpochDay: row.referred_epoch_day,
  time: row.time_of_day,
  providerId: row.provider_uuid,
  cost: costFromRow(row)
});

/* Each read below filters on whether the day is there, so the casts state
   what the WHERE already made true. */
const toAppointment = (row: AppointmentRow): Appointment => ({ ...fieldsOf(row), epochDay: row.epoch_day as number });
const toWaiting = (row: AppointmentRow): WaitingAppointment => ({ ...fieldsOf(row), epochDay: null });

export function makeAppointmentsArea(driver: SqliteDriver): AppointmentsArea {
  const procedureRowid = async (procedureId: string | null): Promise<number | null> => {
    if (procedureId === null) return null;
    const rows = await driver.query<{ id: number }>('SELECT id FROM procedure WHERE uuid = ?', [procedureId]);
    if (rows.length === 0) throw new Error(`unknown procedure: ${procedureId}`);
    return rows[0].id;
  };

  const providerRowid = async (providerId: string | null | undefined): Promise<number | null> => {
    if (!providerId) return null;
    const rows = await driver.query<{ id: number }>('SELECT id FROM provider WHERE uuid = ?', [providerId]);
    if (rows.length === 0) throw new Error(`unknown provider: ${providerId}`);
    return rows[0].id;
  };

  const providers = flatArea<Provider>(driver, {
    table: 'provider',
    columns: { name: 'name', contact: 'contact', competence: 'competence', impressions: 'impressions' },
    guard: ({ name }) => {
      if (!trimmed(name)) throw new Error('a provider needs a name');
    }
  });

  return {
    async getAppointments() {
      const rows = await driver.query<AppointmentRow>(
        `${APPOINTMENT_SELECT} WHERE a.epoch_day IS NOT NULL ORDER BY a.epoch_day, a.id`
      );
      return rows.map(toAppointment);
    },

    async getWaiting() {
      const rows = await driver.query<AppointmentRow>(
        `${APPOINTMENT_SELECT} WHERE a.epoch_day IS NULL
          ORDER BY a.referred_epoch_day IS NULL, a.referred_epoch_day, a.id`
      );
      return rows.map(toWaiting);
    },

    async getStatusUpdates() {
      const rows = await driver.query<{ uuid: string; appointment_uuid: string; epoch_day: number; status: string }>(
        `SELECT s.uuid AS uuid, a.uuid AS appointment_uuid, s.epoch_day AS epoch_day, s.status AS status
           FROM appointment_status s JOIN appointment a ON a.id = s.appointment_id
          ORDER BY s.epoch_day, s.id`
      );
      return rows.map((row) => ({
        id: row.uuid,
        appointmentId: row.appointment_uuid,
        epochDay: row.epoch_day,
        status: row.status
      }));
    },

    async addStatusUpdate({ appointmentId, epochDay, status }) {
      const text = trimmed(status);
      if (text === null) throw new Error('a status update needs text');
      const rows = await driver.query<{ id: number }>('SELECT id FROM appointment WHERE uuid = ?', [appointmentId]);
      if (rows.length === 0) throw new Error(`unknown appointment: ${appointmentId}`);
      const uuid = mintUuid();
      await driver.run(
        `INSERT INTO appointment_status (uuid, appointment_id, epoch_day, status, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [uuid, rows[0].id, epochDay, text, now()]
      );
      return uuid;
    },

    async deleteStatusUpdate(id) {
      await driver.run('DELETE FROM appointment_status WHERE uuid = ?', [id]);
    },

    async getAppointment(id) {
      const rows = await driver.query<AppointmentRow>(
        `${APPOINTMENT_SELECT} WHERE a.uuid = ? AND a.epoch_day IS NOT NULL`,
        [id]
      );
      const row = rows[0];
      return row ? toAppointment(row) : undefined;
    },

    async upsertAppointment(input) {
      // Resolved before either branch writes, so an unknown procedure fails
      // without having changed a day or a note first.
      const time = input.time || null;
      if (time !== null && !isClockTime(time)) throw new Error(`not a time of day: ${time}`);
      if (time !== null && input.epochDay === null) throw new Error('a wait with no day has no time');
      const cost = normalizeCost(input.cost);
      assertValidCost(cost);
      const rowid = await procedureRowid(input.procedureId);
      const providerRow = await providerRowid(input.providerId);
      const values = [
        rowid,
        input.epochDay,
        trimmed(input.kind),
        trimmed(input.place),
        trimmed(input.note),
        input.referredEpochDay ?? null,
        time,
        providerRow,
        ...costColumns(cost)
      ];

      if (input.id) {
        const result = await driver.run(
          `UPDATE appointment SET procedure_id = ?, epoch_day = ?, kind = ?, place = ?, note = ?,
                  referred_epoch_day = ?, time_of_day = ?, provider_id = ?,
                  cost_amount = ?, cost_currency = ?, cost_refunded = ?, updated_at = ?
            WHERE uuid = ?`,
          [...values, now(), input.id]
        );
        assertChanged(result, `appointment: ${input.id}`);
        return input.id;
      }

      const uuid = mintUuid();
      await driver.run(
        `INSERT INTO appointment (uuid, procedure_id, epoch_day, kind, place, note, referred_epoch_day,
                                  time_of_day, provider_id, cost_amount, cost_currency, cost_refunded, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      /* One query for the three ways an appointment reaches a day, so the
         day view's one-read-per-section budget holds: the visit on its day,
         the referral on its referred-on day, each update on its own. */
      const rows = await driver.query<{
        id: string;
        event: AppointmentDayRecord['event'];
        status: string | null;
        kind: string | null;
        place: string | null;
        procedure_uuid: string | null;
        procedure_name: string | null;
        appointment_uuid: string;
      }>(
        `SELECT x.id AS id, x.event AS event, x.status AS status, a.kind AS kind, a.place AS place,
                r.uuid AS procedure_uuid, r.name AS procedure_name, a.uuid AS appointment_uuid
           FROM (
             SELECT id AS appointment_id, uuid AS id, 'visit' AS event, NULL AS status, 0 AS rank, id AS seq
               FROM appointment WHERE epoch_day = ?
             UNION ALL
             SELECT id, uuid, 'referred', NULL, 1, id FROM appointment WHERE referred_epoch_day = ?
             UNION ALL
             SELECT appointment_id, uuid, 'status', status, 2, id FROM appointment_status WHERE epoch_day = ?
           ) x
           JOIN appointment a ON a.id = x.appointment_id
           LEFT JOIN procedure r ON r.id = a.procedure_id
          ORDER BY x.rank, x.seq`,
        [epochDay, epochDay, epochDay]
      );
      return rows.map(
        (row): AppointmentDayRecord => ({
          id: row.id,
          event: row.event,
          status: row.status,
          kind: row.kind,
          place: row.place,
          procedureId: row.procedure_uuid,
          procedureName: row.procedure_name,
          appointmentId: row.appointment_uuid
        })
      );
    },

    async lastWriteEpochDay(todayEpochDay) {
      const rows = await driver.query<{ day: number | null }>(
        `SELECT MAX(day) AS day FROM (
           SELECT epoch_day AS day FROM appointment
           UNION ALL
           SELECT referred_epoch_day FROM appointment
           UNION ALL
           SELECT epoch_day FROM appointment_status
         ) WHERE day <= ?`,
        [todayEpochDay]
      );
      return rows[0]?.day ?? null;
    },

    async consultsByProcedure() {
      const rows = await driver.query<{ uuid: string; procedure_uuid: string; epoch_day: number }>(
        `SELECT a.uuid AS uuid, r.uuid AS procedure_uuid, a.epoch_day AS epoch_day
           FROM appointment a JOIN procedure r ON r.id = a.procedure_id
          WHERE a.epoch_day IS NOT NULL
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
    },

    async getProviders() {
      const rows = await providers.read('ORDER BY name COLLATE NOCASE, id');
      return rows.map((row) => ({ ...row, competence: competenceOf(row.competence) }));
    },

    upsertProvider: (input) =>
      providers.upsert({
        id: input.id,
        name: input.name.trim(),
        contact: trimmed(input.contact),
        competence: competenceOf(input.competence),
        impressions: trimmed(input.impressions)
      }),

    deleteProvider: providers.delete
  };
}
