/* The journaling pause area (phase 5 ticket 21, CONTEXT: "Streak" -
   amended). A journaling pause is not an Entry and carries no episode
   reference - it has to work on its own, the same reasoning cycleEvents.ts
   and sideEffects.ts give. Rows only: whether a day falls inside a pause is
   `journalingPause.ts`'s pauseCoversDay, read from here by `journal/stats.ts`
   (Streak's amended computation) and by the check-in/Home suppression
   checks - this module knows nothing about either. */

import type { SqliteDriver } from '../sqlite/driver';
import type { JournalingPause } from '../types';
import { assertChanged, mintUuid, now } from './support';

export type JournalingPauseInput = Omit<JournalingPause, 'id'> & { id?: string };

export interface JournalingPausesArea {
  /** Every pause, oldest start first. */
  getPauses(): Promise<JournalingPause[]>;
  /** Returns the pause's id. Updating an unknown id throws. */
  upsertPause(input: JournalingPauseInput): Promise<string>;
  /** Idempotent. */
  deletePause(id: string): Promise<void>;
}

type JournalingPauseRow = { uuid: string; start_epoch_day: number; end_epoch_day: number | null };

const toJournalingPause = (row: JournalingPauseRow): JournalingPause => ({
  id: row.uuid,
  startEpochDay: row.start_epoch_day,
  endEpochDay: row.end_epoch_day
});

export function makeJournalingPausesArea(driver: SqliteDriver): JournalingPausesArea {
  return {
    async getPauses() {
      const rows = await driver.query<JournalingPauseRow>(
        'SELECT uuid, start_epoch_day, end_epoch_day FROM journaling_pause ORDER BY start_epoch_day, id'
      );
      return rows.map(toJournalingPause);
    },

    async upsertPause(input) {
      if (input.id) {
        const result = await driver.run(
          'UPDATE journaling_pause SET start_epoch_day = ?, end_epoch_day = ?, updated_at = ? WHERE uuid = ?',
          [input.startEpochDay, input.endEpochDay, now(), input.id]
        );
        assertChanged(result, `journaling pause: ${input.id}`);
        return input.id;
      }

      const uuid = mintUuid();
      await driver.run(
        'INSERT INTO journaling_pause (uuid, start_epoch_day, end_epoch_day, updated_at) VALUES (?, ?, ?, ?)',
        [uuid, input.startEpochDay, input.endEpochDay, now()]
      );
      return uuid;
    },

    async deletePause(id) {
      await driver.run('DELETE FROM journaling_pause WHERE uuid = ?', [id]);
    }
  };
}
