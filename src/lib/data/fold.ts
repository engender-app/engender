/* Folded text: the searchable form of a string (CONTEXT: "Folded text").
   Lowercased, with Polish letterforms stripped - including ł, which has no
   Unicode decomposition, so NFD-based folding and FTS5's remove_diacritics
   both miss it (ADR-0005). Both the search index and the query pass
   through this same function; that is the whole guarantee, so it lives in
   its own import-free module usable on either side of the journal seam
   (the FTS index below it, tag matching above it).

   Moved verbatim from repositories/entries.ts; the extra Western European
   forms it always folded (à, ç, ê, ...) stay so search behaviour does not
   change.

   As of phase 5 deepening ticket 24 the fold is also needed *inside* SQL:
   every area that holds text other than the entry note has no FTS index
   behind it, and matching those in JS would mean reading every text row of
   the database out on every search - across the Capacitor bridge, on a
   phone. So the fold is written here as data, and both forms are derived
   from it: `foldText` for JS, `foldedSql` for a WHERE clause. Two spellings
   of one fold rather than two folds, which is the same reasoning that put
   this function in a module of its own. */

/** The fold, once: each replacement and the letterforms that fold into it.
    `l` folds into itself, which `foldText` performs for free and `foldedSql`
    leaves out - a `REPLACE(x, 'l', 'l')` is work SQLite would do per row for
    no effect. */
const FOLDS: readonly [replacement: string, letterforms: string][] = [
  ['a', 'ąàáâä'],
  ['c', 'ćç'],
  ['e', 'ęèéêë'],
  ['l', 'łl'],
  ['n', 'ńñ'],
  ['o', 'óòôö'],
  ['s', 'śš'],
  ['z', 'żźž']
];

/** Compiled once rather than per call: `foldText` runs on every search index
    write and on every keystroke of a query. */
const FOLD_PATTERNS: readonly [RegExp, string][] = FOLDS.map(([replacement, letterforms]) => [
  new RegExp(`[${letterforms}]`, 'g'),
  replacement
]);

export function foldText(s: string): string {
  let folded = s.toLowerCase();
  for (const [pattern, replacement] of FOLD_PATTERNS) folded = folded.replace(pattern, replacement);
  return folded;
}

/** The same fold as a SQL expression over `expr`, for the areas matched by
    scanning rather than through an FTS index (journal/textSearch.ts).

    `lower()` and `REPLACE()` are core SQLite, so this runs unchanged on all
    three drivers - node:sqlite, SQLite3MultipleCiphers in the worker and
    SQLCipher on Android - with no custom function to register on any of them.

    SQLite's `lower()` maps A-Z and nothing else, so each letterform is
    replaced in both its cases here: `lower('Ł')` is still `Ł`, and a fold
    that only knew the lowercase spelling would leave ŁÓŻKO unfolded in the
    database while folding the typed query. JS `toLowerCase()` has no such
    limit, which is why only this side needs the pairs.

    What stays outside the fold on this side alone: an uppercase letterform
    the fold does not list at all - Ü, ß - which `toLowerCase()` lowers for
    the query and `lower()` leaves standing in the text. It is the same kind
    of documented narrowing as FTS5's whole-token matching (searchQuery.ts),
    it costs a miss rather than a wrong hit, and closing it would mean either
    a custom SQL function per driver or reading every text row out to fold it
    in JS.

    fold.test.ts drives the two forms against each other over the same
    strings, which is what keeps them one fold. */
export function foldedSql(expr: string): string {
  let sql = `lower(${expr})`;
  for (const [replacement, letterforms] of FOLDS) {
    for (const letterform of letterforms) {
      for (const spelling of new Set([letterform, letterform.toUpperCase()])) {
        // `lower()` has already turned every A-Z into its own lowercase, so a
        // spelling that folds to the replacement by lowercasing alone - l, L -
        // needs no REPLACE of its own, and one would be work per row for no
        // effect.
        if (spelling.toLowerCase() === replacement) continue;
        sql = `REPLACE(${sql}, '${spelling}', '${replacement}')`;
      }
    }
  }
  return sql;
}

/** The same folding, reduced to what a file name can carry: lowercase, ASCII,
    hyphen separated, empty when the name reduces to nothing. Here rather than
    beside either export that builds a name, because a journal archive
    (archive/deliver.ts) and a photo journey (photos/journey.ts) have to agree
    on it, and neither should have to import the other to do that. */
export function nameSlug(name: string): string {
  return foldText(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
