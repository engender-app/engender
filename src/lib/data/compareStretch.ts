/* The preceding window a tryout or a procedure's own stretch is compared
   against (phase 8 features ticket 18). Pure arithmetic over epoch days,
   kept apart from journal/stats.ts the same reason epochDay.ts's other
   range functions are: today and the journal's own edges arrive as
   arguments, and nothing here reads the clock or the database.

   `/compare` itself is unchanged (ADR-0012's "two sides, no delta" stands)
   - this only supplies the two sides a tryout or a procedure record hands
   it, as plain date-range query parameters. */

import { dateInputValueFromEpochDay } from './epochDay';

export interface EpochRange {
  start: number;
  end: number;
}

/** The same-length window immediately before `stretch`, both ends
    inclusive. A one-day stretch is compared against the one day before
    it, the same shorthand a calendar week or month already uses. */
export function precedingWindow(stretch: EpochRange): EpochRange {
  const length = stretch.end - stretch.start + 1;
  return { start: stretch.start - length, end: stretch.start - 1 };
}

/** Whether `stretch` sits too early in the journal for a same-length
    window before it to hold any real day: the preceding window's last day
    falls before the journal's own first one, or there is no journal to
    measure against yet. Distinct from a preceding window that exists but
    has nothing logged in it - that is a real gap in the journal, not a
    structurally missing one, and is answered by the entry count `/compare`
    itself already reads, not by this. */
export function stretchTooShortToCompare(stretch: EpochRange, journalFirstEpochDay: number | null): boolean {
  if (journalFirstEpochDay === null) return true;
  return precedingWindow(stretch).end < journalFirstEpochDay;
}

/** The `/compare` path a "compare this stretch" link opens: `stretch` as
    side A and `preceding` as side B, in the same date-range query
    parameters a person filling in the two pickers by hand would produce.
    `/compare` reads these once, on arrival, the same way `/settings/eras`
    reads `start` (settings/eras/+page.svelte). */
export function compareStretchQuery(stretch: EpochRange, preceding: EpochRange): string {
  const params = new URLSearchParams({
    aStart: dateInputValueFromEpochDay(stretch.start),
    aEnd: dateInputValueFromEpochDay(stretch.end),
    bStart: dateInputValueFromEpochDay(preceding.start),
    bEnd: dateInputValueFromEpochDay(preceding.end)
  });
  return `/compare?${params}`;
}
