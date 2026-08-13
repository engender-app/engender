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

/** A milestone's calendar month/day in a given year, with 29 February
    falling back to the 28th in a common year rather than rolling into
    March. `new Date(2025, 1, 29)` is 1 March, which is a different day of
    a different month; clamping keeps the anniversary in February, where
    the milestone happened, and means it is never skipped. */
function anniversaryInYear(milestoneDate: Date, year: number): number {
  const daysInMonth = new Date(year, milestoneDate.getMonth() + 1, 0).getDate();
  return epochDayFromLocalDate(
    new Date(year, milestoneDate.getMonth(), Math.min(milestoneDate.getDate(), daysInMonth))
  );
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
