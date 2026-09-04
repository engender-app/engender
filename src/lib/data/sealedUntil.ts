/* Whether a sealed record has opened yet (phase 4 ticket 19, phase 8
   features ticket 10).

   Pulled out of letterStatus.ts so a practice take can reuse a time-capsule
   letter's own seal mechanics rather than inventing a second one (ticket
   10's own instruction): sealed while the unlock day is still ahead of
   today, open for good once it is not, and nothing stored beyond that one
   day - no `sealed` column, no re-sealing. `letterStatus.ts` keeps the rest
   of a letter's own bookkeeping (read tracking, tile snooze), none of which
   is what "sealed" means. */

export function isSealedUntil(unlockEpochDay: number, todayEpochDay: number): boolean {
  return unlockEpochDay > todayEpochDay;
}
