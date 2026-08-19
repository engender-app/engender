/* What the hair-progress screen counts weeks from (phase 4 ticket 09,
   widened by phase 5 ticket 33). Pure, kept above the journal seam beside
   regimenEpisode.ts and exposureCounters.ts: nothing here reads a clock or
   a database, and the anchor is never stored (ADR-0010) - the screen
   recomputes it from a preference and the dose log on every read, the same
   way ticket 07's earliest episode start is recomputed from episodes
   alone.

   Ticket 09 built this as the first dose logged against finasteride,
   dutasteride or minoxidil, so the timeline only started once someone was
   being treated for hair loss. That premise is wrong for anyone whose hair
   is changing in the direction they chose: someone on testosterone
   watching their hairline move was told to log a drug that would undo the
   change they came here to track. Ticket 33 drops the three-drug list
   entirely. Two things can anchor now:

   - A day the person set themselves, which wins. It is the more honest
     primitive of the two, and it is the only one that serves someone
     tracking hair change with no drug at all - laser, electrolysis, or
     nothing.
   - Failing that, the earliest dose of anything they log. No drug is named
     and no episode is resolved, which is why this no longer takes
     `episodes` at all: with every drug qualifying there is nothing left to
     look a dose's drug up for.

   Still distinct from the earliest episode start (regimenEpisode.ts), and
   for ticket 09's original reason: the anchor is the dose event, not the
   episode's own start day, because a person can log an episode before its
   first dose actually lands. The timeline's zero point is when something
   was taken, not when it was written down.

   Null when neither exists, exactly as before: staging and photos go on
   working unanchored, they lose the framing (hairPhotoSchedule.ts). */

import { epochDayFromTimestamp } from './epochDay';
import type { DoseEvent } from './types';

/** The day the hair-progress timeline counts from, or null when there is
    nothing honest to count from yet.

    `userSetEpochDay` is the preference the person set (`hairAnchorEpochDay`,
    prefs/catalogue.ts) and is taken as given - day 0 is a date they chose,
    not an absent one, so this branches on null rather than on falsiness.

    The dose fallback skips a `skipped` dose, the same `isConsuming` rule
    stockProjection.ts and exposureCounters.ts use: a skipped dose used
    nothing and cannot be a start. `doses` need not be sorted. */
export function hairAnchorEpochDay(userSetEpochDay: number | null, doses: readonly DoseEvent[]): number | null {
  if (userSetEpochDay !== null) return userSetEpochDay;

  let earliest: number | null = null;
  for (const dose of doses) {
    if (dose.status === 'skipped') continue;
    const day = epochDayFromTimestamp(dose.timestamp);
    if (earliest === null || day < earliest) earliest = day;
  }
  return earliest;
}
