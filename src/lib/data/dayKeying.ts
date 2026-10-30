/* Re-keying a day series against an event (phase 8 features ticket 16,
   CONTEXT: "Day of interval", "Day since").

   A day series is a run of one value per calendar day - a day-average mood,
   a body region's daily intensity, a day's wear hours - and every one of
   them arrives in stats.ts's `DayAverage` shape. Re-keying takes such a
   series and plots it against something other than the calendar: which day
   of a repeating interval each day fell on, or how many days each day sits
   from one dated event.

   Two rules, and they have different origins on purpose:

   - **Repeating** counts from 1, because the day the event happened is "day
     1 of the interval" and CONTEXT.md has said so since phase 5.
   - **Anchored** counts from 0, because the event is a single dated moment
     and the app already speaks that way about the only one it has: the
     surgery day is "Surgery day" and the day after is "Post-Op Day 1". A
     1-based anchored axis would contradict a badge on the same screen.

   Descriptive throughout, the rule the whole chart family holds to: a
   position says where days fell and stops. Nothing here draws an expected
   trajectory, a modelled curve or a shaded window on a re-keyed axis - the
   same refusal other modelled readings make, and for the same
   reason, that a re-keyed axis makes a shape look predicted when it was
   only rearranged. */

import type { DayAverage } from './journal/stats';
import type { DoseEvent } from './types';
import { epochDayFromTimestamp } from './epochDay';

export interface PatternPoint {
  /** Where the day landed on the re-keyed axis. Under the repeating rule
      this is 1-based and always positive; under the anchored rule it is 0
      on the anchoring day and negative before it. */
  position: number;
  /** The bucket's day-average value, entry-weighted across the days folded
      into it, in native units (ADR-0012). */
  value: number;
  /** How many distinct calendar days fed this bucket - not how many
      entries, which the evidence floor below is deliberately not measured
      in: a position several intervals never reached should read as thin
      evidence even if the few days it did reach each logged several
      entries. Always 1 under the anchored rule, where a position *is* one
      calendar day. */
  count: number;
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

export interface CompletedInterval {
  startEpochDay: number;
  /** Days from this interval's start up to, but not including, the next
      one's - so the day the next injection happened belongs to the next
      interval's position 1, never to this one's last position. */
  length: number;
}

/** How a day series is re-keyed.

    `repeating` folds many calendar days onto each position, so several
    intervals corroborate a bucket and the evidence floor below applies.
    `anchored` maps each day to exactly one position against a single dated
    event, so no position is an average across days and there is nothing for
    a floor to guard. */
export type Keying =
  | { type: 'repeating'; intervals: readonly CompletedInterval[] }
  | {
      type: 'anchored';
      anchorEpochDay: number;
      /** Passed rather than read, the convention every pure module in this
          phase follows. It carries on the rule rather than beside it
          because only this rule consults a clock: side effects, wear and
          procedures all write their day through a date picker with no
          upper bound, and a future-dated row re-keyed against an anchor
          would draw a mark past the end of the axis. The repeating rule
          takes no such field - what it excludes is decided by the
          intervals it was handed, and capping those by the clock would
          change what the repeating-axis chart answers. */
      todayEpochDay: number;
    };

/** A repeating position needs days from at least this many distinct
    intervals or interval repeats before it says anything - the same
    evidentiary bar tagInsights and correlationCards hold every occurrence
    to. */
const MIN_POSITION_DAYS = 3;

interface Bucket {
  total: number;
  entries: number;
  days: number;
}

/** Folds `point` into `totals` at `position`, entry-weighted the same way
    doseDayInsight (correlationCards.ts) folds a multi-entry day back into a
    total, since a day series has already folded a multi-entry day into one
    point. */
function accumulate(totals: Map<number, Bucket>, position: number, point: DayAverage): void {
  const bucket = totals.get(position) ?? { total: 0, entries: 0, days: 0 };
  bucket.total += point.value * point.count;
  bucket.entries += point.count;
  bucket.days += 1;
  totals.set(position, bucket);
}

/** `totals`, as the positions that cleared `minDays`, lowest position
    first. */
function finishedPoints(totals: Map<number, Bucket>, minDays: number): PatternPoint[] {
  return [...totals.entries()]
    .filter(([, b]) => b.days >= minDays)
    .map(([position, b]) => ({ position, value: b.total / b.entries, count: b.days }))
    .sort((a, b) => a.position - b.position);
}

/** `series` re-keyed by `keying`. */
export function rekeyDaySeries(series: readonly DayAverage[], keying: Keying): PatternPoint[] {
  const totals = new Map<number, Bucket>();

  if (keying.type === 'anchored') {
    for (const point of series) {
      if (point.day > keying.todayEpochDay) continue;
      accumulate(totals, point.day - keying.anchorEpochDay, point);
    }
    // Every position here is one calendar day, so the floor is "the day
    // exists" and nothing more.
    return finishedPoints(totals, 1);
  }

  const byDay = new Map(series.map((p) => [p.day, p]));
  for (const interval of keying.intervals) {
    for (let offset = 0; offset < interval.length; offset++) {
      const point = byDay.get(interval.startEpochDay + offset);
      if (point) accumulate(totals, offset + 1, point);
    }
  }
  return finishedPoints(totals, MIN_POSITION_DAYS);
}
