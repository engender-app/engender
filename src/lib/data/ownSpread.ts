/* "Above the person's own recent spread" (phase 8 features ticket 15).

   Two of the hormone curve's markers are not a record that exists but a day
   that stands out: a tally count above what that person's counts usually
   are, a body-region reading above what that person's readings usually are.
   Both need a threshold, and the one thing a threshold here may never be is
   a number from outside - the app never marks a value as high, low, good or
   bad against anything but the person's own data (PRODUCT.md:109,
   docs/ui-copy.md's "no medical framing"). So the rule is written once, in
   one place, and both markers use it.

   Pure, above the journal seam, no clock and no paraglide (ADR-0016).
   `today` arrives as an argument because "recent" is relative to now and
   nothing about it is stored (ADR-0010).

   ## The rule, and why it is this one

   Over the person's own readings in the window ending today, take the lower
   and upper quartiles. A day is above their own recent spread when its value
   is strictly greater than

     p75 + 1.5 * (p75 - p25)

   which is Tukey's upper fence, the ordinary way of saying "further out than
   this sample's own middle stretches". It is chosen over a plain high
   percentile because a percentile marks a fixed share of days by
   construction - p90 puts nine marks on ninety days whatever the data does,
   including on a journal where nothing ever stood out. The fence marks
   nothing on a steady run and marks the days that genuinely leave it.

   Where the quartiles land on the same value the fence collapses onto them,
   and anything above it is marked. That is deliberate rather than patched
   around: somebody who logs one misgendering on each of the days they log
   any has a spread of zero, and the day there were three is above it. This
   is the common shape for a count and it is the shape the marker is for.

   ## The two numbers, and their reasons

   OWN_SPREAD_WINDOW_DAYS is 180, which is the longest range the hormone
   curve screen draws. Two things follow, and they are the reason for the
   choice. Every day the chart can show was inside the sample that judged it.
   And the answer does not move when the person switches the chart between 30,
   90 and 180 days: a day marked at one zoom is marked at all of them, where a
   window tied to the chart's own range would re-mark days as it was resized
   and look like a bug in the chart.

   OWN_SPREAD_MIN_READINGS is 8. Below it the quartiles are decided by one
   reading apiece, so the first fortnight of a new habit would mark most of
   itself; and "above your own spread" means nothing when there is not enough
   of your own to have a spread. Under it nothing is marked at all, which is
   the honest answer rather than a cautious one. */

/** One of the person's readings: a day, and the number on it. Whatever the
    number counts is the caller's business - this compares it to others of
    its own kind and to nothing else, so a caller with several series (one
    per body region, one per counter) calls this once per series. */
export interface DayValue {
  epochDay: number;
  value: number;
}

/** How far back the readings that set the threshold are taken from,
    counting today as the last day. */
export const OWN_SPREAD_WINDOW_DAYS = 180;

/** How many readings there have to be in that window before there is a
    threshold at all. */
export const OWN_SPREAD_MIN_READINGS = 8;

/** How far past the upper quartile the fence sits, in interquartile ranges.
    Tukey's own constant, kept rather than tuned: a number picked to make a
    particular journal look right is a fixed threshold wearing a multiplier's
    clothes. */
const OWN_SPREAD_FENCE_IQRS = 1.5;

/** The p-th percentile of an already-sorted sample, interpolating between
    the two readings it falls between (the ordinary definition, the one a
    spreadsheet's PERCENTILE gives). Interpolated rather than rounded to a
    member so eight readings and nine readings do not give visibly different
    fences off the same data. */
function percentile(sorted: readonly number[], p: number): number {
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (position - lower) * (sorted[upper] - sorted[lower]);
}

/** The value a day has to beat, or null where the window holds too few of
    the person's readings for there to be a spread to be above.

    Readings dated after `today` are left out. Nothing writes one, but an
    archive from a device whose clock ran ahead can hold one, and a future
    reading voting on what counts as recent would be a threshold set by a
    day that has not happened. */
export function ownSpreadFence(readings: readonly DayValue[], today: number): number | null {
  const from = today - OWN_SPREAD_WINDOW_DAYS + 1;
  const recent = readings
    .filter((reading) => reading.epochDay >= from && reading.epochDay <= today)
    .map((reading) => reading.value)
    .sort((a, b) => a - b);

  if (recent.length < OWN_SPREAD_MIN_READINGS) return null;

  const lowerQuartile = percentile(recent, 0.25);
  const upperQuartile = percentile(recent, 0.75);
  return upperQuartile + OWN_SPREAD_FENCE_IQRS * (upperQuartile - lowerQuartile);
}

/** The readings that stand above the person's own recent spread, oldest
    first. Empty where there is no fence.

    Every reading handed in is judged, not only the ones inside the window:
    a chart can be drawn over a range the window does not reach back to, and
    dropping those days would leave a stretch of it where nothing could ever
    be marked. They are judged against the same one fence, which is what
    keeps the answer stable as the chart is resized.

    Generic over the reading, so a caller whose readings carry more than a
    day and a number - the entry a body-region reading was logged on - gets
    them back whole rather than having to match them up again by identity. */
export function aboveOwnSpread<T extends DayValue>(readings: readonly T[], today: number): T[] {
  const fence = ownSpreadFence(readings, today);
  if (fence === null) return [];

  return readings
    .filter((reading) => reading.epochDay <= today && reading.value > fence)
    .sort((a, b) => a.epochDay - b.epochDay);
}
