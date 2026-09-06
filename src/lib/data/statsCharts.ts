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

interface MoodDay {
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
    const step = moodStep(day.value);
    counts.set(step, (counts.get(step) ?? 0) + 1);
  }
  return [...counts].map(([step, count]) => ({ step, count }));
}

/** How many cards a stack ever draws, however many entries the day holds.
    Past this the deck stops being countable and starts being a texture, and
    the exact number is read out on the cell rather than counted off it. */
/* MAX_STACK_CARDS stays exported only for its own test (AU-09 test-only
   review). */
export const MAX_STACK_CARDS = 4;

/** What a day's cell is drawn as, once the day's own entries are known
    (phase 6 unprompted ticket 11, CONTEXT: Spread).

    `split` carries two steps rather than two values: a step is what a fill
    is, and two entries inside one step have no edge to draw between them.

    `first` and `last` are the day's own order, earliest half on the left
    (Alicja, 2026-09-02: chronological). That is a claim the app used not to
    make - CONTEXT.md's entry for Spread said a day never says which reading
    came first - and it is now hers to make, so the entry says so. Nothing
    else changed with it: the words beside the cell are still the day's
    lowest and highest, which have no order at all. */
export type DayShape =
  | { kind: 'one' }
  | { kind: 'split'; first: number; last: number }
  | { kind: 'stack'; cards: number };

/** How a day that carried the metric is drawn, or null for a day that
    carried none of it.

    Three shapes, and the rule between them is the one a person can state:
    a day of two readings that landed on different steps is **split** down
    the middle, one half per reading, earliest on the left; a day whose readings all landed on the
    same step has no edge to draw, so it **stacks** instead; and a day of
    three or more readings always stacks, because four bands at 36px is a
    texture rather than four readings.

    `stepOf` is what a step means on the metric being drawn, and the caller
    owns it because the two answers are different systems: a gender
    dimension resolves through the heat ramp's four levels, and mood
    resolves to one of its own five faces (ADR-0025). Daylio's rule is
    "two of the same mood", and this is that rule wherever the app has a
    notion of the same.

    A stack says how many, not how much. That is the honest claim: the deck
    is countable and the day's two ends are read out in words beside it. */
export function dayShape(
  spread: DaySpread | undefined,
  stepOf: (value: number) => number
): DayShape | null {
  if (!spread) return null;
  if (spread.count <= 1) return { kind: 'one' };
  /* Whether to split is a question about size and which side is a question
     about time, so the two ends are read twice from two pairs. At two
     readings they are the same pair either way round, which is why the
     condition below can be written on the chronological one. */
  const first = stepOf(spread.first);
  const last = stepOf(spread.last);
  if (spread.count === 2 && first !== last) return { kind: 'split', first, last };
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
