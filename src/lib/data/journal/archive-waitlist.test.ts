/* Waiting lists travel in archives (functional-audit ticket 26). A referral
   is an appointment with no day, its referred-on day and its dated status
   updates; all three go out in the `appointments` section and come back on
   the other device, and an archive written before the ticket still restores
   with nothing waiting. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { ArchiveJournal } from '../archive/payload.ts';
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

const referral = { procedureId: null, kind: 'Gender clinic', place: 'Charing Cross', note: 'GP letter sent' };

async function journalWithAWait() {
  const source = await device();
  const waiting = await source.journal.appointments.upsertAppointment({ ...referral, epochDay: null, referredEpochDay: 19000 });
  await source.journal.appointments.addStatusUpdate({ appointmentId: waiting, epochDay: 19050, status: 'Letter came' });
  const given = await source.journal.appointments.upsertAppointment({ ...referral, kind: 'NFZ endo', epochDay: 19400, referredEpochDay: 19100 });
  await source.journal.appointments.addStatusUpdate({ appointmentId: given, epochDay: 19300, status: 'Date offered' });
  return source;
}

const read = async (journal: Journal) => ({
  waiting: await journal.appointments.getWaiting(),
  visits: await journal.appointments.getAppointments(),
  updates: await journal.appointments.getStatusUpdates()
});

test('a waiting referral, a referred-on day and the status updates restore whole', async () => {
  const source = await journalWithAWait();
  const snapshot = await source.journal.archive.snapshot();

  const target = await device();
  await restoreArchive(target.driver, fakeFileStore(), 'replace', { journal: snapshot.journal, files: noFiles() });

  const before = await read(source.journal);
  assert.equal(before.waiting.length, 1);
  assert.equal(before.updates.length, 2);
  assert.deepEqual(await read(target.journal), before);
});

test('merging brings a status update the other device added to a referral both hold', async () => {
  const source = await journalWithAWait();
  const target = await device();
  await restoreArchive(target.driver, fakeFileStore(), 'replace', {
    journal: (await source.journal.archive.snapshot()).journal,
    files: noFiles()
  });

  const [waiting] = await source.journal.appointments.getWaiting();
  await source.journal.appointments.addStatusUpdate({ appointmentId: waiting.id, epochDay: 19200, status: 'Phoned, still waiting' });
  await restoreArchive(target.driver, fakeFileStore(), 'merge', {
    journal: (await source.journal.archive.snapshot()).journal,
    files: noFiles()
  });

  assert.deepEqual(await target.journal.appointments.getStatusUpdates(), await source.journal.appointments.getStatusUpdates());
});

test('an archive written before waiting lists restores its appointments with nothing waiting', async () => {
  const source = await device();
  await source.journal.appointments.upsertAppointment({ ...referral, epochDay: 19400 });
  const journal = (await source.journal.archive.snapshot()).journal;
  // What a build before ticket 26 wrote: no referred-on day, no updates.
  const legacy = {
    ...journal,
    appointments: journal.appointments.map(({ referredEpochDay: _r, statuses: _s, ...rest }) => rest)
  } as unknown as ArchiveJournal;

  const target = await device();
  await restoreArchive(target.driver, fakeFileStore(), 'replace', { journal: legacy, files: noFiles() });

  const [visit] = await target.journal.appointments.getAppointments();
  assert.equal(visit.epochDay, 19400);
  assert.equal(visit.referredEpochDay, null);
  assert.deepEqual(await target.journal.appointments.getWaiting(), []);
  assert.deepEqual(await target.journal.appointments.getStatusUpdates(), []);
});

test('a status update listed twice in one archive restores once', async () => {
  const source = await device();
  await source.journal.appointments.upsertAppointment({ ...referral, epochDay: null, referredEpochDay: 19000 });
  const [waiting] = await source.journal.appointments.getWaiting();
  await source.journal.appointments.addStatusUpdate({ appointmentId: waiting.id, epochDay: 19200, status: 'Letter came' });
  const journal = (await source.journal.archive.snapshot()).journal;
  const doubled = {
    ...journal,
    appointments: journal.appointments.map((a) => ({ ...a, statuses: [...(a.statuses ?? []), ...(a.statuses ?? [])] }))
  };

  const target = await device();
  await restoreArchive(target.driver, fakeFileStore(), 'replace', { journal: doubled, files: noFiles() });

  assert.deepEqual(await target.journal.appointments.getStatusUpdates(), await source.journal.appointments.getStatusUpdates());
});
