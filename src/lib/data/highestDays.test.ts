import { describe, expect, it } from 'vitest';

import type { DayAverage } from './journal/stats';
import type { DayRecords } from './journal/day';
import {
  HIGHEST_DAYS_CAP,
  HIGHEST_DAYS_METRIC,
  highestDays,
  highestMetricKey,
  rankHighestDays
} from './highestDays';

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

/* Which scale the ranking runs on, once the panel got a chooser (phase 9 UX
   carpet ticket 11). The chooser is local to its card, so "nothing chosen"
   is a state this has to answer for on every render, not just the first. */
describe('which scale the ranking runs on', () => {
  it('runs on euphoria until somebody chooses otherwise', () => {
    expect(highestMetricKey(null, ['mood', HIGHEST_DAYS_METRIC, 'femininity'], 'mood')).toBe(
      HIGHEST_DAYS_METRIC
    );
  });

  it('runs on what was chosen', () => {
    expect(highestMetricKey('femininity', ['mood', HIGHEST_DAYS_METRIC, 'femininity'], 'mood')).toBe(
      'femininity'
    );
  });

  /* Nothing falls back to mood by default: naming which scale a high day is
     measured on is this module's decision, and euphoria is the one it made.
     The screen's own metric is the fallback only where euphoria is not kept,
     which is the case the card used to answer by not rendering at all. */
  it('falls back to the screen\'s own scale where euphoria is not kept', () => {
    expect(highestMetricKey(null, ['mood', 'femininity'], 'femininity')).toBe('femininity');
  });

  /* A chosen scale can stop being kept while the choice is still held - the
     person unticks it in settings and comes back to this screen. Ranking a
     scale that is no longer in the journal draws an empty card with a
     control naming something that is gone. */
  it('drops a choice the person has stopped keeping', () => {
    expect(highestMetricKey('femininity', ['mood', HIGHEST_DAYS_METRIC], 'mood')).toBe(
      HIGHEST_DAYS_METRIC
    );
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
