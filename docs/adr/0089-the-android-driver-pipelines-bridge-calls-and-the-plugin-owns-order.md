# The Android driver pipelines bridge calls; the plugin owns order

Status: Accepted
Decided: 2026-10-14
Last reviewed: 2026-11-02
Supersedes: none

`android-driver.ts` sends every call across the Capacitor bridge the moment it is made, without waiting for the previous one to return. Each call carries the driver's session (one per `createAndroidSqlite`) and a sequence number counted from the open. `SqlitePlugin` hands every connection call to a single worker thread of its own, where `CallSequencer` runs them strictly in sequence and holds back any call that arrives before the ones numbered ahead of it. `oneTransactionAtATime()` is unchanged.

## Why

On a Pixel, a warm Today visit took 1.3 to 1.6 s to show its tiles while its SQL took 20 to 37 ms. The driver's `serializer()` did `tail.then(work)`, so call N+1 did not cross the bridge until call N's answer had come back to JavaScript, and every statement paid a full round trip. Forty `SELECT 1` sent that way took 351 to 439 ms; sent at once they took 32 to 53 ms.

Order still matters. A BEGIN must reach SQLite before the statements written after it, the migration runner composes callbacks on that assumption, and ADR-0017 reads a row back by uuid, which is safe only while statements arrive in order. So order had to move from "wait for the answer" to something that holds without waiting.

## Considered options

**Rely on Capacitor's order.** Capacitor posts every plugin call to one FIFO handler thread, so pipelining alone would arrive in order today. Rejected: that is a framework internal, the driver's own header had described the opposite for months without anyone noticing, and a change there would reorder statements silently. Order is load-bearing enough to own in this repo.

**Batch the reads per screen.** One plugin method that runs many statements in a call. Kept in reserve: it changes every read's shape and each screen's code, where pipelining changes one driver and one plugin.

**Pipeline with sequence numbers.** Chosen. JavaScript stamps each call when it sends it and never stamps one it does not send, so the plugin never waits for a number that will not come.

## Consequences

**The plugin has its own thread.** Connection work used to share Capacitor's plugin thread, where a 45 ms reminders sync delayed every SQLite call behind it. `isPlaintextDatabase` and `deleteDatabase` run with no driver open, carry no number, and only share that thread.

**A failed open still reports its cause.** Calls sent behind the open reach the plugin before JavaScript knows the open failed, and fail there as "the database is not open". The driver replaces such an error with the open's own failure (`SQLITE_NOTADB` for a wrong key, ADR-0020).

**A closed session is refused, and file operations after a close get a session of their own.** `CallSequencer.finish` drops a closed session's counter and remembers a bounded set of recent closed ones (64); a later call on such a session is refused as "sqlite session is closed". That refusal once hid the failure screen's restore after every failed migration, because `boot()` closes the driver on failure and the copy check and restore came after. So the driver's file operations after its close (`preMigrationCopyIsUsable`, `restorePreMigrationCopy`, copy and cleanup) go on a second session, sent once the close has answered, since two sessions are not ordered against each other. That session is never closed, because closing it would close the plugin's one connection, which by then may belong to the next driver; it costs one empty map entry per failed boot. `android-failed-migration.test.ts` runs a failed migration over `test-support/fake-sqlite-plugin.ts`, which keeps `CallSequencer`'s rules.

**What does not change.** A transaction is still not isolated: an unrelated call made while one is open lands between its BEGIN and COMMIT, on both platforms. Two transactions still queue in `oneTransactionAtATime()`. The web driver already pipelined, since its worker takes messages in the order posted.

**Tests.** `CallSequencerTest` (JVM) delivers interleaved calls, a transaction among them, out of order and reads back the order they ran in; it fails with the holding removed. `android-driver.test.ts` checks that every call crosses before any answers and is numbered in call order; it fails against the old serializer. `tests/guards/tile-arrival-timing.mjs` holds the web tier's tile budgets in CI but cannot see the bridge, so the device numbers were the record.

History: amended 2026-10-14 (closed sessions are forgotten and refused; file operations after close use their own session); before/after device timing table dropped 2026-11-02.