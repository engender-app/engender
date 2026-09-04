/* Whether a dated span covers a day, or overlaps a range (phase 8 deepening
   ticket 11). eras.ts's eraCoversDay, journalingPause.ts's pauseCoversDay,
   doseSchedule.ts's pauseCoversDay and regimenEpisode.ts's isActiveOn all
   answered this same question over their own row, and two more inline
   copies differed by one token nothing named. This module hoists the
   arithmetic only - the four modules keep their own types, their own
   wrappers where a domain name reads better at the call site, and their own
   headers, because ADR-0055's live invariant is which computation reads
   which pause, not the row shape, and a merged type would make that
   distinction unenforceable.

   Every bound is an epoch day (ADR-0001, local calendar day), and a null
   bound is unbounded in that direction - reaching back before the journal
   for a start, or still running for an end. */

/** Whether `day` falls inside `span`. Both bounds are inclusive. No named
    `Span` type: a shared record was ruled out for this ticket, and an
    anonymous structural type keeps that from creeping back in as a type
    other modules might reach for. */
export function spanCoversDay(span: { startEpochDay: number | null; endEpochDay: number | null }, day: number): boolean {
  if (span.startEpochDay !== null && day < span.startEpochDay) return false;
  if (span.endEpochDay !== null && day > span.endEpochDay) return false;
  return true;
}

/** Whether `span` overlaps `[fromEpochDay, toEpochDay]` at all - a stretch
    that starts on or before the window ends and ends on or after the window
    starts. */
export function spanOverlapsRange(
  span: { startEpochDay: number | null; endEpochDay: number | null },
  fromEpochDay: number,
  toEpochDay: number
): boolean {
  if (span.startEpochDay !== null && span.startEpochDay > toEpochDay) return false;
  if (span.endEpochDay !== null && span.endEpochDay < fromEpochDay) return false;
  return true;
}
