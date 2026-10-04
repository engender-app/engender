import { expect, test } from 'vitest';
import { migratedDb } from '../sqlite/test-support/migrated-db';
import { fakeFileStore } from '../photos/test-support/fake-file-store';
import { openJournal } from './journal';
import { restoreArchive } from './restore';

function latch() {
  let resolve!: () => void;
  return { promise: new Promise<void>((done) => { resolve = done; }), release: () => resolve() };
}

test('a hair-removal save overlapping a failed Merge survives its rollback', async () => {
  const source = await migratedDb();
  const sourceJournal = openJournal(source, fakeFileStore());
  await sourceJournal.reconcileBuiltIns();
  await sourceJournal.entries.upsertEntry({ epochDay: 19000, mood: 3, note: 'first' });
  await sourceJournal.entries.upsertEntry({ epochDay: 19001, mood: 3, note: 'last' });
  const snapshot = await sourceJournal.archive.snapshot();
  const bad = { ...snapshot.journal, entries: snapshot.journal.entries.map((entry, i) => i === 1 ? { ...entry, epochDay: null } : entry) };
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);
  await journal.reconcileBuiltIns();
  const entered = latch();
  const release = latch();
  const transaction = db.transaction.bind(db);
  db.transaction = (work) => transaction(async (scope) => {
    entered.release();
    await release.promise;
    return work(scope);
  });
  const restoring = restoreArchive(db, files, 'merge', {
    journal: bad as typeof snapshot.journal, files: (async function* () {})()
  });
  const refused = expect(restoring).rejects.toThrow();
  await entered.promise;
  const saving = journal.hairRemoval.upsertSession({ epochDay: 20003, area: 'chin', method: 'laser', painRating: 2 });
  await new Promise((done) => setTimeout(done, 0));
  release.release();
  await refused;
  await expect(saving).resolves.toEqual(expect.any(String));
  expect((await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM hair_removal_session'))[0].n).toBe(1);
  await db.close();
  await source.close();
});

test('photo removal waits for an overlapping rollback before deleting bytes', async () => {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);
  const entryId = await journal.entries.upsertEntry({
    epochDay: 20000, mood: 3, attachPhotos: [{ full: new Uint8Array([1]), thumb: new Uint8Array([2]) }]
  });
  const [photo] = (await journal.entries.getEntry(entryId))!.photos;
  const names = files.names();
  const entered = latch();
  const release = latch();
  const failed = db.transaction(async (scope) => {
    await scope.run('UPDATE entry SET mood = 4 WHERE id = ?', [entryId]);
    entered.release();
    await release.promise;
    throw new Error('deliberate rollback');
  });
  const refusal = expect(failed).rejects.toThrow('deliberate rollback');
  await entered.promise;
  let removed = false;
  const removal = journal.photos.remove(photo.id).then(() => { removed = true; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(removed).toBe(false);
  expect(files.names()).toEqual(names);
  release.release();
  await refusal;
  await removal;
  expect((await journal.entries.getEntry(entryId))!.photos).toEqual([]);
  expect(files.names()).toEqual([]);
  await db.close();
});

test('photo removal keeps rows and bytes when its transaction rolls back', async () => {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);
  const entryId = await journal.entries.upsertEntry({
    epochDay: 20000, mood: 3, attachPhotos: [{ full: new Uint8Array([1]), thumb: new Uint8Array([2]) }]
  });
  const [photo] = (await journal.entries.getEntry(entryId))!.photos;
  const names = files.names();
  const refusing = openJournal({
    ...db,
    transaction: (work) => db.transaction(async (scope) => {
      await work(scope);
      throw new Error('commit refused');
    })
  }, files);
  await expect(refusing.photos.remove(photo.id)).rejects.toThrow('commit refused');
  expect((await journal.entries.getEntry(entryId))!.photos).toEqual([photo]);
  expect(files.names()).toEqual(names);
  await db.close();
});
