/* The chart kit's arithmetic (phase 5 ticket 20), kept out of the Svelte
   components so the numbers the ticket pins - the re-tween between
   datasets and the single-hue bar ramp's leader - can be held to a value
   without mounting anything. The point cap lives in charts/grain.ts
   instead (MAX_POSITIONS/atGrain) and kit-surfaces.test.ts holds it to a
   value; the resampling here exists for the tween alone - to count two
   datasets the same way for as long as one is turning into the other. */

import { describe, expect, it } from 'vitest';
import { areaPath } from '../src/lib/charts/areaPath';
import {
  bridgeGaps,
  lerpSamples,
  paddedSeries,
  readoutCorner,
  resample
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

describe('paddedSeries', () => {
  const points = [
    { x: 10, y: 4 },
    { x: 12, y: 6 },
    { x: 20, y: 5 }
  ];

  it('pads the scale by a fifth of the readings own spread', () => {
    /* Not zero-based: a waist measured in centimetres moves within a few
       percent of itself, and a zero-based axis draws that as a flat
       line. What the top and the bottom of the plot mean is the whole of
       what this decides - there is no axis furniture. */
    expect(paddedSeries(points, 1)).toEqual({
      points,
      min: 4 - 0.4,
      max: 6 + 0.4,
      from: 10,
      to: 20
    });
  });

  it('falls back to the callers own floor when every reading is the same', () => {
    /* A flat run has no spread to take a fifth of, so the padding comes
       from the scale the caller is drawing in: whole units for a waist in
       centimetres, ten for a lab analyte whose values run in the
       hundreds. Without a floor the band would be zero tall. */
    const flat = [
      { x: 1, y: 100 },
      { x: 2, y: 100 }
    ];
    expect(paddedSeries(flat, 10)).toMatchObject({ min: 90, max: 110 });
    expect(paddedSeries(flat, 1)).toMatchObject({ min: 99, max: 101 });
  });

  it('has nothing to draw below two readings', () => {
    expect(paddedSeries([], 1)).toBeNull();
    expect(paddedSeries([{ x: 1, y: 2 }], 1)).toBeNull();
  });

  it('reads its ends off the series order rather than sorting it', () => {
    /* Both callers hand over a query result, and the query's order is
       what the list beside the chart shows - down to how two readings on
       one day settle. Reordering here would put the chart's date range
       out of step with the rows under it. */
    expect(paddedSeries(points, 1)).toMatchObject({ from: 10, to: 20 });
  });
});

/* A series sharing a plot with another one carries a null wherever it has
   no reading at that position (charts/grain.ts's alignSeries). A single
   series never does, which is why every case above is written without
   one. */
describe('areaPath with positions a series has no reading at', () => {
  const box = { width: 100, height: 50, min: 0, max: 100 };

  it('leaves the slot empty rather than placing it on the baseline', () => {
    expect(areaPath([0, null, 100], box).dots).toEqual([
      { x: 0, y: 50 },
      null,
      { x: 100, y: 0 }
    ]);
  });

  it('breaks the line rather than drawing across the gap', () => {
    const { line } = areaPath([0, null, 100], box);
    // Two subpaths: the reading before the gap and the reading after it are
    // not joined by a segment nobody logged.
    expect(line.match(/M/g)).toHaveLength(2);
  });

  it('rings the last reading there is, not the last position', () => {
    expect(areaPath([0, 100, null], box).last).toEqual({ x: 50, y: 0 });
  });

  it('has no ring at all when nothing was read', () => {
    expect(areaPath([null, null], box).last).toBe(null);
  });

  it('keeps every position in the slot the other series put it in', () => {
    // Length is how the scrub finds a position, so a null takes its turn
    // rather than shortening the array.
    expect(areaPath([null, 50, null, null], box).dots).toHaveLength(4);
  });
});

describe('lerpSamples across a position one of the two has no reading at', () => {
  it('arrives at the incoming reading rather than mixing with nothing', () => {
    expect(lerpSamples([0, 0, 0], [100, null, 100], 0.5)).toEqual([50, null, 50]);
  });

  it('takes the incoming reading where the outgoing dataset had none', () => {
    expect(lerpSamples([null, 0], [100, 100], 0.5)).toEqual([100, 50]);
  });
});

describe('bridgeGaps', () => {
  it('fills a hole between two readings along the line already drawn', () => {
    expect(bridgeGaps([0, null, 100])).toEqual([0, 50, 100]);
    expect(bridgeGaps([0, null, null, 30])).toEqual([0, 10, 20, 30]);
  });

  it('leaves the two open ends alone', () => {
    // Before a series' first reading and after its last there is no line to
    // take a point from, so those stay absent and the path stays broken.
    expect(bridgeGaps([null, 10, 20, null])).toEqual([null, 10, 20, null]);
  });

  it('leaves a series with no holes exactly as it was', () => {
    expect(bridgeGaps([1, 2, 3])).toEqual([1, 2, 3]);
    expect(bridgeGaps([])).toEqual([]);
    expect(bridgeGaps([null, null])).toEqual([null, null]);
  });

  it('does not touch the readings it was given', () => {
    // The drawn shape and the readings are two things; filling one must not
    // put a number into the other, which is what a person is shown.
    const readings = [0, null, 100];
    bridgeGaps(readings);
    expect(readings).toEqual([0, null, 100]);
  });
});

describe('readoutCorner', () => {
  // Plot-local pixels: 0,0 is top-left, x grows right, y grows down. This
  // only ever has to pick a half - kit.css's own 50%-of-the-plot cap on
  // .kit-area-readout is what keeps the plate from growing back across
  // whichever half it gave up (chart-library-graph.test.ts and
  // kit-surfaces.test.ts hold that cap; it is not re-tested in pixels here,
  // the same division tests/kit-gallery.mjs and chart-geometry.test.ts
  // already keep between what an eye checks and what arithmetic can).
  const width = 100;
  const height = 100;

  it('takes the bottom-left corner for a reading in the top-right', () => {
    expect(readoutCorner(80, 10, width, height)).toEqual({ left: true, below: true });
  });

  it('takes the top-right corner for a reading in the bottom-left', () => {
    expect(readoutCorner(10, 80, width, height)).toEqual({ left: false, below: false });
  });

  it('takes the bottom-right corner for a reading in the top-left', () => {
    expect(readoutCorner(10, 10, width, height)).toEqual({ left: false, below: true });
  });

  it('takes the top-left corner for a reading in the bottom-right', () => {
    expect(readoutCorner(80, 80, width, height)).toEqual({ left: true, below: false });
  });
});
