/* The cycle event area (phase 5 ticket 03, CONTEXT: "Cycle event"). A cycle
   event is not an Entry: no mood, dimension values, tags or note, and no
   regimen-episode reference - it has to work whether or not a regimen
   episode exists, the same reasoning sideEffects.ts gives.

   Flat, so its three writes come from flatArea.ts and only the two reads
   are its own. */

import type { SqliteDriver } from '../sqlite/driver';
import type { CycleEvent } from '../types';
import { flatArea, type FlatInput } from './flatArea';

export type CycleEventInput = FlatInput<CycleEvent>;

export interface CycleEventsArea {
  getCycleEvents(): Promise<CycleEvent[]>;
  getCycleEventsInRange(fromEpochDay: number, toEpochDay: number): Promise<CycleEvent[]>;
  /** The day of the most recent cycle event at or before `todayEpochDay`, or
      null if there is none (phase 8 features ticket 03, lastWrite.ts). */
  lastWriteEpochDay(todayEpochDay: number): Promise<number | null>;
  /** Returns the cycle event's id. Updating an unknown id throws. */
  upsertCycleEvent(input: CycleEventInput): Promise<string>;
  /** Idempotent. */
  deleteCycleEvent(id: string): Promise<void>;
}

export function makeCycleEventsArea(driver: SqliteDriver): CycleEventsArea {
  const events = flatArea<CycleEvent>(driver, {
    table: 'cycle_event',
    columns: { kind: 'kind', epochDay: 'epoch_day' }
  });

  return {
    getCycleEvents: () => events.read('ORDER BY epoch_day, id'),

    getCycleEventsInRange: (fromEpochDay, toEpochDay) =>
      events.read('WHERE epoch_day BETWEEN ? AND ? ORDER BY epoch_day, id', [fromEpochDay, toEpochDay]),

    async lastWriteEpochDay(todayEpochDay) {
      const [latest] = await events.read('WHERE epoch_day <= ? ORDER BY epoch_day DESC LIMIT 1', [todayEpochDay]);
      return latest?.epochDay ?? null;
    },

    upsertCycleEvent: events.upsert,
    deleteCycleEvent: events.delete
  };
}
