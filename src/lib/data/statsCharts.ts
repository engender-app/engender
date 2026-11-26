/* Project daily stats points into scale distributions, mood counts
   and calendar cell shapes. The screen owns reads, labels and
   formatting in each metric's native units (ADR-0012). */

import type { DayAverage, DaySpread } from './journal/stats';
import { MOOD_RANGE, moodStep, normalize, type MetricRange } from './metricRange';

/** The average of a day series, or null where nothing was logged. */
/* seriesAverage stays exported only for its own test (AU-09 test-only review). */
export function seriesAverage(points: DayAverage[]): number | null {
  if (!points.length) return null;
  return points.reduce((sum, point) => sum + point.value, 0) / points.length;
}

interface MetricStanding {
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
  /** 1 to 5 on the mood ramp. */
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
    const step = moodStep(day.value);
    counts.set(step, (counts.get(step) ?? 0) + 1);
  }
  return [...counts].map(([step, count]) => ({ step, count }));
}

/** A day cell takes the earliest step on the left and the latest on the
    right. Two entries in the same step share a fill. The accessible words
    describe the low and high values, independent of their order. */
export type DayShape = { kind: 'one' } | { kind: 'split'; first: number; last: number };

/** Return null for a day without readings. Split a day only when the
    first and last readings occupy different steps, with first on the
    left. A dip that returns to the same step stays whole and is visible
    on the Day screen. HeatMap draws a pip from the count.

    The caller supplies `stepOf`. Gender dimensions use four heat levels
    and mood uses five faces. */
export function dayShape(
  spread: DaySpread | undefined,
  stepOf: (value: number) => number
): DayShape | null {
  if (!spread) return null;
  if (spread.count <= 1) return { kind: 'one' };
  const first = stepOf(spread.first);
  const last = stepOf(spread.last);
  return first !== last ? { kind: 'split', first, last } : { kind: 'one' };
}

/** Whether a day ran between two different values at all (CONTEXT: Spread).

    The one rule behind "a day with one entry says nothing extra" and "a day
    whose entries all said the same thing says nothing extra", so that the
    cell on the calendar and the words on /stats cannot end up disagreeing
    about which days covered ground. Values rather than steps, unlike
    `dayShape` above: a difference too small to draw an edge for is still a
    difference worth reading out. */
export function coveredGround(
  spread: Pick<DaySpread, 'low' | 'high'> | undefined
): spread is Pick<DaySpread, 'low' | 'high'> {
  return spread !== undefined && spread.high > spread.low;
}
