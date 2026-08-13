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
  anniversaryYears,
  customInclusiveRange,
  nextAnniversaryEpochDay,
  ongoingWindowRange,
  previousCalendarMonthRange,
  previousCalendarYearRange,
  yearToDateRange
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

test(`a 29 February milestone keeps its anniversary on the 28th in a common year, under TZ=${tz}`, () => {
  // Rolling the date forward would put it on 1 March, which is a different
  // day of a different month and belongs to whatever was logged then. The
  // rule is that an anniversary is never skipped and never moves month.
  const milestone = epochDayFromLocalDate(new Date(2024, 1, 29));
  const feb28 = epochDayFromLocalDate(new Date(2025, 1, 28));

  expect(nextAnniversaryEpochDay(milestone, epochDayFromLocalDate(new Date(2025, 0, 1)))).toBe(feb28);
  expect(nextAnniversaryEpochDay(milestone, feb28)).toBe(feb28);
  // The day after, this year's anniversary is behind us rather than ahead.
  expect(nextAnniversaryEpochDay(milestone, feb28 + 1)).toBe(epochDayFromLocalDate(new Date(2026, 1, 28)));
  // And in the next leap year it is back on the 29th.
  expect(nextAnniversaryEpochDay(milestone, epochDayFromLocalDate(new Date(2028, 0, 1)))).toBe(
    epochDayFromLocalDate(new Date(2028, 1, 29))
  );
});

test(`anniversaryYears counts the anniversaries that have arrived, under TZ=${tz}`, () => {
  const milestone = epochDayFromLocalDate(new Date(2023, 2, 1));

  expect(anniversaryYears(milestone, epochDayFromLocalDate(new Date(2024, 1, 29)))).toBe(0);
  expect(anniversaryYears(milestone, epochDayFromLocalDate(new Date(2024, 2, 1)))).toBe(1);
  expect(anniversaryYears(milestone, epochDayFromLocalDate(new Date(2026, 2, 1)))).toBe(3);
});

test(`a 29 February milestone reads as a whole year old on its 28 February anniversary, under TZ=${tz}`, () => {
  // calendarDuration is a day short here - 2025-02-28 is 365 days after
  // 2024-02-29, one short of the calendar year - so the years shown beside
  // an anniversary have to come from the anniversary, not from the gap.
  const milestone = epochDayFromLocalDate(new Date(2024, 1, 29));
  const feb28 = epochDayFromLocalDate(new Date(2025, 1, 28));

  expect(calendarDuration(milestone, feb28).years).toBe(0);
  expect(anniversaryYears(milestone, feb28)).toBe(1);
  expect(anniversaryYears(milestone, feb28 - 1)).toBe(0);
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

test(`previousCalendarYearRange covers the leap year offered by a January recap under TZ=${tz}`, () => {
  const range = previousCalendarYearRange(epochDayFromLocalDate(new Date(2025, 0, 10)));
  expect(range.year).toBe(2024);
  expect(range.start).toBe(epochDayFromLocalDate(new Date(2024, 0, 1)));
  expect(range.end).toBe(epochDayFromLocalDate(new Date(2024, 11, 31)));
});

test(`ongoingWindowRange(7) includes today and the six days before under TZ=${tz}`, () => {
  const today = epochDayFromLocalDate(new Date(2026, 7, 13));
  expect(ongoingWindowRange(today, 7)).toEqual({ start: today - 6, end: today, days: 7 });
});

test(`ongoingWindowRange(30) stays inclusive under TZ=${tz}`, () => {
  const today = epochDayFromLocalDate(new Date(2026, 7, 13));
  const range = ongoingWindowRange(today, 30);
  expect(range.start).toBe(today - 29);
  expect(range.end).toBe(today);
  expect(range.days).toBe(30);
});

test(`ongoingWindowRange(90) stays inclusive under TZ=${tz}`, () => {
  const today = epochDayFromLocalDate(new Date(2026, 7, 13));
  const range = ongoingWindowRange(today, 90);
  expect(range.start).toBe(today - 89);
  expect(range.end).toBe(today);
  expect(range.days).toBe(90);
});

test(`yearToDateRange starts on local January 1 and ends on today under TZ=${tz}`, () => {
  const today = epochDayFromLocalDate(new Date(2026, 7, 13));
  expect(yearToDateRange(today)).toEqual({
    start: epochDayFromLocalDate(new Date(2026, 0, 1)),
    end: today,
    year: 2026
  });
});

test(`customInclusiveRange requires both boundaries under TZ=${tz}`, () => {
  const start = epochDayFromLocalDate(new Date(2026, 7, 1));
  const end = epochDayFromLocalDate(new Date(2026, 7, 13));
  expect(customInclusiveRange(null, end)).toBeNull();
  expect(customInclusiveRange(start, null)).toBeNull();
});

test(`customInclusiveRange keeps both inclusive boundaries, including today, under TZ=${tz}`, () => {
  const start = epochDayFromLocalDate(new Date(2026, 7, 1));
  const end = epochDayFromLocalDate(new Date(2026, 7, 13));
  expect(customInclusiveRange(start, end)).toEqual({ start, end });
});

test(`customInclusiveRange rejects reversed boundaries under TZ=${tz}`, () => {
  const start = epochDayFromLocalDate(new Date(2026, 7, 13));
  const end = epochDayFromLocalDate(new Date(2026, 7, 1));
  expect(customInclusiveRange(start, end)).toBeNull();
});
