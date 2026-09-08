/* A procedure's kind (phase 9 carpet ticket 17) and an archive written
   before it still restores.

   The legacy payload here is made by snapshotting a real journal and
   stripping the fields the old build never wrote, the same approach
   archive-legacy-consults.test.ts takes for the appointment rename: a
   fixture that agreed with the default and not with the exporter would
   prove nothing. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { ArchiveJournal, ArchiveProcedure } from '../archive/payload.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import type { SqliteDriver } from '../sqlite/driver.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal, type Journal } from './journal.ts';
import { restoreArchive } from './restore.ts';

async function device(): Promise<{ driver: SqliteDriver; journal: Journal }> {
  const driver = await migratedDb();
  const journal = openJournal(driver, fakeFileStore());
  await journal.reconcileBuiltIns();
  return { driver, journal };
}

/** A journal with no photographs carries no files, and nothing here writes
    one - the legacy payload is about the `kind` field alone. */
async function* noFiles(): AsyncGenerator<{ name: string; bytes: Uint8Array }> {}

/** What the build before ticket 17 would have written: no `kind` or
    `dilationOptIn` on a procedure at all. */
function asWrittenBeforeTheKind(journal: ArchiveJournal): ArchiveJournal {
  return {
    ...journal,
    procedures: journal.procedures.map((procedure): ArchiveProcedure => {
      const { kind: _kind, dilationOptIn: _dilationOptIn, ...rest } = procedure;
      return rest;
    })
  };
}

test('a procedure in an archive written before the kind restores as custom', async () => {
  const source = await device();
  await source.journal.procedures.upsertProcedure({ name: 'top surgery', surgeryEpochDay: 20100 });
  const legacy = asWrittenBeforeTheKind((await source.journal.archive.snapshot()).journal);
  // The premise of the assertion below: the old shape really is missing the
  // field, which is what makes restoring it a question at all.
  assert.equal('kind' in legacy.procedures[0], false);

  const target = await device();
  await restoreArchive(target.driver, fakeFileStore(), 'replace', { journal: legacy, files: noFiles() });

  const [procedure] = await target.journal.procedures.getProcedures();
  assert.equal(procedure.kind, 'custom');
  assert.equal(procedure.dilationOptIn, false);
});

test('a kind and a custom procedure\'s dilation opt-in travel through the archive', async () => {
  const source = await device();
  await source.journal.procedures.upsertProcedure({ name: 'top surgery', kind: 'chest_reconstruction' });
  await source.journal.procedures.upsertProcedure({ name: 'my own thing', kind: 'custom', dilationOptIn: true });

  const snapshot = (await source.journal.archive.snapshot()).journal;

  const target = await device();
  await restoreArchive(target.driver, fakeFileStore(), 'replace', { journal: snapshot, files: noFiles() });

  const restored = await target.journal.procedures.getProcedures();
  assert.deepEqual(
    restored.map((p) => [p.name, p.kind, p.dilationOptIn]).sort(),
    [
      ['my own thing', 'custom', true],
      ['top surgery', 'chest_reconstruction', false]
    ]
  );
});
