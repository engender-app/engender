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

## Amended by ticket 10: how an unencrypted database becomes an encrypted one

Whole-database encryption makes the conversion of an existing Journal a
container change rather than a data migration, which is the property that
carries the `pref` table across. An export and import would not: `restore.ts`
deliberately never touches that table (ADR-0003, ADR-0011), so an archive-shaped
conversion would silently drop the PIN hash, the app-lock flags, the disguise
setting and the onboarding state.

The mechanism is not the one the pre-migration copy uses, and this is worth
recording because the obvious choice does not work. sqlite3mc takes a
destination's cipher from the source connection's, not from the destination
URI: `VACUUM INTO 'file:…?hexkey=…'` from an unencrypted source writes an
unencrypted file and ignores the key entirely. Measured, not reasoned about -
the copy came out carrying `SQLite format 3` and the seeded text in the clear.
The pre-migration copy is unaffected, because there the source connection is
already keyed. Rekeying the source first is the next idea and sqlite3mc refuses
it: "Rekeying not supported for in-memory or temporary databases".

So the conversion imports the plaintext into the SAHPool under the name the
Journal will keep (`installOpfsSAHPoolVfs()`'s `importDb`, which wants exactly
the plaintext SQLite magic a converted file no longer has) and rewrites every
page in place with `PRAGMA hexrekey`. Between those two steps a readable copy of
the Journal exists in the pool, and the rollback journal that makes the rekey
atomic holds plaintext pages while it runs. Both are inside the window in which
the source is still sitting in the OPFS root anyway and the app has not claimed
to be encrypted; both are gone before it does. The claim gate reads the pool's
bytes after a real conversion rather than taking that on trust
(`tests/browser-tier/conversion-probe.ts`).

Android's conversion is ticket 13's and does not inherit this: SQLCipher
documents `sqlcipher_export()` for exactly this direction, and has no reason to
reach for a rekey in place.

## Amended by phase 2 ticket 11: how the Android driver reaches SQLCipher

The Android `SqliteDriver` is a local Capacitor plugin over
`net.zetetic:sqlcipher-android`, not `@capacitor-community/sqlite`. The
community plugin is not the wrong library: it uses SQLCipher underneath, "even
for unencrypted databases", and its `minSdkVersion = 23` clears the API 26 the
spec asks for. The disagreement is about who holds the key.

`@capacitor-community/sqlite` takes a passphrase (`setEncryptionSecret`),
derives the database key from it and keeps the secret in encrypted
SharedPreferences. ADR-0018 puts a random data key under Android Keystore and
hands it to SQLite raw, and ADR-0013 puts the single stretching step in the
wrapping layer above it. Nothing in the plugin's documented API accepts a raw
key. Adopting it would move key derivation and key storage inside a dependency
and leave ticket 13 amending two ADRs to describe what the plugin happens to
do. Writing the bridge is the smaller cost: `SqliteDriver` is seven methods of
SQL in and rows out, which is most of what any bridge carries anyway, and
ADR-0017's seam means nothing above it can tell which side it is talking to.

Three comments named `@capacitor-community/sqlite` as the Android driver
(`driver.ts`, `migration-runner.ts`, `node-sqlite-driver.ts`). They were
written at phase 1 ticket 04, before ticket 08 measured anything, and two of
them still named SQLocal as the web driver ticket 09 replaced. Corrected here.
A guess repeated in three files reads like a decision, which is how this one
nearly became one. `prd.md` says the same thing and stays as it is: it is the
phase 0 document, unamended since the initial commit, and it is read as a
record of what was wanted rather than of what was built.

One thing the choice rests on that no measurement covers yet. The ticket 08
probe opened the Android database with a passphrase and let SQLCipher run its
KDF (105 ms to reopen and query), and recorded the raw-key path as documented
rather than exercised. This ticket opens with a raw key on device and asserts
it, though nothing is encrypted until ticket 13, because a bridge chosen for a
capability should demonstrate it before three tickets are built on top.
