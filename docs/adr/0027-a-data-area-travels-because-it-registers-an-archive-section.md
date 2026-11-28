# A data area travels in an archive because it registers a section

Status: Accepted
Decided: 2026-08-19
Last reviewed: 2026-11-02
Supersedes: none

An area travels in an archive because it registers one entry in
`src/lib/data/journal/archiveSections.ts`. Payload assembly, the journal
snapshot, both restore modes, the discard and the empty-journal fixtures
iterate that registry, and none of them names a section. An entry declares the
section's key (also its wire key), how its rows are read (`archiveRead.ts`),
how they are written back in both modes (`archiveApply.ts`), which sections
must insert first, and what emptying the area is. An area that is one table
declares the table and its columns instead (`archiveTable.ts`) and gets read,
write and discard derived from that. Merge semantics stay in the section's
apply function. Readers tolerate change without a format bump: a known
section missing from an archive reads as `[]`, a section named in
`DROPPED_ARCHIVE_SECTION_NAMES` is skipped, and any other unknown key refuses
as a newer-version archive.

## Why

The list of what an archive carries used to be written out in several places:
the wire type, the snapshot, the restore, a `COLLECTIONS` shape guard and
empty-journal literals in importers and tests. Nothing checked the copies
against each other and the failure was silent. An area wired into three of
four copies simply did not travel, no test failed, and the gap showed only
when a restore came up empty on a device with no other copy. Tests could not
catch it because they built their expectations from the same code that had
forgotten the area. Adding one modest screen (time-capsule letters) had cost
about eight files of archive wiring and test fan-out.

With one registry an unregistered area is visible in one place. A collection
added to `ArchiveJournal` with no entry is a compile error
(`EverySectionRegistered`), and so is an entry with no `discard`, because that
field is required. The entry also carries a `travels` answer the compiler
requires.

Insert order is declared, not implied by call order. A section that resolves
rowids against another (entries against the vocabulary, felt-sense entries
against tryouts, dose schedules against regimen episodes) lists it in `after`.
The sort refuses a cycle or an unregistered dependency, where reading a
constraint off a call sequence would produce an order that inserts against
rowids that are not there. Wire order stays declaration order.

## What the registry does not decide

Merge semantics stay with the section. A flat area matches a row and skips it
in both modes, and that sameness is what qualifies it as flat. The rest keep
hand-written apply functions because their rules differ and carry reasoning:
a roadmap check must survive a merge that does not carry it, a tag group walks
its tags in both modes, an episode holds one dose schedule. A policy language
expressive enough to state all that would be a wider interface over less
behaviour.

The registry does not absorb `TableName` in `live/writes.ts`, which is
coarser on purpose (one name covers a row and its children). It does not
reopen the format-version axis either: `codec.ts` routes versions and
`container.ts` reads the supported version from the codec registry. The
payload's `writer` stamp (app version and schema number, written by
`archive/codec.ts`) is informational. Nothing in restore reads it.

## Adding and retiring a section

Adding: one registry entry and the wire field in `archive/payload.ts`, plus
the read and apply functions unless the area is flat. Snapshot, ordering,
discard and fixtures change nowhere else.

Retiring: remove the entry and the wire field, add the key to
`DROPPED_ARCHIVE_SECTION_NAMES`, and drop the table in a migration (rows are
dropped, not converted). `restorableJournal` in `restore.ts` then ignores that
key in older archives, and import and archive verification discard its rows.
Rows in kept sections that pointed at the retired area are filtered there too,
for example `areaStates` rows naming a dropped area and tryouts of a dropped
kind (`DROPPED_TRYOUT_KINDS`). A retired key stays on the list for good,
because older archives exist indefinitely. The format version does not change.
`archive-format-guards.test.ts` and the pre-retirement archive test in
`restore.test.ts` hold this.

## Emptying the journal

Each section declares its own discard statements, children first, and the
order is the reverse of insert order. `Journal.discardEverything()` runs them,
`restore.ts` runs the same statements inside its Replace transaction, and the
demo's clear calls the operation. Three checks stand over it. The registry's
oracle reads `sqlite_master` and requires every table to be emptied by a
section or listed with a reason. `restore.test.ts` empties a journal holding
rows in every section and compares every table's row count against a device
holding only its built-ins, with foreign keys off so cascades cannot hide a
missed statement. `archive-golden.test.ts` restores the fixture over a full
journal, so a table missed anywhere shows up as the target's own rows
surviving a Replace.

## The golden fixture

`src/lib/data/journal/fixtures/golden-archive.ttbackup` is one encrypted
archive committed as bytes, holding at least one row in every section, with
`golden-archive-counts.json` beside it pinning each section's row count so a
section that shrinks from nine rows to one is noticed. `GOLDEN_ARCHIVE=rebuild`
packs a fresh journal and is the routine path. `GOLDEN_ARCHIVE=patch`
decrypts what is committed and transforms it, for a change a fresh journal
cannot reproduce (legacy built-in presets are the standing example). Both
regenerate the counts manifest. `archive-golden-merge.test.ts` iterates
`ARCHIVE_SECTION_NAMES`, merges the fixture into an independent journal
twice, and checks that row counts do not change between merges and that no
existing row is lost, so a new section is covered without anyone adding it by
hand.

History: amended 2026-10 (reader rules for missing and dropped sections, dropped list begins with `doubtEntries`); counts removed and retirement procedure added 2026-11-02.