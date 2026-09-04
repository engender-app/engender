/* The top days on the person's own euphoria reading (phase 8 features
   ticket 20, ADR-0010, ADR-0012).

   euphoria_dysphoria is a dimension on the person's own 0-to-100 scale
   (ADR-0012), so `byDay` is a `dayAverages('euphoria_dysphoria', ...)`
   result the caller already fetched - a journal that has never used the
   dimension hands this an empty array, and there is no fallback to mood
   to write here.

   `rankHighestDays` is the pure half and the one this ticket's tests hold
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
export const HIGHEST_DAYS_CAP = 10;

export interface HighestDay {
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
