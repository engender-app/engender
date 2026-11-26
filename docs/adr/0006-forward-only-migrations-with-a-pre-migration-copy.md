# Migrations are forward-only, copy the database first, and refuse newer schemas

Status: Accepted
Decided: 2026-08-11
Last reviewed: 2026-11-02
Supersedes: none

Schema changes are numbered forward-only steps in `src/lib/data/sqlite/migrations.ts`, tracked in `PRAGMA user_version`, each in its own transaction. The chain starts at one baseline statement numbered 88 (`BASELINE_SCHEMA` in `schema.ts`), followed by one step numbered 119 that does the work of what were migrations 89 to 119. That was the last squash. Every migration released after it stays in the list, unedited, for as long as a release that could hold it is supported. Before any step runs the database file is copied and the copy is kept until the next clean boot. A journal numbered above `LATEST_SCHEMA_VERSION` (`schema-version.ts`) is refused with `SchemaTooNewError`. One numbered below the baseline is refused with `JournalBelowBaselineError`, and one numbered between the baseline and 119 with `JournalBetweenStepsError`.

## Why

There is no server, so no coordinated upgrade. A service worker can swap in new code with no user action, Android can lag by weeks, and F-Droid users can skip versions. The database is the user's only copy of their journal and there is no support channel that could recover it. It is small (photos are separate files), so a copy is cheap insurance.

Refusing a newer schema matters because it is reachable: a stale service worker can serve old code after a newer build migrated the file. Guessing at a future schema is how data gets mangled quietly.

## The copy

It is taken only when no usable copy exists. A copy found while migrations are pending was left by a boot that tried the same steps and failed, so it is the better one. Remaking it could not even be written if the failure damaged the file.

It can be put back. `MigrationFileOps.restorePreMigrationCopy` is offered by the boot-failure screen. It checks that the copy opens under the data key before unlinking anything. A build whose migration is deterministically broken will fail again on the restored journal, so the release it came from is what opens it.

Restore is not atomic: `VACUUM INTO` will not overwrite a file, so the database is unlinked and then written. A process killed in that window leaves an empty database beside the copy, and the forward-only rule would migrate the empty file and let the next clean boot retire the copy. So version 0 beside a copy that holds a journal is refused as `InterruptedRestoreError` and the restore finishes on the next boot. A first-ever migration that failed leaves an empty copy and is a real first run.

## The baseline

Release candidate 1 shipped at schema 88, so 88 stays the baseline, and every step written after it was folded into one before 1.0.0: an rc.1 journal updates in place in one transaction, and a process killed partway leaves it at 88. After 1.0.0 no squash exists: a released journal can be at any version a release shipped. The baseline keeps the number the chain reached, so a journal already at it opens with nothing run and the list is never loaded. A journal from 1 to 87, or from 89 to 118, came from a development build, is refused before anything is copied or written, and the failure screen offers start over. Its content can still travel: export an archive from the build that wrote it and restore it here, because the archive has its own version ladder (ADR-0007).

The baseline is proven against `sqlite/test-support/schema-v88-reference.txt` and `schema-v88-reference-rows.txt`, dumped from a database the old chain built, and the step at 119 against the `schema-v119-*` dumps the unsquashed chain made of an empty database and of the rc.1 released journal. Released formats are held by `fixtures/released/` and `tests/released-formats.test.ts`. Committed fixtures are never rebuilt to make a failure pass. A plaintext-era journal is not converted. `legacy-journal.ts` detects and refuses it.

History: amended 2026-08 to 2026-09 (copy not remade and restorable; squash to 78; encryption-conversion exception, now gone with plaintext support) and 2026-10 (baseline at 88, last squash); rewritten to the current state 2026-11-02; steps 89 to 119 folded into one 2026-11-02.