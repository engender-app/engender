# 11 - data: Writes and backups that cannot fail silently

Status: done
Type: bug
Audit findings: D2, D4, D6, D7, S-06
Severity: P2
Blocked by: 01
Blocked by note: (both touch the driver layer; land 01 first)
Size: M
Size note: one to two days
Model: opus
Model note: (transaction semantics across three drivers)
UI: no. No `/impeccable` pass.

## Problems

**D2, a save inside someone else's transaction.** `transactor.ts:25-30`
admits that plain statements issued while a transaction is open land inside
it. Many journal writes are plain `driver.run` (`procedures.ts`,
`hairRemoval.ts`, `doses.upsertDose` used by the boot auto-log). Probe
`.claude/audit-2026-10-03/backend/probe/tx.probe.test.ts`: an
`upsertSession` started during a failing Merge restore resolved with an id,
then the rollback removed it (`sessionsAfter: {n: 0}`). Variant: `deletePhoto`
removes the file after its row DELETE; if that DELETE is rolled back, the row
names a deleted file.

**D4, automatic backups pile up.** `AutoExportPlugin.java:309-356` creates a
new timestamped document every run and never deletes old ones. A large journal
weekly is about 20 GB a year until `destination-full`.

**D6, no fsync.** `PhotoWriteChannel.java:137-139`, `PhotosPlugin.java:278-280`
write with `FileOutputStream(target,false)` and no `getFD().sync()` before the
row commits. After power loss a row can name a partial file (plausible).

**D7, silent backup stop.** `auto-export-scheduler.ts:74-96`: an exception
from `journal.archive.snapshot()` or anything before `runAndroidAutoExport`
returns goes to `console.error` only; `reportFailure` is never called.

**S-06.** `prefs/portableShape.ts:94` throws on an archive without
`preferences` after Replace has committed (`restoreFlow.ts:126-128`), so the
screen reports failure for a restore that landed. Known since the 1 October
audit, never ticketed.

## What to build

- D2: while a transaction is open, plain driver calls from other callers wait
  for it (the way `withReadSnapshots` blocks), in all three drivers. Keep the
  probe as a regression test. Delete the file in `deletePhoto` only after the
  row delete commits.
- D4: keep the last N verified automatic backups (N decided with Alicja;
  propose 5), deleting older ones by name prefix only after a new one has
  verified. Never delete a backup the app did not write.
- D6: sync before replying ok.
- D7: `reportFailure` in that catch, so the failure shows where backup
  failures already show.
- S-06: `portable ?? {}`, with a test.

## Acceptance

- [ ] The tx probe passes: a write that overlaps a failing transaction either
      lands or reports failure, never both.
- [ ] Automatic backups keep N; older ones go only after a verified new one.
- [ ] Photo writes are synced before the row commits.
- [ ] An exception before pack records a backup failure.
- [ ] A v2 archive without preferences restores and reports success.
