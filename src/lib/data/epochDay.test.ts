/* Epoch-day round-trip check (ADR-0001), replacing the old plain-Node
   script now that the harness exists (ticket 03). Run under both
   timezones to catch UTC-anchored regressions:

     TZ=America/Los_Angeles npm test -- epochDay
     TZ=Europe/Warsaw npm test -- epochDay

   The LA case is the regression ADR-0001 exists for: west of UTC, a
   UTC-anchored day calculation renders the previous calendar day. */
import { test, expect } from 'vitest';
import { todayEpochDay, epochDayFromLocalDate, localDateFromEpochDay } from './epochDay.ts';

const tz = process.env.TZ ?? '(system default)';

test(`epochDayFromLocalDate(2024-01-01) is 19723 under TZ=${tz}`, () => {
  // Known-good literal, independent of the implementation: 2024-01-01 is
  // epoch day 19723 (1704067200000ms UTC / 86400000ms per day).
  expect(epochDayFromLocalDate(new Date(2024, 0, 1))).toBe(19723);
});

test.for([
  new Date(2024, 0, 15, 0, 0, 0),
  new Date(2024, 0, 15, 22, 0, 0),
  new Date(2024, 0, 15, 23, 59, 59)
])(`round-trip holds regardless of time-of-day under TZ=${tz}`, (d) => {
  const back = localDateFromEpochDay(epochDayFromLocalDate(d));
  expect([back.getFullYear(), back.getMonth(), back.getDate()]).toEqual([
    d.getFullYear(),
    d.getMonth(),
    d.getDate()
  ]);
});

test(`localDateFromEpochDay(todayEpochDay()) matches the device's calendar date under TZ=${tz}`, () => {
  const now = new Date();
  const local = localDateFromEpochDay(todayEpochDay());
  expect([local.getFullYear(), local.getMonth(), local.getDate()]).toEqual([
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ]);
});
