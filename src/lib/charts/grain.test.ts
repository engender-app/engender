import { describe, expect, it } from 'vitest';

import { epochDayFromDateInputValue, weekdayOfEpochDay } from '../data/epochDay';
import { MAX_POSITIONS, alignSeries, atGrain, bucketByGrain, bucketStart, chooseGrain } from './grain';

const day = (value: string) => epochDayFromDateInputValue(value) as number;

describe('how coarse a chart draws', () => {
  it('reads a week and a month day by day', () => {
    expect(chooseGrain(7)).toBe('day');
    expect(chooseGrain(31)).toBe('day');
    expect(chooseGrain(MAX_POSITIONS)).toBe('day');
  });

  it('reads a quarter and a year week by week', () => {
    expect(chooseGrain(90)).toBe('week');
    expect(chooseGrain(365)).toBe('week');
  });

  it('reads several years month by month', () => {
    expect(chooseGrain(365 * 3)).toBe('month');
    expect(chooseGrain(365 * 20)).toBe('month');
  });

  /* The rule is "the coarsest grain that is not needed", so a choice comes
     out under the cap wherever a grain can hold it. Month is the floor: a
     decade is 120 months and there is nothing coarser to fall back to, so
     that case is named rather than asserted away. */
  it('keeps every range a grain can hold inside the card', () => {
    for (const span of [7, 30, 61, 90, 180, 365, 800, 1800]) {
      const grain = chooseGrain(span);
      const perBucket = grain === 'day' ? 1 : grain === 'week' ? 7 : 30.44;
      expect(span / perBucket, `${span} days at ${grain}`).toBeLessThanOrEqual(MAX_POSITIONS + 1);
    }
  });

  it('draws a decade at the month grain and lets it be dense', () => {
    expect(chooseGrain(365 * 10)).toBe('month');
  });
});

describe('where a bucket starts', () => {
  it('leaves a day alone', () => {
    expect(bucketStart(day('2026-06-17'), 'day')).toBe(day('2026-06-17'));
  });

  it('takes a week back to its Monday', () => {
    // 17 June 2026 is a Wednesday.
    expect(weekdayOfEpochDay(day('2026-06-17'))).toBe(2);
    expect(bucketStart(day('2026-06-17'), 'week')).toBe(day('2026-06-15'));
    expect(bucketStart(day('2026-06-15'), 'week')).toBe(day('2026-06-15'));
    expect(bucketStart(day('2026-06-21'), 'week')).toBe(day('2026-06-15'));
  });

  it('takes a month back to its first', () => {
    expect(bucketStart(day('2026-06-17'), 'month')).toBe(day('2026-06-01'));
    expect(bucketStart(day('2026-06-01'), 'month')).toBe(day('2026-06-01'));
    expect(bucketStart(day('2026-12-31'), 'month')).toBe(day('2026-12-01'));
  });
});

describe('a range read at one grain', () => {
  const points = [
    { x: day('2026-06-15'), y: 2 },
    { x: day('2026-06-16'), y: 4 },
    { x: day('2026-06-22'), y: 5 },
    { x: day('2026-07-06'), y: 1 }
  ];

  it('averages the days inside each bucket, oldest first', () => {
    const weeks = bucketByGrain(points, 'week');
    expect(weeks).toEqual([
      { x: day('2026-06-15'), y: 3, days: 2 },
      { x: day('2026-06-22'), y: 5, days: 1 },
      { x: day('2026-07-06'), y: 1, days: 1 }
    ]);
  });

  /* The bucket with nothing in it - the week of 29 June - is absent rather
     than zero. "Said nothing" is not "said none". */
  it('leaves an empty bucket out rather than drawing it as zero', () => {
    expect(bucketByGrain(points, 'week').map((p) => p.x)).not.toContain(day('2026-06-29'));
  });

  it('averages over the days that carried a value, not over the bucket', () => {
    // One entry in a whole month is that entry, not a month divided by 30.
    expect(bucketByGrain([{ x: day('2026-06-17'), y: 4 }], 'month')).toEqual([
      { x: day('2026-06-01'), y: 4, days: 1 }
    ]);
  });

  it('is the identity at the day grain, in order', () => {
    const shuffled = [...points].reverse();
    expect(bucketByGrain(shuffled, 'day')).toEqual(points.map((p) => ({ ...p, days: 1 })));
  });

  it('chooses and buckets in one call, so the two cannot disagree', () => {
    const year = Array.from({ length: 300 }, (_, i) => ({ x: day('2026-01-01') + i, y: 3 }));
    const read = atGrain(year, 300);
    expect(read.grain).toBe('week');
    expect(read.points.length).toBeLessThanOrEqual(MAX_POSITIONS);
    expect(read.points.length).toBeGreaterThan(40);
  });
});

describe('two series read onto one set of positions', () => {
  const mon = day('2026-06-01');
  const tue = day('2026-06-02');
  const wed = day('2026-06-03');
  const thu = day('2026-06-04');
  const at = (x: number, y: number) => ({ x, y, days: 1 });

  it('keeps the union of both series positions, oldest first', () => {
    const rows = alignSeries([at(mon, 1), at(wed, 3)], [at(tue, 20), at(thu, 40)]);
    expect(rows.map((r) => r.x)).toEqual([mon, tue, wed, thu]);
  });

  it('carries each series own reading where it has one', () => {
    const rows = alignSeries([at(mon, 1), at(wed, 3)], [at(mon, 20), at(wed, 40)]);
    expect(rows.map((r) => [r.a, r.b])).toEqual([
      [1, 20],
      [3, 40]
    ]);
  });

  /* A position the other series introduced carries nothing for this one.
     The line still crosses that stretch - charts/geometry's bridgeGaps puts
     it there for the drawing - but a reading is a thing a person logged, and
     the readout under a finger has to be able to say there was none. */
  it('leaves a position the other series introduced empty', () => {
    const rows = alignSeries([at(mon, 1), at(wed, 3)], [at(tue, 20)]);
    expect(rows.map((r) => r.a)).toEqual([1, null, 3]);
  });

  /* Outside a series' own span, same answer for the same reason: before a
     metric was first logged there is nothing it read. */
  it('leaves a series empty before it starts and after it ends', () => {
    const rows = alignSeries([at(mon, 1), at(tue, 2)], [at(wed, 30), at(thu, 40)]);
    expect(rows.map((r) => r.a)).toEqual([1, 2, null, null]);
    expect(rows.map((r) => r.b)).toEqual([null, null, 30, 40]);
  });

  it('gives a one-bucket series that one position and nothing either side', () => {
    const rows = alignSeries([at(mon, 1), at(wed, 3)], [at(tue, 20)]);
    expect(rows.map((r) => r.b)).toEqual([null, 20, null]);
  });

  it('reads one series alone as itself', () => {
    const rows = alignSeries([at(mon, 1), at(tue, 2)], []);
    expect(rows).toEqual([
      { x: mon, a: 1, b: null },
      { x: tue, a: 2, b: null }
    ]);
  });

  it('has nothing to say about two empty series', () => {
    expect(alignSeries([], [])).toEqual([]);
  });

  it('folds two buckets logged at the same position into one row', () => {
    const rows = alignSeries([at(mon, 1), at(tue, 2)], [at(mon, 20), at(tue, 40)]);
    expect(rows).toHaveLength(2);
  });
});
