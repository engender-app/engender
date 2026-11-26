# Encryption is whole-database, not application-level

Status: Accepted
Decided: 2026-08-12
Last reviewed: 2026-11-02
Supersedes: none

The live journal is encrypted by the SQLite build itself, page by page, side files included: SQLite3MultipleCiphers compiled to WASM on the web (`src/lib/data/sqlite/mc-driver.ts`, `mc-worker.ts`), and SQLCipher (`net.zetetic:sqlcipher-android`) on Android. The random data key of ADR-0018 is handed to the database as a raw key (`PRAGMA hexkey` on the web, `x'<hex>'` on Android), so key stretching stays in the wrapping layer where ADR-0013 put it. Photos, thumbnails, temporary imports and sensitive boot data live outside SQLite and are covered by per-file AES-GCM under the same data key.

## Why

A prototype exercised both candidates on both platforms against a synthetic ten-year journal. Application-level encryption worked and its numbers were tolerable. It lost on structure:

- FTS5 cannot index ciphertext, so search would mean decrypting the whole journal and rebuilding an in-memory index on every unlock. Under whole-database encryption the index pages are encrypted like any other and FTS5 just works.
- Android's framework SQLite refused `CREATE VIRTUAL TABLE ... USING fts5`, so application-level encryption would need a bundled SQLite anyway and keep all its costs.
- SQL stops being the query engine. `AVG(mood)`, lab series and tag joins all become decrypt-everything code, and the reactive query layer is built on those reads.
- Whatever stays queryable stays plaintext (epoch days, timestamps, photo paths), so the public claim would need a boundary clause the whole-database mechanism does not.

Both libraries ship through channels F-Droid accepts: SQLCipher's community edition (BSD-style) from Maven Central, SQLite3MultipleCiphers under MIT with an Apache-2.0 wasm wrapper.

## Consequences

**The web driver wraps the SAHPool VFS.** sqlite3mc cannot encrypt on the async `opfs` VFS or on a bare `opfs-sahpool`; the pool VFS must be wrapped via `sqlite3mc_vfs_create()` and the database opened through the wrapped name. SAHPool stores opaque pool files, so file-level operations (the pre-migration copy, backup health checks) go through SQLite or the pool handle, not OPFS paths. The pre-migration copy is `VACUUM INTO` a URI carrying the same key. Note that sqlite3mc takes the destination's cipher from the source connection: `VACUUM INTO 'file:...?hexkey=...'` from an unkeyed source writes plaintext and ignores the key. This is why a plaintext journal cannot be converted by copy, and why none is (ADR-0018).

**The Android driver is a local Capacitor plugin over SQLCipher, not `@capacitor-community/sqlite`.** That plugin uses SQLCipher underneath, but it takes a passphrase, derives the database key itself and keeps the secret in encrypted SharedPreferences. ADR-0018 puts a random data key under Android Keystore and hands it to SQLite raw, with the single stretching step above it. Nothing in the community plugin's documented API accepts a raw key, so adopting it would move key derivation and storage inside a dependency. The bridge is small: `SqliteDriver` is a handful of methods, SQL in and rows out. `NativeSqliteCapabilitiesTest` asserts that a raw key opens and reopens the database and that a wrong raw key is rejected. How calls cross the bridge and keep their order is ADR-0089.

**Two libraries, one mechanism.** Raw database files never travel between platforms (archives do, ADR-0007), so cross-platform file compatibility is not required. sqlite3mc can read SQLCipher's format if that ever changes.

**A wrong key fails as `SQLITE_NOTADB`** on both platforms. The unlock path budgets for that one failure, not for garbage reads.

**The encryption claim keeps its own gate.** This decision covers the database and its side files. The closed-app inspection (ADR-0018) additionally depends on per-file coverage of photos, thumbnails, temporary imports and boot data. Android's WAL was already checkpointed away at scan time, so its encryption rests on SQLCipher's design rather than a byte-level observation.

**The web build depends on `@evolu/sqlite-wasm`**, which tracks upstream sqlite-wasm with some lag. If the lag or maintenance becomes a problem, sqlite3mc documents a self-build path.

History: amended 2026-08-18 (plaintext conversion mechanism; since removed in favor of refusal, ADR-0018), 2026-08-20 (Android driver choice) and 2026-09-23 (pipelined bridge, ADR-0089); prototype timings and conversion detail dropped 2026-11-02.