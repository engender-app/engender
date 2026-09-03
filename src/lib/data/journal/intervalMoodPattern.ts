/* The interval mood pattern area (phase 5 ticket 09). A view stitched from
   rows `stats` and `doses` own, the same way correlationCards.ts is - this
   area owns no table of its own. The bucketing math lives in
   ../dayKeying.ts and the two ways of getting a repeating rule out of a
   journal in ../intervalMoodPattern.ts, both tested without a driver; this
   file only wires them to the rest of the journal. */

import { rekeyDaySeries } from '../dayKeying';
import { completedInjectionIntervals, foldByCustomInterval, type PatternPoint } from '../intervalMoodPattern';
import type { DosesArea } from './doses';
import type { StatsArea } from './stats';

export interface IntervalMoodPatternArea {
  /** Day-average mood bucketed by day of interval, averaged across every
      completed injection interval in `[fromEpochDay, toEpochDay]` - nothing
      here is stored, every point is recomputed from the dose log and
      entries each time (ADR-0010). */
  dayOfInterval(fromEpochDay: number, toEpochDay: number): Promise<PatternPoint[]>;
  /** The same bucket-and-average shape over `[fromEpochDay, toEpochDay]`,
      folded by `intervalLengthDays` against the epoch day itself instead of
      by the regimen's own interval - no claim that a cycle exists. */
  byCustomInterval(fromEpochDay: number, toEpochDay: number, intervalLengthDays: number): Promise<PatternPoint[]>;
}

export function makeIntervalMoodPatternArea(stats: StatsArea, doses: DosesArea): IntervalMoodPatternArea {
  return {
    async dayOfInterval(fromEpochDay, toEpochDay) {
      const [dayAverages, doseEvents] = await Promise.all([
        stats.dayAverages('mood', fromEpochDay, toEpochDay),
        doses.getDoses(fromEpochDay, toEpochDay)
      ]);
      return rekeyDaySeries(dayAverages, {
        type: 'repeating',
        intervals: completedInjectionIntervals(doseEvents)
      });
    },

    async byCustomInterval(fromEpochDay, toEpochDay, intervalLengthDays) {
      const dayAverages = await stats.dayAverages('mood', fromEpochDay, toEpochDay);
      return foldByCustomInterval(dayAverages, intervalLengthDays);
    }
  };
}
