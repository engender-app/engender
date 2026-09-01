/* What someone typed, turned into the two things a search needs (ADR-0005).

   Both halves fold through foldText(), which is the guarantee the ADR is
   built on: the index is written folded, the query is folded the same way,
   so ł and every other Polish letterform meet on the same letters without
   FTS5 or its tokenizer being involved.

   The two halves match differently, on purpose:

   Notes go to FTS5, which matches whole tokens. Each token is prefix-
   matched, so typing half a word finds it, but mid-word does not match -
   "erapy" will not find "therapy". The demo store's `includes()` did match
   mid-word. That narrowing is inherent to using an index instead of
   scanning every note, which is the point of the port.

   Tag labels are matched here in memory, above the journal seam, because a
   built-in tag stores a key rather than a word and resolving keys to labels
   needs paraglide, which the Node tier cannot import (ADR-0016). They stay
   on substring matching, exactly as the demo store had them: there are tens
   of labels, they are short, and it keeps the one search case the
   walkthrough pins behaving as it does today.

   Phase 5 deepening ticket 24 added two more things a search needs, and both
   are here rather than beside their caller so that everything shaping a query
   stays in one module: `likePattern`, for the areas matched by scanning
   instead of through the index, and `matchWindow` at the bottom of the file,
   for what to show of a hit once one comes back. */

import type { Tag } from './types';
import { foldText } from './fold';

/** Runs of letters and digits, which is what FTS5's unicode61 tokenizer also
    treats as token characters.

    Deliberately not `[a-z0-9]+`, even though folded text is lowercase: the
    fold covers Polish and the Western European forms it inherited, not every
    letter a person can type. Splitting on whatever it happens not to cover
    tears words apart - "Müller" becomes "m" AND "ller" and stops matching
    the note it was typed to find. Left whole, FTS5 folds ü the same way on
    both sides and the match lands. */
const TOKENS = /[\p{L}\p{N}]+/gu;

/** The MATCH expression for a note search, or null when the query holds
    nothing searchable - punctuation only, or nothing at all. Null means
    "do not go to the database": FTS5 rejects an empty expression outright,
    and a query of pure punctuation has no tokens to look for.

    Every token is double-quoted, which is what makes typed FTS5 syntax
    inert. Someone searching for `NOT` or `OR` means the word, and a stray
    quote or bracket must not reach the parser as syntax. */
export function ftsMatchExpression(raw: string): string | null {
  const tokens = foldText(raw).match(TOKENS);
  if (!tokens) return null;
  return tokens.map((t) => `"${t}"*`).join(' AND ');
}

/** A LIKE pattern for the folded query, or null when there is nothing to
    look for - what the areas matched by scanning rather than through the FTS
    index need (journal/textSearch.ts).

    Null means "do not go to the database", and it is the same rule
    `ftsMatchExpression` follows above: a query with no letter and no digit in
    it is not a search, so one the entry index refuses does not quietly become
    eighteen table scans.

    `%` and `_` in what somebody typed are literal characters they want found
    rather than wildcards, so they are escaped along with the escape character
    itself: "100%" searches for a hundred percent, not for everything. */
export function likePattern(raw: string): string | null {
  const folded = foldText(raw).trim();
  if (!folded.match(TOKENS)) return null;
  const escaped = folded.replace(/[\\%_]/g, (character) => `\\${character}`);
  return `%${escaped}%`;
}

/** The ids of tags whose label contains the query, folded on both sides.
    Callers hand in the labels they showed the user; ADR-0004 mirrors the
    vocabulary, so this runs over tens of rows already in memory. */
export function tagIdsMatching(raw: string, tags: Pick<Tag, 'id' | 'label'>[]): string[] {
  const q = foldText(raw).trim();
  if (!q) return [];
  return tags.filter((t) => foldText(t.label).includes(q)).map((t) => t.id);
}

/** The three parts of a hit's text: what runs up to the match, the match
    itself, and what follows. Null when the query is not in the text at all,
    which is the caller's signal to show the text as it stands.

    Long text is clipped around the match rather than shown whole - a letter
    runs to paragraphs and a hit has one line - so `before` and `after` carry
    an ellipsis where something was cut. */
export interface MatchWindow {
  before: string;
  match: string;
  after: string;
}

/** How much of the text survives around the match: enough before it to read
    into the phrase, and a line's worth after it. */
const BEFORE_CHARS = 30;
const AFTER_CHARS = 110;

/** The window around the first place `query` appears in `text`, both folded
    (ADR-0005), or null when it does not appear.

    Folding is length-preserving for every letterform it covers, so the index
    of the match in the folded text is the index in the original - which is
    what lets the *unfolded* text be sliced by a folded match, and how a hit
    shows what the person actually wrote rather than a stripped copy of it.
    `toLowerCase()` can change a string's length on letters outside the fold
    (İ is the well-known one), and where it has, this gives up and returns
    null rather than slicing at an index that has shifted.

    Above the journal seam because it is presentation: the journal returns
    the whole matched field, and how much of it fits on a row is the
    screen's business (textSearch.ts). */
export function matchWindow(text: string, query: string): MatchWindow | null {
  const foldedQuery = foldText(query).trim();
  const foldedText = foldText(text);
  if (!foldedQuery || foldedText.length !== text.length) return null;

  const at = foldedText.indexOf(foldedQuery);
  if (at < 0) return null;

  const end = at + foldedQuery.length;
  const from = Math.max(0, at - BEFORE_CHARS);
  const to = Math.min(text.length, end + AFTER_CHARS);

  return {
    before: (from > 0 ? '…' : '') + text.slice(from, at),
    match: text.slice(at, end),
    after: text.slice(end, to) + (to < text.length ? '…' : '')
  };
}
