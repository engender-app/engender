/* The one part of the chart kit that needs a charting library: turning a row
   of readings into the two path strings an area chart draws, the marks a
   finger scrubs between, and the ring on the latest reading.

   It sits apart from charts/geometry.ts, which holds the arithmetic and
   imports nothing, so that a caller after a number does not get a library
   too - the rule and the reasoning are in tests/chart-library-graph.test.ts.
   Everything here is still Node-testable, which is why it is a module rather
   than something inside AreaChart.svelte: the curve, the gaps and the
   clamping are worth a test without a DOM (ADR-0016), and
   tests/chart-geometry.test.ts is where they have one.

   d3-shape only: the scale is the box's own arithmetic rather than
   d3-scale, which the charts that need an axis reach for themselves. */

import { area as d3area, line as d3line, curveLinear, curveMonotoneX } from 'd3-shape';
import type { Point, Sample } from './geometry';

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

/** Three decimals is finer than a device pixel at any chart size the app
    draws, and it keeps the path strings short enough to diff by eye. */
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
