import { describe, expect, it } from 'vitest';
import { sliderScaleStops, snapToStop } from '../src/lib/components/sliderScale';

/* The two scales the app can actually create: the custom-dimension screen
   offers 0-10 and 0-100 and nothing else, and the built-in dimensions are
   0-10. Everything below those two is the rule holding up under spans
   nobody has made yet. */
describe('slider stops', () => {
  it('keeps every value reachable on the 0-10 scale', () => {
    expect(sliderScaleStops(0, 10)).toEqual({
      step: 1,
      stops: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      majorEvery: 5
    });
  });

  it('coarsens the 0-100 scale to 21 stops of 5', () => {
    const { step, stops, majorEvery } = sliderScaleStops(0, 100);
    expect(step).toBe(5);
    expect(stops).toHaveLength(21);
    expect(stops.at(0)).toBe(0);
    expect(stops.at(-1)).toBe(100);
    expect(majorEvery).toBe(5);
  });

  it('never marks more stops than a phone can separate', () => {
    for (let max = 1; max <= 200; max++) {
      const { stops } = sliderScaleStops(0, max);
      expect(stops.length, `0-${max}`).toBeLessThanOrEqual(21);
    }
  });

  it('lands its last stop exactly on the maximum, or draws no ruler at all', () => {
    for (let max = 1; max <= 200; max++) {
      const { stops, step } = sliderScaleStops(0, max);
      if (stops.length === 0) continue;
      expect(stops.at(-1), `0-${max}`).toBe(max);
      expect(max % step, `0-${max}`).toBe(0);
    }
  });

  it('gives up rather than marking a span it cannot divide', () => {
    expect(sliderScaleStops(0, 1000)).toEqual({ step: 1, stops: [], majorEvery: 0 });
    expect(sliderScaleStops(0, 0)).toEqual({ step: 1, stops: [], majorEvery: 0 });
  });

  it('marks majors only where the last one lands on the maximum', () => {
    expect(sliderScaleStops(0, 8).majorEvery).toBe(0);
    expect(sliderScaleStops(0, 20).majorEvery).toBe(5);
  });

  it('respects a scale that does not start at zero', () => {
    expect(sliderScaleStops(1, 5).stops).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('snapping', () => {
  it('takes a value to its nearest stop', () => {
    expect(snapToStop(63, 0, 100, 5)).toBe(65);
    expect(snapToStop(62, 0, 100, 5)).toBe(60);
    expect(snapToStop(7, 0, 10, 1)).toBe(7);
  });

  it('stays inside the scale', () => {
    expect(snapToStop(-4, 0, 100, 5)).toBe(0);
    expect(snapToStop(140, 0, 100, 5)).toBe(100);
    expect(snapToStop(99, 0, 100, 5)).toBe(100);
  });

  it('snaps from an offset minimum, not from zero', () => {
    expect(snapToStop(4, 1, 21, 5)).toBe(6);
  });
});
