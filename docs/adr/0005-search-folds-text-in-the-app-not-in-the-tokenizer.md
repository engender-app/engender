# Search folds text in the app, not in the tokenizer

Notes are folded to a searchable form in TypeScript before being written to a
contentless FTS5 table, and every query is folded by the same function. Tag labels
are matched separately, in memory, against the mirrored tag vocabulary.

## Why

FTS5's `remove_diacritics 2` folds by Unicode decomposition, which covers ą ć ę ń
ó ś ź ż but cannot cover **ł**: U+0142 is a distinct letter with no canonical
decomposition, not a base letter plus a combining mark. Verified against SQLite
3.51.2:

```
'lozku'  -> ['spalem w lozku']       does not match 'spałem w łóżku'
'gesla'  -> ['zażółć gęślą jaźń']    ę ś ą fold correctly
'zazolc' -> []                       fails, and only because of ł
```

F19 and the walkthrough suite both require a query without Polish diacritics to
find text with them, so the tokenizer alone cannot satisfy the requirement. Custom
FTS5 tokenizers need the C API and cannot be registered from JavaScript in either
SQLocal or the Capacitor plugin, so the fold has to move up into application code.

Folding on both sides with the same function makes index and query symmetric by
construction rather than by discipline.

## Consequences

The FTS table is contentless (`content=''`), holding folded text against the rowid
only, because its stored text no longer matches `entry.note` and nothing needs
`snippet()`. Result rows render the note from `entry`.

Tag matching stays out of the index deliberately. Denormalizing tag labels into
each entry's FTS row would mean renaming one tag reindexes every entry carrying it;
tags are mirrored reference data (ADR-0004), so matching them is a folded compare
over tens of rows, unioned with the FTS hits.
