import assert from 'node:assert/strict';
import { test } from 'vitest';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { thumbFileName } from '../photos/names.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal } from './journal.ts';
import { sweepOrphanPhotos } from './photos.ts';
import { UUID_PATTERN } from './test-support.ts';

const shot = (full: string, thumb: string) => ({
  full: new Uint8Array([...full].map((c) => c.charCodeAt(0))),
  thumb: new Uint8Array([...thumb].map((c) => c.charCodeAt(0)))
});

async function journalWithFiles() {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);
  await journal.reconcileBuiltIns();
  return { db, files, journal };
}

const anEntry = (journal: ReturnType<typeof openJournal>) =>
  journal.entries.upsertEntry({ epochDay: 20000, mood: 4 });

test('attaching a photo writes both files and one row, and reads back', async () => {
  const { files, journal } = await journalWithFiles();
  const entryId = await anEntry(journal);

  const id = await journal.photos.attach({ entryId }, shot('full', 'thumb'));

  assert.match(id, UUID_PATTERN);
  const photos = (await journal.entries.getEntry(entryId))!.photos;
  assert.equal(photos.length, 1);
  assert.equal(photos[0].id, id);
  // The stored name is the opaque uuid.jpg of ticket 11, not a label and
  // not whatever the picker called the original.
  assert.equal(photos[0].fileName, `${id}.jpg`);
  assert.deepEqual(files.names(), [`${id}-thumb.jpg`, `${id}.jpg`]);
  assert.deepEqual(await files.read(`${id}.jpg`), shot('full', 'thumb').full);
  assert.deepEqual(await files.read(thumbFileName(`${id}.jpg`)), shot('full', 'thumb').thumb);
});

test('an entry carries several photos, oldest first', async () => {
  const { journal } = await journalWithFiles();
  const entryId = await anEntry(journal);

  const first = await journal.photos.attach({ entryId }, shot('a', 'A'));
  const second = await journal.photos.attach({ entryId }, shot('b', 'B'));

  const photos = (await journal.entries.getEntry(entryId))!.photos;
  assert.deepEqual(
    photos.map((p) => p.id),
    [first, second]
  );
});

test('a milestone photo goes through the same table and the same call', async () => {
  const { files, journal } = await journalWithFiles();
  const milestoneId = await journal.milestones.upsertMilestone({ name: 'HRT start', epochDay: 19000 });

  const id = await journal.photos.attach({ milestoneId }, shot('m', 'M'));

  const [milestone] = await journal.milestones.getMilestones();
  assert.equal(milestone.photo?.fileName, `${id}.jpg`);
  assert.deepEqual(files.names(), [`${id}-thumb.jpg`, `${id}.jpg`]);
});

test('an entry photo and a milestone photo land in the one photo table', async () => {
  const { db, journal } = await journalWithFiles();
  const entryId = await anEntry(journal);
  const milestoneId = await journal.milestones.upsertMilestone({ name: 'Voice', epochDay: 19000 });

  await journal.photos.attach({ entryId }, shot('e', 'E'));
  await journal.photos.attach({ milestoneId }, shot('m', 'M'));

  const rows = await db.query<{ entry_id: number | null; milestone_id: number | null }>(
    'SELECT entry_id, milestone_id FROM photo ORDER BY id'
  );
  assert.equal(rows.length, 2, 'one table, not a parallel one for milestones');
  assert.deepEqual(
    rows.map((r) => [r.entry_id != null, r.milestone_id != null]),
    [
      [true, false],
      [false, true]
    ]
  );
});

test('the entry reads its photos back with it', async () => {
  const { journal } = await journalWithFiles();
  const entryId = await anEntry(journal);
  const id = await journal.photos.attach({ entryId }, shot('x', 'X'));

  const entry = await journal.entries.getEntry(entryId);
  assert.deepEqual(entry?.photos, [{ id, fileName: `${id}.jpg` }]);
});

test('the milestone reads its photo back with it', async () => {
  const { journal } = await journalWithFiles();
  const milestoneId = await journal.milestones.upsertMilestone({ name: 'Voice', epochDay: 19500 });
  const id = await journal.photos.attach({ milestoneId }, shot('y', 'Y'));

  const [milestone] = await journal.milestones.getMilestones();
  assert.deepEqual(milestone.photo, { id, fileName: `${id}.jpg` });
});

