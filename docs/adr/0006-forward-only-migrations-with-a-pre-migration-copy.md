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
