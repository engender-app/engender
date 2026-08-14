import assert from 'node:assert/strict';
import { test } from 'vitest';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal } from './journal.ts';

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

test('saving an entry commits its fields, added photos and removed photos together', async () => {
  const { files, journal } = await journalWithFiles();
  const entryId = await journal.entries.upsertEntry({
    epochDay: 20_000,
    mood: 3,
    note: 'before',
    attachPhotos: [shot('old-full', 'old-thumb')]
  });
  const oldPhoto = (await journal.entries.getEntry(entryId))!.photos[0];

  await journal.entries.upsertEntry({
    id: entryId,
    note: 'after',
    attachPhotos: [shot('new-full', 'new-thumb')],
    removePhotoIds: [oldPhoto.id]
  });

  const saved = (await journal.entries.getEntry(entryId))!;
  assert.equal(saved.note, 'after');
  assert.equal(saved.photos.length, 1);
  assert.notEqual(saved.photos[0].id, oldPhoto.id);
  assert.deepEqual(files.names(), [`${saved.photos[0].id}-thumb.jpg`, `${saved.photos[0].id}.jpg`]);
});

test('an entry save rejects a removed photo owned by another entry before writing anything', async () => {
  const { files, journal } = await journalWithFiles();
  const entryId = await journal.entries.upsertEntry({
    epochDay: 20_000,
    mood: 3,
    note: 'unchanged',
    attachPhotos: [shot('mine', 'mine-thumb')]
  });
  const otherId = await journal.entries.upsertEntry({
    epochDay: 20_001,
    mood: 3,
    attachPhotos: [shot('theirs', 'theirs-thumb')]
  });
  const otherPhoto = (await journal.entries.getEntry(otherId))!.photos[0];
  const beforeFiles = files.names();

  await assert.rejects(
    journal.entries.upsertEntry({
      id: entryId,
      note: 'must not land',
      attachPhotos: [shot('new', 'new-thumb')],
      removePhotoIds: [otherPhoto.id]
    }),
    /does not belong to entry/
  );

  const entry = (await journal.entries.getEntry(entryId))!;
  assert.equal(entry.note, 'unchanged');
  assert.equal(entry.photos.length, 1);
  assert.deepEqual(files.names(), beforeFiles);
});

test('an entry save rejects an unknown removed photo before writing anything', async () => {
  const { files, journal } = await journalWithFiles();
  const entryId = await journal.entries.upsertEntry({ epochDay: 20_000, mood: 4 });

  await assert.rejects(
    journal.entries.upsertEntry({
      id: entryId,
      mood: 5,
      attachPhotos: [shot('new', 'new-thumb')],
      removePhotoIds: ['00000000-dead-4000-8000-000000000000']
    }),
    /unknown photo/
  );

  assert.equal((await journal.entries.getEntry(entryId))!.mood, 4);
  assert.deepEqual(files.names(), []);
});

test('a new entry rejects photo removals because no photo can belong to it yet', async () => {
  const { files, journal } = await journalWithFiles();
  const ownerId = await journal.entries.upsertEntry({
    epochDay: 20_000,
    mood: 3,
    attachPhotos: [shot('owned', 'owned-thumb')]
  });
  const ownedPhoto = (await journal.entries.getEntry(ownerId))!.photos[0];
  const beforeFiles = files.names();

  await assert.rejects(
    journal.entries.upsertEntry({
      epochDay: 20_001,
      mood: 4,
      attachPhotos: [shot('new', 'new-thumb')],
      removePhotoIds: [ownedPhoto.id]
    }),
    /does not belong to a new entry/
  );

  assert.deepEqual(await journal.entries.entriesForDay(20_001), []);
  assert.deepEqual(files.names(), beforeFiles);
});

test('the empty-entry check uses the final photo state and writes nothing when it fails', async () => {
  const { files, journal } = await journalWithFiles();
  const entryId = await journal.entries.upsertEntry({
    epochDay: 20_000,
    mood: 3,
    attachPhotos: [shot('only', 'only-thumb')]
  });
  const before = (await journal.entries.getEntry(entryId))!;
  const beforeFiles = files.names();

  // Clearing the mood alongside removing the only photo leaves the final
  // state with nothing at all - the check has to see that combined state,
  // not just the photo half of it.
  await assert.rejects(
    journal.entries.upsertEntry({ id: entryId, mood: null, removePhotoIds: [before.photos[0].id] }),
    /needs a mood/
  );

  assert.deepEqual(await journal.entries.getEntry(entryId), before);
  assert.deepEqual(files.names(), beforeFiles);
});

