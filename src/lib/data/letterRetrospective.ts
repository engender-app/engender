/* Which letters a retrospective surface may show (phase 5 deepening ticket
   13).

   A letter reaches a retrospective twice: the annual wrapped names the
   letters written during its year, and on-this-day resurfaces the letters
   written or unlocked on one of its three lookback days. Both are
   selections over the letters the caller already read - the same shape as
   wrappedSections.ts, where the conditional lives in a tested function and
   the screen only writes `{#if}`.

   The rule that owns the file: a sealed letter is not a retrospective fact.
   "Sealed" is not stored anywhere (ADR-0010) - it is `unlockEpochDay`
   against today (letterStatus.ts), so every function here takes
   `todayEpochDay` and answers the seal question itself rather than trusting
   its caller to have filtered. Nothing below hands back a letter's text
   unless the letter is readable today; there is no retrospective view of a
   sealed letter (spec: exposing sealed contents is out of scope under any
   circumstance).

   `kind` says why a letter matched, for the card's own label: a letter read
   on the day it unlocked surfaced as an opening, not as something written
   that day. A letter both written and unlocked on the candidate day reads
   as written - that is the day its words are from. */

import { isLetterSealed } from './letterStatus';
import type { Letter } from './types';

/** How far back a retrospective reads for letters. The letters screen keeps
    100 rows of history; a lookback can reach further than the list that
    holds them, and letters are written one at a time, so 200 is a bound on
    the read rather than a number anybody is expected to meet. */
export const LETTER_RETROSPECTIVE_LIMIT = 200;

export interface RetrospectiveLetter {
  letter: Letter;
  kind: 'written' | 'opened';
}

/** The unlocked letters written inside `[start, end]`, both ends inclusive,
    oldest first - the order a year is read in.

    Membership is by the day a letter was *written*, not the day it opened:
    a yearly recap is that year's own voice, so a letter belongs to the
    year its words date from, and "unlocked" filters rather than places it.
    A letter written in 2024 that opened in 2025 is therefore a 2024
    letter. */
export function wrappedLetters(
  letters: Letter[],
  start: number,
  end: number,
  todayEpochDay: number
): RetrospectiveLetter[] {
  return letters
    .filter((l) => l.epochDay >= start && l.epochDay <= end && !isLetterSealed(l, todayEpochDay))
    .sort((a, b) => a.epochDay - b.epochDay)
    .map((letter) => ({ letter, kind: 'written' as const }));
}

/** The unlocked letters with something to say about `candidateEpochDay`:
    written that day, or unlocked that day. Written wins when both are the
    same day. */
/** The single strongest letter to show on Safe Space (phase 5 deepening
    ticket 14, CONTEXT: "Safe space"): the most recently unlocked one, ties
    broken by whichever was written most recently, and a final tie broken
    by id for a deterministic pick between two letters unlocked and written
    the same day.

    Unlike the retrospectives above, there is no candidate day and no
    range: Safe Space is not looking back at a particular day, it is
    reaching for whichever letter has the most to say to someone right now,
    which is the one their past self most recently finished waiting on.
    Returns null rather than undefined so a caller's `{#if}` reads the same
    way ReadGate's empty branches do elsewhere on the screen. */
export function featuredLetter(letters: Letter[], todayEpochDay: number): Letter | null {
  const unlocked = letters.filter((l) => !isLetterSealed(l, todayEpochDay));
  if (unlocked.length === 0) return null;

  return unlocked.reduce((newest, candidate) => {
    if (candidate.unlockEpochDay !== newest.unlockEpochDay) {
      return candidate.unlockEpochDay > newest.unlockEpochDay ? candidate : newest;
    }
    if (candidate.epochDay !== newest.epochDay) {
      return candidate.epochDay > newest.epochDay ? candidate : newest;
    }
    return candidate.id > newest.id ? candidate : newest;
  });
}

export function onThisDayLetters(
  letters: Letter[],
  candidateEpochDay: number,
  todayEpochDay: number
): RetrospectiveLetter[] {
  return letters
    .filter((l) => !isLetterSealed(l, todayEpochDay))
    .filter((l) => l.epochDay === candidateEpochDay || l.unlockEpochDay === candidateEpochDay)
    .sort((a, b) => a.epochDay - b.epochDay)
    .map((letter) => ({
      letter,
      kind: letter.epochDay === candidateEpochDay ? ('written' as const) : ('opened' as const)
    }));
}
