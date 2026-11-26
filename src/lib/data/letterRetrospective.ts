/* Select letters for Wrapped and On this day from rows the caller
   loaded. Each function checks `unlockEpochDay` against
   `todayEpochDay` itself (ADR-0010). Retrospectives never expose
   sealed text.

   Report whether a letter matched its writing or unlock day so the
   card can label it. Writing wins when both match. */

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

/** Return every unlocked letter for Safe Space, without ranking
    strength or imposing a cap. Sort a copy by newest unlock, then
    newest writing day, then ID. The screen decides how many to show. */
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
    ellipsis where the cut happened.

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
