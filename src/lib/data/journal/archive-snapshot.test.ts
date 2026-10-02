import assert from 'node:assert/strict';
import { test } from 'vitest';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { makeArchiveArea } from './archive.ts';
import { makeEntriesArea } from './entries.ts';

const photo = { full: new Uint8Array([1, 2]), thumb: new Uint8Array([3]) };

test('a save during attachment metadata cannot add an entry without its attachment to a backup', async () => {
  const db = await migratedDb();
  const store = fakeFileStore();
  const entries = makeEntriesArea(db, store);
  await entries.upsertEntry({ epochDay: 100, mood: 4, note: 'before', attachPhotos: [photo] });
  let saved = false;
  let saving: Promise<number> | undefined;
  const files = {
    ...store,
    async size(name: string) {
      if (!saved) {
        saved = true;
        saving = entries.upsertEntry({ epochDay: 101, mood: 4, note: 'during', attachPhotos: [photo] });
      }
      return store.size(name);
    }
  };
  const snapshot = await makeArchiveArea(db, files).snapshot();
  await saving;
  assert.equal(await entries.countAll(), 2);
  assert.deepEqual(snapshot.journal.entries.map((entry) => ({ note: entry.note, photos: entry.photos.length })),
    [{ note: 'before', photos: 1 }]);
  const targetDb = await migratedDb();
  const targetFiles = fakeFileStore();
  await makeArchiveArea(targetDb, targetFiles).replace({
    journal: snapshot.journal,
    files: (async function* () {
      for (const file of snapshot.files) yield { name: file.name, bytes: await snapshot.readFile(file.name) };
    })()
  });
  const restored = (await makeEntriesArea(targetDb, targetFiles).entriesForDay(100))[0];
  assert.equal(restored.photos.length, 1);
  for (const file of snapshot.files) assert.deepEqual(await targetFiles.read(file.name), await store.read(file.name));
  await targetDb.close();
  await db.close();
});
