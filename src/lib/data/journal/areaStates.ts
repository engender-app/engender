/* Reading and writing which areas are hidden, which are finished, and which
   are suspended (phase 8 deepening ticket 13, phase 8 features ticket 51,
   ADR-0052). The rule these rows are read by is `areaState.ts`, above the
   journal seam and driver-free, the way `cycleTracking.ts` sits above
   `cycleEvents.ts`. This half is only storage.

   It holds one invariant of its own: the table is sparse. A row exists
   because something was said about that area, so a state that has gone back
   to saying nothing takes its row with it.

   Two plural setters for hidden and finished rather than two singular ones,
   because a hub row can front more than one section - hair progress is
   `hairStages` and `hairPhotos` together - and a row half-finished by two
   separate calls is a state no screen has a way to show. One call, one
   transaction, so it cannot happen. Which sections a row fronts is
   presentation and lives with the hub. `setAreasSuspended` keeps the same
   shape, narrowed to `SuspendableArea` (areaState.ts): only voice practice
   and hair removal have a real case for it (ticket 51).

   Finished and suspended are mutually exclusive (areaState.ts): setting one
   to a day clears the other. Un-setting either with null leaves the other
   alone - un-finishing a stream does not un-suspend it and vice versa,
   because only one of them could have been set to begin with.

   No delete method and no unknown-id case (ADR-0053): every area key is a
   section name this build already has, so there is no id here to name a row
   that is not there. `setAreasFinished(areas, null)` is how a person
   un-finishes a stream that restarted, and it has to stay exactly as easy as
   finishing one; `setAreasSuspended(areas, null)` is the same gesture for
   resuming a paused one. */

import type { SqliteDriver } from '../sqlite/driver';
import type { AreaStates, FinishableArea, HideableArea, SuspendableArea } from '../areaState';
import type { ArchiveSectionName } from './archiveSections';
import { now } from './support';

export interface AreaStatesArea {
  /** Every area that has said anything, sparse: an area with no entry is not
      hidden, not finished and not suspended, and no row was written to say
      that. */
  getAreaStates(): Promise<AreaStates>;
  /** Hides or unhides every area named, together. Hiding takes an area out
      of the navigation only - the records, the direct URL and search are
      untouched (ADR-0043's own kind of hiding). */
  setAreasHidden(areas: readonly HideableArea[], hidden: boolean): Promise<void>;
  /** Records the day every area named finished, or clears it with null.
      Finishing does not hide: a stream you are done with is still readable,
      which is the whole point of recording that you are done with it.
      Finishing an area that was suspended clears the suspended day - a
      stream is active, suspended or finished, never two at once. */
  setAreasFinished(areas: readonly FinishableArea[], finishedEpochDay: number | null): Promise<void>;
  /** Records the day every area named was paused, or clears it with null to
      resume. Suspending an area that was finished clears the finished day,
      for the same reason the other direction does (phase 8 features ticket
      51). */
  setAreasSuspended(areas: readonly SuspendableArea[], suspendedEpochDay: number | null): Promise<void>;
}

type StateRow = {
  area: string;
  hidden: number;
  finished_epoch_day: number | null;
  suspended_epoch_day: number | null;
};

type Column = 'hidden' | 'finished_epoch_day' | 'suspended_epoch_day';

export function makeAreaStatesArea(driver: SqliteDriver): AreaStatesArea {
  /** Writes one column for every area named, optionally clearing a second
      one on the same row, and then drops whatever rows have stopped saying
      anything, in one transaction. The upsert names its columns explicitly
      so a flag it is not touching survives a write it was not part of.

      `clearing` is only reached when `value` is not null: un-finishing or
      un-suspending clears nothing else, because setting a day is the only
      gesture that has to displace the other one. */
  async function set(areas: readonly ArchiveSectionName[], column: Column, value: number | null, clearing?: Column) {
    if (areas.length === 0) return;
    const alsoClear = value !== null ? clearing : undefined;

    await driver.transaction(async () => {
      const ts = now();
      for (const area of areas) {
        if (alsoClear) {
          await driver.run(
            `INSERT INTO area_state (area, ${column}, ${alsoClear}, updated_at) VALUES (?, ?, NULL, ?)
               ON CONFLICT(area) DO UPDATE SET ${column} = excluded.${column}, ${alsoClear} = NULL, updated_at = excluded.updated_at`,
            [area, value, ts]
          );
        } else {
          await driver.run(
            `INSERT INTO area_state (area, ${column}, updated_at) VALUES (?, ?, ?)
               ON CONFLICT(area) DO UPDATE SET ${column} = excluded.${column}, updated_at = excluded.updated_at`,
            [area, value, ts]
          );
        }
      }
      const placeholders = areas.map(() => '?').join(', ');
      await driver.run(
        `DELETE FROM area_state
           WHERE area IN (${placeholders})
             AND hidden = 0 AND finished_epoch_day IS NULL AND suspended_epoch_day IS NULL`,
        [...areas]
      );
    });
  }

  return {
    async getAreaStates() {
      const rows = await driver.query<StateRow>(
        'SELECT area, hidden, finished_epoch_day, suspended_epoch_day FROM area_state ORDER BY area'
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
          finishedEpochDay: row.finished_epoch_day,
          suspendedEpochDay: row.suspended_epoch_day
        };
      }
      return states;
    },

    setAreasHidden(areas, hidden) {
      return set(areas, 'hidden', hidden ? 1 : 0);
    },

    setAreasFinished(areas, finishedEpochDay) {
      return set(areas, 'finished_epoch_day', finishedEpochDay, 'suspended_epoch_day');
    },

    setAreasSuspended(areas, suspendedEpochDay) {
      return set(areas, 'suspended_epoch_day', suspendedEpochDay, 'finished_epoch_day');
    }
  };
}
