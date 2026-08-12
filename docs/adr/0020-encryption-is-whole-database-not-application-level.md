# Encryption is whole-database, not application-level

The live Journal is encrypted by the SQLite build itself, page by page, side
files included: SQLite3MultipleCiphers compiled to WASM on the web, SQLCipher
(`net.zetetic:sqlcipher-android`) on Android. The random data key of ADR-0018
is handed to the database as a raw key (`PRAGMA hexkey`, exercised in the web
probe; SQLCipher documents the equivalent raw-key syntax), so key stretching
stays in the wrapping layer where ADR-0013 already put it. Photos,
thumbnails, temporary imports and sensitive boot data live outside SQLite, so
neither candidate's mechanism reaches them; they are covered by per-file
AES-GCM under the same data key.

## Why

The ticket 08 prototype (branch `prototype/encryption-mechanism`,
`prototype/encryption/RESULTS.md`) exercised both candidates on both
platforms against a synthetic ten-year Journal rather than comparing them on
paper. Application-level encryption did work, and at today's Journal size its
numbers were tolerable. It lost on structure, not on a benchmark:

- FTS5 cannot index ciphertext, so search under application-level encryption
  means decrypting the whole Journal and rebuilding an in-memory index on
  every unlock, linear in Journal size, with the folded corpus resident in
  memory for the session. Under whole-database encryption the index pages are
  encrypted like every other page and FTS5 just works - measured on both
  platforms. (All prototype numbers are desktop-class; ticket 20 measures the
  ten-year Journal on real devices with encryption on.)
- On Android the framework's SQLite refused `CREATE VIRTUAL TABLE ... USING
  fts5` outright (API 35 emulator). Application-level encryption would
  therefore need a bundled SQLite build anyway, surrendering its one
  structural advantage while keeping all its costs.
- SQL stops being the query engine: AVG(mood), lab series and tag joins all
  become decrypt-everything-in-application-code, and the reactive query layer
  is built on those SQL reads today.
- Whatever stays queryable stays plaintext (epoch days, timestamps, photo
  paths, row counts), so the public encryption claim would need a boundary
  clause the whole-database mechanism does not need.

F-Droid's inclusion policy (f-droid.org, read 2026-08-12) allows prebuilt
FLOSS binaries "with specific conditions from trusted Maven repositories",
naming Maven Central, and requires the binary itself to be freely licensed.
SQLCipher's community edition is BSD-style on Maven Central;
SQLite3MultipleCiphers is MIT, its wasm wrapper Apache-2.0.

## Consequences

The web driver is replaced, not reconfigured. sqlite3mc cannot encrypt on the
async `opfs` VFS that SQLocal hard-codes, nor on a bare `opfs-sahpool`; the
SAHPool VFS must be wrapped via `sqlite3mc_vfs_create()` and the database
opened through the wrapped VFS. ADR-0017 contains the blast radius:
`sqlocal-driver.ts` is the only file that knows SQLocal, so ticket 09 writes
a new `SqliteDriver` + `MigrationFileOps` implementation behind the same
interfaces. SAHPool stores opaque pool files, so file-level operations (the
pre-migration copy, backup health checks) go through SQLite or the pool
handle `installOpfsSAHPoolVfs()` returns rather than OPFS paths.

Ticket 11's native SQLite is SQLCipher. That satisfies the spec's existing
requirement that the Android build provide FTS5, which the platform database
was measured not to.

Two libraries implement one mechanism. Raw database files never travel
between platforms - Archives do (ADR-0007) - so cross-platform file format
compatibility is not required. sqlite3mc can read SQLCipher's format, so a
shared format stays possible later without any work now.

Opening with the wrong key fails as `SQLITE_NOTADB` on both platforms - with
a passphrase and with a wrong raw key. The unlock path budgets for one such
failure mode, not for garbage reads. Side-file coverage was verified by
sentinel scan on the web (SAHPool files included); on Android the WAL was
already checkpointed away at scan time, so its encryption rests on SQLCipher's
design rather than on a byte-level observation. The claim gate tests
(ticket 09 on the web, ticket 13 on Android) scan the side files live.

The encryption claim still has its own gate. This decision covers the
database and its side files; the closed-app inspection the spec requires
(no protected content readable in any persistent file) additionally depends
on the per-file coverage of photos, thumbnails, temp imports and boot data,
which ships with tickets 09 and 12.

The web build takes `@evolu/sqlite-wasm` as a dependency, which tracks
upstream sqlite-wasm with some lag (3.50.4 against 3.53.0 at decision time).
If the lag or the project's maintenance ever becomes a problem, sqlite3mc
documents a self-build path that follows sqlite.org's own wasm build.
