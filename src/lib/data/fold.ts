/* Use one fold for indexed text and queries (ADR-0005). Lowercase and
   map Polish letterforms, including ł, which NFD and FTS5's
   remove_diacritics leave intact. The existing map also covers Western
   European forms such as à, ç and ê.

   foldText and foldedSql share the map. SQL-side folding supports
   unindexed areas without reading every text row across the Android
   bridge. */

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

/**
 * foldedSql maps Cyrillic uppercase because SQLite lower() is ASCII-only;
 * JS toLowerCase() and the FTS5 unicode61 tokenizer already case-fold it.
 * This lets a lowercase query match names such as Настя in stored rows.
 *
 * Map Russian, the additional Ukrainian letters ҐЄІЇ, and Belarusian Ў.
 * The chain grows from 48 to 86 REPLACEs per row. A ten-year
 * search-everywhere run took 36 ms versus a 37 ms baseline and 150 ms budget;
 * scan limits still bound the number of rows.
 */
const SQL_ONLY_UPPERCASE = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯҐЄІЇЎ';

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

/**
 * Build the same fold for SQL-scanned areas with SQLite lower() and
 * REPLACE(), available on all three drivers. lower() covers ASCII only,
 * so replace both cases of the listed letters. SQL_ONLY_UPPERCASE adds
 * case folding where nothing needs stripping.
 *
 * Unlisted uppercase letters such as Ü can miss a match that JS's
 * Unicode lowercasing would find. Closing that gap needs a custom
 * function on each driver or a full JS scan. fold.test.ts checks the
 * shared cases against the same strings.
 */
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
  for (const uppercase of SQL_ONLY_UPPERCASE) {
    sql = `REPLACE(${sql}, '${uppercase}', '${uppercase.toLowerCase()}')`;
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
