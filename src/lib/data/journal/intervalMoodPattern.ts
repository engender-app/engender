/* The interval mood pattern area (phase 5 ticket 09). A view stitched from
   rows `stats` and `doses` own, the same way correlationCards.ts is - this
   area owns no table of its own. The bucketing math lives in
   ../dayKeying.ts and the two ways of getting a repeating rule out of a
   journal in ../intervalMoodPattern.ts, both tested without a driver; this
   file only wires them to the rest of the journal.

   Phase 8 audit ticket 16: both folds take "ever" literally. /stats passes
   Number.MIN_SAFE_INTEGER as fromEpochDay because a completed injection
   interval commonly runs 14-28 days and rarely recurs three times inside
   even the screen's own 90-day range, so the fold needs more history than
   any range picker there offers. Read as a decade of days, though, that
   costs 102.3KB per card on the ten-year fixture - twice, since both cards
   ask - and dayOfInterval's own dose read every dose ever logged besides.
   `boundedFrom` below caps how far back "ever" actually reaches, rather
   than moving the fold into a `GROUP BY` expression in SQL: the arithmetic
   stays where it is, in dayKeying.ts, which already has its own tests and
   is shared with the anchored keying, and folding in SQL would split that
   arithmetic across two call sites for a saving this bound gets more
   simply. INTERVAL_FOLD_LOOKBACK_DAYS is two years, which holds dozens of
   completions at the common 14-28 day cadence and several at even a
   quarterly depot regimen - comfortably past MIN_POSITION_DAYS, the
   evidence floor either fold is held to. A caller asking for a narrower
   range than that keeps it; only "ever" gets capped.

   This does mean a journal older than the lookback window reads a
   different average than it did before this ticket, not only at the
   floor's edge: a position that already cleared MIN_POSITION_DAYS loses
   whatever days fell outside the window, so its value can move even
   though it was never empty either way. Accepted rather than hidden -
   the ticket's own Notes call bounding the read "the cheaper option" over
   moving the fold into SQL, and a bound is exactly a claim about how much
   history still corroborates today's position. Two years is chosen so
   that claim holds for any regimen this app actually models; it is not a
   claim that no real journal's answer ever moves. */

import { rekeyDaySeries } from '../dayKeying';
import { FIRST_EPOCH_DAY } from '../epochDay';
import { completedInjectionIntervals, foldByCustomInterval, type PatternPoint } from '../intervalMoodPattern';
import type { DosesArea } from './doses';
import type { StatsArea } from './stats';

/** How far back either fold looks when asked for "ever". See the module
    header for why this is a bound rather than a SQL fold. */
const INTERVAL_FOLD_LOOKBACK_DAYS = 730;

/** `fromEpochDay`, or `toEpochDay` minus the lookback window if that is
    later - never wider than what the caller actually asked for. */
function boundedFrom(fromEpochDay: number, toEpochDay: number): number {
  return Math.max(fromEpochDay, toEpochDay - INTERVAL_FOLD_LOOKBACK_DAYS + 1);
}

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
      const from = boundedFrom(fromEpochDay, toEpochDay);
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
        stats.dayAverages('mood', from, toEpochDay),
        doses.getDoses(Math.max(FIRST_EPOCH_DAY, from), toEpochDay)
      ]);
      return rekeyDaySeries(dayAverages, {
        type: 'repeating',
        intervals: completedInjectionIntervals(doseEvents)
      });
    },

    async byCustomInterval(fromEpochDay, toEpochDay, intervalLengthDays) {
      const dayAverages = await stats.dayAverages('mood', boundedFrom(fromEpochDay, toEpochDay), toEpochDay);
      return foldByCustomInterval(dayAverages, intervalLengthDays);
    }
  };
}
