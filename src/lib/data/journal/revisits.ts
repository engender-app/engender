/* A day chosen to see one entry again (phase 8 features ticket 08,
   ADR-0045: "the arrival offers and never mints"). This area owns the
   schedule only - the entry it points at stays exactly as written, the same
   "own record type" reasoning letters.ts gives a letter.

   `entry_id` is stored as the owning entry's uuid rather than its local row
   id (schema.ts has the reasoning), so every read here joins against
   `entry` to hand the app-facing `Revisit.entryId` back as the ordinary
   numeric id every other screen already addresses an entry by. */

import type { SqliteDriver } from '../sqlite/driver';
import type { Revisit } from '../types';
import { mintUuid, now } from './support';

export interface RevisitInput {
  entryId: number;
  /** The day the revisit was set - today's epoch day, handed in rather than
      read here (ADR-0001: today is a local calendar day, not the data
      layer's to decide). */
  createdEpochDay: number;
  targetEpochDay: number;
}

export interface RevisitsArea {
  /** The one revisit set for an entry, or null. */
  getRevisitForEntry(entryId: number): Promise<Revisit | null>;
  /** Upserts the entry's one revisit row: setting a new day for an entry
      that already has one replaces it rather than adding a second. */
  setRevisit(input: RevisitInput): Promise<void>;
  /** Idempotent, like the journal's other deletes. */
  deleteRevisit(id: string): Promise<void>;
  /** Every revisit whose target day has arrived, owning entry not trashed,
      earliest target first - what the live tile draws from. */
  getDueRevisits(todayEpochDay: number): Promise<Revisit[]>;
}

type RevisitRow = {
  uuid: string;
  entry_id: number;
  entry_epoch_day: number;
  created_epoch_day: number;
  target_epoch_day: number;
};

const toRevisit = (row: RevisitRow): Revisit => ({
  id: row.uuid,
  entryId: row.entry_id,
  entryEpochDay: row.entry_epoch_day,
  createdEpochDay: row.created_epoch_day,
  targetEpochDay: row.target_epoch_day
});

const SELECT = `
  SELECT r.uuid, e.id AS entry_id, r.entry_epoch_day, r.created_epoch_day, r.target_epoch_day
  FROM revisit r
  JOIN entry e ON e.uuid = r.entry_id
`;

export function makeRevisitsArea(driver: SqliteDriver): RevisitsArea {
  return {
    async getRevisitForEntry(entryId) {
      const rows = await driver.query<RevisitRow>(`${SELECT} WHERE e.id = ?`, [entryId]);
      return rows.length ? toRevisit(rows[0]) : null;
    },

    async setRevisit(input) {
      const entryRows = await driver.query<{ uuid: string; epoch_day: number }>(
        'SELECT uuid, epoch_day FROM entry WHERE id = ?',
        [input.entryId]
      );
      const entry = entryRows[0];
      if (!entry) throw new Error(`unknown entry: ${input.entryId}`);

      await driver.run(
        `INSERT INTO revisit (uuid, entry_id, entry_epoch_day, created_epoch_day, target_epoch_day, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (entry_id) DO UPDATE SET
           created_epoch_day = excluded.created_epoch_day,
           target_epoch_day = excluded.target_epoch_day,
           updated_at = excluded.updated_at`,
        [mintUuid(), entry.uuid, entry.epoch_day, input.createdEpochDay, input.targetEpochDay, now()]
      );
    },

    async deleteRevisit(id) {
      await driver.run('DELETE FROM revisit WHERE uuid = ?', [id]);
    },

    async getDueRevisits(todayEpochDay) {
      const rows = await driver.query<RevisitRow>(
        `${SELECT} WHERE r.target_epoch_day <= ? AND e.trashed_at IS NULL ORDER BY r.target_epoch_day ASC, r.id ASC`,
        [todayEpochDay]
      );
      return rows.map(toRevisit);
    }
  };
}
