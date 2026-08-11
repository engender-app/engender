/* Pure epoch-day arithmetic — no imports, so it can run under plain Node for
   the TZ round-trip check (tests/epoch-day.test.mjs); there is no unit test
   harness yet. dates.ts re-exports everything here; nothing else should
   import this file directly.

   An epoch day is the local calendar day (ADR-0001): days since 1970-01-01
   counted from a Date's local year/month/day, never from its UTC clock
   time. Date.UTC(y, m, d) is used only to count days between two calendar
   dates — it never represents a real instant here. */

export const DAY = 86400000;

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
