import { describe, expect, it } from 'vitest';

import { epochDayFromDateInputValue, weekdayOfEpochDay } from '../data/epochDay';
import { MAX_POSITIONS, atGrain, bucketByGrain, bucketStart, chooseGrain } from './grain';

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
