/* Journal reads for one completed Wrapped period. Muted eras are checked by
   resurfacing consent before this read starts. */

import type { Journal } from './journal/journal';
import { wrappedLetters, LETTER_RETROSPECTIVE_LIMIT } from './letterRetrospective';
import { wrappedTagInsights, wrappedTallyCounts } from './wrappedSections';

export async function readWrappedPeriod(
  journal: Pick<Journal, 'stats' | 'letters'>,
  period: {
    start: number;
    end: number;
    today: number;
    /** The selected scale, which tag insights follow - the same one the
        stats hub's own insight card reads. */
    metric: string;
    /** The year's rows shade the selected scale rather than mood (phase 11
        ticket 07, WrappedYear.svelte), and only a year has a prose section
        for letters to the future self (phase 5 deepening ticket 13). */
    year: boolean;
  }
) {
  const { start, end, today, metric, year } = period;
  const [recap, moodTrend, scaleTrend, insights, misgendered, correctlyGendered, letters] = await Promise.all([
    journal.stats.recap(start, end),
    journal.stats.dayAverages('mood', start, end),
    year ? journal.stats.dayAverages(metric, start, end) : Promise.resolve([]),
    journal.stats.tagInsights(metric, start, end),
    journal.stats.tallyTrend('misgendered', start, end),
    journal.stats.tallyTrend('correctly_gendered', start, end),
    year ? journal.letters.getLetters(LETTER_RETROSPECTIVE_LIMIT) : Promise.resolve([])
  ]);
  return {
    recap,
    moodTrend,
    scaleTrend,
    insights: wrappedTagInsights(insights),
    tally: wrappedTallyCounts(misgendered, correctlyGendered),
    /* Written inside the period and unlocked today, which is the only way a
       past self's words may resurface. Sealed ones never reach the screen:
       letterRetrospective.ts answers the seal question. */
    letters: wrappedLetters(letters, start, end, today)
  };
}
