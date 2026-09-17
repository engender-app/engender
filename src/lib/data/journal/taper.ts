/* The dilation taper (phase 8 features ticket 12, CONTEXT: "Taper"). The
   session log is a flat table (schema.ts) through flatArea.ts's shared
   triple - the row-and-write contract ticket 08 installs, adopted rather
   than copied from a sibling module the way sizeRecords.ts is: an unknown
   id throws on upsert and succeeds-and-changes-nothing on delete, with no
   assertion of its own on the delete path.

   The schedule left that shape at schema v83 (audit item 7): it names
   which procedure it dilates for rather than carrying a surgery date of
   its own, which is a join - flatArea.ts's own refusal - so it is
   hand-written here the same way appointments.ts resolves its own
   `procedure_id`: a `procedureRowid` lookup on write, a
   `LEFT JOIN procedure` on read, the procedure's `uuid` is what the rest
   of the app calls its id.

   One area for both tables, the same reasoning doses.ts gives for folding
   a schedule and its events under one name: nothing here reads a session
   without knowing whether there is a schedule to compare it against, and a
   screen showing both should not have to compose two area handles.

   The schedule's `stages` is JSON in a single column rather than a child
   table - the right call because the expansion (taperSchedule.ts) always
   reads every stage at once and never queries one on its own. */

import type { SqliteDriver } from '../sqlite/driver';
import type { Taper, TaperSession, TaperStage } from '../types';
import { flatArea } from './flatArea';
import { assertChanged, mintUuid, now, rowidByUuid } from './support';

interface TaperInput {
  id?: string;
  procedureId: string;
  startEpochDay: number;
  stages: TaperStage[];
}

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

  return {
    async getTaper() {
      const rows = await driver.query<TaperRow>(`${TAPER_SELECT} ORDER BY t.id LIMIT 1`);
      return rows[0] ? toTaper(rows[0]) : null;
    },

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

    async lastWriteEpochDay(todayEpochDay) {
      const [latest] = await sessions.read('WHERE epoch_day <= ? ORDER BY epoch_day DESC LIMIT 1', [todayEpochDay]);
      return latest?.epochDay ?? null;
    },

    upsertSession: (input) => sessions.upsert({ ...input, note: input.note ?? '' }),

    deleteSession: sessions.delete
  };
}
