/* The era area (phase 6 ticket 01, ADR-0049, CONTEXT: "Era"). Rows only:
   whether a day falls in an era, and what an open bound resolves to, are
   `eras.ts`'s pure functions, read from here by the editor while someone is
   still typing and by this area before it writes - the same split
   journalingPauses.ts and journalingPause.ts already have.

   No `key` column and no built-ins: an era is the person's own name for
   their own stretch of time, so nothing ships seeded and a minted uuid is
   its only travelling identity (ADR-0002).

   Deleting is a plain delete rather than a hide. Nothing holds a foreign key
   to an era: the resurfacing consent layer keys its own rows by this uuid
   and reads a rule pointing at a deleted era as no rule (ADR-0049), which is
   the same resting state a day in no era already has. */

import type { SqliteDriver } from '../sqlite/driver';
import type { Era } from '../types';
import { assertEraFits, type JournalBounds } from '../eras';
import { assertChanged, mintUuid, now } from './support';

type EraInput = Omit<Era, 'id'> & { id?: string };

export interface ErasArea {
  /** Every era in timeline order, the one with no start first. */
  getEras(): Promise<Era[]>;
  /** Returns the era's id. Throws, naming what it collided with, when the
      era would be a second open start, a second open end or an overlap
      (`eras.ts`'s assertEraFits). Updating an unknown id throws. */
  upsertEra(input: EraInput): Promise<string>;
  /** Deleting an unknown id succeeds and changes nothing (ADR-0053). Stated
      here and asserted in this area's own tests rather than inherited from
      `flatArea.ts`, because `upsertEra`'s guard is a whole-table invariant
      rather than a validator and keeps this area hand-written. */
  deleteEra(id: string): Promise<void>;
  /** The first and last day the journal holds an entry for, which is what an
      open bound clamps to at read time (`eras.ts`'s eraRange). Null on a
      journal with no entries, where there is no edge to clamp to and so no
      concrete range to resolve an open era into.

      Entries rather than every dated table: an era is offered to the
      surfaces that read entries - compare, wrapped, the calendar, the charts
      - and a dose logged a year before the first entry would stretch every
      open bound past anything those surfaces can draw. */
  getJournalBounds(): Promise<JournalBounds | null>;
}

type EraRow = { uuid: string; name: string; start_epoch_day: number | null; end_epoch_day: number | null };

const toEra = (row: EraRow): Era => ({
  id: row.uuid,
  name: row.name,
  startEpochDay: row.start_epoch_day,
  endEpochDay: row.end_epoch_day
});

export function makeErasArea(driver: SqliteDriver): ErasArea {
  async function getEras(): Promise<Era[]> {
    const rows = await driver.query<EraRow>(
      `SELECT uuid, name, start_epoch_day, end_epoch_day FROM era
       ORDER BY start_epoch_day IS NULL DESC, start_epoch_day, id`
    );
    return rows.map(toEra);
  }

  return {
    getEras,

    async upsertEra(input) {
      assertEraFits(await getEras(), input);

      if (input.id) {
        const result = await driver.run(
          'UPDATE era SET name = ?, start_epoch_day = ?, end_epoch_day = ?, updated_at = ? WHERE uuid = ?',
          [input.name, input.startEpochDay, input.endEpochDay, now(), input.id]
        );
        assertChanged(result, `era: ${input.id}`);
        return input.id;
      }

      const uuid = mintUuid();
      await driver.run(
        'INSERT INTO era (uuid, name, start_epoch_day, end_epoch_day, updated_at) VALUES (?, ?, ?, ?, ?)',
        [uuid, input.name, input.startEpochDay, input.endEpochDay, now()]
      );
      return uuid;
    },

    async deleteEra(id) {
      await driver.run('DELETE FROM era WHERE uuid = ?', [id]);
    },

    async getJournalBounds() {
      const [row] = await driver.query<{ first_day: number | null; last_day: number | null }>(
        'SELECT MIN(epoch_day) AS first_day, MAX(epoch_day) AS last_day FROM entry WHERE trashed_at IS NULL'
      );
      if (!row || row.first_day === null || row.last_day === null) return null;
      return { firstEpochDay: row.first_day, lastEpochDay: row.last_day };
    }
  };
}
