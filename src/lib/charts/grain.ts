/* How coarse a chart draws, and why (phase 5 UX ticket 23, second review
   round).

   The area chart used to be a timeline you scrolled: every reading kept a
   14px slot, so a year was 365 slots and you read it a week at a time by
   dragging. On a phone that turned out to be the wrong trade. A chart in a
   card is something you glance at, and a chart you have to drag has no
   shape at all until you have dragged all of it - Alicja, 2026-08-25: "the
   graph shouldn't be scrollable".

   So the whole range fits the card, and what changes with the range is the
   grain: a month is read day by day, a year is read week by week, several
   years month by month. The choice is made from the number of positions the
   card can hold rather than from the length of the range, so it is one rule
   rather than a table of ranges.

   This is calendar arithmetic, so it lives beside the other calendar
   arithmetic and takes today's clock from nobody: a day arrives as an epoch
   day and a bucket comes back as one. */

import { localDateFromEpochDay, epochDayFromLocalDate, weekdayOfEpochDay } from '../data/epochDay';

export type Grain = 'day' | 'week' | 'month';

/** The most positions a chart draws across the width of a card.

    A card is about 340px wide inside its padding on the narrowest screen
    the app supports, and a mark wants 5 to 6px of its own before
    neighbouring marks read as one smear. Sixty is that, and it is also
    comfortably more than a month, which is the range the day grain has to
    survive. */
export const MAX_POSITIONS = 60;

/** Roughly how many days a bucket of each grain covers. Used only to
    predict how many positions a grain would produce, never to place one. */
const DAYS_PER_BUCKET: Record<Grain, number> = { day: 1, week: 7, month: 30.44 };

/** The coarsest grain that is not needed, given how long the range is.

    Read off the span rather than off how many days carried a value: a month
    with four entries in it is still a month, and drawing those four as four
    positions across a card would space them as though they were
    consecutive. */
export function chooseGrain(spanInDays: number, maxPositions: number = MAX_POSITIONS): Grain {
  for (const grain of ['day', 'week'] as const) {
    if (spanInDays / DAYS_PER_BUCKET[grain] <= maxPositions) return grain;
  }
  return 'month';
}

/** The epoch day a bucket starts on, for the grain given.

    A week starts on Monday, which is what `previousCalendarWeekRange`
    already assumes and what the calendar screen draws. A month starts on
    the 1st. A day is itself. */
export function bucketStart(epochDay: number, grain: Grain): number {
  if (grain === 'day') return epochDay;
  if (grain === 'week') return epochDay - weekdayOfEpochDay(epochDay);
  const date = localDateFromEpochDay(epochDay);
  return epochDayFromLocalDate(new Date(date.getFullYear(), date.getMonth(), 1));
}

export interface GrainPoint {
  /** The epoch day the bucket starts on. */
  x: number;
  /** The bucket's days averaged. */
  y: number;
  /** How many days went into it, so a reading can say "averaged over 7". */
  days: number;
}

/** `points` averaged into calendar buckets of one grain, oldest first.

    Averaged over the days that carried a value rather than over the days in
    the bucket, which is the same rule the year wrapped's month strip
    follows: a week with two entries in it is those two entries' average,
    not a week dragged two sevenths of the way toward zero.

    Empty buckets are absent rather than zero. "Said nothing" is not "said
    none", which is the rule the whole stats area is built on - and it is
    what keeps a gap in the journal from drawing as a crash in the line. */
export function bucketByGrain(points: { x: number; y: number }[], grain: Grain): GrainPoint[] {
  const buckets = new Map<number, { total: number; days: number }>();
  for (const point of points) {
    const start = bucketStart(point.x, grain);
    const bucket = buckets.get(start) ?? { total: 0, days: 0 };
    bucket.total += point.y;
    bucket.days += 1;
    buckets.set(start, bucket);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([x, bucket]) => ({ x, y: bucket.total / bucket.days, days: bucket.days }));
}

/** The grain a range wants, and the range read at it, in one call - so no
    caller can choose one and bucket at the other. */
export function atGrain(
  points: { x: number; y: number }[],
  spanInDays: number,
  maxPositions: number = MAX_POSITIONS
): { grain: Grain; points: GrainPoint[] } {
  const grain = chooseGrain(spanInDays, maxPositions);
  return { grain, points: bucketByGrain(points, grain) };
}
