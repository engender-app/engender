/* Pure logic for resurfacing consent (phase 6 ticket 05, ADR-0049, CONTEXT:
   "Resurfacing consent"): whether a stretch of days a resurfacing surface is
   about to show touches an era the person muted.

   One function, read by every resurfacing surface - on-this-day, Wrapped and
   their Home tiles - rather than each re-deriving its own overlap check, the
   same reason eraForDay is one function and not one per caller. A single day
   is the degenerate case of a range, so on-this-day's per-lookback check and
   Wrapped's per-period check are the same call with fromEpochDay = toEpochDay.

   Kept apart from eras.ts the way eras.ts already sits apart from
   journal/eras.ts: this reads two areas' rows together (era, era_mute) and
   neither of those areas' own files does. */

import type { EraSpan } from './eras';

/** Whether `era`'s span overlaps [fromEpochDay, toEpochDay] at all - not
    just whether one of the range's own endpoints falls inside it, which
    would miss a muted era entirely contained inside a wider range (a week
    muted in the middle of a year someone wrapped). */
function eraOverlapsRange(era: EraSpan, fromEpochDay: number, toEpochDay: number): boolean {
  const eraStartsAfterRange = era.startEpochDay !== null && era.startEpochDay > toEpochDay;
  const eraEndsBeforeRange = era.endEpochDay !== null && era.endEpochDay < fromEpochDay;
  return !eraStartsAfterRange && !eraEndsBeforeRange;
}

/** Whether any day in [fromEpochDay, toEpochDay] falls inside a muted era.
    A day in no era, or in an era nobody muted, never matches - the same
    resting state eraForDay already gives a day outside every named era. A
    uuid in `mutedEraUuids` naming an era that no longer exists in `eras`
    matches nothing here either, which is what makes deleting a muted era
    safe with no cleanup job (ADR-0049): the stale uuid is simply never the
    id of anything `eras` still holds. */
export function touchesMutedEra(
  eras: readonly EraSpan[],
  mutedEraUuids: ReadonlySet<string>,
  fromEpochDay: number,
  toEpochDay: number
): boolean {
  return eras.some(
    (era) => era.id !== undefined && mutedEraUuids.has(era.id) && eraOverlapsRange(era, fromEpochDay, toEpochDay)
  );
}
