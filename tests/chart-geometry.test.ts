/* The chart kit's arithmetic (phase 5 ticket 20), kept out of the Svelte
   components so the three things the ticket pins numbers to - the point
   cap, the re-tween between datasets, and the single-hue bar ramp's
   leader - can be held to a value without mounting anything.

   The cap is the load-bearing one. Tier 3's re-tween interpolates an SVG
   path on the main thread inside a Capacitor WebView, and a year of daily
   entries is 365 points. Resampling both datasets onto one fixed grid is
   what makes the tween possible at all - two arrays of different lengths
   have no pairwise interpolation - and capping that grid is what keeps the
   per-frame cost the same whether the range is a week or a year. */

import { describe, expect, it } from 'vitest';
import {
  MAX_SAMPLES,
  areaPath,
  lerpSamples,
  resample,
  share
} from '../src/lib/charts/geometry';

describe('resample', () => {
  it('reproduces a straight line exactly, whatever the sample count', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 100 }
    ];
    const ys = resample(points, 11);
    expect(ys).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  it('keeps every vertex of a polyline it samples at or above its own length', () => {
    const points = [
      { x: 0, y: 4 },
      { x: 1, y: 9 },
      { x: 2, y: 2 }
    ];
    expect(resample(points, 3)).toEqual([4, 9, 2]);
  });

  it('carries uneven x spacing onto the even grid', () => {
    // Two days apart then one: the midpoint of the grid falls inside the
    // first segment, not on the middle vertex.
    const points = [
      { x: 0, y: 0 },
      { x: 2, y: 10 },
      { x: 3, y: 10 }
    ];
    expect(resample(points, 4)).toEqual([0, 5, 10, 10]);
  });

  it('caps a year of daily points at the grid it is given', () => {
    const year = Array.from({ length: 365 }, (_, i) => ({ x: i, y: i % 7 }));
    expect(resample(year).length).toBe(MAX_SAMPLES);
  });

  it('holds a single point flat across the grid rather than drawing nothing', () => {
    expect(resample([{ x: 5, y: 42 }], 4)).toEqual([42, 42, 42, 42]);
  });

  it('is empty for no points', () => {
    expect(resample([], 8)).toEqual([]);
  });
});

describe('lerpSamples', () => {
  const a = [0, 50, 100];
  const b = [100, 50, 0];

  it('is the outgoing dataset at t=0 and the incoming one at t=1', () => {
    expect(lerpSamples(a, b, 0)).toEqual(a);
    expect(lerpSamples(a, b, 1)).toEqual(b);
  });

  it('interpolates pairwise halfway', () => {
    expect(lerpSamples(a, b, 0.5)).toEqual([50, 50, 50]);
  });

  it('cuts to the incoming dataset when the two grids disagree', () => {
    // Only reachable if a caller resamples the two datasets onto different
    // grids, which the components never do; interpolating pairwise across
    // a length mismatch would silently draw a shape belonging to neither.
    expect(lerpSamples([0, 100], b, 0.5)).toEqual(b);
  });
});

describe('areaPath', () => {
  const box = { width: 100, height: 50, min: 0, max: 100 };

  it('draws the line left to right with the value scale inverted', () => {
    expect(areaPath([0, 100], box).line).toBe('M0,50 L100,0');
  });

  it('closes the fill down to the baseline', () => {
    expect(areaPath([0, 100], box).fill).toBe('M0,50 L100,0 L100,50 L0,50 Z');
  });

  it('reports the latest point so the chart can ring it', () => {
    expect(areaPath([0, 50, 100], box).last).toEqual({ x: 100, y: 0 });
  });

  it('clamps a value outside the scale rather than drawing past the box', () => {
    expect(areaPath([-20, 140], box).line).toBe('M0,50 L100,0');
  });

  it('flattens a flat scale onto the baseline instead of dividing by zero', () => {
    expect(areaPath([5, 5], { ...box, min: 5, max: 5 }).line).toBe('M0,50 L100,50');
  });

  it('has no path and no latest point when there is nothing to draw', () => {
    expect(areaPath([], box)).toEqual({ line: '', fill: '', last: null });
  });
});

describe('share', () => {
  it('is a percentage of the largest value in the set', () => {
    expect(share(5, 10)).toBe(50);
    expect(share(10, 10)).toBe(100);
  });

  it('is zero rather than NaN when nothing has been logged', () => {
    expect(share(0, 0)).toBe(0);
  });

  it('never goes negative', () => {
    expect(share(-3, 10)).toBe(0);
  });
});
