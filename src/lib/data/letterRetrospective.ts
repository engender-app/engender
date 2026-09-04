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

/** Every unlocked letter Safe Space may show, most recently unlocked
    first, ties broken by whichever was written most recently and then by
    id so two letters unlocked and written the same day still order the
    same way on every read (phase 5 deepening ticket 14 for the ordering,
    phase 8 features ticket 21 for the widening from one letter to all of
    them, CONTEXT: "Safe space").

    Unlike the retrospectives above, there is no candidate day and no
    range: Safe Space is not looking back at a particular day, it is
    reaching for what a person's past self wrote them on purpose. Recency
    of unlock is the order because the letter somebody most recently
    finished waiting on is the one they are least likely to have read
    already - it is not a claim that an older letter says less, and no
    strength ranking is implied or wanted (ticket 21 rules one out).

    Returns the whole unlocked set rather than a capped one: the seal rule
    and the order are this file's to own, how many rows a screen has space
    for is the screen's. Sorts a copy, so a caller's live-query array is
    left as the journal handed it over. */
export function safeSpaceLetters(letters: Letter[], todayEpochDay: number): Letter[] {
  return letters
    .filter((l) => !isLetterSealed(l, todayEpochDay))
    .slice()
    .sort(
      (a, b) =>
        b.unlockEpochDay - a.unlockEpochDay || b.epochDay - a.epochDay || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
    );
}

/** How much of a letter a list row may carry. Past what two lines can show
    at any width the app renders at, so the code cut below and the row's own
    CSS clamp never disagree about what is visible. It lives here rather than
    on the card, next to the reasoning that depends on it. */
export const LETTER_OPENING_LIMIT = 200;

/** What a list row may carry of a letter: its opening, flattened to one
    run of text and cut to `limit` characters on a word boundary, with an
    ellipsis where the cut happened (phase 8 features ticket 21).

    The row's own two-line clamp is CSS, and CSS cuts the paint rather than
    the text - so a row whose text is a whole letter hands a screen reader
    the whole letter as the link's name. On Safe Space that is three letters
    read out in full before the person has chosen one of them. The clamp
    stays, because it is what makes the visible cut land at the row's real
    width; this is the cut underneath it.

    The flattening is not a compromise either: a row sets its text with
    `white-space: normal`, so a letter's paragraph breaks are already
    collapsed to spaces by the time anybody sees it. Doing it here means the
    announced text matches the drawn text. */
export function letterOpening(text: string, limit: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return flat;

  const cut = flat.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  // A single word longer than the whole allowance has no boundary to cut on.
  return `${lastSpace === -1 ? cut : cut.slice(0, lastSpace)}\u2026`;
}

/** The unlocked letters with something to say about `candidateEpochDay`:
    written that day, or unlocked that day. Written wins when both are the
    same day. */
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
