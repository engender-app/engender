/* How coarse a chart draws, and why.

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

import type { PatternPoint } from '../data/dayKeying';
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

interface GrainPoint {
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

/** One position on a chart carrying two metrics, and what each of them
    actually read there. `null` where a metric has no bucket at that
    position - either because it was not being logged yet, or because the
    other metric is what put this position on the plot.

    Only real readings, never a value derived to fill a hole. The line drawn
    between two buckets still crosses the positions in between, and
    bridgeGaps in charts/geometry is what puts it there; a number a person
    is shown has to be one they logged. */
interface AlignedPoint {
  x: number;
  a: number | null;
  b: number | null;
}

/** Two bucketed series read onto one set of positions, oldest first.

    Two metrics have their own days and their own gaps, so bucketing them
    separately leaves two arrays that agree about nothing. A chart places by
    position rather than by date, so drawing those two as they come would
    space one series' four buckets across the same width as the other's
    forty and put a Tuesday above a March - which is precisely the reading a
    person putting two metrics on one plot is trying to make.

    So the positions are the union of both, and each series keeps its own
    readings against them. A position the other metric introduced is `null`
    here rather than filled in: the line still crosses it, but it crosses it
    as geometry (charts/geometry's bridgeGaps), and the readout under a
    finger has nothing to say there. "Said nothing" is not "said none", and
    that rule does not stop applying because a second metric was logged that
    day. */
export function alignSeries(a: GrainPoint[], b: GrainPoint[]): AlignedPoint[] {
  const first = new Map(a.map((p) => [p.x, p.y]));
  const second = new Map(b.map((p) => [p.x, p.y]));
  return [...new Set([...first.keys(), ...second.keys()])]
    .sort((p, q) => p - q)
    .map((x) => ({ x, a: first.get(x) ?? null, b: second.get(x) ?? null }));
}

/** How coarse a **re-keyed** axis draws.

    `chooseGrain` and `bucketByGrain` above answer this for a calendar axis
    and cannot answer it here: a seven-day calendar bucket spans seven
    different positions on a re-keyed axis, so folding by week would mix
    day 3 of one interval with day 3 of the next but also with days 4
    through 9. A re-keyed axis has to fold by position instead.

    It needs folding for the same reason the calendar axis does. A repeating
    axis is usually safe on its own - an injection interval is 14 to 28
    positions - but an anchored axis over several years around a surgery is
    upwards of a thousand, and `MAX_POSITIONS` is what a card can draw
    without the marks reading as one smear. */

/** The first position of the bucket `position` falls in, at `width`.

    Laid off zero rather than off the lowest position in the series, which
    matters on an anchored axis and nowhere else: zero is the day the
    surgery happened, and a bucket that straddled it would average a day
    before the operation together with a day after it and draw the result
    as one mark. Laying the buckets off zero makes that impossible by
    construction rather than by a caller remembering to check. */
export const positionBucket = (position: number, width: number) => Math.floor(position / width) * width;

/** The narrowest `width` at which `points` draw as at most `maxPositions`
    buckets.

    Read off the span rather than off how many positions carried a value,
    the same rule `chooseGrain` follows: a gap in the middle of a recovery
    is a gap, and closing it up would space the days either side of it as
    though they were consecutive.

    Starts from the width the span alone implies and widens from there,
    because laying the buckets off zero can cost one bucket more than the
    span predicts - a series running 2 to 7 spans 6 positions but crosses
    three zero-laid buckets of 3. Two iterations at the most in practice,
    and it keeps `MAX_POSITIONS` an exact ceiling rather than an
    approximate one. */
function choosePositionWidth(points: readonly PatternPoint[], maxPositions: number): number {
  const positions = points.map((p) => p.position);
  const lowest = Math.min(...positions);
  const highest = Math.max(...positions);
  let width = Math.max(1, Math.ceil((highest - lowest + 1) / maxPositions));
  while (positionBucket(highest, width) / width - positionBucket(lowest, width) / width + 1 > maxPositions) {
    width += 1;
  }
  return width;
}

/** `points` folded into buckets of exactly `width`, lowest position first.

    Weighted by the calendar days behind each position rather than averaging
    the positions evenly, because on a repeating axis one position can carry
    five days and its neighbour three. `count` is those days summed, so the
    reading stays "how many days said this" all the way through the fold.

    Empty buckets are absent rather than zero, the same rule
    `bucketByGrain` holds: "said nothing" is not "said none". */
function bucketByPositionWidth(points: readonly PatternPoint[], width: number): PatternPoint[] {
  const buckets = new Map<number, { total: number; days: number }>();
  for (const point of points) {
    const start = positionBucket(point.position, width);
    const bucket = buckets.get(start) ?? { total: 0, days: 0 };
    bucket.total += point.value * point.count;
    bucket.days += point.count;
    buckets.set(start, bucket);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([position, bucket]) => ({ position, value: bucket.total / bucket.days, count: bucket.days }));
}

/** Several re-keyed series folded onto **one** width, and the width they
    were folded at.

    One width across the group rather than the narrowest each series could
    take on its own. Two series folded independently would land on different
    widths whenever their spans differ, and then two lines on one plot -
    wear hours against region intensity - would space their marks
    differently while looking like one axis, and two cards read as a pair -
    a region's dysphoria beside its euphoria - would carry x axes that
    disagree without saying so. */
export function foldPositionGroup(
  group: readonly (readonly PatternPoint[])[],
  maxPositions: number = MAX_POSITIONS
): { width: number; group: PatternPoint[][] } {
  const everyPoint = group.flat();
  if (everyPoint.length === 0) return { width: 1, group: group.map((series) => [...series]) };

  const width = choosePositionWidth(everyPoint, maxPositions);
  if (width === 1) return { width, group: group.map((series) => [...series]) };

  return { width, group: group.map((series) => bucketByPositionWidth(series, width)) };
}
