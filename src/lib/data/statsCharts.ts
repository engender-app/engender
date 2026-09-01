/* What the stats screen's three chart kinds are drawn from (phase 5 UX
   ticket 23).

   The seam answers one point per day per metric (journal/stats.ts). Two of
   the charts on the hub ask a different question of the same answer - where
   each scale sat over the period, and how many days landed on each mood -
   and both are arithmetic over data the screen already has rather than a
   read of its own. Kept here, away from the markup, because the awkward part
   of both is a unit problem and a unit problem is worth a test.

   The calendar's spread mark (phase 6 unprompted ticket 11) is here for the
   same reason, though the calendar is not the stats screen: where a day's
   two ends land inside a metric's own range is the same unit problem the
   bars have, and it is the half of that mark a test can hold.

   Nothing here names anything and nothing here formats anything: a metric's
   own wording comes from the vocabulary and a value is written by the
   screen in the metric's native units (ADR-0012). */

import type { DayAverage, DaySpread } from './journal/stats';
import { MOOD_RANGE, normalize, type MetricRange } from './metricRange';

/** The average of a day series, or null where nothing was logged. */
export function seriesAverage(points: DayAverage[]): number | null {
  if (!points.length) return null;
  return points.reduce((sum, point) => sum + point.value, 0) / points.length;
}

export interface MetricStanding {
  key: string;
  /** The period's average, in the metric's own units, or null where the
      metric carried nothing. */
  value: number | null;
  /** Where that average sits inside the metric's own range, 0 to 1.

      This is the only thing a bar's length can honestly be drawn from.
      Mood runs 1 to 5 and a gender dimension commonly runs 0 to 100, so a
      bar drawn from the raw number puts every mood at the far left of the
      card and says nothing except which scale has the bigger numbers.
      normalize() is the same function the heat ramp reads (metricRange.ts),
      and the rule there holds here: it drives the drawing and is never
      shown as a number. */
  share: number;
  /** How many days went into the average, for the line above the bar. */
  days: number;
}

/** Where each scale sat over the period, one row per metric.

    Every metric asked about gets a row, including one that carried nothing:
    a scale that has been switched on and not used is a fact about the
    period, and dropping its row would leave the reader to notice an absence
    rather than read a blank. */
export function metricStandings(
  metrics: { key: string; range: MetricRange }[],
  series: (key: string) => DayAverage[]
): MetricStanding[] {
  return metrics.map((metric) => {
    const points = series(metric.key);
    const value = seriesAverage(points);
    return {
      key: metric.key,
      value,
      share: value === null ? 0 : normalize(value, metric.range),
      days: points.length
    };
  });
}

export interface MoodDay {
  /** 1 to 5 on the mood ramp (ADR-0025). */
  step: number;
  count: number;
}

/** How many days of the period landed on each mood step.

    Days rather than entries, which is what the seam hands back: a day's
    mood is its entries averaged (CONTEXT: Day average), and a day with a
    1 and a 5 on it belongs at 3 rather than in two places at once.

    Every step is present even at zero, because the distribution is read
    against the picker's own five and a missing column would shift the
    remaining ones under the wrong faces.

    A day average is a fraction, so it is rounded to the step it is nearest
    and clamped into the scale - a metric key that is not mood cannot reach
    this, but a stored value from an import can sit outside 1 to 5 and it
    belongs at the end of the ramp rather than off it. */
export function moodDistribution(days: DayAverage[]): MoodDay[] {
  const counts = new Map<number, number>();
  for (let step = MOOD_RANGE.min; step <= MOOD_RANGE.max; step++) counts.set(step, 0);
  for (const day of days) {
    const step = Math.min(MOOD_RANGE.max, Math.max(MOOD_RANGE.min, Math.round(day.value)));
    counts.set(step, (counts.get(step) ?? 0) + 1);
  }
  return [...counts].map(([step, count]) => ({ step, count }));
}

/** Whether a day ran between two different values at all (CONTEXT: Spread).

    The one rule behind "a day with one entry shows no spread" and "a day
    whose entries all said the same thing shows no spread", so that the mark
    on the calendar and the words on /stats cannot end up disagreeing about
    which days covered ground. */
export function coveredGround(spread: Pick<DaySpread, 'low' | 'high'> | undefined): spread is DaySpread {
  return spread !== undefined && spread.high > spread.low;
}

/** The narrowest mark the calendar draws, as a fraction of the metric's
    range. A dimension running 0 to 100 can hold two entries two points
    apart, which is well under a pixel of a 46px cell: the day did cover
    ground and a mark thinner than the eye can see would say it did not. */
export const MIN_SPREAD_MARK = 0.12;

export interface SpreadMark {
  /** Where the mark begins inside the metric's own range, 0 to 1. */
  start: number;
  /** How much of the range it covers, 0 to 1. */
  width: number;
}

/** Where a day's spread sits on the track under its calendar cell, or null
    for a day with no mark to draw (CONTEXT: Spread).

    Normalized, for metricStandings' own reason and ADR-0012's: a mood of 2
    to 5 and a dimension of 20 to 85 have to be marks a person can compare
    across a month without being told which scale is showing. The numbers
    themselves stay native and are read out rather than drawn.

    A day with one entry, and a day whose entries all landed on the same
    value, get no mark at all. Both are days that covered no ground, and the
    honest mark for that is none - not a mark of no width, which at this
    size is a smudge that reads as a very narrow range.

    Descriptive only: a mark says the day ran between these two points, never
    which end it started at. */
export function spreadMark(spread: Pick<DaySpread, 'low' | 'high'> | undefined, range: MetricRange): SpreadMark | null {
  if (!coveredGround(spread)) return null;
  const low = normalize(spread.low, range);
  const high = normalize(spread.high, range);
  const width = Math.min(1, Math.max(high - low, MIN_SPREAD_MARK));
  // Widened around its own middle and then pushed back inside the track, so
  // a floor applied at either end of the scale does not hang off it.
  const start = Math.min(1 - width, Math.max(0, (low + high) / 2 - width / 2));
  return { start, width };
}
