/* The chart kit's arithmetic (phase 5 ticket 20), kept out of the Svelte
   components so the numbers the ticket pins - the re-tween between
   datasets and the single-hue bar ramp's leader - can be held to a value
   without mounting anything. The point cap lives in charts/grain.ts
   instead (MAX_POSITIONS/atGrain) and kit-surfaces.test.ts holds it to a
   value; the resampling here exists for the tween alone - to count two
   datasets the same way for as long as one is turning into the other. */

import { describe, expect, it } from 'vitest';
import {
  areaPath,
  lerpSamples,
  resample,
  share
} from '../src/lib/charts/geometry';

describe('resample', () => {
  it('reproduces a straight line exactly, whatever the count', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 100 }
    ];
    expect(resample(points, 11)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  it('keeps every vertex of a polyline it reads at its own length', () => {
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

  it('reads a week onto a year of positions, which is what the tween needs', () => {
    const week = Array.from({ length: 7 }, (_, i) => ({ x: i, y: i * 10 }));
    const onto = resample(week, 365);
    expect(onto.length).toBe(365);
    expect(onto[0]).toBe(0);
    expect(onto[364]).toBe(60);
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
    expect(lerpSamples([0, 100], b, 0.5)).toEqual(b);
  });
});

describe('areaPath', () => {
  const box = { width: 100, height: 50, min: 0, max: 100 };

  it('places every value in its own slot, left to right', () => {
    expect(areaPath([0, 50, 100], box).dots).toEqual([
      { x: 0, y: 50 },
      { x: 50, y: 25 },
      { x: 100, y: 0 }
    ]);
  });

  it('smooths the line without overshooting a value nobody logged', () => {
    // A monotone curve through a rise and a plateau stays inside the two
    // values it runs between: a spline that overshoots would draw a day
    // above the highest reading there is.
    const { line } = areaPath([0, 100, 100], box);
    expect(line.startsWith('M')).toBe(true);
    expect(line).toMatch(/C/);
    const ys = [...line.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[2]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(50);
  });

  it('closes the fill down to the baseline', () => {
    const { fill } = areaPath([0, 100], box);
    expect(fill.startsWith('M')).toBe(true);
    expect(fill.endsWith('Z')).toBe(true);
    expect(fill).toContain('50'); // the baseline the fill returns along
  });

  it('reports the latest position so the chart can ring it', () => {
    expect(areaPath([0, 50, 100], box).last).toEqual({ x: 100, y: 0 });
  });

  it('clamps a value outside the scale rather than drawing past the box', () => {
    expect(areaPath([-20, 140], box).dots).toEqual([
      { x: 0, y: 50 },
      { x: 100, y: 0 }
    ]);
  });

  it('flattens a scale with no span onto the baseline instead of dividing by zero', () => {
    expect(areaPath([5, 5], { ...box, min: 5, max: 5 }).dots).toEqual([
      { x: 0, y: 50 },
      { x: 100, y: 50 }
    ]);
  });

  it('centres a lone reading rather than pinning it to the left edge', () => {
    expect(areaPath([50], box).dots).toEqual([{ x: 50, y: 25 }]);
  });

  it('has no path and no latest point when there is nothing to draw', () => {
    expect(areaPath([], box)).toEqual({ line: '', fill: '', dots: [], last: null });
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