test('files are written before the row, so a failed write leaves no row at all', async () => {
  const { db, files, journal } = await journalWithFiles();
  const entryId = await anEntry(journal);

  // A crash between the two files: the thumbnail never lands.
  files.failNthWrite(2);

  await assert.rejects(() => journal.photos.attach({ entryId }, shot('f', 'T')), /disk full/);

  const rows = await db.query('SELECT id FROM photo');
  assert.equal(rows.length, 0, 'no row may point at a photo that is not fully on disk');
  assert.deepEqual(files.names().length, 1, 'the full file is left behind for the sweep');
});

test('removing a photo drops the row and both its files', async () => {
  const { db, files, journal } = await journalWithFiles();
  const entryId = await anEntry(journal);
  const id = await journal.photos.attach({ entryId }, shot('r', 'R'));

  await journal.photos.remove(id);

  assert.deepEqual(files.names(), []);
  assert.equal((await db.query('SELECT id FROM photo')).length, 0);
  // Idempotent, like the other deletes in this journal.
  await journal.photos.remove(id);
});

test('deleting an entry takes its photo files and their thumbnails', async () => {
  const { files, journal } = await journalWithFiles();
  const entryId = await anEntry(journal);
  await journal.photos.attach({ entryId }, shot('1', 'a'));
  await journal.photos.attach({ entryId }, shot('2', 'b'));

  await journal.entries.deleteEntry(entryId);

  assert.deepEqual(files.names(), [], 'thumbnails go with the photos they belong to');
});

test('deleting a milestone takes its photo files and their thumbnails', async () => {
  const { files, journal } = await journalWithFiles();
  const milestoneId = await journal.milestones.upsertMilestone({ name: 'Surgery', epochDay: 19900 });
  await journal.photos.attach({ milestoneId }, shot('s', 'S'));

  await journal.milestones.deleteMilestone(milestoneId);

  assert.deepEqual(files.names(), []);
});

/* The orphan sweep (ADR-0008/0011). It runs on boot, after the database
   opens, and is the only thing that ever deletes a file nobody asked to
   delete - which is what lets attach, remove and import all leave a mess
   behind rather than risk losing a photo. */

test('the sweep reclaims a file no row references', async () => {
  const { db, files, journal } = await journalWithFiles();
  const entryId = await anEntry(journal);
  const kept = await journal.photos.attach({ entryId }, shot('k', 'K'));
  await files.write('99999999-dead-4000-8000-000000000000.jpg', new Uint8Array([9]));

  await sweepOrphanPhotos(db, files);

  assert.deepEqual(files.names(), [`${kept}-thumb.jpg`, `${kept}.jpg`]);
});

test("the sweep keeps a referenced photo's thumbnail, which no row names", async () => {
  const { db, files, journal } = await journalWithFiles();
  const entryId = await anEntry(journal);
  const id = await journal.photos.attach({ entryId }, shot('t', 'T'));

  await sweepOrphanPhotos(db, files);

  // file_path names only the full photo; the thumbnail is derived, so a
  // sweep that matched on the column alone would delete every thumbnail.
  assert.ok(files.names().includes(thumbFileName(`${id}.jpg`)));
});

test('the sweep reclaims the leftovers of an interrupted attach and an interrupted delete', async () => {
  const { db, files, journal } = await journalWithFiles();
  const entryId = await anEntry(journal);

  // Interrupted attach: the full file landed, the thumbnail write failed,
  // so no row was ever inserted.
  files.failNthWrite(2);
  await assert.rejects(() => journal.photos.attach({ entryId }, shot('a', 'A')));
  assert.equal(files.names().length, 1);

  // Interrupted delete: the row is gone but the app died before the files.
  const doomed = await journal.photos.attach({ entryId }, shot('d', 'D'));
  await db.run('DELETE FROM photo WHERE uuid = ?', [doomed]);

  await sweepOrphanPhotos(db, files);

  assert.deepEqual(files.names(), [], 'neither leftover survives the next boot');
});

test('the sweep leaves a milestone photo alone', async () => {
  const { db, files, journal } = await journalWithFiles();
  const milestoneId = await journal.milestones.upsertMilestone({ name: 'Voice', epochDay: 19000 });
  const id = await journal.photos.attach({ milestoneId }, shot('m', 'M'));

  await sweepOrphanPhotos(db, files);

  assert.deepEqual(files.names(), [`${id}-thumb.jpg`, `${id}.jpg`]);
});

test('the sweep is a no-op on an empty journal and an empty store', async () => {
  const { db, files } = await journalWithFiles();
  await sweepOrphanPhotos(db, files);
  assert.deepEqual(files.names(), []);
});

