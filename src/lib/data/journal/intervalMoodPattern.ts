/* The interval mood pattern area (phase 5 ticket 09). A view stitched from
   rows `stats` and `doses` own, the same way correlationCards.ts is - this
   area owns no table of its own. The bucketing math lives in
   ../dayKeying.ts and the two ways of getting a repeating rule out of a
   journal in ../intervalMoodPattern.ts, both tested without a driver; this
   file only wires them to the rest of the journal. */

import { rekeyDaySeries } from '../dayKeying';
import { FIRST_EPOCH_DAY } from '../epochDay';
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
      /* The dose read is clamped to a real epoch day, and this is not
         defensive tidying: `/stats` asks for all history as
         `Number.MIN_SAFE_INTEGER`, which is right for `dayAverages`
         (an epoch_day comparison) and silently empty for `getDoses`, which
         turns the bound into a timestamp and gets NaN (epochDay.ts's
         FIRST_EPOCH_DAY). With no doses there are no intervals and no
         positions, so the card has been drawing its not-enough-data copy
         whatever anybody logged. The clamp belongs here rather than in
         `getDoses`, which would then quietly accept a bound that is not a
         day, and rather than at the call site, which would leave the next
         caller to find the same NaN. */
      const [dayAverages, doseEvents] = await Promise.all([
        stats.dayAverages('mood', fromEpochDay, toEpochDay),
        doses.getDoses(Math.max(FIRST_EPOCH_DAY, fromEpochDay), toEpochDay)
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
