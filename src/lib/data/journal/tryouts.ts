/* Name and pronoun tryouts (phase 4 ticket 16, CONTEXT: "Tryout",
   "Felt-sense entry"). Two tables, one area - the same shape doubtJournal.ts
   uses - since a tryout's own fields and its felt-sense history belong to
   the same screen and nothing reads one without the other.

   Which entries fall inside a tryout's date range is not read through
   here: it is an ordinary date-range search
   (entries.searchEntries('', [], { startEpochDay, endEpochDay })), the
   same filter the search screen's date chip already produces. This area
   only owns what it alone writes - the tryout's own fields and its
   felt-sense observations. */

import type { SqliteDriver } from '../sqlite/driver';
import type { FeltSenseEntry, Tryout, TryoutKind } from '../types';
import { assertChanged, mintUuid, now, rowidByUuid } from './support';

export interface TryoutInput {
  id?: string;
  kind: TryoutKind;
  label: string;
  startEpochDay: number;
  endEpochDay: number | null;
}

export interface FeltSenseInput {
  tryoutId: string;
  epochDay: number;
  mood: number;
  note?: string | null;
}

export interface TryoutsArea {
  /** Most recently started first: several tryouts can be open at once, and
      the one someone just started is what they came here to check on. */
  getTryouts(): Promise<Tryout[]>;
  /** Returns the tryout's id. Updating an unknown id throws. */
  upsertTryout(input: TryoutInput): Promise<string>;
  /** Idempotent. Takes the tryout's felt-sense history with it. */
  deleteTryout(id: string): Promise<void>;
  /** Newest first, the same order doubtJournal's history reads in. */
  getFeltSenseEntries(tryoutId: string): Promise<FeltSenseEntry[]>;
  /** Returns the entry's id. Throws on an unknown tryout or a mood outside
      the five-level scale. */
  addFeltSenseEntry(input: FeltSenseInput): Promise<string>;
  /** Idempotent. */
  deleteFeltSenseEntry(id: string): Promise<void>;
}

type TryoutRow = {
  uuid: string;
  kind: TryoutKind;
  label: string;
  start_epoch_day: number;
  end_epoch_day: number | null;
};

type FeltSenseRow = {
  uuid: string;
  tryout_uuid: string;
  epoch_day: number;
  mood: number;
  note: string | null;
};

const toTryout = (row: TryoutRow): Tryout => ({
  id: row.uuid,
  kind: row.kind,
  label: row.label,
  startEpochDay: row.start_epoch_day,
  endEpochDay: row.end_epoch_day
});

const toFeltSenseEntry = (row: FeltSenseRow): FeltSenseEntry => ({
  id: row.uuid,
  tryoutId: row.tryout_uuid,
  epochDay: row.epoch_day,
  mood: row.mood,
  note: row.note
});

export function makeTryoutsArea(driver: SqliteDriver): TryoutsArea {
  return {
    async getTryouts() {
      const rows = await driver.query<TryoutRow>(
        'SELECT uuid, kind, label, start_epoch_day, end_epoch_day FROM tryout ORDER BY start_epoch_day DESC, id DESC'
      );
      return rows.map(toTryout);
    },

    async upsertTryout(input) {
      const label = input.label.trim();
      if (label.length === 0) throw new Error('a tryout needs a name or pronoun set');

      if (input.id) {
        const result = await driver.run(
          'UPDATE tryout SET kind = ?, label = ?, start_epoch_day = ?, end_epoch_day = ?, updated_at = ? WHERE uuid = ?',
          [input.kind, label, input.startEpochDay, input.endEpochDay, now(), input.id]
        );
        assertChanged(result, `tryout: ${input.id}`);
        return input.id;
      }

      const uuid = mintUuid();
      await driver.run(
        'INSERT INTO tryout (uuid, kind, label, start_epoch_day, end_epoch_day, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [uuid, input.kind, label, input.startEpochDay, input.endEpochDay, now()]
      );
      return uuid;
    },

    async deleteTryout(id) {
      await driver.transaction(async () => {
        await driver.run('DELETE FROM tryout_felt_sense WHERE tryout_id IN (SELECT id FROM tryout WHERE uuid = ?)', [
          id
        ]);
        await driver.run('DELETE FROM tryout WHERE uuid = ?', [id]);
      });
    },

    async getFeltSenseEntries(tryoutId) {
      const rows = await driver.query<FeltSenseRow>(
        `SELECT f.uuid, t.uuid AS tryout_uuid, f.epoch_day, f.mood, f.note
           FROM tryout_felt_sense f JOIN tryout t ON t.id = f.tryout_id
          WHERE t.uuid = ?
          ORDER BY f.epoch_day DESC, f.id DESC`,
        [tryoutId]
      );
      return rows.map(toFeltSenseEntry);
    },

    async addFeltSenseEntry(input) {
      if (!Number.isInteger(input.mood) || input.mood < 1 || input.mood > 5) {
        throw new Error(`invalid mood: ${input.mood}`);
      }
      const tryoutId = await rowidByUuid(driver, 'tryout', input.tryoutId);

      const uuid = mintUuid();
      await driver.run(
        'INSERT INTO tryout_felt_sense (uuid, tryout_id, epoch_day, mood, note, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [uuid, tryoutId, input.epochDay, input.mood, input.note ?? null, now()]
      );
      return uuid;
    },

    async deleteFeltSenseEntry(id) {
      await driver.run('DELETE FROM tryout_felt_sense WHERE uuid = ?', [id]);
    }
  };
}
