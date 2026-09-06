/* The journaling pause area (phase 5 ticket 21, CONTEXT: "Journaling
   pause"). A journaling pause is not an Entry and carries no episode
   reference - it has to work on its own, the same reasoning cycleEvents.ts
   and sideEffects.ts give. Rows only: whether a day falls inside a pause is
   `journalingPause.ts`'s pauseCoversDay, read from here by the check-in
   suppression and by Home's pause tile - this module knows nothing about
   either.

   Flat, so its three writes come from flatArea.ts and only the one read is
   its own. */

import type { SqliteDriver } from '../sqlite/driver';
import type { JournalingPause } from '../types';
import { flatArea, type FlatInput } from './flatArea';

type JournalingPauseInput = FlatInput<JournalingPause>;

export interface JournalingPausesArea {
  /** Every pause, oldest start first. */
  getPauses(): Promise<JournalingPause[]>;
  /** Returns the pause's id. Updating an unknown id throws. */
  upsertPause(input: JournalingPauseInput): Promise<string>;
  /** Idempotent. */
  deletePause(id: string): Promise<void>;
}

export function makeJournalingPausesArea(driver: SqliteDriver): JournalingPausesArea {
  const pauses = flatArea<JournalingPause>(driver, {
    table: 'journaling_pause',
    columns: { startEpochDay: 'start_epoch_day', endEpochDay: 'end_epoch_day' }
  });

  return {
    getPauses: () => pauses.read('ORDER BY start_epoch_day, id'),
    upsertPause: pauses.upsert,
    deletePause: pauses.delete
  };
}
