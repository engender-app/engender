/* The chart kit's arithmetic (phase 5 ticket 20). Kept apart from the
   components for the same reason $lib/motion/flagSun.ts is: the numbers
   the ticket pins - the point cap and the re-tween between datasets - are
   worth testing without a DOM.

   Everything here works on an even grid of values rather than on the
   points a caller passes. That grid is what makes tier 3's re-tween
   possible: a week and a year have nothing to interpolate pairwise until
   both are sampled onto the same number of positions. */

export interface Point {
  /** Domain position - an epoch day, an index, whatever the caller counts in. */
  x: number;
  y: number;
}

/** How many positions a chart draws, whatever range it is showing.

    A year of daily entries is 365 points, and tier 3 interpolates the whole
    path on the main thread inside a Capacitor WebView on a mid-range
    Android phone. 120 is one position per ~3px across a 390px screen's
    chart, which is finer than the 2.5px stroke drawing it, and it makes the
    per-frame cost of the re-tween identical for a week and for a year. */
export const MAX_SAMPLES = 120;

/** Reads `points` onto `n` evenly spaced positions across its own x range.

    Linear along the polyline rather than bucket-averaged: a seven-point
    week resamples to a shape that passes through all seven of its values,
    so a short range is not smoothed on its way through the cap. A year is
    subsampled at ~3px, which is the resolution the stroke has anyway. */
export function resample(points: Point[], n: number = MAX_SAMPLES): number[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const x0 = sorted[0].x;
  const x1 = sorted[sorted.length - 1].x;
  // A single point, or several logged against the same position, is a flat
  // line at that value rather than an empty chart.
  if (x1 === x0) return Array.from({ length: n }, () => sorted[sorted.length - 1].y);

  const out: number[] = [];
  let seg = 0;
  for (let i = 0; i < n; i++) {
    const x = x0 + ((x1 - x0) * i) / (n - 1);
    while (seg < sorted.length - 2 && sorted[seg + 1].x < x) seg++;
    const a = sorted[seg];
    const b = sorted[seg + 1];
    const t = (x - a.x) / (b.x - a.x);
    out.push(a.y + (b.y - a.y) * t);
  }
  return out;
}

/** One frame of tier 3's re-tween: the same position in the outgoing and
    the incoming dataset, mixed.

    A length mismatch cuts to the incoming dataset rather than interpolating
    across it. Only a caller that resampled its two datasets onto different
    grids can produce one, and the shape that would come out belongs to
    neither reading. */
export function lerpSamples(from: number[], to: number[], t: number): number[] {
  if (from.length !== to.length) return to;
  return to.map((b, i) => from[i] + (b - from[i]) * t);
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
  /** The latest position, for the ring the area chart puts on it. */
  last: { x: number; y: number } | null;
}

export function areaPath(samples: number[], box: AreaBox): AreaPath {
  if (samples.length === 0) return { line: '', fill: '', last: null };

  const span = box.max - box.min;
  const xs = (i: number) => (samples.length === 1 ? 0 : (box.width * i) / (samples.length - 1));
  const ys = (v: number) => {
    // A scale with no span - one dimension pinned to a single value - sits
    // on the baseline rather than dividing by zero.
    if (span === 0) return box.height;
    const clamped = Math.min(box.max, Math.max(box.min, v));
    return box.height - ((clamped - box.min) / span) * box.height;
  };

  const points = samples.map((v, i) => `${round(xs(i))},${round(ys(v))}`);
  const line = `M${points[0]} ${points.slice(1).map((p) => `L${p}`).join(' ')}`.trim();
  const lastX = round(xs(samples.length - 1));
  return {
    line,
    fill: `${line} L${lastX},${round(box.height)} L0,${round(box.height)} Z`,
    last: { x: lastX, y: round(ys(samples[samples.length - 1])) }
  };
}

/** A bar's width as a percentage of the largest value beside it. The bars
    carry their own values as text, so this is length only. */
export function share(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return (value / max) * 100;
}

/** Three decimals is finer than a device pixel at any chart size the app
    draws, and it keeps the path strings short enough to diff by eye. */
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
