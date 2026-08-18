/* The hair-treatment anchor (phase 4 ticket 09). Pure, kept above the
   journal seam beside regimenEpisode.ts and exposureCounters.ts: nothing
   here reads a clock or a database, and the anchor is never stored
   (ADR-0010) - the hair-progress screen recomputes it from the dose log and
   the regimen episode history on every read, the same way ticket 07's
   earliestEpisodeStartEpochDay is recomputed from episodes alone.

   Distinct from earliestEpisodeStartEpochDay (regimenEpisode.ts): that is
   HRT's own start, whichever drug began it. This is the first dose event
   actually logged against one of three named hair-loss-treatment drugs
   specifically - finasteride, dutasteride or minoxidil - since a person can
   be on HRT for months or years before starting, or without ever starting,
   one of these three (ticket 09). The anchor is the dose event, not the
   episode's own start day, because a person can log an episode for one of
   these drugs before their first dose of it actually lands - the timeline's
   zero point is when treatment began, not when it was logged.

   Matched the way stockProjection.ts's drugsMatch matches a drug: trim
   only, case sensitive, against RegimenEpisode.drug's own free-text
   convention (CONTEXT: "Regimen episode"). No fold, no picklist - drug
   names get no case-insensitive matching anywhere else in this journal
   (stock.ts, exposureCounters.ts), and adding the first exception for this
   one anchor would need its own argument this ticket's acceptance criteria
   do not make. A person who types "Finasteride" or a misspelling simply
   does not anchor, the same risk stock tracking and exposure counters
   already carry for every other drug. */

import { epochDayFromTimestamp } from './epochDay';
import { resolveEpisodeAt } from './regimenEpisode';
import type { DoseEvent, RegimenEpisode } from './types';

export const HAIR_TREATMENT_DRUGS = ['finasteride', 'dutasteride', 'minoxidil'] as const;

const isHairTreatmentDrug = (drug: string): boolean =>
  (HAIR_TREATMENT_DRUGS as readonly string[]).includes(drug.trim());

/** The earliest logged dose - taken or changed, never skipped, the same
    `isConsuming` rule stockProjection.ts and exposureCounters.ts use, since
    a skipped dose used nothing and cannot be treatment's own start -
    resolved to an episode naming finasteride, dutasteride or minoxidil.
    Null when no such dose has ever been logged: staging and photos still
    work unanchored (ticket 09) until one is.

    `doses` and `episodes` need not already be scoped to each other - this
    resolves each dose's drug itself, the way cumulativeDoseTotals does.
    `episodes` must be sorted ascending by startEpochDay, the order
    journal.regimen.getEpisodes() already returns them in. */
export function earliestHairTreatmentDoseEpochDay(
  doses: readonly DoseEvent[],
  episodes: readonly RegimenEpisode[]
): number | null {
  let earliest: number | null = null;
  for (const dose of doses) {
    if (dose.status === 'skipped') continue;
    const episode = resolveEpisodeAt(episodes, dose.timestamp);
    if (!episode || !isHairTreatmentDrug(episode.drug)) continue;
    const day = epochDayFromTimestamp(dose.timestamp);
    if (earliest === null || day < earliest) earliest = day;
  }
  return earliest;
}
