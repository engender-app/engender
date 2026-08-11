/* Epoch-day round-trip check (ADR-0001), replacing the old plain-Node
   script now that the harness exists (ticket 03). Run under both
   timezones to catch UTC-anchored regressions:

     TZ=America/Los_Angeles npm test -- epochDay
     TZ=Europe/Warsaw npm test -- epochDay

   The LA case is the regression ADR-0001 exists for: west of UTC, a
   UTC-anchored day calculation renders the previous calendar day. */
import { test, expect } from 'vitest';
import {
  todayEpochDay,
  epochDayFromLocalDate,
  localDateFromEpochDay,
  epochDayFromTimestamp,
  startOfDayTimestamp,
  epochDayFromDateInputValue,
  dateInputValueFromEpochDay,
  calendarDuration,
  nextAnniversaryEpochDay,
  previousCalendarMonthRange
} from './epochDay.ts';

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

test(`epochDayFromTimestamp round-trips with epochDayFromLocalDate under TZ=${tz}`, () => {
  const d = new Date(2024, 5, 10, 23, 30);
  expect(epochDayFromTimestamp(d.getTime())).toBe(epochDayFromLocalDate(d));
});

test(`startOfDayTimestamp is not epochDay * 86400000 across a DST transition under TZ=${tz}`, () => {
  // A UTC-anchored day is always exactly 86400000ms; a real local day is
  // 23 or 25 hours on the day the clocks change. Skipped outside the two
  // zones this ticket names, since other zones may not observe DST at all.
  if (tz !== 'Europe/Warsaw' && tz !== 'America/Los_Angeles') return;
  const springForward =
    tz === 'Europe/Warsaw'
      ? epochDayFromLocalDate(new Date(2024, 2, 31)) // last Sunday of March
      : epochDayFromLocalDate(new Date(2024, 2, 10)); // second Sunday of March
  const before = startOfDayTimestamp(springForward);
  const after = startOfDayTimestamp(springForward + 1);
  expect(after - before).toBe(23 * 3600000);
});

test(`startOfDayTimestamp spans a full 86400000ms on an ordinary day under TZ=${tz}`, () => {
  const day = epochDayFromLocalDate(new Date(2024, 6, 15));
  expect(startOfDayTimestamp(day + 1) - startOfDayTimestamp(day)).toBe(86400000);
});

test(`epochDayFromDateInputValue round-trips with dateInputValueFromEpochDay under TZ=${tz}`, () => {
  const day = epochDayFromLocalDate(new Date(2024, 2, 1));
  expect(dateInputValueFromEpochDay(day)).toBe('2024-03-01');
  expect(epochDayFromDateInputValue('2024-03-01')).toBe(day);
});

test(`epochDayFromDateInputValue returns null for the empty string under TZ=${tz}`, () => {
  expect(epochDayFromDateInputValue('')).toBeNull();
});

test(`calendarDuration never carries a 364-day gap as 12 months under TZ=${tz}`, () => {
  const from = epochDayFromLocalDate(new Date(2023, 0, 1));
  const to = epochDayFromLocalDate(new Date(2023, 11, 31)); // 364 days later
  expect(calendarDuration(from, to)).toEqual({ years: 0, months: 11, days: 30 });
});

test(`calendarDuration puts a 421-day gap at 1 year, not 14 months, under TZ=${tz}`, () => {
  const from = epochDayFromLocalDate(new Date(2023, 0, 1));
  const to = from + 421;
  const d = calendarDuration(from, to);
  expect(d.years).toBe(1);
  expect(d.months).toBeLessThanOrEqual(11);
});

test(`calendarDuration.months is always 0-11 regardless of gap length under TZ=${tz}`, () => {
  const from = epochDayFromLocalDate(new Date(2020, 0, 1));
  for (const gap of [10, 100, 364, 365, 400, 421, 1000, 3000]) {
    const { months } = calendarDuration(from, from + gap);
    expect(months).toBeGreaterThanOrEqual(0);
    expect(months).toBeLessThanOrEqual(11);
  }
});

test(`calendarDuration is order-independent under TZ=${tz}`, () => {
  const a = epochDayFromLocalDate(new Date(2022, 3, 15));
  const b = epochDayFromLocalDate(new Date(2024, 6, 2));
  expect(calendarDuration(a, b)).toEqual(calendarDuration(b, a));
});

test(`nextAnniversaryEpochDay finds the milestone's calendar date every year, across a leap year, under TZ=${tz}`, () => {
  // A milestone set on 2023-03-01 (non-leap) is 366 days before its first
  // anniversary because 2024 is a leap year — the exact case the old
  // `% 365` check got wrong. The correct anniversary is still 2024-03-01.
  const milestone = epochDayFromLocalDate(new Date(2023, 2, 1));
  const today = epochDayFromLocalDate(new Date(2024, 2, 1));
  expect(nextAnniversaryEpochDay(milestone, today)).toBe(today);
});

test(`nextAnniversaryEpochDay rolls to next year once this year's date has passed, under TZ=${tz}`, () => {
  const milestone = epochDayFromLocalDate(new Date(2023, 2, 1));
  const today = epochDayFromLocalDate(new Date(2024, 2, 2));
  const next = nextAnniversaryEpochDay(milestone, today);
  expect(localDateFromEpochDay(next).getFullYear()).toBe(2025);
  expect(localDateFromEpochDay(next).getMonth()).toBe(2);
  expect(localDateFromEpochDay(next).getDate()).toBe(1);
});

test(`nextAnniversaryEpochDay finds this year's date when it is still ahead, under TZ=${tz}`, () => {
  const milestone = epochDayFromLocalDate(new Date(2023, 2, 1));
  const today = epochDayFromLocalDate(new Date(2024, 1, 15));
  expect(nextAnniversaryEpochDay(milestone, today)).toBe(epochDayFromLocalDate(new Date(2024, 2, 1)));
});

test(`previousCalendarMonthRange covers a leap February under TZ=${tz}`, () => {
  const range = previousCalendarMonthRange(epochDayFromLocalDate(new Date(2024, 2, 15)));
  expect(range.year).toBe(2024);
  expect(range.month).toBe(1);
  expect(range.start).toBe(epochDayFromLocalDate(new Date(2024, 1, 1)));
  expect(range.end).toBe(epochDayFromLocalDate(new Date(2024, 1, 29)));
});

test(`previousCalendarMonthRange crosses the year boundary in January under TZ=${tz}`, () => {
  const range = previousCalendarMonthRange(epochDayFromLocalDate(new Date(2024, 0, 10)));
  expect(range.year).toBe(2023);
  expect(range.month).toBe(11);
  expect(range.start).toBe(epochDayFromLocalDate(new Date(2023, 11, 1)));
  expect(range.end).toBe(epochDayFromLocalDate(new Date(2023, 11, 31)));
});
