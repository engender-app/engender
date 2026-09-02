import { describe, expect, it } from 'vitest';

import type { DayAverage } from './journal/stats';
import { MOOD_RANGE } from './metricRange';
import { MAX_STACK_CARDS, coveredGround, dayShape, metricStandings, moodDistribution, seriesAverage } from './statsCharts';

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

describe('what a day is drawn as on the calendar', () => {
  const FEMININITY = { min: 0, max: 100 };
  const day = (low: number, high: number, count: number) => ({ day: 20100, low, high, count });

  it('draws nothing for a day the metric was never logged on', () => {
    expect(dayShape(undefined, MOOD_RANGE)).toBeNull();
  });

  it('leaves a day of one reading whole', () => {
    expect(dayShape(day(4, 4, 1), MOOD_RANGE)).toEqual({ kind: 'one' });
  });

  it('splits a day of two readings that landed on different steps, low half first', () => {
    /* The half is a fill, and a fill is a step, so the split carries steps
       rather than values. Low first and no further order: which one came
       first is a question this cannot answer. */
    expect(dayShape(day(2, 5, 2), MOOD_RANGE)).toEqual({ kind: 'split', low: 1, high: 4 });
  });

  it('stacks a day of two readings that landed on the same step', () => {
    // Nothing to draw an edge between: both halves would be one colour, and
    // a split with no visible edge reads as a day that said one thing.
    expect(dayShape(day(4, 4, 2), MOOD_RANGE)).toEqual({ kind: 'stack', cards: 2 });
    // Two different values inside one step is the same case.
    expect(dayShape(day(30, 44, 2), FEMININITY)).toEqual({ kind: 'stack', cards: 2 });
  });

  it('stacks a day of three or more readings however far apart they were', () => {
    // Four bands at 46px is a texture rather than four readings.
    expect(dayShape(day(1, 5, 3), MOOD_RANGE)).toEqual({ kind: 'stack', cards: 3 });
    expect(dayShape(day(10, 90, 4), FEMININITY)).toEqual({ kind: 'stack', cards: 4 });
  });

  it('stops the deck where it stops being countable', () => {
    expect(dayShape(day(1, 5, 9), MOOD_RANGE)).toEqual({ kind: 'stack', cards: MAX_STACK_CARDS });
  });

  it('splits the same pair of readings the same way whatever the range is', () => {
    // A 1-to-5 metric and a 0-to-100 one both resolve through the heat
    // steps, so a split means the same thing on either (ADR-0012).
    expect(dayShape(day(1, 5, 2), MOOD_RANGE)).toEqual({ kind: 'split', low: 1, high: 4 });
    expect(dayShape(day(0, 100, 2), FEMININITY)).toEqual({ kind: 'split', low: 1, high: 4 });
  });
});

describe('whether a day covered ground at all', () => {
  it('says no for a day that only ever held one value', () => {
    expect(coveredGround(undefined)).toBe(false);
    expect(coveredGround({ low: 4, high: 4 })).toBe(false);
  });

  it('says yes for a difference too small to draw an edge for', () => {
    /* The words and the drawing part company here on purpose: two readings
       two points apart share a step, so the cell stacks rather than splits,
       and /stats still prints "from 50 to 52". */
    expect(coveredGround({ low: 50, high: 52 })).toBe(true);
  });
});
