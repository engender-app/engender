/* Whether a time-capsule letter is sealed or unlocked (phase 4 ticket 19).

   Nothing here is stored (ADR-0010) - the schema has no `sealed` column,
   and whether a letter is readable is a question about today, which
   changes overnight. It sits above the journal for the same reason
   milestoneStatus.ts does: "today" is a local calendar day (ADR-0001) and
   the data layer has no business deciding which one it is, so today
   arrives as an argument.

   Once `unlockEpochDay` is on or before today the letter stays unlocked
   for good - there is no re-sealing - which is why this is a single
   comparison rather than a three-way status like milestoneStatus()'s. */

import type { Letter } from './types';

export function isLetterSealed(letter: Pick<Letter, 'unlockEpochDay'>, todayEpochDay: number): boolean {
  return letter.unlockEpochDay > todayEpochDay;
}
