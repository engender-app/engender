import { describe, expect, it } from 'vitest';

import type { DayAverage } from './journal/stats';
import { MOOD_RANGE } from './metricRange';
import { MIN_SPREAD_MARK, metricStandings, moodDistribution, seriesAverage, spreadMark } from './statsCharts';

const days = (...values: number[]): DayAverage[] =>
  values.map((value, i) => ({ day: 20100 + i, value, count: 1 }));

describe('a day series averaged', () => {
  it('says nothing about a metric nothing was logged against', () => {
    expect(seriesAverage([])).toBeNull();
  });

  it('averages over the days that carried it, not over the range', () => {
    expect(seriesAverage(days(1, 2, 3))).toBe(2);
  });
});

describe('where each scale sat over the period', () => {
  const metrics = [
    { key: 'mood', range: MOOD_RANGE },
    { key: 'femininity', range: { min: 0, max: 100 } }
  ];

  /* The whole reason this is not the raw number: a mood of 4 out of 5 is
     further along its own scale than a dimension at 50 out of 100, and a bar
     drawn from 4 against 50 says the opposite. */
  it('draws the bar from where the average sits in the metric\'s own range', () => {
    const series = (key: string) => (key === 'mood' ? days(4, 4) : days(50, 50));
    const [mood, femininity] = metricStandings(metrics, series);
    expect(mood.value).toBe(4);
    expect(mood.share).toBeCloseTo(0.75);
    expect(femininity.value).toBe(50);
    expect(femininity.share).toBeCloseTo(0.5);
  });

  it('keeps a scale that carried nothing, as a row with no reading', () => {
    const [mood, femininity] = metricStandings(metrics, (key) => (key === 'mood' ? days(3) : []));
    expect(mood.days).toBe(1);
    expect(femininity).toEqual({ key: 'femininity', value: null, share: 0, days: 0 });
  });
});

describe('how many days landed on each mood', () => {
  it('has all five steps even where the period only touched one', () => {
    const spread = moodDistribution(days(3, 3, 3));
    expect(spread.map((s) => s.step)).toEqual([1, 2, 3, 4, 5]);
    expect(spread.map((s) => s.count)).toEqual([0, 0, 3, 0, 0]);
  });

  it('has all five steps with nothing logged at all', () => {
    expect(moodDistribution([]).map((s) => s.count)).toEqual([0, 0, 0, 0, 0]);
  });

  /* A day average is a fraction: a day with a 2 and a 3 on it is one day at
     2.5, and it belongs on one step rather than in two places. */
  it('puts a fractional day average on the step it is nearest', () => {
    expect(moodDistribution(days(2.4, 2.6, 4.5)).map((s) => s.count)).toEqual([0, 1, 1, 0, 1]);
  });

  it('holds a value from outside the scale at the end of the ramp', () => {
    expect(moodDistribution(days(0, 9)).map((s) => s.count)).toEqual([1, 0, 0, 0, 1]);
  });
});

describe('the mark a day covering ground gets on the calendar', () => {
  const FEMININITY = { min: 0, max: 100 };

  it('marks nothing on a day the read said nothing about', () => {
    expect(spreadMark(undefined, MOOD_RANGE)).toBeNull();
  });

  it('marks nothing on a day that only ever said one thing', () => {
    /* One entry, or six entries all at the same value. Neither covered any
       ground, and a mark of no width would be a smudge claiming otherwise. */
    expect(spreadMark({ low: 4, high: 4 }, MOOD_RANGE)).toBeNull();
  });

  it('runs from the lowest to the highest, inside the metric\'s own range', () => {
    const mark = spreadMark({ low: 2, high: 5 }, MOOD_RANGE);
    expect(mark?.start).toBeCloseTo(0.25);
    expect(mark?.width).toBeCloseTo(0.75);
  });

  it('reads the same way on a range that is not mood\'s', () => {
    /* The acceptance criterion behind this: a 1-to-5 metric and a 0-to-100
       one have to produce a mark a person can compare between two months
       without knowing which scale is showing. */
    const mark = spreadMark({ low: 20, high: 85 }, FEMININITY);
    expect(mark?.start).toBeCloseTo(0.2);
    expect(mark?.width).toBeCloseTo(0.65);
  });

  it('keeps a difference too small to draw visible, centred on where it was', () => {
    // Two points apart on a 0-to-100 scale is under a pixel of a calendar
    // cell. The day did cover ground, so the mark says so at the floor.
    const mark = spreadMark({ low: 50, high: 52 }, FEMININITY);
    expect(mark?.width).toBeCloseTo(MIN_SPREAD_MARK);
    expect(mark?.start).toBeCloseTo(0.51 - MIN_SPREAD_MARK / 2);
  });

  it('keeps that floor inside the track rather than hanging off its end', () => {
    const top = spreadMark({ low: 98, high: 100 }, FEMININITY);
    expect(top?.start).toBeCloseTo(1 - MIN_SPREAD_MARK);
    const bottom = spreadMark({ low: 0, high: 2 }, FEMININITY);
    expect(bottom?.start).toBeCloseTo(0);
  });

  it('holds a value from outside the range to the range, the way the fill does', () => {
    // An archive from a build whose dimension ran wider (metricRange.ts).
    const mark = spreadMark({ low: -20, high: 140 }, FEMININITY);
    expect(mark?.start).toBeCloseTo(0);
    expect(mark?.width).toBeCloseTo(1);
  });
});