test('a photo file-write failure leaves the previous entry and photos visible', async () => {
  const { files, journal } = await journalWithFiles();
  const entryId = await journal.entries.upsertEntry({
    epochDay: 20_000,
    mood: 3,
    note: 'before',
    attachPhotos: [shot('old', 'old-thumb')]
  });
  const before = (await journal.entries.getEntry(entryId))!;
  files.failNthWrite(2);

  await assert.rejects(
    journal.entries.upsertEntry({
      id: entryId,
      note: 'must roll back',
      attachPhotos: [shot('new', 'new-thumb')],
      removePhotoIds: [before.photos[0].id]
    }),
    /disk full/
  );

  assert.deepEqual(await journal.entries.getEntry(entryId), before);
  assert.equal(files.names().length, 3, 'the old pair stays and the loose new full file awaits the sweep');
});

test('a transaction failure leaves new files loose but preserves the previous entry and photos', async () => {
  const { db, files, journal } = await journalWithFiles();
  const entryId = await journal.entries.upsertEntry({
    epochDay: 20_000,
    mood: 3,
    note: 'before',
    attachPhotos: [shot('old', 'old-thumb')]
  });
  const before = (await journal.entries.getEntry(entryId))!;
  db.raw.exec(`
    CREATE TRIGGER fail_entry_save BEFORE UPDATE ON entry
    BEGIN SELECT RAISE(ABORT, 'transaction failed'); END
  `);

  await assert.rejects(
    journal.entries.upsertEntry({
      id: entryId,
      note: 'must roll back',
      attachPhotos: [shot('new', 'new-thumb')],
      removePhotoIds: [before.photos[0].id]
    }),
    /transaction failed/
  );

  assert.deepEqual(await journal.entries.getEntry(entryId), before);
  assert.equal(files.names().length, 4, 'both new files landed before the failed transaction');
});

test('post-commit file cleanup failure does not make a completed entry save fail', async () => {
  const { files, journal } = await journalWithFiles();
  const entryId = await journal.entries.upsertEntry({
    epochDay: 20_000,
    mood: 3,
    note: 'before',
    attachPhotos: [shot('old', 'old-thumb')]
  });
  const oldPhoto = (await journal.entries.getEntry(entryId))!.photos[0];
  files.failNthRemove(1);

  await journal.entries.upsertEntry({
    id: entryId,
    note: 'committed',
    attachPhotos: [shot('new', 'new-thumb')],
    removePhotoIds: [oldPhoto.id]
  });

  const saved = (await journal.entries.getEntry(entryId))!;
  assert.equal(saved.note, 'committed');
  assert.equal(saved.photos.length, 1);
  assert.notEqual(saved.photos[0].id, oldPhoto.id);
  assert.equal(files.names().length, 4, 'the old files remain for the orphan sweep');
});

test('saving a new milestone commits its fields and replacement photo together', async () => {
  const { files, journal } = await journalWithFiles();

  const id = await journal.milestones.upsertMilestone({
    name: 'HRT start',
    epochDay: 19_000,
    photo: { action: 'replace', photo: shot('new', 'new-thumb') }
  });

  const [saved] = await journal.milestones.getMilestones();
  assert.equal(saved.id, id);
  assert.equal(saved.photo?.fileName, `${saved.photo?.id}.jpg`);
  assert.deepEqual(files.names(), [`${saved.photo?.id}-thumb.jpg`, `${saved.photo?.id}.jpg`]);
});

test('preserving a milestone photo leaves every existing row untouched', async () => {
  const { journal } = await journalWithFiles();
  const id = await journal.milestones.upsertMilestone({ name: 'Before', epochDay: 19_000 });
  const first = await journal.photos.attach({ milestoneId: id }, shot('one', 'one-thumb'));
  const second = await journal.photos.attach({ milestoneId: id }, shot('two', 'two-thumb'));

  await journal.milestones.upsertMilestone({
    id,
    name: 'After',
    epochDay: 19_001,
    photo: { action: 'preserve' }
  });

  assert.deepEqual(
    (await journal.photos.inJournal()).map((photo) => photo.id),
    [first, second]
  );
});

