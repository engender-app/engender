/* The chart kit's arithmetic (phase 5 ticket 20). Kept apart from the
   components for the same reason $lib/motion/flagSun.ts is: the number
   the ticket pins - the re-tween between datasets - is worth testing
   without a DOM. The point cap that used to live here moved to
   charts/grain.ts's MAX_POSITIONS/atGrain, which chooses how coarse a
   chart draws instead of averaging its real points down. */

import { area as d3area, line as d3line, curveLinear, curveMonotoneX } from 'd3-shape';

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

export interface AreaBox {
  width: number;
  height: number;
  min: number;
  max: number;
}

export interface AreaPath {
  line: string;
  /** The same line, closed down to the baseline. */
  fill: string;
  /** Where each value sits, for the marks a finger scrolls between. `null`
      at a position this series has no reading at - the slot is kept rather
      than dropped, because its index is how the scrub finds a position and
      two series on one plot have to agree about which index is where. */
  dots: ({ x: number; y: number } | null)[];
  /** The latest reading, for the ring the area chart puts on it. The latest
      one there is, which on a series that stops early is not the last
      position on the plot. */
  last: { x: number; y: number } | null;
}

export function areaPath(values: Sample[], box: AreaBox, smooth: boolean = true): AreaPath {
  if (values.length === 0) return { line: '', fill: '', dots: [], last: null };

  const span = box.max - box.min;
  const xs = (i: number) => (values.length === 1 ? box.width / 2 : (box.width * i) / (values.length - 1));
  const ys = (v: number) => {
    // A scale with no span - one dimension pinned to a single value - sits
    // on the baseline rather than dividing by zero.
    if (span === 0) return box.height;
    const clamped = Math.min(box.max, Math.max(box.min, v));
    return box.height - ((clamped - box.min) / span) * box.height;
  };

  const dots = values.map((v, i) => (v === null ? null : { x: round(xs(i)), y: round(ys(v)) }));

  /* Monotone rather than straight segments or a plain spline: it rounds the
     corners a reading turns without inventing a peak between two days that
     were never that far apart, which a Catmull-Rom or a cardinal curve
     will. A chart of someone's own history has no business overshooting a
     value they logged.

     Straight segments while a tween is playing, though. A monotone path
     over a year is three cubic control points per day where a polyline is
     one position, and on a Pixel 10a rebuilding the smoothed version every
     frame put the p95 frame at 33.3ms against a 16.7ms baseline - visibly
     dropped frames, in the one direction that matters. At 14px a point the
     difference between the two curves is a fraction of the stroke width
     while the line is moving, and the smoothing arrives when it stops. */
  const curve = smooth ? curveMonotoneX : curveLinear;
  /* `defined` is what keeps a gap a gap: a stretch this metric was not
     logged over comes out as a break in the path rather than as a segment
     drawn straight across it. On a single series nothing is ever undefined
     and the path is what it always was. */
  const defined = (p: { x: number; y: number | null }): p is Point => p.y !== null;
  const line = d3line<{ x: number; y: number | null }>()
    .defined(defined)
    .x((p) => p.x)
    .y((p) => p.y as number)
    .curve(curve);
  const fill = d3area<{ x: number; y: number | null }>()
    .defined(defined)
    .x((p) => p.x)
    .y0(box.height)
    .y1((p) => p.y as number)
    .curve(curve);
  const shape = dots.map((d, i) => ({ x: round(xs(i)), y: d ? d.y : null }));
  const read = dots.filter((d) => d !== null);

  return {
    line: line(shape) ?? '',
    fill: fill(shape) ?? '',
    dots,
    last: read[read.length - 1] ?? null
  };
}

/** A bar's width as a percentage of the largest value beside it. The bars
    carry their own values as text, so this is length only. */
export function share(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return (value / max) * 100;
}

export interface PaddedSeries {
  points: Point[];
  min: number;
  max: number;
  from: number;
  to: number;
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
  if (points.length < 2) return null;
  const values = points.map((p) => p.y);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.2 || minPad;
  return { points, min: min - pad, max: max + pad, from: points[0].x, to: points[points.length - 1].x };
}

/** Three decimals is finer than a device pixel at any chart size the app
    draws, and it keeps the path strings short enough to diff by eye. */
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
