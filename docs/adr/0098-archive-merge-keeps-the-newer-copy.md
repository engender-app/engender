# Archive Merge keeps the newer copy of each row and carries deletions

Status: Accepted
Decided: 2026-10-30
Last reviewed: 2026-11-02
Supersedes: none
Amends: ADR-0011

Merge is how two devices exchange a journal without a network: export an
archive on one, merge it on the other. A row present on both sides takes the
archive's copy when the archive's `updated_at` is later, and a deletion
travels as a marker so a record deleted on one phone does not come back with
the other's next archive. ADR-0011's "Merge leaves matched rows alone" is
replaced by this record; its file-writing order is unchanged.

The old rule was deliberate: `restore.ts` argued that last-write-wins needs
trustworthy clocks across two devices with no sync protocol, and that its
failure is silent. Known exposure below answers that rather than dropping it.

## Decisions

- **Every row carries its `updated_at`.** The archive writes it as `updatedAt`
  on every row and every nested child with a table of its own.
- **The newer copy wins, row by row.** A tie keeps this device's row, so
  merging the same archive twice equals merging it once. A row from an archive
  written before stamps existed never wins, so an old archive still only adds
  what is missing.
- **A row the archive wins keeps the archive's stamp.** Stamping it with the
  import's clock would make the copy look newer than an edit the first device
  makes after the export, and that edit would lose the next Merge back.
- **A deletion leaves a marker.** A `deletion` table (table, identity, time)
  and an `AFTER DELETE` trigger on every table merged by `updated_at` (schema
  116). A trigger rather than a call in each delete, so every path records
  one: an area's delete, a cascade, the Trash purge, a Merge applying another
  device's deletion. Markers are never pruned. The archive carries them as the
  `deletions` section.
- **A deletion applies unless this device's row is newer**, and the marker is
  recorded either way, at the archive's time, so a third device hears of it. A
  row edited after the deletion on the other side survives it.
- **Deletions apply first.** `deletions` is declared first in the section
  registry (ADR-0027), so a Merge applies them before any row.
- **Every table has a Merge class** in `src/lib/data/journal/archiveMerge.ts`:
  by `updated_at` with an identity (a uuid, a built-in's key, or a natural
  key), following its parent (join tables), or out of Merge with a reason
  (preferences, the search index's storage, the markers themselves).
  `archiveMerge.test.ts` fails on a table with no class or with a missing
  deletion trigger. A migration that rebuilds a table drops its trigger and
  must recreate it (`deletionTrigger` in
  `src/lib/data/sqlite/deletion-migration.ts`).
- **A child goes where its parent is.** A child whose parent this device
  deleted is dropped with it. A reference that neither cascades nor sets null
  is unlinked when its target is not here, as deleting the target does.
- **Trash travels.** A trashed entry is exported with its Trash time and files.
  Moving to Trash and restoring bump `updated_at`; Delete forever is a
  deletion.
- **A built-in nobody edited is stamped 0**, so a device installed later does
  not bring back a tag the first device hid.

## Where one rule does not fit

- A **roadmap check** holds a status and a hidden flag in one row. A row newer
  here only because the goal was hidden here still takes the archive's status
  when this device has none, keeping its own hidden flag.
- **One taper per procedure** and **one schedule per episode**: a second one is
  left out, newer or not. Only the same record's newer copy is written over.
- A **stock row** is matched by uuid or drug and keeps this device's uuid; a
  **checklist** is one per owner, so another device's list for the same owner
  is this one.

## Known exposure

- **Clocks.** A device whose clock runs ahead wins edits it should lose, for as
  long as its stamps stay ahead. Nothing here can see that; the person can edit
  the row again.
- **Whole rows.** Two edits to different fields of one row on two devices do
  not combine: the later row wins whole. The roadmap check is the one
  workaround.
- **Delete forever keeps the uuid.** The marker holds the entry's uuid, table
  and time, and nothing of what it said (`delete-forever.test.ts` reads every
  table for its note).
- **Markers grow.** One small row per deletion, never pruned: pruning would let
  an archive from before the deletion bring the record back.
- **Archives from before schema 116** carry no stamps or markers. Merged into a
  device that has deleted something, they no longer bring it back.

## Consequences

A newer row's file name is written over this device's like any other column:
when the archive's file collides with one here it lands under a fresh name, the
old file is no longer owned, and the orphan sweep takes it. Folder sync
(ADR-0099) reuses this merge path unchanged.

History: decided 2026-10-30, replacing ADR-0011's add-only Merge.