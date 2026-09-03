/* Reading and writing which areas are hidden and which are finished (phase 8
   deepening ticket 13, ADR-0052). The rule these rows are read by is
   `areaState.ts`, above the journal seam and driver-free, the way
   `cycleTracking.ts` sits above `cycleEvents.ts`. This half is only storage.

   It holds one invariant of its own: the table is sparse. A row exists
   because something was said about that area, so a state that has gone back
   to saying nothing takes its row with it.

   Two plural setters rather than two singular ones, because a hub row can
   front more than one section - hair progress is `hairStages` and
   `hairPhotos` together - and a row half-finished by two separate calls is a
   state no screen has a way to show. One call, one transaction, so it cannot
   happen. Which sections a row fronts is presentation and lives with the hub.

   No delete method and no unknown-id case (ADR-0053): every area key is a
   section name this build already has, so there is no id here to name a row
   that is not there. `setAreasFinished(areas, null)` is how a person
   un-finishes a stream that restarted, and it has to stay exactly as easy as
   finishing one. */

import type { SqliteDriver } from '../sqlite/driver';
import type { AreaStates, FinishableArea, HideableArea } from '../areaState';
import type { ArchiveSectionName } from './archiveSections';
import { now } from './support';

export interface AreaStatesArea {
  /** Every area that has said anything, sparse: an area with no entry is not
      hidden and not finished, and no row was written to say that. */
  getAreaStates(): Promise<AreaStates>;
  /** Hides or unhides every area named, together. Hiding takes an area out
      of the navigation only - the records, the direct URL and search are
      untouched (ADR-0043's own kind of hiding). */
  setAreasHidden(areas: readonly HideableArea[], hidden: boolean): Promise<void>;
  /** Records the day every area named finished, or clears it with null.
      Finishing does not hide: a stream you are done with is still readable,
      which is the whole point of recording that you are done with it. */
  setAreasFinished(areas: readonly FinishableArea[], finishedEpochDay: number | null): Promise<void>;
}

type StateRow = { area: string; hidden: number; finished_epoch_day: number | null };

export function makeAreaStatesArea(driver: SqliteDriver): AreaStatesArea {
  /** Writes one column for every area named and then drops whatever rows
      have stopped saying anything, in one transaction. The upsert names one
      column so the other flag survives a write it was not part of - the two
      are independent, and an INSERT carrying both would make every hide
      clear a finish day. */
  async function set(
    areas: readonly ArchiveSectionName[],
    column: 'hidden' | 'finished_epoch_day',
    value: number | null
  ) {
    if (areas.length === 0) return;

    await driver.transaction(async () => {
      const ts = now();
      for (const area of areas) {
        await driver.run(
          `INSERT INTO area_state (area, ${column}, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(area) DO UPDATE SET ${column} = excluded.${column}, updated_at = excluded.updated_at`,
          [area, value, ts]
        );
      }
      const placeholders = areas.map(() => '?').join(', ');
      await driver.run(
        `DELETE FROM area_state
           WHERE area IN (${placeholders}) AND hidden = 0 AND finished_epoch_day IS NULL`,
        [...areas]
      );
    });
  }

  return {
    async getAreaStates() {
      const rows = await driver.query<StateRow>(
        'SELECT area, hidden, finished_epoch_day FROM area_state ORDER BY area'
      );
      const states: AreaStates = {};
      for (const row of rows) {
        /* Cycle tracking is not answerable here, and a row saying otherwise
           is dropped rather than trusted: no writer in this build can make
           one, but an `area_state` row travels, so a foreign archive is a
           way in. ADR-0043's rule is one-directional and an archive must not
           be what reverses it. `cycleTrackingVisible` stays cycle's gate.

           Any other key this build has never heard of can only come from an
           archive written by a newer one. It travelled here and it travels
           on; nothing above reads an area it cannot name. */
        if (row.area === 'cycleEvents') continue;
        states[row.area as HideableArea] = {
          hidden: row.hidden === 1,
          finishedEpochDay: row.finished_epoch_day
        };
      }
      return states;
    },

    setAreasHidden(areas, hidden) {
      return set(areas, 'hidden', hidden ? 1 : 0);
    },

    setAreasFinished(areas, finishedEpochDay) {
      return set(areas, 'finished_epoch_day', finishedEpochDay);
    }
  };
}
