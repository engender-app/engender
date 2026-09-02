/* What the stats screen's three chart kinds are drawn from (phase 5 UX
   ticket 23).

   The seam answers one point per day per metric (journal/stats.ts). Two of
   the charts on the hub ask a different question of the same answer - where
   each scale sat over the period, and how many days landed on each mood -
   and both are arithmetic over data the screen already has rather than a
   read of its own. Kept here, away from the markup, because the awkward part
   of both is a unit problem and a unit problem is worth a test.

   The shape a calendar cell takes (phase 6 unprompted ticket 11) is here
   for the same reason, though the calendar is not the stats screen: which
   step each of a day's readings landed on is the same unit problem the bars
   have, and the rule between split, stack and neither is the half of that
   cell a test can hold.

   Nothing here names anything and nothing here formats anything: a metric's
   own wording comes from the vocabulary and a value is written by the
   screen in the metric's native units (ADR-0012). */

import type { DayAverage, DaySpread } from './journal/stats';
import { MOOD_RANGE, heatLevel, normalize, type MetricRange } from './metricRange';

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

/** How many cards a stack ever draws, however many entries the day holds.
    Past this the deck stops being countable and starts being a texture, and
    the exact number is read out on the cell rather than counted off it. */
export const MAX_STACK_CARDS = 4;

/** What a day's cell is drawn as, once the day's own entries are known
    (phase 6 unprompted ticket 11, CONTEXT: Spread).

    `split` carries two heat steps rather than two values: a step is what a
    fill is, and two entries inside one step have no edge to draw between
    them. Low first, and that is the whole of the order - which entry came
    first, and which one the day "really" was, are questions this
    deliberately cannot answer. */
export type DayShape =
  | { kind: 'one' }
  | { kind: 'split'; low: number; high: number }
  | { kind: 'stack'; cards: number };

/** How a day that carried the metric is drawn, or null for a day that
    carried none of it.

    Three shapes, and the rule between them is the one a person can state:
    a day of two readings that landed on different steps is **split** down
    the middle, one half per reading; a day whose readings all landed on the
    same step has no edge to draw, so it **stacks** instead; and a day of
    three or more readings always stacks, because four bands at 46px is a
    texture rather than four readings.

    A stack says how many, not how much. That is the honest claim: the deck
    is countable and the day's two ends are read out in words beside it. */
export function dayShape(spread: DaySpread | undefined, range: MetricRange): DayShape | null {
  if (!spread) return null;
  if (spread.count <= 1) return { kind: 'one' };
  const low = heatLevel(spread.low, range);
  const high = heatLevel(spread.high, range);
  if (spread.count === 2 && low !== high) return { kind: 'split', low, high };
  return { kind: 'stack', cards: Math.min(spread.count, MAX_STACK_CARDS) };
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
