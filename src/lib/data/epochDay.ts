/* Pure epoch-day arithmetic — no imports, so the TZ round-trip check
   (epochDay.test.ts) can run under plain Node with no build step. Every
   module that needs epoch-day arithmetic imports straight from here;
   dates.ts (the paraglide-bound layer above it) only formats what this
   module computes (ADR-0016) — it does not re-export this file's
   functions as a pass-through.

   An epoch day is the local calendar day (ADR-0001): days since 1970-01-01
   counted from a Date's local year/month/day, never from its UTC clock
   time. Date.UTC(y, m, d) is used only to count days between two calendar
   dates — it never represents a real instant here. */

const DAY = 86400000;

export function todayEpochDay(): number {
  return epochDayFromLocalDate(new Date());
}

export function epochDayFromLocalDate(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY);
}

export function localDateFromEpochDay(epochDay: number): Date {
  const utc = new Date(epochDay * DAY);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

/** Which epoch day a moment in time falls on, in the device's local timezone. */
export function epochDayFromTimestamp(ts: number): number {
  return epochDayFromLocalDate(new Date(ts));
}

/** The timestamp of local midnight at the start of an epoch day. Not
    `epochDay * DAY`: that's a UTC instant and drifts from local midnight
    by the zone's offset, and by an extra hour on either side of a DST
    transition. */
export function startOfDayTimestamp(epochDay: number): number {
  return localDateFromEpochDay(epochDay).getTime();
}

/** The instant a local wall-clock time falls at on an epoch day, from the
    'HH:MM' text such times are stored as (reminder.time, lab_result
    .draw_time). Built by setting the hours on the day's local Date rather
    than by adding an offset to startOfDayTimestamp: 09:00 is 09:00 on both
    sides of a DST transition, which a fixed millisecond offset from local
    midnight is not. */
export function timestampAtLocalTime(epochDay: number, time: string): number {
  const [h, mi] = time.split(':').map(Number);
  const d = localDateFromEpochDay(epochDay);
  d.setHours(h, mi, 0, 0);
  return d.getTime();
}

/** `<input type="date">` value → epoch day, or null for the empty string.
    The single place that guard lives; callers fall back with `?? …`. */
export function epochDayFromDateInputValue(value: string): number | null {
  if (!value) return null;
  const [y, mo, d] = value.split('-').map(Number);
  return epochDayFromLocalDate(new Date(y, mo - 1, d));
}

/** Epoch day → `<input type="date">` value. */
export function dateInputValueFromEpochDay(epochDay: number): string {
  const d = localDateFromEpochDay(epochDay);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface CalendarDuration {
  years: number;
  months: number;
  days: number;
}

/** The gap between two epoch days as whole calendar years, whole calendar
    months and remaining days — never `/365`, `/365.25` or `/30`, so
    `months` is always 0–11 and a same-length gap reads the same regardless
    of which months it happens to cross. Order-independent. */
export function calendarDuration(fromEpochDay: number, toEpochDay: number): CalendarDuration {
  const lo = Math.min(fromEpochDay, toEpochDay);
  const hi = Math.max(fromEpochDay, toEpochDay);
  const a = localDateFromEpochDay(lo);
  const b = localDateFromEpochDay(hi);
  let years = b.getFullYear() - a.getFullYear();
  let months = b.getMonth() - a.getMonth();
  let days = b.getDate() - a.getDate();
  if (days < 0) {
    months -= 1;
    days += new Date(b.getFullYear(), b.getMonth(), 0).getDate(); // days in the month before b
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months, days };
}

/** A year/month/day clamped to the target month's length before becoming an
    epoch day - `new Date(2025, 1, 29)` is 1 March, a different day of a
    different month, so this is what keeps a 29 February anniversary in
    February and a 31 October lookback in September rather than rolling
    into the next month. */
function clampedEpochDay(year: number, month: number, day: number): number {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return epochDayFromLocalDate(new Date(year, month, Math.min(day, daysInMonth)));
}

/** A milestone's calendar month/day in a given year, with 29 February
    falling back to the 28th in a common year rather than rolling into
    March: clamping keeps the anniversary in February, where the milestone
    happened, and means it is never skipped. */
function anniversaryInYear(milestoneDate: Date, year: number): number {
  return clampedEpochDay(year, milestoneDate.getMonth(), milestoneDate.getDate());
}

/** The next occurrence of a milestone's calendar month/day that falls on
    or after `onOrAfterEpochDay` — the recurring-yearly anniversary
    (CONTEXT.md), not `milestoneEpochDay + n * 365`, which drifts across
    leap years. Returns `onOrAfterEpochDay` itself when today already is
    the anniversary. */
export function nextAnniversaryEpochDay(milestoneEpochDay: number, onOrAfterEpochDay: number): number {
  const m = localDateFromEpochDay(milestoneEpochDay);
  const refYear = localDateFromEpochDay(onOrAfterEpochDay).getFullYear();
  const thisYear = anniversaryInYear(m, refYear);
  return thisYear >= onOrAfterEpochDay ? thisYear : anniversaryInYear(m, refYear + 1);
}

/** How many of a past milestone's anniversaries have arrived by
    `onEpochDay`: the year difference, less one while this year's is still
    ahead. Not `calendarDuration().years`, which measures the gap and is
    therefore a day short on a 29 February milestone's 28 February
    anniversary - the one day the two disagree, and the day a milestone
    would otherwise announce "0 years" while flagging itself as an
    anniversary. Only meaningful for a milestone in the past. */
export function anniversaryYears(milestoneEpochDay: number, onEpochDay: number): number {
  const m = localDateFromEpochDay(milestoneEpochDay);
  const refYear = localDateFromEpochDay(onEpochDay).getFullYear();
  return refYear - m.getFullYear() - (anniversaryInYear(m, refYear) > onEpochDay ? 1 : 0);
}

/** The epoch day this many calendar months before `epochDay`, clamped the
    same way `anniversaryInYear` clamps a year back - 31 October minus one
    month lands on 30 September, not 1 November via rollover. On-this-day
    (ticket 03) is the caller: a month, six months and a year are all "this
    many calendar months back" once a year is written as twelve. */
export function epochDayMonthsAgo(epochDay: number, months: number): number {
  const d = localDateFromEpochDay(epochDay);
  const totalMonths = d.getFullYear() * 12 + d.getMonth() - months;
  const year = Math.floor(totalMonths / 12);
  const month = ((totalMonths % 12) + 12) % 12;
  return clampedEpochDay(year, month, d.getDate());
}

export interface CalendarWeekRange {
  start: number;
  end: number;
}

/** The Monday-to-Sunday week before the one `epochDay` falls in.

    Monday-first because the calendar heat-map already is, and because a
    weekly wrapped covering a different seven days than Home's own week
    strip would be reading back a week the person never saw. Computed from
    the epoch day's own arithmetic rather than `getDay()`: epoch day 0 was a
    Thursday, so `+ 3` lands the modulo on Monday, and Sunday comes out as 6
    - the last day of its week - instead of the 0 that `getDay()` reports
    and that would push the boundary a day late.

    The modulo is taken twice because JavaScript's `%` keeps the sign of its
    left operand: a day before 1969-12-29 is a negative epoch day, and one
    `%` alone hands back a negative remainder, which puts "this Monday"
    *after* the day asked about and returns the week the day is still in.
    Nothing calls this with a date that old today - it is only ever asked
    about today - but this file is the one every module takes its epoch-day
    arithmetic from, and a helper here that is wrong for a whole range of
    inputs is a trap for the next caller rather than a saving. */
export function previousCalendarWeekRange(epochDay: number): CalendarWeekRange {
  const daysSinceMonday = (((epochDay + 3) % 7) + 7) % 7;
  const thisMonday = epochDay - daysSinceMonday;
  return { start: thisMonday - 7, end: thisMonday - 1 };
}

export interface CalendarMonthRange {
  start: number;
  end: number;
  year: number;
  month: number;
}

/** The calendar month before the one `epochDay` falls in, as an epoch-day
    range plus the year/month pair (month 0-based) for naming it. */
export function previousCalendarMonthRange(epochDay: number): CalendarMonthRange {
  const d = localDateFromEpochDay(epochDay);
  const year = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
  const month = (d.getMonth() + 11) % 12;
  return {
    start: epochDayFromLocalDate(new Date(year, month, 1)),
    end: epochDayFromLocalDate(new Date(year, month + 1, 0)),
    year,
    month
  };
}

export interface CalendarYearRange {
  start: number;
  end: number;
  year: number;
}

/** The calendar year before the one `epochDay` falls in. January offers
    this range as the completed year recap (PRD F29). */
export function previousCalendarYearRange(epochDay: number): CalendarYearRange {
  const year = localDateFromEpochDay(epochDay).getFullYear() - 1;
  return {
    start: epochDayFromLocalDate(new Date(year, 0, 1)),
    end: epochDayFromLocalDate(new Date(year, 11, 31)),
    year
  };
}

export interface OngoingWindowRange {
  start: number;
  end: number;
  days: number;
}

/** An ongoing inclusive window ending on `todayEpochDay`. */
export function ongoingWindowRange(todayEpochDay: number, days: number): OngoingWindowRange {
  const width = Math.max(1, Math.floor(days));
  return {
    start: todayEpochDay - width + 1,
    end: todayEpochDay,
    days: width
  };
}

/** The inclusive range from local 1 January of this year through today. */
export function yearToDateRange(todayEpochDay: number): CalendarYearRange {
  const year = localDateFromEpochDay(todayEpochDay).getFullYear();
  return {
    start: epochDayFromLocalDate(new Date(year, 0, 1)),
    end: todayEpochDay,
    year
  };
}

/** A custom inclusive range, requiring both boundaries and start <= end. */
export function customInclusiveRange(
  startEpochDay: number | null,
  endEpochDay: number | null
): { start: number; end: number } | null {
  if (startEpochDay === null || endEpochDay === null) return null;
  if (startEpochDay > endEpochDay) return null;
  return { start: startEpochDay, end: endEpochDay };
}
