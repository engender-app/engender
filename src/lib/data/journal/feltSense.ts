/* The felt-sense area (phase 5 ticket 24, CONTEXT: "Felt-sense entry"). One
   table and one code path for both owners, the same reasoning photos.ts
   gives for its own table: a tryout's felt-sense history and a milestone's
   differ only in which column a row hangs off (migrations.ts v32), so
   there is no second implementation for milestones to drift from this one.

   Offering one - at a milestone's own creation, and again on each
   anniversary showing - is the caller's business (settings/milestones,
   MilestoneCard); this module only holds the record once someone chooses
   to add it, and never requires one. */

import type { SqliteDriver } from '../sqlite/driver';
import type { FeltSenseEntry } from '../types';
import { mintUuid, now, rowidByUuid } from './support';

/** Exactly one owner, mirroring the felt_sense table's CHECK constraint
    (migrations.ts v32) and PhotoOwner's own shape (photos.ts). */
export type FeltSenseOwner = { tryoutId: string; milestoneId?: never } | { milestoneId: string; tryoutId?: never };

export interface FeltSenseInput {
  epochDay: number;
  mood: number;
  note?: string | null;
}

export interface FeltSenseArea {
  /** Newest first, the same order the tryout screen already read in before
      this module existed. */
  forTryout(tryoutId: string): Promise<FeltSenseEntry[]>;
  /** Newest first, like forTryout. */
  forMilestone(milestoneId: string): Promise<FeltSenseEntry[]>;
  /** Returns the entry's id. Throws on an unknown owner or a mood outside
      the five-level scale. */
  add(owner: FeltSenseOwner, input: FeltSenseInput): Promise<string>;
  /** Idempotent. */
  remove(id: string): Promise<void>;
}

type FeltSenseRow = { uuid: string; epoch_day: number; mood: number; note: string | null };

const toFeltSenseEntry = (row: FeltSenseRow): FeltSenseEntry => ({
  id: row.uuid,
  epochDay: row.epoch_day,
  mood: row.mood,
  note: row.note
});

/** Both owner columns, resolved before anything is written - an unknown
    owner has to fail before the row does, the same reasoning photos.ts'
    columnsFor gives. */
async function columnsFor(
  driver: SqliteDriver,
  owner: FeltSenseOwner
): Promise<{ tryoutId: number | null; milestoneId: number | null }> {
  if (owner.tryoutId != null) {
    return { tryoutId: await rowidByUuid(driver, 'tryout', owner.tryoutId), milestoneId: null };
  }
  return { tryoutId: null, milestoneId: await rowidByUuid(driver, 'milestone', owner.milestoneId) };
}

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

    async forMilestone(milestoneId) {
      const rows = await driver.query<FeltSenseRow>(
        `SELECT f.uuid, f.epoch_day, f.mood, f.note
           FROM felt_sense f JOIN milestone ms ON ms.id = f.milestone_id
          WHERE ms.uuid = ?
          ORDER BY f.epoch_day DESC, f.id DESC`,
        [milestoneId]
      );
      return rows.map(toFeltSenseEntry);
    },

    async add(owner, input) {
      if (!Number.isInteger(input.mood) || input.mood < 1 || input.mood > 5) {
        throw new Error(`invalid mood: ${input.mood}`);
      }
      const { tryoutId, milestoneId } = await columnsFor(driver, owner);

      const uuid = mintUuid();
      await driver.run(
        'INSERT INTO felt_sense (uuid, tryout_id, milestone_id, epoch_day, mood, note, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuid, tryoutId, milestoneId, input.epochDay, input.mood, input.note ?? null, now()]
      );
      return uuid;
    },

    async remove(id) {
      await driver.run('DELETE FROM felt_sense WHERE uuid = ?', [id]);
    }
  };
}
