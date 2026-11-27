/* The taper area owns its schedule and session log. Sessions use
   `flatArea.ts`: upsert rejects an unknown ID, while delete is a no-op.

   Since schema 83 the schedule names a procedure rather than carrying
   its surgery date. Resolve the procedure row ID on write and join it
   on read. Callers identify the procedure by UUID. Store stages as JSON
   because expansion reads every stage together (`taperSchedule.ts`). */

import type { SqliteDriver } from '../sqlite/driver';
import { sessionSlots, sessionsExpectedOn, type SessionSlotNumber } from '../taperSchedule';
import type { Taper, TaperSession, TaperStage } from '../types';
import { flatArea } from './flatArea';
import { assertChanged, mintUuid, now, rowidByUuid } from './support';

interface TaperInput {
  id?: string;
  procedureId: string;
  startEpochDay: number;
  stages: TaperStage[];
}

/** A session as a day lists it: which of that day's expected sessions it
    is, when the schedule asked for more than one. */
export type DayTaperSession = TaperSession & { slot: SessionSlotNumber };

interface TaperSessionInput {
  id?: string;
  epochDay: number;
  /** Defaults to ''. Nothing is required beyond the day (ticket 12: this is
      a logging surface, not an adherence tool). */
  note?: string;
}

export interface TaperArea {
  /** The one taper the person has typed in, or null before they have. */
  getTaper(): Promise<Taper | null>;
  /** Returns the taper's id. Editing in place - a surgeon changes the plan
      - rather than a history of past schedules, the same "one row" shape
      `getTaper` returns. */
  upsertTaper(input: TaperInput): Promise<string>;
  getSessions(): Promise<TaperSession[]>;
  getSessionsOnDay(epochDay: number): Promise<TaperSession[]>;
  /** The day's sessions numbered against what the schedule expected that
      day: "session 2 of 3" on a times-a-day stage (day.ts). */
  getDaySessions(epochDay: number): Promise<DayTaperSession[]>;
  /** The day of the most recent session at or before `todayEpochDay`, or
      null if there is none (lastWrite.ts). */
  lastWriteEpochDay(todayEpochDay: number): Promise<number | null>;
  upsertSession(input: TaperSessionInput): Promise<string>;
  deleteSession(id: string): Promise<void>;
}

/** The schedule/procedure join every `getTaper` row shares - `stages` as
    JSON, the one translation this file owns that flatArea.ts does not
    know about, and `procedure_uuid` the join contributes (appointments.ts'
    own `AppointmentRow` is the same shape for the same reason). */
type TaperRow = {
  uuid: string;
  procedure_uuid: string;
  start_epoch_day: number;
  stages: string;
};

const TAPER_SELECT = `SELECT t.uuid AS uuid, p.uuid AS procedure_uuid, t.start_epoch_day AS start_epoch_day,
                t.stages AS stages
           FROM taper t JOIN procedure p ON p.id = t.procedure_id`;

const toTaper = (row: TaperRow): Taper => ({
  id: row.uuid,
  procedureId: row.procedure_uuid,
  startEpochDay: row.start_epoch_day,
  stages: JSON.parse(row.stages) as TaperStage[]
});

export function makeTaperArea(driver: SqliteDriver): TaperArea {
  const sessions = flatArea<TaperSession>(driver, {
    table: 'taper_session',
    columns: { epochDay: 'epoch_day', note: 'note' }
  });

  async function getTaper() {
    const rows = await driver.query<TaperRow>(`${TAPER_SELECT} ORDER BY t.id LIMIT 1`);
    return rows[0] ? toTaper(rows[0]) : null;
  }

  return {
    getTaper,

    async upsertTaper(input) {
      // Resolved before either branch writes, so an unknown procedure
      // fails without having changed a schedule first.
      const procedureRowid = await rowidByUuid(driver, 'procedure', input.procedureId);
      const values = [procedureRowid, input.startEpochDay, JSON.stringify(input.stages)];

      if (input.id) {
        const result = await driver.run(
          'UPDATE taper SET procedure_id = ?, start_epoch_day = ?, stages = ?, updated_at = ? WHERE uuid = ?',
          [...values, now(), input.id]
        );
        assertChanged(result, `taper: ${input.id}`);
        return input.id;
      }

      const uuid = mintUuid();
      await driver.run(
        'INSERT INTO taper (uuid, procedure_id, start_epoch_day, stages, updated_at) VALUES (?, ?, ?, ?, ?)',
        [uuid, ...values, now()]
      );
      return uuid;
    },

    getSessions: () => sessions.read('ORDER BY epoch_day, id'),

    getSessionsOnDay: (epochDay) => sessions.read('WHERE epoch_day = ? ORDER BY id', [epochDay]),

    async getDaySessions(epochDay) {
      const [onDay, taper] = await Promise.all([
        sessions.read('WHERE epoch_day = ? ORDER BY id', [epochDay]),
        getTaper()
      ]);
      const expected = taper ? sessionsExpectedOn(taper, epochDay) : 0;
      return sessionSlots(onDay, expected).flatMap(({ session, slot }) => (session ? [{ ...session, slot }] : []));
    },

    async lastWriteEpochDay(todayEpochDay) {
      const [latest] = await sessions.read('WHERE epoch_day <= ? ORDER BY epoch_day DESC LIMIT 1', [todayEpochDay]);
      return latest?.epochDay ?? null;
    },

    upsertSession: (input) => sessions.upsert({ ...input, note: input.note ?? '' }),

    deleteSession: sessions.delete
  };
}
