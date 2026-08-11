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
   walkthrough pins behaving as it does today. */

import { foldText } from './fold.ts';

/** Every run of characters FTS5's default tokenizer would treat as a token.
    Folded text is lowercase and unaccented, so this is the whole alphabet
    it can produce. */
const TOKENS = /[a-z0-9]+/g;

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

/** The ids of tags whose label contains the query, folded on both sides.
    Callers hand in the labels they showed the user; ADR-0004 mirrors the
    vocabulary, so this runs over tens of rows already in memory. */
export function tagIdsMatching(raw: string, tags: readonly { id: string; label: string }[]): string[] {
  const q = foldText(raw).trim();
  if (!q) return [];
  return tags.filter((t) => foldText(t.label).includes(q)).map((t) => t.id);
}
