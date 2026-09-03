/* Interval mood pattern (phase 5 ticket 09, CONTEXT: "Day of interval",
   "Day average"). Two ways of getting a repeating keying out of a journal -
   the injectable regimen's own completed intervals, or an arbitrary fold
   length someone names - kept apart from ../correlationCards.ts on purpose:
   that engine pairs an occurrence against a value, and neither shape here
   is a pair. This is closer to how labTiming.ts derives day of interval
   from the dose log than to a correlation card.

   The bucketing itself is not here any more. Phase 8 ticket 16 generalised
   it into dayKeying.ts, which re-keys any day series under a repeating or
   an anchored rule; both functions below hand it a repeating rule and this
   file's remaining job is turning a journal into one. The custom fold in
   particular turned out to be the repeating rule with its intervals tiled
   off the epoch, so it is a caller too rather than a second copy of the
   same arithmetic.

   The second shape is deliberately never called a "period": CONTEXT.md's
   Cycle event already gives that word a menstrual meaning for people on
   testosterone, and reusing it here for an arbitrary fold length would sit
   the two features on the same word for unrelated ideas - worse in Polish,
   where the ordinary translation of "period" has no other reading.

   Purely descriptive throughout, the same rule labTiming.ts and its
   comparability flag hold to: a bucket says where days fell and stops. The
   custom-interval fold in particular asserts nothing about a cycle existing
   - it folds by whatever length it is given, the way Chuanromanee &
   Metoyer's CHI 2023 study describes a period tracker being repurposed for
   exactly this, without the app claiming to have found a cycle on anyone's
   behalf. */

import { rekeyDaySeries, type CompletedInterval, type PatternPoint } from './dayKeying';
import type { DayAverage } from './journal/stats';
import type { DoseEvent } from './types';
import { epochDayFromTimestamp } from './epochDay';

export type { CompletedInterval, PatternPoint };

/** The injectable regimen's own completed intervals, one per gap between
    consecutive IM/SC doses - a skipped dose never happened, the same rule
    doseDaysFromEvents (correlationCards.ts) applies. The span from the
    latest injection to today is left out: it has no length yet, so bucketing
    its days would mean picking an arbitrary cutoff rather than reporting one.

    Derived from the dose log alone, the same reasoning labTimingFor
    (labTiming.ts) gives for day of interval generally: a regimen episode's
    `interval` is free text and cannot be computed from, and a dose schedule
    is optional and would go silently missing for anyone who has not set
    one. */
export function completedInjectionIntervals(doseEvents: readonly DoseEvent[]): CompletedInterval[] {
  const injectionDays = [
    ...new Set(
      doseEvents
        .filter((d) => d.status !== 'skipped' && (d.route === 'im' || d.route === 'sc'))
        .map((d) => epochDayFromTimestamp(d.timestamp))
    )
  ].sort((a, b) => a - b);

  const intervals: CompletedInterval[] = [];
  for (let i = 0; i < injectionDays.length - 1; i++) {
    intervals.push({ startEpochDay: injectionDays[i], length: injectionDays[i + 1] - injectionDays[i] });
  }
  return intervals;
}

/** Intervals of `intervalLengthDays` tiled off the epoch, one per tile any
    day in `series` falls in. Anchored to the epoch rather than to whatever
    range a caller happens to be asking about, for two reasons: an epoch day
    is never negative (ADR-0001), so this needs no caller-supplied reference
    point to stay exact, and a fixed anchor means position 1 keeps meaning
    the same calendar days no matter which range someone later widens or
    narrows. */
function epochTiledIntervals(series: readonly DayAverage[], intervalLengthDays: number): CompletedInterval[] {
  const starts = new Set(series.map((p) => Math.floor(p.day / intervalLengthDays) * intervalLengthDays));
  return [...starts].sort((a, b) => a - b).map((startEpochDay) => ({ startEpochDay, length: intervalLengthDays }));
}

/** The same bucket-and-average shape as a day-of-interval fold, taken
    against the epoch day itself instead of against the regimen's own
    interval - position 1 is every day that is a multiple of
    `intervalLengthDays` since 1970-01-01 (epochDay.ts), and every
    `intervalLengthDays`'th day after it, whatever that day turns out to
    mean. Asserts nothing about a cycle existing either way. */
export function foldByCustomInterval(
  dayAverages: readonly DayAverage[],
  intervalLengthDays: number
): PatternPoint[] {
  return rekeyDaySeries(dayAverages, {
    type: 'repeating',
    intervals: epochTiledIntervals(dayAverages, intervalLengthDays)
  });
}
