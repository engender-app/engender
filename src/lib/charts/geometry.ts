/* The chart kit's arithmetic. Kept apart from the components for the same
   reason $lib/motion/flagSun.ts is: the re-tween between datasets is worth
   testing without a DOM. The point cap that used to live here moved to
   charts/grain.ts's MAX_POSITIONS/atGrain, which chooses how coarse a
   chart draws instead of averaging its real points down.

   This module imports nothing, and that is a rule rather than an accident:
   its callers want arithmetic and should not have a charting library come
   with it. Path building is charts/areaPath.ts and the bar length is
   charts/share.ts for that reason alone. tests/chart-library-graph.test.ts
   holds the rule and carries the measurement behind it. */

export interface Point {
  /** Domain position - an epoch day, an index, whatever the caller counts in. */
  x: number;
  y: number;
}

/** One reading at one position, or nothing at all.

    A chart drawing one series never has a null: every position it holds
    came from a bucket that carried a value. A chart sharing its positions
    with a second metric does, wherever one of the two was not being logged
    yet (charts/grain.ts's alignSeries). */
export type Sample = number | null;

/** A position on a chart and what was read there. The area chart's own
    input: `Point[]` is one of these, and a series sharing its positions
    with a second metric is the other. */
export interface SeriesPoint {
  x: number;
  y: Sample;
}

/** Reads `points` onto `n` evenly spaced positions across its own x range.

    This is what makes a re-tween possible at all: a week and a year have
    nothing to interpolate pairwise until both are counted the same way, so
    the outgoing dataset is read onto the incoming one's own point count and
    the two are then mixed position by position.

    Linear along the polyline rather than bucket-averaged: a seven-point
    week read onto 365 positions still passes through all seven of its
    values, so the shape the tween starts from is the shape that was on
    screen. */
export function resample(points: Point[], n: number): number[] {
  if (points.length === 0 || n <= 0) return [];
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const x0 = sorted[0].x;
  const x1 = sorted[sorted.length - 1].x;
  // A single point, or several logged against the same position, is a flat
  // line at that value rather than an empty chart.
  if (x1 === x0 || n === 1) return Array.from({ length: n }, () => sorted[sorted.length - 1].y);

  const out: number[] = [];
  let seg = 0;
  for (let i = 0; i < n; i++) {
    const x = x0 + ((x1 - x0) * i) / (n - 1);
    while (seg < sorted.length - 2 && sorted[seg + 1].x < x) seg++;
    const a = sorted[seg];
    const b = sorted[seg + 1];
    out.push(a.y + (b.y - a.y) * ((x - a.x) / (b.x - a.x)));
  }
  return out;
}

/** One frame of tier 3's re-tween: the same position in the outgoing and
    the incoming dataset, mixed.

    A length mismatch cuts to the incoming dataset rather than interpolating
    across it. Only a caller that failed to resample onto one grid can
    produce one, and the shape that would come out belongs to neither
    reading. */
export function lerpSamples(from: Sample[], to: Sample[], t: number): Sample[] {
  if (from.length !== to.length) return to;
  /* A position either dataset has no reading at cuts to the incoming one.
     There is no shape to travel between when one end of the journey is
     nothing, and mixing a reading with an absence would draw a line down to
     a value nobody logged. */
  return to.map((b, i) => {
    const a = from[i];
    return a === null || b === null ? b : a + (b - a) * t;
  });
}

/** A series' readings with its interior gaps filled in, for drawing only.

    A position between two of a series' own readings is one the line already
    crossed before anything put a position there - two metrics on one plot
    give each other positions the other never logged (charts/grain's
    alignSeries), and breaking the line at each of them would draw a sparse
    metric as a row of unconnected marks nobody can see.

    So the drawn shape bridges those, and the readings do not: what comes out
    here is handed to areaPath and to nothing else, and the number under a
    finger still comes from what the person actually logged. Outside the
    series' own span nothing is filled, because before its first reading
    there is no line to take a point from. */
