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
