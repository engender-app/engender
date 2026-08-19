/* The cycle event area (phase 5 ticket 03, CONTEXT: "Cycle event"). A cycle
   event is not an Entry: no mood, dimension values, tags or note, and no
   regimen-episode reference - it has to work whether or not a regimen
   episode exists, the same reasoning sideEffects.ts gives. */

import type { SqliteDriver } from '../sqlite/driver';
import type { CycleEvent, CycleEventKind } from '../types';
import { assertChanged, mintUuid, now } from './support';

export interface CycleEventInput {
  id?: string;
  kind: CycleEventKind;
  epochDay: number;
}

export interface CycleEventsArea {
  getCycleEvents(): Promise<CycleEvent[]>;
  getCycleEventsInRange(fromEpochDay: number, toEpochDay: number): Promise<CycleEvent[]>;
  /** Returns the cycle event's id. Updating an unknown id throws. */
  upsertCycleEvent(input: CycleEventInput): Promise<string>;
  /** Idempotent. */
  deleteCycleEvent(id: string): Promise<void>;
}

type CycleEventRow = { uuid: string; kind: CycleEventKind; epoch_day: number };

const toCycleEvent = (row: CycleEventRow): CycleEvent => ({
  id: row.uuid,
  kind: row.kind,
  epochDay: row.epoch_day
});

export function makeCycleEventsArea(driver: SqliteDriver): CycleEventsArea {
  return {
    async getCycleEvents() {
      const rows = await driver.query<CycleEventRow>(
        'SELECT uuid, kind, epoch_day FROM cycle_event ORDER BY epoch_day, id'
      );
      return rows.map(toCycleEvent);
    },

    async getCycleEventsInRange(fromEpochDay, toEpochDay) {
      const rows = await driver.query<CycleEventRow>(
        'SELECT uuid, kind, epoch_day FROM cycle_event WHERE epoch_day BETWEEN ? AND ? ORDER BY epoch_day, id',
        [fromEpochDay, toEpochDay]
      );
      return rows.map(toCycleEvent);
    },

    async upsertCycleEvent(input) {
      if (input.id) {
        const result = await driver.run('UPDATE cycle_event SET kind = ?, epoch_day = ?, updated_at = ? WHERE uuid = ?', [
          input.kind,
          input.epochDay,
          now(),
          input.id
        ]);
        assertChanged(result, `cycle event: ${input.id}`);
        return input.id;
      }
      const uuid = mintUuid();
      await driver.run('INSERT INTO cycle_event (uuid, kind, epoch_day, updated_at) VALUES (?, ?, ?, ?)', [
        uuid,
        input.kind,
        input.epochDay,
        now()
      ]);
      return uuid;
    },

    async deleteCycleEvent(id) {
      await driver.run('DELETE FROM cycle_event WHERE uuid = ?', [id]);
    }
  };
}
