/* The exposure counters area (phase 4 ticket 05, CONTEXT: "Regimen
   episode", "Dose event"). A view stitched together from rows `doses` and
   `regimen` own, the same way stock.ts is a view over `doses`, `regimen`
   and `reminders` - this area owns no table of its own, and reads no
   driver directly.

   Nothing here is stored: every counter is recomputed from the dose log
   and the regimen episode history for whatever range is asked for
   (exposureCounters.ts, ADR-0010). */

import type { DoseTotal, RegimenDays, RouteDays } from '../exposureCounters';
import { cumulativeDoseTotals, daysOnEachRoute, timeOnEachRegimen } from '../exposureCounters';
import type { DosesArea } from './doses';
import type { RegimenArea } from './regimen';

export interface ExposureCounters {
  doseTotals: DoseTotal[];
  routeDays: RouteDays[];
  regimenDays: RegimenDays[];
}

export interface ExposureArea {
  /** Every counter over `[fromEpochDay, toEpochDay]` - a read-only
      aggregate over the dose log and the regimen episode history
      (ADR-0012): nothing here is stored. */
  getCounters(fromEpochDay: number, toEpochDay: number): Promise<ExposureCounters>;
}

export function makeExposureArea(doses: DosesArea, regimen: RegimenArea): ExposureArea {
  return {
    async getCounters(fromEpochDay, toEpochDay) {
      const [doseEvents, episodes] = await Promise.all([doses.getDoses(fromEpochDay, toEpochDay), regimen.getEpisodes()]);

      return {
        doseTotals: cumulativeDoseTotals(doseEvents, episodes, fromEpochDay, toEpochDay),
        routeDays: daysOnEachRoute(episodes, fromEpochDay, toEpochDay),
        regimenDays: timeOnEachRegimen(episodes, fromEpochDay, toEpochDay)
      };
    }
  };
}
