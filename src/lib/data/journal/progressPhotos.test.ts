import assert from 'node:assert/strict';
import { test } from 'vitest';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { filesOf } from '../photos/names.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal } from './journal.ts';
import { sweepOrphanPhotos } from './photos.ts';

/* journal.progressPhotos (pre-release-human 12, bug 25): a shot taken on
   purpose in a pose, dated in its own right, stored through the same
   file-before-row pipeline every other photograph uses. */

async function journalWithFiles() {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);
  await journal.reconcileBuiltIns();
  return { db, files, journal };
}

const shot = (mark: string) => ({
  full: new Uint8Array([...mark].map((c) => c.charCodeAt(0))),
  thumb: new Uint8Array([...mark].map((c) => c.charCodeAt(0)))
});

test('photos read back per pose, oldest first, with their files stored', async () => {
  const { files, journal } = await journalWithFiles();
  const later = await journal.progressPhotos.addPhoto(20010, 'front', shot('b'));
  const earlier = await journal.progressPhotos.addPhoto(20000, 'front', shot('a'));
  const side = await journal.progressPhotos.addPhoto(20005, 'side', shot('s'));

  const photos = await journal.progressPhotos.getPhotos();
  assert.deepEqual(
    photos.map((photo) => [photo.id, photo.pose, photo.epochDay]),
    [[earlier, 'front', 20000], [side, 'side', 20005], [later, 'front', 20010]]
  );
  const [full, thumb] = filesOf(photos[0].fileName);
  assert.ok(await files.read(full));
  assert.ok(await files.read(thumb));
});

test('a pose the code does not know reads as front rather than vanishing', async () => {
  const { db, journal } = await journalWithFiles();
  db.raw.exec(
    "INSERT INTO progress_photo (uuid, epoch_day, pose, file_path, updated_at) VALUES ('x', 1, 'lying', 'x.jpg', 1)"
  );
  assert.equal((await journal.progressPhotos.getPhotos())[0].pose, 'front');
});

test('deleting a photo removes its row and its files, and is idempotent', async () => {
  const { files, journal } = await journalWithFiles();
  const id = await journal.progressPhotos.addPhoto(20000, 'back', shot('k'));
  const [photo] = await journal.progressPhotos.getPhotos();

  await journal.progressPhotos.deletePhoto(id);
  await journal.progressPhotos.deletePhoto(id);

  assert.deepEqual(await journal.progressPhotos.getPhotos(), []);
  for (const name of filesOf(photo.fileName)) assert.equal(await files.read(name), null);
});

test('the library lists a progress photo under its own source', async () => {
  const { journal } = await journalWithFiles();
  const id = await journal.progressPhotos.addPhoto(20000, 'side', shot('p'));
  const library = await journal.photoLibrary.inJournal();
  assert.deepEqual(
    library.map((photo) => [photo.id, photo.source, photo.ownerId]),
    [[id, 'progress', id]]
  );
});

test('the last write is the newest photo on or before today', async () => {
  const { journal } = await journalWithFiles();
  assert.equal(await journal.progressPhotos.lastWriteEpochDay(20000), null);
  await journal.progressPhotos.addPhoto(19990, 'front', shot('a'));
  await journal.progressPhotos.addPhoto(20010, 'front', shot('b'));
  assert.equal(await journal.progressPhotos.lastWriteEpochDay(20000), 19990);
});

test('the orphan sweep keeps both files of a progress photo', async () => {
  const { db, files, journal } = await journalWithFiles();
  await journal.progressPhotos.addPhoto(20000, 'front', shot('f'));
  const [photo] = await journal.progressPhotos.getPhotos();

  await sweepOrphanPhotos(db, files);

  assert.deepEqual(files.names(), [...filesOf(photo.fileName)].sort());
});
