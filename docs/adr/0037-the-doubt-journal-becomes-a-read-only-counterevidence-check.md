# The doubt journal becomes a read-only counterevidence check, and its written entries are removed

Status: Accepted
Decided: 2026-08-22
Last reviewed: 2026-11-02
Supersedes: none

The doubt journal's free-write composer is removed, and so are the entries it
recorded and the counterevidence snapshots that later copied from the pool.
What remains is a read: Safe space's Good moments screen
(`src/routes/doubt/evidence`) shows the person's own past euphoria-tagged and
starred entries, the counterevidence pool, and writes nothing. Nothing on it
asks for words first, nothing is saved from it, and
`src/lib/data/journal/safeSpaceReads.test.ts` pins zero writes at the driver.

## Why

The feature exists to interrupt a spiral with evidence, and the writing step
worked against that. Someone whose dysphoria is overwhelming had to compose a
paragraph before the app showed anything reassuring, so the moment the feature
exists for was the moment it asked the most. The evidence was never gated on
the write, so the composer was already doing less than its prominence
suggested.

Snapshots went for a separate reason. A snapshot copied each good-moment
entry's day, mood and note with no link back, so deleting the entry, even past
the trash window, left its words in a table the person could not see from the
entry. The pool is a live read, so a deleted entry leaves it.

## Considered and rejected

- **Keep writing optional, below the evidence.** It leaves a private spiral
  log bolted onto a crisis screen and the glossary with two concepts for one.
  The normal entry flow already has a note field for anyone who wants an
  outlet.
- **Keep recorded `doubt_entry` rows readable but stop writing new ones.**
  Readable rows would keep the record type, its table and its readers alive
  for a feature that no longer produces rows.
- **Offer a one-time export before the migration deletes the rows.** More to
  build for a small pre-1.0 app, and a deliberate call for this removal only.
- **Keep snapshots as a "save this for later" action.** The snapshot is the
  copy that outlives its source, which is the defect.

## Consequences

This is the app's one deliberate exception to giving deletion an undo window
(the entry trash is the usual one). The migrations that shipped this dropped
`doubt_entry` and later the snapshot tables outright, with no export prompt
and no grace period. Anyone who wrote a doubt entry or saved a snapshot lost
that text on update. Dropping tables that held real rows is an
irreversible-data migration and gets the scrutiny any such migration does.

Older backups still restore: `doubtEntries` and `counterevidenceSnapshots` are
on `DROPPED_ARCHIVE_SECTION_NAMES` and are skipped (ADR-0027), which
`restore.test.ts` covers.

The home-screen widget's strings no longer describe a composer. It is titled
"Safe space" (`widget_doubt_title`), and its disguise gate is unchanged (ADR-0101).

The pool's size and preview are one constant in one place
(`src/lib/data/counterevidence.ts`) because the Good moments screen and the
affirming-themes reading must agree. The screen's subtitle promises a rule
the query keeps, and the two move together.

History: decided 2026-08-22 (composer and entries removed); amended 2026-10 (snapshots dropped, widget copy fixed); screen renamed Safe space, 2026-11-02.