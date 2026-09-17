import assert from 'node:assert/strict';
import { test } from 'vitest';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { FILE_OWNERS } from './fileOwnership.ts';

import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { openJournal } from './journal.ts';
import { sweepOrphanPhotos } from './photos.ts';


test('every file-owning schema column has shared ownership facts', async () => {
  const db = await migratedDb();
  const tables = await db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'");
  const actual: string[] = [];
  for (const { name } of tables) {
    const columns = await db.query<{ name: string }>(`PRAGMA table_info("${name}")`);
    for (const column of columns) {
      if (column.name.endsWith('file_path')) actual.push(`${name}.${column.name}`);
    }
  }
  const declared = Object.values(FILE_OWNERS).flatMap((owner) =>
    owner.fileColumns.map((column) => `${owner.table}.${column}`)
  );
  assert.deepEqual(declared.sort(), actual.sort());
});

const audio = new Uint8Array([7, 8, 9]);
const photo = { full: new Uint8Array([1, 2]), thumb: new Uint8Array([3]) };

async function device() {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);
  await journal.reconcileBuiltIns();
  return { db, files, journal };
}

test('every attachment survives archive restore and cleanup removes only orphans', async () => {
  const { db, files, journal } = await device();
  const entry = await journal.entries.upsertEntry({
    epochDay: 20000, mood: 3, attachRecordings: [audio], attachVideos: [audio]
  });
  await journal.photos.attach({ entryId: entry }, photo);
  const milestone = await journal.milestones.upsertMilestone({ name: 'First', epochDay: 20000 });
  await journal.photos.attach({ milestoneId: milestone }, photo);
  await journal.hairProgress.addPhoto(20000, photo);
  const session = await journal.hairRemoval.upsertSession({
    epochDay: 20000, area: 'chin', method: 'laser', painRating: 2
  });
  await journal.hairRemoval.addPhoto(session, photo);
  const procedure = await journal.procedures.upsertProcedure({ name: 'Surgery', surgeryEpochDay: 20000 });
  await journal.procedures.addPhoto(procedure, 20001, photo);
  const tryout = await journal.tryouts.upsertTryout({ kind: 'name', label: 'Alex', startEpochDay: 20000, endEpochDay: null });
  await journal.tryouts.addPhoto(tryout, 20001, photo);
  await journal.documents.addDocument({ epochDay: 20000, title: 'Image' }, photo);
  await journal.documents.addDocument({ epochDay: 20000, title: 'PDF' }, { pdfBytes: audio, thumb: photo.thumb });
  await journal.documents.addDocument({ epochDay: 20000, title: 'PDF without preview' }, { pdfBytes: audio, thumb: null });
  for (const vowelAudio of [audio, null]) {
    await journal.voiceBenchmarks.saveBenchmark({
      epochDay: 20000, passageKey: 'builtin', passageAudio: audio, vowelAudio,
      f0MedianHz: 180, f0P10Hz: 160, f0P90Hz: 200, semitoneSd: 2,
      wordsPerMinute: 140, f1Hz: null, f2Hz: null, snrDb: null
    });
  }
  const expected = files.names();
  assert.equal(expected.length, 22);
  await files.write('orphan.jpg', audio);
  const snapshot = await journal.archive.snapshot();
  assert.deepEqual(snapshot.files.map((file) => file.name).sort(), expected);
  await sweepOrphanPhotos(db, files);
  assert.deepEqual(files.names(), expected);

  const restored = await device();
  await restored.journal.archive.replace({
    journal: snapshot.journal,
    files: (async function* () {
      for (const { name } of snapshot.files) yield { name, bytes: await snapshot.readFile(name) };
    })()
  });
  await sweepOrphanPhotos(restored.db, restored.files);
  assert.deepEqual(restored.files.names(), expected);
  for (const name of expected) assert.deepEqual(await restored.files.read(name), await files.read(name));
  assert.deepEqual((await restored.journal.archive.snapshot()).journal, snapshot.journal);
});

test('trash attachments stay on disk but do not travel in archives', async () => {
  const { db, files, journal } = await device();
  const entry = await journal.entries.upsertEntry({
    epochDay: 20000, mood: 3, attachRecordings: [audio], attachVideos: [audio]
  });
  await journal.photos.attach({ entryId: entry }, photo);
  const expected = files.names();
  await journal.entries.deleteEntry(entry);
  assert.deepEqual((await journal.archive.snapshot()).files, []);
  await sweepOrphanPhotos(db, files);
  assert.deepEqual(files.names(), expected);
});
