import assert from 'node:assert/strict';
import { test } from 'vitest';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { filesOf } from '../photos/names.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal } from './journal.ts';
import { sweepOrphanPhotos } from './photos.ts';

/* journal.progressPhotos: a shot taken on
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

/* Poses as the person's own list: the four built-ins
   are seeded by key and can be renamed and hidden but never deleted; a
   custom pose is minted a uuid, and deleting it takes its photos with it. */

test('the four built-in poses are there, in order, under the catalogue name', async () => {
  const { journal } = await journalWithFiles();
  assert.deepEqual(await journal.progressPhotos.getPoses(), [
    { id: 'front', builtIn: true, name: '', hidden: false },
    { id: 'side', builtIn: true, name: '', hidden: false },
    { id: 'back', builtIn: true, name: '', hidden: false },
    { id: 'hair', builtIn: true, name: '', hidden: false }
  ]);
});

test('a custom pose is added after the built-ins, renamed, hidden and shown', async () => {
  const { journal } = await journalWithFiles();
  const id = await journal.progressPhotos.addPose('Flexing');
  await journal.progressPhotos.renamePose(id, 'Arms up');
  await journal.progressPhotos.setPoseHidden(id, true);
  const poses = await journal.progressPhotos.getPoses();
  assert.deepEqual(poses.at(-1), { id, builtIn: false, name: 'Arms up', hidden: true });
  await journal.progressPhotos.setPoseHidden(id, false);
  assert.equal((await journal.progressPhotos.getPoses()).at(-1)?.hidden, false);
});

test('a built-in pose takes a name of its own and gives it back with an empty one', async () => {
  const { journal } = await journalWithFiles();
  await journal.progressPhotos.renamePose('side', 'Profile');
  assert.equal((await journal.progressPhotos.getPoses())[1].name, 'Profile');
  await journal.progressPhotos.renamePose('side', '');
  assert.equal((await journal.progressPhotos.getPoses())[1].name, '');
});

test('a photo in a custom pose reads under that pose', async () => {
  const { journal } = await journalWithFiles();
  const pose = await journal.progressPhotos.addPose('Flexing');
  await journal.progressPhotos.addPhoto(20000, pose, shot('c'));
  assert.equal((await journal.progressPhotos.getPhotos())[0].pose, pose);
});

test('deleting a custom pose deletes its photos and their files, and leaves the rest', async () => {
  const { files, journal } = await journalWithFiles();
  const pose = await journal.progressPhotos.addPose('Flexing');
  await journal.progressPhotos.addPhoto(20000, pose, shot('c'));
  const kept = await journal.progressPhotos.addPhoto(20000, 'front', shot('f'));
  const gone = (await journal.progressPhotos.getPhotos()).find((photo) => photo.pose === pose)!;

  await journal.progressPhotos.deletePose(pose);

  assert.deepEqual((await journal.progressPhotos.getPhotos()).map((photo) => photo.id), [kept]);
  assert.deepEqual((await journal.progressPhotos.getPoses()).map((p) => p.id), ['front', 'side', 'back', 'hair']);
  for (const name of filesOf(gone.fileName)) assert.equal(await files.read(name), null);
});

test('a built-in pose cannot be deleted', async () => {
  const { journal } = await journalWithFiles();
  await assert.rejects(journal.progressPhotos.deletePose('front'));
  assert.equal((await journal.progressPhotos.getPoses()).length, 4);
});

async function contents(journal: Awaited<ReturnType<typeof journalWithFiles>>['journal'], drop?: 'progressPoses') {
  const snapshot = await journal.archive.snapshot();
  const archived = { ...snapshot.journal } as Record<string, unknown>;
  if (drop) delete archived[drop];
  return {
    journal: archived as unknown as typeof snapshot.journal,
    fileCount: snapshot.files.length,
    files: (async function* () {
      for (const file of snapshot.files) yield { name: file.name, bytes: await snapshot.readFile(file.name) };
    })()
  };
}

test('an archive written before poses were a list (120, 121) restores with the built-ins as they are', async () => {
  const { journal: source } = await journalWithFiles();
  await source.progressPhotos.addPhoto(20000, 'side', shot('s'));
  const { journal: target } = await journalWithFiles();
  await target.progressPhotos.addPose('Leftover');

  await target.archive.replace(await contents(source, 'progressPoses'));

  assert.deepEqual((await target.progressPhotos.getPoses()).map((p) => p.id), ['front', 'side', 'back', 'hair']);
  assert.deepEqual((await target.progressPhotos.getPhotos()).map((p) => p.pose), ['side']);
});

test('custom poses, a renamed built-in and their photos travel in an archive', async () => {
  const { journal: source } = await journalWithFiles();
  const pose = await source.progressPhotos.addPose('Flexing');
  await source.progressPhotos.renamePose('back', 'Behind');
  await source.progressPhotos.setPoseHidden('side', true);
  await source.progressPhotos.addPhoto(20000, pose, shot('c'));
  const { journal: target } = await journalWithFiles();

  await target.archive.replace(await contents(source));

  assert.deepEqual(await target.progressPhotos.getPoses(), [
    { id: 'front', builtIn: true, name: '', hidden: false },
    { id: 'side', builtIn: true, name: '', hidden: true },
    { id: 'back', builtIn: true, name: 'Behind', hidden: false },
    { id: 'hair', builtIn: true, name: '', hidden: false },
    { id: pose, builtIn: false, name: 'Flexing', hidden: false }
  ]);
  assert.deepEqual((await target.progressPhotos.getPhotos()).map((p) => p.pose), [pose]);
});

test('the hair pose is a built-in like the others: shown by default, renamed or hidden at will', async () => {
  const { journal } = await journalWithFiles();
  const id = await journal.progressPhotos.addPhoto(20000, 'hair', shot('h'));

  assert.deepEqual((await journal.progressPhotos.getPhotos()).map((p) => [p.id, p.pose]), [[id, 'hair']]);
  assert.equal((await journal.progressPhotos.getPoses()).find((p) => p.id === 'hair')?.hidden, false);

  await journal.progressPhotos.renamePose('hair', 'Scalp');
  await journal.progressPhotos.setPoseHidden('hair', true);
  assert.deepEqual((await journal.progressPhotos.getPoses()).find((p) => p.id === 'hair'), {
    id: 'hair', builtIn: true, name: 'Scalp', hidden: true
  });
  await assert.rejects(journal.progressPhotos.deletePose('hair'));
});
