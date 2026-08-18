/* The side-effect area (phase 4 ticket 06). A side effect is not an Entry
   (CONTEXT: "Side effect"): no mood, dimension values, tags or note, and no
   regimen-episode reference - it has to work whether or not a regimen
   episode exists.

   getSideEffectsInRange is ticket 12's read path: it pulls a range with no
   query logic of ticket 12's own, the same way stats.ts's fromEpochDay/
   toEpochDay reads do. */

import type { SqliteDriver } from '../sqlite/driver';
import type { SideEffect } from '../types';
import { assertChanged, mintUuid, now } from './support';

export const MIN_SEVERITY = 1;
export const MAX_SEVERITY = 5;

export interface SideEffectInput {
  id?: string;
  name: string;
  severity: number;
  epochDay: number;
}

export interface SideEffectsArea {
  getSideEffects(): Promise<SideEffect[]>;
  getSideEffectsInRange(fromEpochDay: number, toEpochDay: number): Promise<SideEffect[]>;
  /** Returns the side effect's id. Updating an unknown id throws; an
      out-of-range severity throws before anything is written. */
  upsertSideEffect(input: SideEffectInput): Promise<string>;
  /** Idempotent. */
  deleteSideEffect(id: string): Promise<void>;
}

type SideEffectRow = { uuid: string; name: string; severity: number; epoch_day: number };

const toSideEffect = (row: SideEffectRow): SideEffect => ({
  id: row.uuid,
  name: row.name,
  severity: row.severity,
  epochDay: row.epoch_day
});

/** The schema's CHECK is the backstop (like reminder's recurrence); this is
    what turns a bad value into a message naming the ticket's own scale
    instead of a raw SQLite constraint failure. */
function assertValidSeverity(severity: number): void {
  if (!Number.isInteger(severity) || severity < MIN_SEVERITY || severity > MAX_SEVERITY) {
    throw new Error(`invalid severity: ${severity}`);
  }
}

export function makeSideEffectsArea(driver: SqliteDriver): SideEffectsArea {
  const rowsInRange = (fromEpochDay: number, toEpochDay: number) =>
    driver.query<SideEffectRow>(
      'SELECT uuid, name, severity, epoch_day FROM side_effect WHERE epoch_day BETWEEN ? AND ? ORDER BY epoch_day, id',
      [fromEpochDay, toEpochDay]
    );

  return {
    async getSideEffects() {
      const rows = await driver.query<SideEffectRow>(
        'SELECT uuid, name, severity, epoch_day FROM side_effect ORDER BY epoch_day, id'
      );
      return rows.map(toSideEffect);
    },

    async getSideEffectsInRange(fromEpochDay, toEpochDay) {
      return (await rowsInRange(fromEpochDay, toEpochDay)).map(toSideEffect);
    },

    async upsertSideEffect(input) {
      assertValidSeverity(input.severity);
      if (input.id) {
        const result = await driver.run(
          'UPDATE side_effect SET name = ?, severity = ?, epoch_day = ?, updated_at = ? WHERE uuid = ?',
          [input.name, input.severity, input.epochDay, now(), input.id]
        );
        assertChanged(result, `side effect: ${input.id}`);
        return input.id;
      }
      const uuid = mintUuid();
      await driver.run('INSERT INTO side_effect (uuid, name, severity, epoch_day, updated_at) VALUES (?, ?, ?, ?, ?)', [
        uuid,
        input.name,
        input.severity,
        input.epochDay,
        now()
      ]);
      return uuid;
    },

    async deleteSideEffect(id) {
      await driver.run('DELETE FROM side_effect WHERE uuid = ?', [id]);
    }
  };
}
