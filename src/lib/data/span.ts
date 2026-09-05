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

/** `[fromEpochDay, toEpochDay]` cut into gapless, non-overlapping closed
    ranges at each of `cutDays`, oldest first. Empty for a range that runs
    backwards. Cuts are deduplicated, sorted, and ignored where they fall
    outside the range; the first range always starts at `fromEpochDay` and
    the last always ends at `toEpochDay`, so the ranges cover the whole of
    it and a day belongs to exactly one.

    Hoisted arithmetic like the two questions above, for the same reason:
    regimenEpisode.ts's drugSpans cuts a window where attribution changes
    and stockProjection.ts cuts one where a stock entry's answer changes,
    and the off-by-one at the seam between two ranges is not worth writing
    twice. No named range type, per this module's header. */
export function rangesFromCuts(
  cutDays: Iterable<number>,
  fromEpochDay: number,
  toEpochDay: number
): { fromEpochDay: number; toEpochDay: number }[] {
  if (toEpochDay < fromEpochDay) return [];

  const starts = [...new Set([fromEpochDay, ...cutDays])]
    .filter((day) => day >= fromEpochDay && day <= toEpochDay)
    .sort((a, b) => a - b);

  return starts.map((start, index) => ({
    fromEpochDay: start,
    toEpochDay: index + 1 < starts.length ? starts[index + 1] - 1 : toEpochDay
  }));
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