export function bridgeGaps(values: Sample[]): Sample[] {
  const out = [...values];
  let last = -1;
  for (let i = 0; i < out.length; i++) {
    if (out[i] === null) continue;
    if (last >= 0 && i - last > 1) {
      const from = out[last] as number;
      const step = ((out[i] as number) - from) / (i - last);
      for (let j = last + 1; j < i; j++) out[j] = from + step * (j - last);
    }
    last = i;
  }
  return out;
}

export interface PaddedRange {
  min: number;
  max: number;
}

interface PaddedSeries extends PaddedRange {
  points: Point[];
  from: number;
  to: number;
}

/** The two ends of a scale to draw a set of readings against, padded off
    the readings themselves - see paddedSeries below for why, which is the
    caller this was pulled out of: another caller wanted the same pad over
    a set of values with no positions attached.

    Null on nothing to scale. One reading is a scale, unlike one *point*,
    which is not a series: a lone mark still has to be placed somewhere on
    a card, and `minPad` is what puts it in the middle of one. */
export function paddedRange(values: readonly number[], minPad: number): PaddedRange | null {
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.2 || minPad;
  return { min: min - pad, max: max + pad };
}

/** A series of readings with a scale to draw it against, or null when
    there are fewer than two and there is no line to draw.

    The scale is padded off the readings rather than starting at zero: a
    waist measured in centimetres moves within a few percent of itself,
    and a zero-based axis draws that as a flat line. A fifth of the spread
    on each side, and `minPad` where a flat run leaves no spread to take a
    fifth of - which is the one thing the two callers disagree about, a
    lab analyte running in the hundreds wanting ten where a measurement in
    centimetres wants one.

    The ends come off the series order, not off a sort: both callers hand
    over a query result whose order is also the order of the list beside
    the chart, down to how two readings on one day settle. */
export function paddedSeries(points: Point[], minPad: number): PaddedSeries | null {
  const range = points.length < 2 ? null : paddedRange(points.map((p) => p.y), minPad);
  if (range === null) return null;
  return { points, ...range, from: points[0].x, to: points[points.length - 1].x };
}

/** Which corner of the plot the scrub readout takes (AreaChart.svelte),
    picked so the plate never lands on the reading it names.

    A plate fixed in one corner sits over any reading that lands near it -
    carpet ticket 08, filed off a value near the top of its own range with
    a plate answering for it right on top of the curve. The fix is not to
    chase the finger: kit.css's own note above `.kit-area-readout` already
    ruled that out for touch, a label glued to the touch point is a label
    under the thumb holding it. So the plate jumps between the plot's four
    corners instead - whichever half `x` (and, on the other axis, `topY`)
    is *not* in, so the mark always lands in the half the plate gives up.

    That only fully holds on the x axis, where kit.css caps the plate at
    half the plot's width (`max-width: 50%` on `.kit-area-readout`) - a
    plate that could grow past the half it was given would reach back
    across the midline and cover the mark anyway, so the corner alone is
    not enough there without the cap doing its half of the work. The y axis
    takes the same half-split with no matching cap: the plot's height is a
    fixed 132px the plate's content does not answer to the way its width
    answers to the card, and capping it clips a wrapped annotation name
    mid-line with no ellipsis to say so, worse than the overlap it would be
    guarding against - so a plate carrying an unusually tall stack of
    annotations can still reach past the vertical midline it was placed to
    clear. What it never does any more is sit in a corner picked without
    looking at the mark at all, which is what carpet ticket 08 was filed
    against.

    `x` and `topY` are plot-local pixels, the same space `plotWidth` and
    `plotHeight` bound them in - AreaChart's own dot and plot-box
    coordinates, not screen ones. `topY` is the higher (smaller-y) of the
    two marks where a second metric shares the plot, so one flip clears
    both. */
export function readoutCorner(
  x: number,
  topY: number,
  plotWidth: number,
  plotHeight: number
): { left: boolean; below: boolean } {
  return { left: x > plotWidth / 2, below: topY < plotHeight / 2 };
}
