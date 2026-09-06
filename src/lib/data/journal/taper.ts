/* The dilation taper (phase 8 features ticket 12, CONTEXT: "Taper"). Two
   flat tables (schema.ts), both through flatArea.ts's shared
   triple - the row-and-write contract ticket 08 installs, adopted rather
   than copied from a sibling module the way sizeRecords.ts is: an unknown
   id throws on upsert and succeeds-and-changes-nothing on delete, with no
   assertion of its own on the delete path.

   One area for both tables, the same reasoning doses.ts gives for folding
   a schedule and its events under one name: nothing here reads a session
   without knowing whether there is a schedule to compare it against, and a
   screen showing both should not have to compose two area handles.

   The schedule's `stages` is JSON in a single column rather than a child
   table - flatArea.ts's own refusal of anything needing a join, and the
   right call here because the expansion (taperSchedule.ts) always reads
   every stage at once and never queries one on its own. */

import type { SqliteDriver } from '../sqlite/driver';
import type { Taper, TaperSession, TaperStage } from '../types';
import { flatArea } from './flatArea';

interface TaperInput {
  id?: string;
  surgeryEpochDay: number;
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

/** The schedule row's own shape: `stages` stored as JSON, the one
    translation this file owns that flatArea.ts does not know about. */
interface TaperRow {
  id: string;
  surgeryEpochDay: number;
  startEpochDay: number;
  stagesJson: string;
}

const toTaper = (row: TaperRow): Taper => ({
  id: row.id,
  surgeryEpochDay: row.surgeryEpochDay,
  startEpochDay: row.startEpochDay,
  stages: JSON.parse(row.stagesJson) as TaperStage[]
});

export function makeTaperArea(driver: SqliteDriver): TaperArea {
  const schedule = flatArea<TaperRow>(driver, {
    table: 'taper',
    columns: {
      surgeryEpochDay: 'surgery_epoch_day',
      startEpochDay: 'start_epoch_day',
      stagesJson: 'stages'
    }
  });

  const sessions = flatArea<TaperSession>(driver, {
    table: 'taper_session',
    columns: { epochDay: 'epoch_day', note: 'note' }
  });

  return {
    async getTaper() {
      const [row] = await schedule.read('ORDER BY id LIMIT 1');
      return row ? toTaper(row) : null;
    },

    upsertTaper: (input) =>
      schedule.upsert({
        id: input.id,
        surgeryEpochDay: input.surgeryEpochDay,
        startEpochDay: input.startEpochDay,
        stagesJson: JSON.stringify(input.stages)
      }),

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
