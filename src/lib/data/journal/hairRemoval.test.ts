import assert from 'node:assert/strict';
import { test } from 'vitest';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal } from './journal.ts';

test('deleting a hair-removal session removes its photos and files immediately, preserving other sessions', async () => {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);
  const input = { epochDay: 20000, area: 'chin' as const, method: 'laser' as const, painRating: 2 };
  const removed = await journal.hairRemoval.upsertSession(input);
  const kept = await journal.hairRemoval.upsertSession({ ...input, epochDay: 20001 });
  const photo = { full: new Uint8Array([1, 2]), thumb: new Uint8Array([3]) };
  await journal.hairRemoval.addPhoto(kept, photo);
  const keptFiles = files.names();
  await journal.hairRemoval.addPhoto(removed, photo);
  await journal.hairRemoval.addPhoto(removed, photo);
  assert.equal(files.names().length, 6);
  assert.equal((await db.query('PRAGMA foreign_keys'))[0].foreign_keys, 1);

  await journal.hairRemoval.deleteSession(removed);
  await journal.hairRemoval.deleteSession(removed);

  assert.deepEqual(await journal.hairRemoval.getPhotos(removed), []);
  assert.equal((await journal.hairRemoval.getPhotos(kept)).length, 1);
  assert.deepEqual(files.names(), keptFiles);
  assert.deepEqual((await journal.archive.snapshot()).files.map((file) => file.name).sort(), keptFiles);
  assert.deepEqual(await db.query('PRAGMA foreign_key_check'), []);
});
