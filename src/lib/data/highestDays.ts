/* The top days on one of the person's own readings (phase 8 features
   ticket 20, ADR-0010, ADR-0012).

   `byDay` is a `dayAverages(key, ...)` result the caller already fetched,
   for whichever scale the panel is ranking - a scale that has never been
   logged hands this an empty array.

   Which scale that is used to be fixed here at euphoria_dysphoria, and the
   panel simply did not render for somebody who does not keep it. Phase 9
   carpet ticket 11 gave the panel a chooser, so the decision moved into
   `highestMetricKey` rather than out of this module: naming which scale a
   high day is measured on is still this module's call, and euphoria is
   still the call it makes until a person says otherwise.

   `rankHighestDays` is the pure half and the one this module's tests hold
   to TDD: sorting is all it does. It still takes `todayEpochDay` and
   drops anything past it, rather than trusting that whatever fetched
   `byDay` already bounded it. Ties break on the more recent day so the same journal
   always produces the same list.

   `highestDays` is the thin async half: it ranks, then asks the day
   assembler (journal/day.ts) for each ranked day's other records, so a
   high day arrives with its context rather than as a number. Nothing
   here or in the panel that reads this may call it "best" - the module's
   own name is the guard against a caption drifting there later. */

import type { DayAverage } from './journal/stats';
import type { DayArea, DayRecords } from './journal/day';

/** How many days the ranking names. Not configurable behind a preference,
    or any other way - the ticket that asked for this asked for ten and no
    bottom ten. */
/* HIGHEST_DAYS_CAP stays exported only for its own test (AU-09 test-only
   review). */
export const HIGHEST_DAYS_CAP = 10;

/** The scale a high day is measured on where nobody has said otherwise.
    A dimension on the person's own 0-to-100 scale (ADR-0012). */
export const HIGHEST_DAYS_METRIC = 'euphoria_dysphoria';

/** Which scale the panel ranks by: what the chooser holds, then euphoria,
    then whatever the screen is already showing.

    The chooser is local to its card, so `chosen` is null on arrival and
    stays null until somebody moves it - and a choice can outlive the scale
    it names, since the person can untick a dimension in settings and come
    back. Both cases end on a key that is actually in `available`. */
export function highestMetricKey(
  chosen: string | null,
  available: string[],
  fallback: string
): string {
  if (chosen && available.includes(chosen)) return chosen;
  if (available.includes(HIGHEST_DAYS_METRIC)) return HIGHEST_DAYS_METRIC;
  return fallback;
}

interface HighestDay {
  epochDay: number;
  value: number;
  records: DayRecords;
}

/** The top `HIGHEST_DAYS_CAP` days by euphoria_dysphoria, highest first. */
export function rankHighestDays(todayEpochDay: number, byDay: DayAverage[]): DayAverage[] {
  return byDay
    .filter((point) => point.day <= todayEpochDay)
    .sort((a, b) => b.value - a.value || b.day - a.day)
    .slice(0, HIGHEST_DAYS_CAP);
}

/** The top `HIGHEST_DAYS_CAP` days by euphoria_dysphoria, each with what the
    day assembler holds for it. */
export async function highestDays(
  todayEpochDay: number,
  byDay: DayAverage[],
  dayArea: Pick<DayArea, 'getDay'>
): Promise<HighestDay[]> {
  const ranked = rankHighestDays(todayEpochDay, byDay);
  return Promise.all(
    ranked.map(async (point) => ({
      epochDay: point.day,
      value: point.value,
      records: await dayArea.getDay(point.day)
    }))
  );
}
