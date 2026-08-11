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

/** The next occurrence of a milestone's calendar month/day that falls on
    or after `onOrAfterEpochDay` — the recurring-yearly anniversary
    (CONTEXT.md), not `milestoneEpochDay + n * 365`, which drifts across
    leap years. Returns `onOrAfterEpochDay` itself when today already is
    the anniversary. */
export function nextAnniversaryEpochDay(milestoneEpochDay: number, onOrAfterEpochDay: number): number {
  const m = localDateFromEpochDay(milestoneEpochDay);
  const ref = localDateFromEpochDay(onOrAfterEpochDay);
  const thisYear = epochDayFromLocalDate(new Date(ref.getFullYear(), m.getMonth(), m.getDate()));
  return thisYear >= onOrAfterEpochDay
    ? thisYear
    : epochDayFromLocalDate(new Date(ref.getFullYear() + 1, m.getMonth(), m.getDate()));
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