test('the sweep keeps a referenced voice recording, which shares this store (ticket 24)', async () => {
  const { db, files, journal } = await journalWithFiles();
  const entryId = await anEntry(journal);
  await journal.entries.upsertEntry({ id: entryId, attachRecordings: [new Uint8Array([9])] });
  const recording = (await journal.entries.getEntry(entryId))!.recordings[0];

  await sweepOrphanPhotos(db, files);

  assert.deepEqual(files.names(), [recording.fileName]);
});

test('the sweep reclaims a voice recording file no row references', async () => {
  const { db, files } = await journalWithFiles();
  await files.write('99999999-dead-4000-8000-000000000000.webm', new Uint8Array([9]));

  await sweepOrphanPhotos(db, files);

  assert.deepEqual(files.names(), []);
});

test('mood cannot be cleared from an entry even with a photo still on it', async () => {
  const { journal } = await journalWithFiles();
  // Mood is required unconditionally now (ticket 04): a photo does not
  // exempt an entry from carrying one, so clearing it is rejected even
  // though the photo remains.
  const entryId = await journal.entries.upsertEntry({ epochDay: 20001, mood: 3 });
  await journal.photos.attach({ entryId }, shot('p', 'P'));

  await assert.rejects(journal.entries.upsertEntry({ id: entryId, mood: null }), /needs a mood/);

  const entry = await journal.entries.getEntry(entryId);
  assert.equal(entry?.mood, 3);
  assert.equal(entry?.photos.length, 1);
});

/* One query for the Progress screen (ticket 08, ADR-0008): entry photos and
   milestone photos are rows in the same table, so the screen that shows
   every photo in the journal chronologically is a query, not a union
   assembled in JavaScript. */

test('every photo in the journal comes back dated, oldest first, naming its milestone', async () => {
  const { journal } = await journalWithFiles();
  const entryId = await journal.entries.upsertEntry({ epochDay: 20100, mood: 4 });
  const milestoneId = await journal.milestones.upsertMilestone({ name: 'HRT start', epochDay: 20000 });

  const second = await journal.photos.attach({ entryId }, shot('e2', 't2'));
  const first = await journal.photos.attach({ milestoneId }, shot('m1', 't1'));

  assert.deepEqual(await journal.photos.inJournal(), [
    { id: first, fileName: `${first}.jpg`, epochDay: 20000, milestoneName: 'HRT start' },
    { id: second, fileName: `${second}.jpg`, epochDay: 20100, milestoneName: null }
  ]);
});

test('a journal with no photos yields an empty list, not a broken join', async () => {
  const { journal } = await journalWithFiles();
  await journal.entries.upsertEntry({ epochDay: 20100, mood: 4 });
  assert.deepEqual(await journal.photos.inJournal(), []);
});

/* Saving an entry is one action (PRD F1), and a photo on its own is enough
   content for one (CONTEXT: "Entry"). So the photos picked in the editor
   arrive with the save rather than in a second call after it - otherwise a
   photo-only entry is rejected as empty on the way to being given its
   photo. */

test('a photo alone is not enough without a mood, and nothing is written', async () => {
  const { journal, files } = await journalWithFiles();

  await assert.rejects(
    journal.entries.upsertEntry({ epochDay: 20100, attachPhotos: [shot('one', 't1')] }),
    /needs a mood/
  );
  assert.deepEqual(files.names(), [], 'a rejected save writes no photo files');
});

test('an entry with nothing at all is still rejected, photos included in the count', async () => {
  const { journal, files } = await journalWithFiles();
  await assert.rejects(journal.entries.upsertEntry({ epochDay: 20100, attachPhotos: [] }), /needs a mood/);
  assert.deepEqual(files.names(), [], 'a rejected save writes no files');
});

test('editing an entry adds the photos it brings without disturbing the ones it has', async () => {
  const { journal } = await journalWithFiles();
  const id = await journal.entries.upsertEntry({ epochDay: 20100, mood: 3, attachPhotos: [shot('first', 't1')] });
  const first = (await journal.entries.getEntry(id))!.photos[0];

  await journal.entries.upsertEntry({ id, note: 'and another', attachPhotos: [shot('second', 't2')] });

  const photos = (await journal.entries.getEntry(id))!.photos;
  assert.deepEqual(photos.map((p) => p.id), [first.id, photos[1].id]);
  assert.equal(photos.length, 2);
});
