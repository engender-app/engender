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

/** A felt-sense entry read without knowing whose it is (phase 5 deepening
    ticket 21), which is the one caller the type's own note does not cover:
    the day view asks a day what it holds and is handed entries from both
    arms at once, so the owner has to travel with the row for it to say
    "how the name felt" rather than a mood with nothing attached.

    The owner's name, not just its id: a row that reads "Robin" is what the
    screen shows, and resolving it here is one join where the screen would
    otherwise read every tryout and every milestone to look one up. */
export interface FeltSenseOnDay extends FeltSenseEntry {
  owner: { kind: 'tryout'; id: string; name: string } | { kind: 'milestone'; id: string; name: string };
}

export interface FeltSenseArea {
  /** Newest first, the same order the tryout screen already read in before
      this module existed. */
  forTryout(tryoutId: string): Promise<FeltSenseEntry[]>;
  /** Newest first, like forTryout. */
  forMilestone(milestoneId: string): Promise<FeltSenseEntry[]>;
  /** Both owners' entries dated to one day, tryouts before milestones and
      oldest-logged first inside each. */
  onDay(epochDay: number): Promise<FeltSenseOnDay[]>;
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

    /* One query over both arms rather than one per arm: the table's CHECK
       already guarantees exactly one owner column is set, so the two LEFT
       JOINs cannot both land and the arm follows from which name came
       back. */
    async onDay(epochDay) {
      const rows = await driver.query<
        FeltSenseRow & { tryout_uuid: string | null; tryout_label: string | null; milestone_uuid: string | null; milestone_name: string | null }
      >(
        `SELECT f.uuid, f.epoch_day, f.mood, f.note,
                t.uuid AS tryout_uuid, t.label AS tryout_label,
                ms.uuid AS milestone_uuid, ms.name AS milestone_name
           FROM felt_sense f
           LEFT JOIN tryout t ON t.id = f.tryout_id
           LEFT JOIN milestone ms ON ms.id = f.milestone_id
          WHERE f.epoch_day = ?
          ORDER BY f.tryout_id IS NULL, f.id`,
        [epochDay]
      );
      return rows.map((row) => ({
        ...toFeltSenseEntry(row),
        owner:
          row.tryout_uuid != null
            ? ({ kind: 'tryout', id: row.tryout_uuid, name: row.tryout_label ?? '' } as const)
            : ({ kind: 'milestone', id: row.milestone_uuid ?? '', name: row.milestone_name ?? '' } as const)
      }));
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
