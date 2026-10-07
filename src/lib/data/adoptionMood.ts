/* The one felt sense an adopted tryout hands to its new milestone (phase 5
   deepening ticket 11). Adoption writes a single reading onto the
   milestone, and the confirmation sheet shows the same step before anyone
   confirms, so both ask this function rather than each counting on its
   own.

   The step chosen most often wins. A tie goes to whichever of the tied
   steps was read most recently (phase 15 after-release ticket 15): two
   "great" and two "poor" used to stamp the milestone "poor" because the
   count was scanned from the bottom of the scale up, which made the low
   end win every tie for no reason anyone could see. The latest reading is
   the one a person is most likely to recognise as how it feels now.

   Readings arrive newest first, which is the order both callers already
   read them in (feltSense.ts `forTryout`, and the same ORDER BY in
   tryouts.ts). */

export function adoptionMood(newestFirst: readonly { mood: number }[]): number | null {
  const counts = new Map<number, number>();
  for (const reading of newestFirst) counts.set(reading.mood, (counts.get(reading.mood) ?? 0) + 1);

  let chosen: number | null = null;
  let chosenCount = 0;
  // Newest first and strictly greater, so among equal counts the step met
  // first, which is the most recent, keeps its place.
  for (const reading of newestFirst) {
    const count = counts.get(reading.mood) ?? 0;
    if (count > chosenCount) {
      chosen = reading.mood;
      chosenCount = count;
    }
  }
  return chosen;
}
