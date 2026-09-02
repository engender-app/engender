/* The one place a native value turns into colour (ADR-0012).

   Two value concepts live in this app and they must never be confused.
   Every number a person sees stays in native units - mood 1 to 5, a gender
   dimension within its own range - and the journal only ever returns
   those. A normalized 0-to-1 value exists so that mood and a 0-10 custom
   dimension shade comparably on the calendar heat-map and the week strip,
   and it is never displayed.

   Import-free on purpose: the journal picks the recap's biggest dimension
   change by normalized magnitude (comparing a 0-100 dimension against a
   0-10 one any other way is meaningless) while reporting the change
   natively, and the journal may not import anything above its seam. */

export interface MetricRange {
  min: number;
  max: number;
}

/** Mood is the one metric that is not a gender dimension, so its range
    does not come from a row. */
export const MOOD_RANGE: MetricRange = { min: 1, max: 5 };

/** How many swatches the heat-map and week strip have, not counting the
    empty one. `--heat-1` through `--heat-4` in the palette. */
export const HEAT_LEVELS = 4;

/** Where a value sits in its own range, 0 to 1, clamped. Colour input
    only - showing this number to someone is the bug ADR-0012 exists to
    prevent. */
export function normalize(value: number, range: MetricRange): number {
  const width = range.max - range.min;
  if (width <= 0) return 0; // a range with no width has one colour, the floor
  return Math.min(1, Math.max(0, (value - range.min) / width));
}

/** Which of the five mood steps a value rounds to (ADR-0025).

    A day's mood is its entries averaged, so it is a fraction, and every
    surface that draws mood as one of its five faces or five hexes has to
    land it on a step. Clamped as well as rounded: a stored value from an
    import can sit outside 1 to 5, and it belongs at the end of the ramp
    rather than off it. */
export function moodStep(value: number): number {
  return Math.min(MOOD_RANGE.max, Math.max(MOOD_RANGE.min, Math.round(value)));
}

/** Which swatch a day gets: 0 for a day with no value, otherwise 1 to
    HEAT_LEVELS. A logged low and an empty day are different things, so the
    floor of the range still lands on level 1. */
export function heatLevel(value: number | null, range: MetricRange): number {
  if (value == null) return 0;
  return Math.min(HEAT_LEVELS, Math.max(1, Math.ceil(normalize(value, range) * HEAT_LEVELS)));
}

/** The narrowest span of recency the ramp will shade across, in days.

    Someone who injects daily, or who started this week, can have every
    site within a day or two of every other; without a floor the ramp would
    turn "yesterday and the day before" into its widest difference. */
export const RECENCY_FLOOR_DAYS = 7;

/** The range a set of "days since last used" readings shades across: zero
    to the longest of them, or the floor above where they are closer
    together than that. Sites never used are skipped - they have no place on
    the ramp (see below).

    A span rather than fixed day bands because an injection cadence is
    weekly for some people and fortnightly for others: six sites on a weekly
    rotation are 0 to 42 days apart and the same six on a fortnightly one 0
    to 84, so any fixed set of edges leaves one of those two rotations
    almost entirely in one swatch. This is the same reason a mood value and
    a 0-100 dimension get a range each rather than one scale (ADR-0012), and
    it keeps the comparison to the person's own history rather than to a
    cadence the app decided was normal. */
export function recencySpan(readings: Iterable<number | null>): MetricRange {
  let longest = 0;
  for (const days of readings) if (days !== null && days > longest) longest = days;
  return { min: 0, max: Math.max(longest, RECENCY_FLOOR_DAYS) };
}

/** Which swatch a "days since last used" reading gets within that span. The
    most recent use is the strongest fill and it fades from there, so the
    ramp describes where the recent ones went rather than pointing at where
    the next one should go.

    `null` - a site with no dose ever recorded against it - is level 0, the
    empty swatch, because neither a large number nor zero reads as "never".

    A reading below zero, which a dose dated later today can produce, shades
    as the most recent rather than falling off the end. */
export function recencyHeatLevel(daysAgo: number | null, span: MetricRange): number {
  if (daysAgo === null) return 0;
  return heatLevel(span.max - Math.max(0, daysAgo), span);
}
