/* The chart kit's arithmetic. Kept apart from the components for the same
   reason $lib/motion/flagSun.ts is: the re-tween between datasets is worth
   testing without a DOM. The point cap that used to live here moved to
   charts/grain.ts's MAX_POSITIONS/atGrain, which chooses how coarse a
   chart draws instead of averaging its real points down.

   This module imports nothing, and that is a rule rather than an accident.
   Its callers are not all charts: `share` is a bar's length, and
   components/kit/barRow.ts wanted those three lines out of a module that
   used to open with a d3-shape import. Path building moved to
   charts/areaPath.ts so that importing arithmetic cannot pull a charting
   library along behind it - tests/chart-library-graph.test.ts holds the
   line and has the measurement that went with the decision. */

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

/** A bar's width as a percentage of the largest value beside it. The bars
    carry their own values as text, so this is length only. */
export function share(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return (value / max) * 100;
}

export interface PaddedRange {
  min: number;
  max: number;
}

export interface PaddedSeries extends PaddedRange {
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
