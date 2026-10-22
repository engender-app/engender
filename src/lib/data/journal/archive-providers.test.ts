/* An appointment's time and its provider travel in archives (functional-audit
   ticket 27). The provider is its own section, which appointments resolve
   their `providerId` against; an archive written before the ticket restores
   with no times and nobody named; a malformed time is refused as a corrupt
   row rather than failing inside SQLite. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { ArchiveJournal } from '../archive/payload.ts';
import { CorruptArchiveError } from '../archive/container.ts';
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

async function* noFiles(): AsyncGenerator<{ name: string; bytes: Uint8Array }> {}

const blank = { procedureId: null, kind: 'Endo', place: null, note: null };

async function journalWithAProvider() {
  const source = await device();
  const provider = await source.journal.appointments.upsertProvider({
    name: 'Dr Nowak', contact: '22 123 45 67', competence: 'good', impressions: 'Listened, no gatekeeping'
  });
  await source.journal.appointments.upsertProvider({ name: 'Clinic B', contact: null, competence: 'poor', impressions: null });
  await source.journal.appointments.upsertAppointment({ ...blank, epochDay: 19400, time: '14:30', providerId: provider });
  await source.journal.appointments.upsertAppointment({ ...blank, epochDay: null, referredEpochDay: 19000, providerId: provider });
  return source;
}

const read = async (journal: Journal) => ({
  providers: await journal.appointments.getProviders(),
  visits: await journal.appointments.getAppointments(),
  waiting: await journal.appointments.getWaiting()
});

test('providers, an appointment time and the who restore whole', async () => {
  const source = await journalWithAProvider();
  const snapshot = await source.journal.archive.snapshot();
  assert.equal(snapshot.journal.providers.length, 2);
  assert.equal(snapshot.journal.appointments.find((a) => a.epochDay === 19400)?.time, '14:30');

  for (const mode of ['replace', 'merge'] as const) {
    const target = await device();
    await restoreArchive(target.driver, fakeFileStore(), mode, { journal: snapshot.journal, files: noFiles() });
    assert.deepEqual(await read(target.journal), await read(source.journal), mode);
  }
});

test('an archive written before the ticket restores with no time and nobody named', async () => {
  const source = await journalWithAProvider();
  const journal = (await source.journal.archive.snapshot()).journal;
  const { providers: _p, ...withoutSection } = journal;
  const legacy = {
    ...withoutSection,
    appointments: journal.appointments.map(({ time: _t, providerId: _r, ...rest }) => rest)
  } as unknown as ArchiveJournal;

  const target = await device();
  await restoreArchive(target.driver, fakeFileStore(), 'replace', { journal: legacy, files: noFiles() });

  const [visit] = await target.journal.appointments.getAppointments();
  assert.equal(visit.epochDay, 19400);
  assert.equal(visit.time, null);
  assert.equal(visit.providerId, null);
  assert.deepEqual(await target.journal.appointments.getProviders(), []);
});

test('a provider the archive does not carry is dropped from the appointment, which is kept', async () => {
  const source = await journalWithAProvider();
  const journal = (await source.journal.archive.snapshot()).journal;
  const target = await device();
  await restoreArchive(target.driver, fakeFileStore(), 'replace', {
    journal: { ...journal, providers: [] },
    files: noFiles()
  });
  const [visit] = await target.journal.appointments.getAppointments();
  assert.equal(visit.time, '14:30');
  assert.equal(visit.providerId, null);
});

test('a time that is not HH:MM, or a provider with no name, is a corrupt row', async () => {
  const source = await journalWithAProvider();
  const journal = (await source.journal.archive.snapshot()).journal;
  for (const broken of [
    { ...journal, appointments: journal.appointments.map((a) => ({ ...a, time: '25:00' })) },
    { ...journal, providers: journal.providers.map((p) => ({ ...p, name: ' ' })) }
  ]) {
    const target = await device();
    await assert.rejects(
      restoreArchive(target.driver, fakeFileStore(), 'replace', { journal: broken, files: noFiles() }),
      CorruptArchiveError
    );
  }
});
