/* An archive written before the appointment rename still restores (phase 8
   features ticket 57, ADR-0066).

   `procedure_consult` became `appointment`, and with it the archive's
   consults stopped travelling nested under their procedure and got a section
   of their own. Every backup already on somebody's disk is in the old shape,
   and the way that shape fails is the reason this file exists: nothing about
   it is a parse error, so `assertRestorable` (restore.ts) would refuse the
   whole file with "the archive's appointments are not readable" and the
   person would be told their backup was damaged.

   The legacy payloads here are made by snapshotting a real journal and
   putting the result back into the shape the old build wrote, rather than by
   hand: a fixture that agreed with the alias and not with the exporter would
   prove nothing. Doing it that way also keeps this test honest as later
   tickets add sections, which a frozen byte fixture would not - and what is
   being asserted is this rename's shape change, not the archive format in
   general. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { ArchiveJournal, ArchiveProcedure } from '../archive/payload.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import type { SqliteDriver } from '../sqlite/driver.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { aliasLegacyConsults } from './archiveApply.ts';
import { openJournal, type Journal } from './journal.ts';
import { restoreArchive } from './restore.ts';

async function device(): Promise<{ driver: SqliteDriver; journal: Journal }> {
  const driver = await migratedDb();
  const journal = openJournal(driver, fakeFileStore());
  await journal.reconcileBuiltIns();
  return { driver, journal };
}

/** A journal with no photographs carries no files, and nothing here writes
    one - the alias is about rows. */
async function* noFiles(): AsyncGenerator<{ name: string; bytes: Uint8Array }> {}

/** What the build before ticket 57 would have written: no `appointments`
    key at all, and each procedure carrying its own consults. */
function asWrittenBeforeTheRename(journal: ArchiveJournal): ArchiveJournal {
  const { appointments, ...rest } = journal;
  const legacy = {
    ...rest,
    procedures: journal.procedures.map(
      (procedure): ArchiveProcedure => ({
        ...procedure,
        consults: appointments
          .filter((appointment) => appointment.procedureId === procedure.id)
          .map((appointment) => ({ id: appointment.id, epochDay: appointment.epochDay }))
      })
    )
  };
  // The premise of every assertion below: the old shape really is missing
  // the section, which is what makes restoring it a question at all.
  assert.equal('appointments' in legacy, false);
  return legacy as ArchiveJournal;
}

async function legacySnapshotOf(journal: Journal): Promise<ArchiveJournal> {
  return asWrittenBeforeTheRename((await journal.archive.snapshot()).journal);
}

test('a consult in an archive written before the rename restores as an appointment', async () => {
  const source = await device();
  const procedureId = await source.journal.procedures.upsertProcedure({
    name: 'Vaginoplasty',
    surgeryEpochDay: 20100
  });
  const consultId = await source.journal.procedures.addConsult(procedureId, 20000);

  const legacy = await legacySnapshotOf(source.journal);

  const target = await device();
  await restoreArchive(target.driver, fakeFileStore(), 'replace', { journal: legacy, files: noFiles() });

  const appointments = await target.journal.appointments.getAppointments();
  assert.equal(appointments.length, 1);
  assert.equal(appointments[0].id, consultId);
  assert.equal(appointments[0].epochDay, 20000);
  assert.equal(appointments[0].procedureId, procedureId);
  // There was nowhere for these to have been written before the rename.
  assert.equal(appointments[0].kind, null);
  assert.equal(appointments[0].place, null);
  assert.equal(appointments[0].note, null);

  // And it is still the procedure's consult on the surgery screen.
  const [procedure] = await target.journal.procedures.getProcedures();
  assert.deepEqual(procedure.consults, [{ id: consultId, epochDay: 20000 }]);
});

test('a merge of a pre-rename archive adds the consults it does not have', async () => {
  const source = await device();
  const procedureId = await source.journal.procedures.upsertProcedure({ name: 'Vaginoplasty' });
  const consultId = await source.journal.procedures.addConsult(procedureId, 20000);
  const legacy = await legacySnapshotOf(source.journal);

  // A device with an appointment of its own, which a merge must leave alone.
  const target = await device();
  const mine = await target.journal.appointments.upsertAppointment({
    epochDay: 20010,
    procedureId: null,
    kind: 'psycholog',
    place: null,
    note: null
  });

  await restoreArchive(target.driver, fakeFileStore(), 'merge', { journal: legacy, files: noFiles() });

  assert.deepEqual(
    (await target.journal.appointments.getAppointments()).map((a) => a.id),
    [consultId, mine]
  );
});

test('the alias is a no-op on an archive that already carries appointments', async () => {
  const source = await device();
  await source.journal.appointments.upsertAppointment({
    epochDay: 20000,
    procedureId: null,
    kind: 'endokrynolog',
    place: null,
    note: null
  });
  const snapshot = (await source.journal.archive.snapshot()).journal;

  assert.equal(aliasLegacyConsults(snapshot), snapshot);
});

test('a pre-rename archive with no consults still gains the section', async () => {
  const source = await device();
  await source.journal.procedures.upsertProcedure({ name: 'Vaginoplasty' });

  const aliased = aliasLegacyConsults(await legacySnapshotOf(source.journal));

  assert.deepEqual(aliased.appointments, []);
});
