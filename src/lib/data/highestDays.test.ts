import { describe, expect, it } from 'vitest';

import type { DayAverage } from './journal/stats';
import type { DayRecords } from './journal/day';
import { HIGHEST_DAYS_CAP, highestDays, rankHighestDays } from './highestDays';

const point = (day: number, value: number): DayAverage => ({ day, value, count: 1 });

const emptyRecords = { entries: [] } as unknown as DayRecords;

describe('ranking days by euphoria', () => {
  it('says nothing where euphoria has never been logged', () => {
    expect(rankHighestDays(100, [])).toEqual([]);
  });

  it('orders highest first', () => {
    const ranked = rankHighestDays(100, [point(1, 40), point(2, 90), point(3, 60)]);
    expect(ranked.map((p) => p.day)).toEqual([2, 3, 1]);
  });

  it('caps at ten', () => {
    const many = Array.from({ length: 15 }, (_, i) => point(i, i));
    expect(rankHighestDays(100, many)).toHaveLength(HIGHEST_DAYS_CAP);
  });

  it('returns fewer than the cap when fewer days qualify', () => {
    expect(rankHighestDays(100, [point(1, 70), point(2, 80)])).toHaveLength(2);
  });

  /* Day.value ties break on the more recent day, so the same journal
     always produces the same order regardless of input order. */
  it('breaks a tie on the more recent day', () => {
    const ranked = rankHighestDays(100, [point(5, 80), point(9, 80), point(2, 80)]);
    expect(ranked.map((p) => p.day)).toEqual([9, 5, 2]);
  });

  it('drops a row past today rather than trusting the caller\'s bound', () => {
    const ranked = rankHighestDays(10, [point(9, 50), point(11, 99)]);
    expect(ranked.map((p) => p.day)).toEqual([9]);
  });
});

describe('the top days with their day records attached', () => {
  it('carries each ranked day\'s records from the day assembler', async () => {
    const records = new Map<number, DayRecords>([
      [2, { ...emptyRecords, entries: ['e2'] as never } as DayRecords],
      [1, { ...emptyRecords, entries: ['e1'] as never } as DayRecords]
    ]);
    const dayArea = { getDay: async (day: number) => records.get(day)! };

    const result = await highestDays(100, [point(1, 40), point(2, 90)], dayArea);

    expect(result).toEqual([
      { epochDay: 2, value: 90, records: records.get(2) },
      { epochDay: 1, value: 40, records: records.get(1) }
    ]);
  });

  it('says nothing where euphoria has never been logged', async () => {
    const dayArea = { getDay: async () => emptyRecords };
    expect(await highestDays(100, [], dayArea)).toEqual([]);
  });
});
