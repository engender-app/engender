/* The on-this-day lookback rule (phase 4 features ticket 03). Rune-free and
   import-light for the same reason wrapped.test.ts is - run under both
   timezones:

     TZ=America/Los_Angeles npm test -- on-this-day
     TZ=Europe/Warsaw npm test -- on-this-day */
import { test, expect } from 'vitest';
import { epochDayFromLocalDate } from './epochDay.ts';
import { ON_THIS_DAY_LOOKBACKS, onThisDayCandidates } from './on-this-day.ts';

const tz = process.env.TZ ?? '(system default)';
const day = (year: number, month: number, dayOfMonth: number) =>
  epochDayFromLocalDate(new Date(year, month, dayOfMonth));

test(`each lookback names a calendar day this many months before today, under TZ=${tz}`, () => {
  const today = day(2026, 7, 20); // Thursday 20 August 2026

  expect(onThisDayCandidates(today)).toEqual([
    { key: 'year', epochDay: day(2025, 7, 20) },
    { key: 'sixMonths', epochDay: day(2026, 1, 20) },
    { key: 'month', epochDay: day(2026, 6, 20) }
  ]);
});

test(`the three lookbacks are longest first, under TZ=${tz}`, () => {
  expect(ON_THIS_DAY_LOOKBACKS.map((l) => l.key)).toEqual(['year', 'sixMonths', 'month']);
});