test('removing a milestone photo removes every existing photo row', async () => {
  const { files, journal } = await journalWithFiles();
  const id = await journal.milestones.upsertMilestone({ name: 'Before', epochDay: 19_000 });
  await journal.photos.attach({ milestoneId: id }, shot('one', 'one-thumb'));
  await journal.photos.attach({ milestoneId: id }, shot('two', 'two-thumb'));

  await journal.milestones.upsertMilestone({
    id,
    name: 'After',
    epochDay: 19_001,
    photo: { action: 'remove' }
  });

  assert.equal((await journal.milestones.getMilestones())[0].photo, null);
  assert.deepEqual(await journal.photos.inJournal(), []);
  assert.deepEqual(files.names(), []);
});

test('replacing a milestone photo removes every old row and attaches at most one replacement', async () => {
  const { files, journal } = await journalWithFiles();
  const id = await journal.milestones.upsertMilestone({ name: 'Before', epochDay: 19_000 });
  const first = await journal.photos.attach({ milestoneId: id }, shot('one', 'one-thumb'));
  const second = await journal.photos.attach({ milestoneId: id }, shot('two', 'two-thumb'));

  await journal.milestones.upsertMilestone({
    id,
    name: 'After',
    epochDay: 19_001,
    photo: { action: 'replace', photo: shot('new', 'new-thumb') }
  });

  const photos = await journal.photos.inJournal();
  assert.equal(photos.length, 1);
  assert.ok(![first, second].includes(photos[0].id));
  assert.deepEqual(files.names(), [`${photos[0].id}-thumb.jpg`, `${photos[0].id}.jpg`]);
});

test('a replacement file-write failure leaves the previous milestone and photo visible', async () => {
  const { files, journal } = await journalWithFiles();
  const id = await journal.milestones.upsertMilestone({ name: 'Before', epochDay: 19_000 });
  await journal.photos.attach({ milestoneId: id }, shot('old', 'old-thumb'));
  const before = (await journal.milestones.getMilestones())[0];
  files.failNthWrite(2);

  await assert.rejects(
    journal.milestones.upsertMilestone({
      id,
      name: 'Must not land',
      epochDay: 19_001,
      photo: { action: 'replace', photo: shot('new', 'new-thumb') }
    }),
    /disk full/
  );

  assert.deepEqual((await journal.milestones.getMilestones())[0], before);
  assert.equal(files.names().length, 3, 'the old pair stays and the loose new full file awaits the sweep');
});

test('a transaction failure leaves replacement files loose but preserves the milestone and photo', async () => {
  const { db, files, journal } = await journalWithFiles();
  const id = await journal.milestones.upsertMilestone({ name: 'Before', epochDay: 19_000 });
  await journal.photos.attach({ milestoneId: id }, shot('old', 'old-thumb'));
  const before = (await journal.milestones.getMilestones())[0];
  db.raw.exec(`
    CREATE TRIGGER fail_milestone_save BEFORE UPDATE ON milestone
    BEGIN SELECT RAISE(ABORT, 'transaction failed'); END
  `);

  await assert.rejects(
    journal.milestones.upsertMilestone({
      id,
      name: 'Must roll back',
      epochDay: 19_001,
      photo: { action: 'replace', photo: shot('new', 'new-thumb') }
    }),
    /transaction failed/
  );

  assert.deepEqual((await journal.milestones.getMilestones())[0], before);
  assert.equal(files.names().length, 4, 'both replacement files landed before the failed transaction');
});

test('post-commit cleanup failure does not make a completed milestone replacement fail', async () => {
  const { files, journal } = await journalWithFiles();
  const id = await journal.milestones.upsertMilestone({ name: 'Before', epochDay: 19_000 });
  const oldId = await journal.photos.attach({ milestoneId: id }, shot('old', 'old-thumb'));
  files.failNthRemove(1);

  await journal.milestones.upsertMilestone({
    id,
    name: 'Committed',
    epochDay: 19_001,
    photo: { action: 'replace', photo: shot('new', 'new-thumb') }
  });

  const [saved] = await journal.milestones.getMilestones();
  assert.equal(saved.name, 'Committed');
  assert.notEqual(saved.photo?.id, oldId);
  assert.equal(files.names().length, 4, 'the old files remain for the orphan sweep');
});
