/* Interval mood pattern (phase 5 ticket 09, CONTEXT: "Day of interval", "Day
   average"). Two bucket-and-average shapes over a cyclical position -
   day-average mood folded by position within an injectable regimen's own
   interval, or by an arbitrary interval length someone names - kept apart
   from ../correlationCards.ts on purpose: that engine pairs an occurrence
   against a value, and neither shape here is a pair. This is closer to how
   labTiming.ts derives day of interval from the dose log than to a
   correlation card.

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

import type { DayAverage } from './journal/stats';
import type { DoseEvent } from './types';
import { epochDayFromTimestamp } from './epochDay';

export interface PatternPoint {
  /** 1-based position within the interval. An injection's own day is
      position 1, the same rule labTiming.ts's day of interval uses. */
  position: number;
  /** The bucket's day-average mood, entry-weighted across the days folded
      into it, in native units (ADR-0012). */
  value: number;
  /** How many distinct calendar days fed this bucket - not how many entries,
      which the evidence floor below is deliberately not measured in: a
      position several intervals never reached should read as thin evidence
      even if the few days it did reach each logged several entries. */
  count: number;
}

/** A position needs days from at least this many distinct intervals or
    interval repeats before it says anything - the same evidentiary bar
    tagInsights and correlationCards hold every occurrence to. */
const MIN_POSITION_DAYS = 3;

export interface CompletedInterval {
  startEpochDay: number;
  /** Days from this interval's start up to, but not including, the next
      one's - so the day the next injection happened belongs to the next
      interval's position 1, never to this one's last position. */
  length: number;
}

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

interface Bucket {
  total: number;
  entries: number;
  days: number;
}

/** Folds `point` into `totals` at `position`, entry-weighted the same way
    doseDayInsight (correlationCards.ts) folds a multi-entry day back into a
    total, since `dayAverages` already folded a multi-entry day into one
    point. */
function accumulate(totals: Map<number, Bucket>, position: number, point: DayAverage): void {
  const bucket = totals.get(position) ?? { total: 0, entries: 0, days: 0 };
  bucket.total += point.value * point.count;
  bucket.entries += point.count;
  bucket.days += 1;
  totals.set(position, bucket);
}

/** `totals`, as the positions that cleared `MIN_POSITION_DAYS`, oldest
    position first. */
function finishedPoints(totals: Map<number, Bucket>): PatternPoint[] {
  return [...totals.entries()]
    .filter(([, b]) => b.days >= MIN_POSITION_DAYS)
    .map(([position, b]) => ({ position, value: b.total / b.entries, count: b.days }))
    .sort((a, b) => a.position - b.position);
}

/** Day-average mood bucketed by day of interval, averaged across every
    completed interval that reached that position. */
export function dayOfIntervalPattern(
  dayAverages: readonly DayAverage[],
  intervals: readonly CompletedInterval[]
): PatternPoint[] {
  const byDay = new Map(dayAverages.map((p) => [p.day, p]));
  const totals = new Map<number, Bucket>();

  for (const interval of intervals) {
    for (let offset = 0; offset < interval.length; offset++) {
      const point = byDay.get(interval.startEpochDay + offset);
      if (point) accumulate(totals, offset + 1, point);
    }
  }

  return finishedPoints(totals);
}

/** The same bucket-and-average shape as `dayOfIntervalPattern`, folded by
    `intervalLengthDays` against the epoch day itself instead of against the
    regimen's own interval - position 1 is every day that is a multiple of
    `intervalLengthDays` since 1970-01-01 (epochDay.ts), and every
    `intervalLengthDays`'th day after it, whatever that day turns out to
    mean. Anchored to the epoch rather than to whatever range a caller
    happens to be asking about, for two reasons: an epoch day is never
    negative (ADR-0001), so this needs no caller-supplied reference point to
    stay exact, and a fixed anchor means position 1 keeps meaning the same
    calendar days no matter which range someone later widens or narrows.
    Asserts nothing about a cycle existing either way. */
export function foldByCustomInterval(dayAverages: readonly DayAverage[], intervalLengthDays: number): PatternPoint[] {
  const totals = new Map<number, Bucket>();

  for (const point of dayAverages) {
    accumulate(totals, (point.day % intervalLengthDays) + 1, point);
  }

  return finishedPoints(totals);
}
