# Search folds text in the app, not in the tokenizer

Status: Accepted
Decided: 2026-08-11
Last reviewed: 2026-11-02
Supersedes: none

Notes are folded to a searchable form in TypeScript (`foldText`, `src/lib/data/fold.ts`) before being written to a contentless FTS5 table, and every query is folded by the same function. Tag labels are matched separately, in memory, against the mirrored tag vocabulary. Areas other than entry notes are matched by scanning, with the same fold written as SQL (`foldedSql`).

## Why

FTS5's `remove_diacritics 2` folds by Unicode decomposition. That covers ą ć ę ń ó ś ź ż but not **ł**, which is a distinct letter with no decomposition. A query for "lozku" cannot find "łóżku", and a query without Polish diacritics has to find text with them. Custom FTS5 tokenizers need the C API and cannot be registered from JavaScript in SQLocal or the Capacitor plugin, so the fold moves up into application code. Folding both sides with one function makes index and query symmetric by construction.

## Consequences

The FTS table (`entry_fts`) is contentless: it holds folded text against the rowid, because its text no longer matches `entry.note` and nothing needs `snippet()`. Result rows render the note from `entry`.

Tag matching stays out of the index. Denormalizing labels into each entry's row would mean renaming one tag reindexes every entry carrying it. Tags are mirrored reference data (ADR-0004), so matching is a folded compare over tens of rows, unioned with the FTS hits.

Letters, milestone names, procedure notes and the other small text areas have no index. `journal/textSearch.ts` scans them with `foldedSql`, which is `lower()` and `REPLACE()` only, so it runs unchanged on all three drivers. Matching there is substring, not whole-token prefix. An uppercase letter the fold table does not list (such as Ü) is lowered for the query but not in the stored text, which costs a miss, never a wrong hit.

History: extended 2026-09 (SQL-side fold for non-note areas); saved questions cut 2026-10; folded 2026-11-02.