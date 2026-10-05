# 01 - data: Foreign keys enforced where the journal actually runs

Status: ready-for-agent
Status note: (reopened 2026-10-05: an archive holding a revisit on a trashed entry cannot be restored with foreign keys on, L01-01)
Was: phase-14 pre-release 01 (moved 2026-10-05)
Type: bug
Audit findings: D1
Severity: P1, blocks release
Blocked by: none
Size: M
Size note: one to two days
Model: opus
Model note: (a migration that deletes rows, and the data-loss path on every device)
UI: no. No `/impeccable` pass.

## Problem

Production SQLite never enforces foreign keys. The shipped wasm build
(`@evolu/sqlite-wasm`, SQLite 3.50.4, SQLite3MC 2.2.4) reports
`foreign_keys = 0`, and nothing in `src/lib/data/sqlite/*` or the Android
SQLCipher code turns it on. The Node test tier uses `node:sqlite`
(`src/lib/data/sqlite/test-support/node-sqlite-driver.ts:15`), which defaults
to `1`. So every test passes against behaviour no device has.

`schema.ts` declares 28 `ON DELETE CASCADE` and 2 `SET NULL` rules. Code that
relies on them:

- `hairRemoval.ts:161-163`, `deleteSession`: "Its photos go with it".
- `procedures.ts:238-255`: `procedure_photo` and `appointment`.
- `checklists.ts:192-194`: `checklist_item`.
- `entries.ts:1363-1369`: the purge deletes children by hand but misses
  `margin_note` (schema:167 relies on a cascade).

Effect on a device: a deleted hair-removal session leaves its photo rows, so
the files are never swept, and they leave the device in every backup. A
deleted procedure leaves its consult appointments; a deleted checklist leaves
its items.

Evidence, all in `.claude/audit-2026-10-03/backend/`: `fk-probe.mjs` (prints
`foreign_keys default = 0`, rechecked by hand on 3 October), and
`probe/fk.probe.test.ts`, `probe/fk2.probe.test.ts` (same code, FK on vs off:
on gives `appointmentsLeft:0, orphanItems:0, manifest:[]`; off gives
`appointmentsLeft:1, orphanItems:1` and the deleted session's two photo files
in the backup manifest). Rerun with
`npx vitest run --config <probe>/vitest.config.mjs --root <probe>`.

## What to build

1. `PRAGMA foreign_keys = ON` on every connection, where the connection is
   opened: the web worker (mc worker), `sqlocal-driver`, and Android's
   `SqliteConnection` after the key is applied.
2. Migrations run with it off and turn it back on after, because table-rebuild
   migrations (v81 and the like) must not cascade while they copy. Run
   `PRAGMA foreign_key_check` after migrating and fail loudly in tests if it
   reports anything.
3. A migration (v85) that deletes orphans already on devices: rows whose
   parent id no longer exists, for every child table with a declared foreign
   key. Photo files whose rows it deletes are left for the boot orphan sweep,
   which already handles files with no row.
4. A test that opens the production driver path (not `node:sqlite` defaults)
   and asserts `foreign_keys` is 1, so the two tiers cannot drift again. If
   the Node driver keeps its default of 1, the test must still prove the
   production open sets it.
5. Fix `entries.ts` purge for `margin_note` explicitly as well, so a purge does
   not depend on the pragma.

Archive restore runs inside a transaction that inserts parents and children:
check insert order holds with enforcement on (the Merge and Replace paths, the
golden archive test, `restore.ts`). Read `docs/adr/` on archive sections before
reordering anything.

## Acceptance

- [ ] Every connection on web and Android reports `foreign_keys = 1` after
      open; a test fails if the production open path stops setting it.
- [ ] Deleting a hair-removal session, a procedure and a checklist removes
      their children, and the next backup's manifest no longer lists the
      deleted session's photos (the fk2 probe passes with production settings).
- [ ] Migrations run with enforcement off and leave `foreign_key_check` empty.
- [ ] The v85 orphan cleanup is tested on a journal seeded with orphans of
      every kind and leaves non-orphans untouched.
- [ ] Restore (Merge and Replace) and the golden archive test pass with
      enforcement on.
- [ ] Android: checked on the device or the emulator tier that SQLCipher
      reports 1 after open.

## Reopened 2026-10-05 (full audit)

Status set back to ready-for-agent. The acceptance line "Restore (Merge and
Replace) and the golden archive test pass with enforcement on" does not hold
for one shape of data, and the audit calls it release-blocking (B1). Report:
`.claude/audit-2026-10-05/report-L01.md`, `report-L02.md`.

- **L01-01 (P1, blocks release).** A "see this again" revisit on an entry that
  was later trashed travels in the archive without its entry.
  `revisit.entry_id ... REFERENCES entry(uuid)` has no ON DELETE
  (`schema.ts:1352`); `readEntries` drops trashed entries
  (`archiveRead.ts:265`) while `revisits` is a flat section that exports every
  row (`archiveSections.ts:527-546`); `applyFlatTable` inserts them with no
  owner check (`archiveApply.ts:114-137`). With foreign keys on, every Replace
  and every Merge of that archive fails with `FOREIGN KEY constraint failed`,
  on a new phone and on the same device, and `verifyArchive`
  (`restore.ts:354-368`) still calls the file healthy because it never applies
  rows. `readMarginNotes` (`archiveRead.ts:452-459`) exports margin notes of
  trashed entries the same way. Probe:
  `.claude/audit-2026-10-05/L01/revisit.probe.ts` printed `REPLACE FAILED`,
  `MERGE FAILED` and `SAME-DEVICE REPLACE FAILED`.
- **L02-10 (P3).** `migration-runner.ts:153-166` runs `PRAGMA
  foreign_key_check` on every clean boot and throws on any row, so one future
  orphan makes the journal unopenable with a technical error, and "restore
  previous" brings the same rows back. This ticket asked for the check after
  migrating only.
- **L01-10 (P3).** `hairRemoval.ts:161-163` deletes the session row; its photo
  rows now cascade, but the files stay on disk until the next cold-boot sweep.
  `deleteTryout` and `deleteProcedure` remove their files.

What to build:

- Make revisits a hand-written section: the read joins `entry` with
  `trashed_at IS NULL`; the apply skips a row whose `entry_id` resolves to no
  entry, the way `applyMarginNotes` does, so archives already made with this
  shape still restore.
- Filter `readMarginNotes` on trash too.
- Add a trashed entry with a revisit and a margin note to `everySection()` and
  the golden fixture (it never had one, which is why the archive tests missed
  this). Consider having the backup check apply rows into an in-memory
  database.
- Run `foreign_key_check` only after migrations; on a clean boot, log a
  violation and carry on.
- `deleteSession` reads the file paths and removes the files, as `deleteTryout`
  does.

Acceptance (added):

- [ ] An archive holding a revisit and a margin note of a trashed entry
      restores by Replace and by Merge, on the same device and on a fresh one,
      with foreign keys on; the revisit probe passes.
- [ ] The backup check fails a file that cannot be applied, or the apply path
      can no longer fail on this shape (a test proves which).
- [ ] A clean boot over a journal with one orphan row opens and logs it.
- [ ] Deleting a hair-removal session removes its photo files at once.
