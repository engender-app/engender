/* The reads behind the wrapped screens (final-audit ticket 31).

   Two calls, split the way comingBackReads.ts splits its own: the second is
   asked about something the first decides. `readWrappedEras` is what a
   picked era and the mute check need, and the screen resolves the range and
   whether it touches a muted era from it (wrappedRange.ts,
   resurfacingConsent.ts, both pure over what they are handed). Only then does
   it ask `readWrappedPeriod` about that range - and not at all while wrapped
   is off or the range is muted, which is the consent rule: nothing is read
   for a period the person has kept out. */

import type { Journal } from './journal/journal';
import { wrappedLetters, LETTER_RETROSPECTIVE_LIMIT } from './letterRetrospective';
import { wrappedTagInsights, wrappedTallyCounts } from './wrappedSections';

/** The eras an `era` choice can name, the journal's own edges to clamp an
    open one against (phase 6 ticket 03), and which eras are muted (phase 6
    ticket 05). */
export async function readWrappedEras(journal: Pick<Journal, 'eras' | 'eraMutes'>) {
  const [eras, bounds, mutedEraUuids] = await Promise.all([
    journal.eras.getEras(),
    journal.eras.getJournalBounds(),
    journal.eraMutes.getMutedEraUuids()
  ]);
  return { eras, bounds, mutedEraUuids };
}

/** One result for a wrapped period. Start every journal call before
    awaiting so liveQuery observes every dependency on its first run. The
    screen already held the period whole until every figure had landed; a
    failed read now also fails it whole, rather than drawing a recap beside
    sections that silently read as empty. */
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
