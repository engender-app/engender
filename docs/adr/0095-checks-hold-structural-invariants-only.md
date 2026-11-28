# A CHECK holds a structural invariant, never a vocabulary

Status: Accepted
Decided: 2026-10-21
Last reviewed: 2026-11-02
Supersedes: none

SQL CHECK constraints state what must be true of a row whatever the app says: a
rating between 1 and 5, a reminder that is either one-off, recurring with an
interval, or daily. Which words a column may hold (a tryout kind, a hair-removal
area, a reminder type) is a vocabulary, and vocabularies live in code:
`src/lib/data/rowValues.ts` (and `hairRemovalAreas.ts`, which it re-exports).
That one module is read by the ordinary write path, by archive import
validation (`src/lib/data/journal/archiveRowValidation.ts`) and by the label
lookups. There is no second list.

A stored word the code does not know renders as "other" on its screen. It is
not an error, and it is not shown raw.

## Why

SQLite cannot alter a CHECK. Every change to a vocabulary that lived in one
meant rebuilding the whole table, copying every row, and recreating its
indexes and triggers. Hair removal and tryouts each needed one, and a table
that two changes touch was rebuilt twice or lost one change in a
merge. A vocabulary also changes more often than a row's shape, and a build
can meet a word it does not know: an archive from a newer build, or a row an
older build left behind. A CHECK refuses that row at the database after the
app has already said yes, and the failure surfaces as a raw constraint message
instead of a screen.

With the vocabulary in code, adding or dropping a word is a code change with a
test. Import still refuses an unknown word before any write (the strict fuzz
run, `FUZZ_STRICT_TYPED=1` in `tests/fuzz/fuzz.test.ts`, stays at zero untyped
refusals), so the database is no more permissive for new data. An unknown word
already stored, or inserted by a path that skips validation, cannot brick a
table rebuild or an import of the rest of the journal.

## What stays in SQL

Anything that is a fact about the row's own shape, independent of any word
list: numeric ranges, "exactly one of these two columns is set", the reminder
rule shape, NOT NULL, UNIQUE, foreign keys. A CHECK that spells out a closed
list of words is what this removes.

## Applied

Schema 93 rebuilt `hair_removal_session` (area, method), `tryout` (kind),
`tally_event` (kind), `cycle_event` (kind) and `reminder` (type) once, without
their vocabulary CHECKs. It also made `hair_removal_session.pain_rating` and
`.cost` nullable, added a nullable `note` and dropped `tally_event.context`,
so later changes do not rebuild these tables again. Migrations never use
`DROP COLUMN`; a column change is a rebuild: create the new table, copy, carry
the AUTOINCREMENT counter, drop the old table, rename, recreate indexes and
triggers, with foreign keys off for the step and checked after it.

Other CHECK-held lists (document-link `target_kind`, dose `recurrence_kind`,
`hair_stage` grades) leave SQL the next time their tables are rebuilt for
another reason.

History: decided 2026-10-21 (schema 93).