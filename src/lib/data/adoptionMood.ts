/* How a tryout mostly felt, as the adoption sheet sums it up before anyone
   confirms. Adoption used to write this step
   onto the new milestone as a felt-sense reading; functional audit ticket
   32 cut milestone readings, so it is a line on the sheet and nothing more.

   The step chosen most often wins. A tie goes to whichever of the tied
   steps was read most recently (phase 15 after-release ticket 15): two
   "great" and two "poor" used to read "poor" because the
   count was scanned from the bottom of the scale up, which made the low
   end win every tie for no reason anyone could see. The latest reading is
   the one a person is most likely to recognise as how it feels now.

   Readings arrive newest first, the order feltSense.ts `forTryout` reads
   them in. */

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
