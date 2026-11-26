/* The felt-sense area (phase 5 ticket 24, CONTEXT: "Felt-sense entry"): how
   a tryout felt, logged on the days someone chooses to log it. A milestone
   held readings too, until functional audit ticket 32 cut them - they were
   asked for and never shown - and migration 98 rebuilt the table with the
   tryout as its one owner.

   Offering one is the caller's business; this module only holds the record
   once someone chooses to add it, and never requires one. */

import type { SqliteDriver } from '../sqlite/driver';
import type { FeltSenseEntry } from '../types';
import { mintUuid, now, rowidByUuid } from './support';

/** The tryout a reading belongs to. */
type FeltSenseOwner = { tryoutId: string };

interface FeltSenseInput {
  epochDay: number;
  mood: number;
  note?: string | null;
}

/** A felt-sense entry read without knowing whose it is (phase 5 deepening
    ticket 21): the day view asks a day what it holds, so the tryout has to
    travel with the row for it to say "how the name felt" rather than a
    mood with nothing attached.

    The tryout's label, not just its id: a row that reads "Robin" is what
    the screen shows, and resolving it here is one join where the screen
    would otherwise read every tryout to look one up. */
export interface FeltSenseOnDay extends FeltSenseEntry {
  owner: { id: string; name: string };
}

export interface FeltSenseArea {
  /** Newest first, the same order the tryout screen already read in before
      this module existed. */
  forTryout(tryoutId: string): Promise<FeltSenseEntry[]>;
  /** Every tryout's readings, oldest first, keyed by tryout and read in one
      query rather than one per row - `photosByProcedure` (procedures.ts)
      is the shape, and the reason is the one `forEntries` (marginNotes.ts)
      gives: a screen drawing several tryouts at once costs one query, not
      one per tryout. A tryout with no readings is absent rather than
      present with an empty list, so a caller reads "has any" off `get`
      alone.

      Oldest first, where `forTryout` is newest first, because this answers
      a drawing rather than a log: the tryouts index puts a running
      tryout's readings on a line running left to right in time (ticket 53,
      tryoutReading.ts), and a log shows the last thing first. */
  byTryout(): Promise<Map<string, FeltSenseEntry[]>>;
  /** The entries dated to one day, oldest-logged first. */
  onDay(epochDay: number): Promise<FeltSenseOnDay[]>;
  /** Returns the entry's id. Throws on an unknown tryout or a mood outside
      the five-level scale. */
  add(owner: FeltSenseOwner, input: FeltSenseInput): Promise<string>;
  /** Idempotent. */
  remove(id: string): Promise<void>;
  /** The day of the most recent felt-sense entry at or before
      `todayEpochDay`, or null if there is none (phase 8 features ticket 03,
      lastWrite.ts). */
  lastWriteEpochDay(todayEpochDay: number): Promise<number | null>;
}

type FeltSenseRow = { uuid: string; epoch_day: number; mood: number; note: string | null };

const toFeltSenseEntry = (row: FeltSenseRow): FeltSenseEntry => ({
  id: row.uuid,
  epochDay: row.epoch_day,
  mood: row.mood,
  note: row.note
});

export function makeFeltSenseArea(driver: SqliteDriver): FeltSenseArea {
  return {
    async forTryout(tryoutId) {
      const rows = await driver.query<FeltSenseRow>(
        `SELECT f.uuid, f.epoch_day, f.mood, f.note
           FROM felt_sense f JOIN tryout t ON t.id = f.tryout_id
          WHERE t.uuid = ?
          ORDER BY f.epoch_day DESC, f.id DESC`,
        [tryoutId]
      );
      return rows.map(toFeltSenseEntry);
    },

    async byTryout() {
      const rows = await driver.query<FeltSenseRow & { tryout_uuid: string }>(
        `SELECT f.uuid, f.epoch_day, f.mood, f.note, t.uuid AS tryout_uuid
           FROM felt_sense f JOIN tryout t ON t.id = f.tryout_id
          ORDER BY f.epoch_day, f.id`
      );
      const byTryout = new Map<string, FeltSenseEntry[]>();
      for (const row of rows) {
        const entry = toFeltSenseEntry(row);
        const found = byTryout.get(row.tryout_uuid);
        if (found) found.push(entry);
        else byTryout.set(row.tryout_uuid, [entry]);
      }
      return byTryout;
    },

    async onDay(epochDay) {
      const rows = await driver.query<FeltSenseRow & { tryout_uuid: string; tryout_label: string }>(
        `SELECT f.uuid, f.epoch_day, f.mood, f.note, t.uuid AS tryout_uuid, t.label AS tryout_label
           FROM felt_sense f JOIN tryout t ON t.id = f.tryout_id
          WHERE f.epoch_day = ?
          ORDER BY f.id`,
        [epochDay]
      );
      return rows.map((row) => ({ ...toFeltSenseEntry(row), owner: { id: row.tryout_uuid, name: row.tryout_label } }));
    },

    async add(owner, input) {
      if (!Number.isInteger(input.mood) || input.mood < 1 || input.mood > 5) {
        throw new Error(`invalid mood: ${input.mood}`);
      }
      // Resolved before anything is written, so an unknown tryout fails
      // before the row does.
      const tryoutId = await rowidByUuid(driver, 'tryout', owner.tryoutId);

      const uuid = mintUuid();
      await driver.run(
        'INSERT INTO felt_sense (uuid, tryout_id, epoch_day, mood, note, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [uuid, tryoutId, input.epochDay, input.mood, input.note ?? null, now()]
      );
      return uuid;
    },

    async remove(id) {
      await driver.run('DELETE FROM felt_sense WHERE uuid = ?', [id]);
    },

    async lastWriteEpochDay(todayEpochDay) {
      const rows = await driver.query<{ day: number | null }>(
        'SELECT MAX(epoch_day) AS day FROM felt_sense WHERE epoch_day <= ?',
        [todayEpochDay]
      );
      return rows[0]?.day ?? null;
    }
  };
}
