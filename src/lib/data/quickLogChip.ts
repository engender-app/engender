/* The entry editor's quick-log chip (after-release ticket 01): which
   running drugs it still offers a dose for, and what that dose would leave
   in stock. Only EntryEditor.svelte asks either question, so they live here
   rather than in regimenEpisode.ts and stockProjection.ts, which are both in
   the first-load graph; here they load with the editor. */

import { attributeDrug } from './regimenEpisode';
import { dosesInOneUnit, type StockEntry } from './stockProjection';
import type { DoseEvent, RegimenEpisode } from './types';

/** Which of `candidates` have no dose logged against their drug among
    `dayDoses` - the entry editor's quick-log chip, which offers a dose only
    for a drug not already logged that day (after-release ticket 01).

    Each dose's drug is attributeDrug's answer, the one dayRows draws with:
    a dose's own `drug` is null on most rows, so reading only that field left
    the chip up after a dose logged from the dose sheet, and one tap then
    logged a second. A drug-less dose while two different drugs run is
    ambiguous and takes neither off. Names compare trimmed and case
    ignored, as the chip always compared them. */
export function episodesWithNoDoseLogged(
  episodes: readonly RegimenEpisode[],
  candidates: readonly RegimenEpisode[],
  dayDoses: readonly Pick<DoseEvent, 'drug' | 'timestamp'>[]
): RegimenEpisode[] {
  const fold = (drug: string) => drug.toLowerCase().trim();
  const logged = new Set<string>();
  for (const dose of dayDoses) {
    const { drug } = attributeDrug(episodes, dose);
    if (drug) logged.add(fold(drug));
  }
  return candidates.filter((episode) => !logged.has(fold(episode.drug)));
}

/** What one more dose would leave, in the entry's own unit: the entry
    editor's quick-log chip states this before the dose is logged. */
export function remainingAfterOneDose(remaining: number, stock: Pick<StockEntry, 'dosesPerUnit'>): number {
  return remaining - 1 / dosesInOneUnit(stock);
}
