# Migrations are forward-only, copy the database first, and refuse newer schemas

Schema changes run as numbered forward-only steps tracked in `PRAGMA user_version`,
each inside a transaction. Before any step runs, the database file is copied and
the copy is kept until the next clean boot. The app refuses to open a database
whose `user_version` is higher than the code knows.

## Why

There is no server, so there is no coordinated upgrade and no way to know what
version a given device is on. A PWA service worker can swap in new code with no
user action, the Android build can lag by weeks, and F-Droid users can skip
versions entirely.

Transactions cover a failure inside a step but not a corrupt file or a process
killed mid-migration, and the database being migrated is the user's only copy of
their journal. There is no support channel that could recover it. A journal
database is small (text and numbers; photos are separate files), so the copy is
cheap insurance on the one asset with no backup.

Refusing a newer `user_version` matters because that case is reachable in practice:
a stale service worker can serve old code after a newer version has already
migrated the database. Guessing at a schema from the future is how data gets
mangled quietly.

## Amended by ticket 10: the encryption conversion retires its source at verification

Converting a plaintext-era Journal to an encrypted one (phase 2 ticket 10) is a
migration in this ADR's sense, and it follows the rule with one difference. Its
pre-conversion state is the source database itself: nothing plaintext is
destroyed until the encrypted copy has been reopened under the data key and
counted table by table against the original. That gives the same guarantee the
copy exists for, without making a copy at all.

The difference is when the source goes. This ADR keeps a copy until the next
clean boot; the conversion deletes the source as soon as the copy is verified,
in the same boot. Holding it one boot longer would mean the app calling itself
encrypted while a readable copy of the whole Journal sits in OPFS, which
ADR-0018 cannot claim over. A copy already verified page for page has nothing
left to insure against, and the window this closes is the only one in which
both forms exist and the app is not saying so.

The version refusal applies unchanged, and is checked before the conversion
starts rather than after: converting a schema this build does not know would
write a faithful encrypted copy and then fail to open it, having already
retired the only copy an older build could read.

## Amended by ticket 04: the copy is not remade, and it can be put back

Insurance nobody can claim on is not insurance, so ticket 04 turned the copy
from a file that exists into a recovery this app performs. Three changes.

**The copy is taken only when there is not one already.** "Before any step runs,
the database file is copied" now means "unless a copy from an earlier boot is
still there". A copy on disk when migrations are pending was left by a boot that
tried these same steps and did not finish them, so it is the better of the two:
taken before the attempt that failed, from a file nothing had been at. Remaking
it would spend that, and if the failed attempt damaged the database the
replacement could not be written at all, so a retry would destroy the only way
back and leave nothing in its place.

**The copy can become the live database again.** `MigrationFileOps` gained
`restorePreMigrationCopy`, which the boot-failure screen offers when a copy is
there. On the web it goes through both keyed pagers, like the copy itself, and
it verifies the copy under the data key before unlinking anything: a copy that
cannot be opened is not a recovery point, and finding that out afterwards would
be finding it out too late. What comes back is the Journal as it was, which is
the honest limit worth stating - a build whose migration is deterministically
broken will fail again on it, and the release the Journal came from is what
opens it.

**An unmigrated database beside a readable copy is refused.** Restoring cannot
be atomic here: SQLite's `VACUUM INTO` will not write over an existing file, so
the database is unlinked and then written. A process killed in that window
leaves an empty file with the copy beside it, and this ADR's forward-only rule
would happily migrate the empty file to the current schema, open it, and let the
next clean boot retire the copy - the whole Journal gone, silently, exactly what
the copy exists to prevent. So that state is recognised and the restore is
finished on the next boot instead. The question asked is whether the copy holds
a journal rather than whether the file is there, because a first-ever migration
that failed leaves an empty database beside an empty copy, and that is a real
first run.
