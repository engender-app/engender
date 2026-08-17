/* The wrapped cadence rule (phase 4 features ticket 01). Rune-free and
   import-light for the same reason epochDay.ts is: which period a wrapped
   covers and which one Home offers today are calendar arithmetic, so they
   are decided here as plain deterministic cases rather than inside a screen
   that would need a browser to ask.

   Run under both timezones, like epochDay.test.ts - a wrapped's range is
   built from local calendar days, and the previous-week boundary is the
   piece a UTC-anchored version would move by a day:

     TZ=America/Los_Angeles npm test -- wrapped
     TZ=Europe/Warsaw npm test -- wrapped */
import { test, expect } from 'vitest';
import { epochDayFromLocalDate } from './epochDay.ts';
import {
  WRAPPED_CADENCES,
  WRAPPED_ENTRY_FLOOR,
  WRAPPED_FRESH_DAYS,
  completedWrappedPeriod,
  offeredWrappedPeriod
} from './wrapped.ts';

const tz = process.env.TZ ?? '(system default)';
const day = (year: number, month: number, dayOfMonth: number) =>
  epochDayFromLocalDate(new Date(year, month, dayOfMonth));

test(`each cadence's completed period is the whole period before this one under TZ=${tz}`, () => {
  const today = day(2026, 7, 20); // Thursday 20 August 2026

  expect(completedWrappedPeriod('week', today)).toEqual({
    cadence: 'week',
    start: day(2026, 7, 10),
    end: day(2026, 7, 16),
    year: 2026,
    month: null
  });
  expect(completedWrappedPeriod('month', today)).toEqual({
    cadence: 'month',
    start: day(2026, 6, 1),
    end: day(2026, 6, 31),
    year: 2026,
    month: 6
  });
  expect(completedWrappedPeriod('year', today)).toEqual({
    cadence: 'year',
    start: day(2025, 0, 1),
    end: day(2025, 11, 31),
    year: 2025,
    month: null
  });
});

/* Naming a period is the only thing `year` is for, and the two awkward cases
   are a January month (named by the previous year) and a week that straddles
   New Year (named by the year it finished in). */
test(`a period carries the year it belongs to, across both New Year cases, under TZ=${tz}`, () => {
  const january = completedWrappedPeriod('month', day(2026, 0, 10));
  expect([january.year, january.month]).toEqual([2025, 11]);

  // Friday 1 January 2027: the week before it ran 21-27 December 2026.
  expect(completedWrappedPeriod('week', day(2027, 0, 1)).year).toBe(2026);
  // Monday 4 January 2027: the week before it ran 28 December to 3 January,
  // so it ended in 2027 and is named by that.
  expect(completedWrappedPeriod('week', day(2027, 0, 4)).year).toBe(2027);
});

/* The invariant a wrapped is built on: it reads back a period that is over.
   A range including today would recompute to different numbers every time
   it was opened, which is exactly what "a completed cadence" rules out. */
test(`no cadence's completed period reaches today under TZ=${tz}`, () => {
  for (const today of [day(2027, 0, 1), day(2026, 7, 20), day(2026, 1, 28), day(2026, 11, 31)]) {
    for (const cadence of WRAPPED_CADENCES) {
      const period = completedWrappedPeriod(cadence, today);
      expect(period.end).toBeLessThan(today);
      expect(period.start).toBeLessThanOrEqual(period.end);
    }
  }
});

test(`January offers the year that just ended, for the whole of its window, under TZ=${tz}`, () => {
  // Friday 1 January 2027, the day after 2026 ended.
  expect(offeredWrappedPeriod(day(2027, 0, 1))).toEqual({
    cadence: 'year',
    start: day(2026, 0, 1),
    end: day(2026, 11, 31),
    year: 2026,
    month: null
  });
  // Still the year 30 days later, on the last day of the 31-day window.
  expect(offeredWrappedPeriod(day(2027, 0, 31)).cadence).toBe('year');
});

test(`the year stops being offered once its window has run out under TZ=${tz}`, () => {
  // 1 February 2027 is 32 days past 31 December, so the month takes over.
  expect(offeredWrappedPeriod(day(2027, 1, 1))).toEqual({
    cadence: 'month',
    start: day(2027, 0, 1),
    end: day(2027, 0, 31),
    year: 2027,
    month: 0
  });
});

/* The decision the ranking encodes: a longer cadence outranks a shorter one
   while it is still fresh, even though the shorter one ended more recently.
   14 February is 14 days past January's end and 1 day past the week's, and
   January is what Home offers. */
test(`a fresh month outranks the week that ended more recently under TZ=${tz}`, () => {
  const midFebruary = day(2027, 1, 14);
  expect(completedWrappedPeriod('week', midFebruary).end).toBeGreaterThan(
    completedWrappedPeriod('month', midFebruary).end
  );
  expect(offeredWrappedPeriod(midFebruary).cadence).toBe('month');
});

test(`the week is what is offered once neither longer cadence is fresh under TZ=${tz}`, () => {
  // Monday 15 February 2027: 15 days past January's end.
  expect(offeredWrappedPeriod(day(2027, 1, 15))).toEqual({
    cadence: 'week',
    start: day(2027, 1, 8),
    end: day(2027, 1, 14),
    year: 2027,
    month: null
  });
  // Thursday 20 August 2026: 20 days past July's end.
  expect(offeredWrappedPeriod(day(2026, 7, 20)).cadence).toBe('week');
});

/* The week's own window can never expire - the previous Monday-to-Sunday
   week always ended between one and seven days ago - so there is always
   something on offer, and what keeps Home clear is the entry floor and the
   Settings toggle rather than a day with no wrapped in it. */
test(`some cadence is always on offer, every day of a year, under TZ=${tz}`, () => {
  const firstDay = day(2026, 0, 1);
  for (let today = firstDay; today < firstDay + 365; today++) {
    const period = offeredWrappedPeriod(today);
    expect(WRAPPED_CADENCES).toContain(period.cadence);
    expect(today - period.end).toBeLessThanOrEqual(WRAPPED_FRESH_DAYS[period.cadence]);
  }
});

/* One floor, not one per cadence: a week needing five entries and a year
   needing five is the point of the rule, so a sparse period is judged the
   same way whichever cadence it belongs to. */
test('the entry floor is a single whole number shared by every cadence', () => {
  expect(Number.isInteger(WRAPPED_ENTRY_FLOOR)).toBe(true);
  expect(WRAPPED_ENTRY_FLOOR).toBeGreaterThan(0);
});
