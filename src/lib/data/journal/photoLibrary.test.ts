import assert from 'node:assert/strict';
import { test } from 'vitest';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal } from './journal.ts';

/* journal.photoLibrary (phase 11 ticket 14): the one read behind "every
   photo in your journal". Six tables, one dated list, each row saying
   where it came from.

   photos.inJournal() is deliberately not this - it stays the `photo`
   table's own read, because four callers delete, star and count what it
   returns and every one of them needs a `photo` row (the ticket's Comment
   has the list). */

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

/** One photograph in each of the six sources, every one on its own day, so
    a test can name what it expects by day rather than by tie-break. */
async function oneOfEach(journal: ReturnType<typeof openJournal>) {
  const entryId = await journal.entries.upsertEntry({ epochDay: 20000, mood: 4 });
  const entryPhoto = await journal.photos.attach({ entryId }, shot('e'));

  const milestoneId = await journal.milestones.upsertMilestone({
    name: 'First appointment',
    epochDay: 20001,
    photo: { action: 'replace', photo: shot('m') }
  });
  const milestonePhoto = (await journal.milestones.getMilestones()).find((one) => one.id === milestoneId)!
    .photo!.id;

  const hairPhoto = await journal.hairProgress.addPhoto(20002, shot('h'));

  const sessionId = await journal.hairRemoval.upsertSession({
    epochDay: 20003,
    area: 'chin',
    method: 'laser',
    painRating: 2
  });
  const removalPhoto = await journal.hairRemoval.addPhoto(sessionId, shot('r'));

  const tryoutId = await journal.tryouts.upsertTryout({
    kind: 'name',
    label: 'Wren',
    startEpochDay: 19990,
    endEpochDay: null
  });
  const tryoutPhoto = await journal.tryouts.addPhoto(tryoutId, 20004, shot('t'));

  const procedureId = await journal.procedures.upsertProcedure({ name: 'Orchiectomy' });
  const procedurePhoto = await journal.procedures.addPhoto(procedureId, 20005, shot('p'));

  const videoEntry = await journal.entries.upsertEntry({
    epochDay: 20006,
    mood: 3,
    attachVideos: [new Uint8Array([9])]
  });
  const videoNote = (await journal.entries.getEntry(videoEntry))!.videos[0].id;

  return {
    entryId,
    videoEntry,
    ids: {
      entryPhoto,
      milestonePhoto,
      hairPhoto,
      removalPhoto,
      tryoutPhoto,
      procedurePhoto,
      videoNote
    }
  };
}

test('every photograph in the journal appears once, dated, with its source and owner name', async () => {
  const { journal } = await journalWithFiles();
  const { ids } = await oneOfEach(journal);

  const library = await journal.photoLibrary.inJournal();

  assert.deepEqual(
    library.map((photo) => [photo.id, photo.source, photo.epochDay, photo.ownerName]),
    [
      [ids.entryPhoto, 'entry', 20000, null],
      [ids.milestonePhoto, 'milestone', 20001, 'First appointment'],
      [ids.hairPhoto, 'hair', 20002, null],
      [ids.removalPhoto, 'hairRemoval', 20003, null],
      [ids.tryoutPhoto, 'tryout', 20004, 'Wren'],
      [ids.procedurePhoto, 'procedure', 20005, 'Orchiectomy'],
      [ids.videoNote, 'video', 20006, null]
    ]
  );
});

test('a photograph carries the file its own table stores, and a video note its webm', async () => {
  const { journal } = await journalWithFiles();
  const { ids } = await oneOfEach(journal);

  const byId = new Map((await journal.photoLibrary.inJournal()).map((photo) => [photo.id, photo]));

  assert.equal(byId.get(ids.hairPhoto)!.fileName, `${ids.hairPhoto}.jpg`);
  assert.equal(byId.get(ids.videoNote)!.fileName, `${ids.videoNote}.webm`);
});

test('a hair-removal photograph is dated to its session, which is the only day it has', async () => {
  const { journal } = await journalWithFiles();
  const sessionId = await journal.hairRemoval.upsertSession({
    epochDay: 19500,
    area: 'upper_lip',
    method: 'electrolysis',
    painRating: 3
  });
  const photoId = await journal.hairRemoval.addPhoto(sessionId, shot('r'));

  assert.deepEqual(await journal.photoLibrary.inJournal(), [
    {
      id: photoId,
      fileName: `${photoId}.jpg`,
      epochDay: 19500,
      source: 'hairRemoval',
      ownerName: null,
      starred: false
    }
  ]);
});

test("a trashed entry's photograph and its video note both drop out", async () => {
  const { journal } = await journalWithFiles();
  const { entryId, videoEntry, ids } = await oneOfEach(journal);

  await journal.entries.deleteEntry(entryId);
  await journal.entries.deleteEntry(videoEntry);

  const library = await journal.photoLibrary.inJournal();
  assert.equal(
    library.some((photo) => photo.id === ids.entryPhoto || photo.id === ids.videoNote),
    false
  );
  assert.equal(library.length, 5, 'the other five tables have no trash state to check');
});

test('order is by day, then by source, then by the order a table was written in', async () => {
  const { journal } = await journalWithFiles();
  const entryId = await journal.entries.upsertEntry({ epochDay: 20000, mood: 4 });
  const second = await journal.photos.attach({ entryId }, shot('b'));
  const first = await journal.photos.attach({ entryId }, shot('a'));
  const hair = await journal.hairProgress.addPhoto(20000, shot('h'));
  const older = await journal.hairProgress.addPhoto(19000, shot('o'));

  assert.deepEqual(
    (await journal.photoLibrary.inJournal()).map((photo) => photo.id),
    [older, second, first, hair]
  );
});

test("an entry photograph's day override wins, the same as it does in photos.inJournal", async () => {
  const { journal } = await journalWithFiles();
  const entryId = await journal.entries.upsertEntry({ epochDay: 20000, mood: 4 });
  const photoId = await journal.photos.attach({ entryId }, shot('e'));

  await journal.photos.setEpochDayOverride(photoId, 9000);

  assert.equal((await journal.photoLibrary.inJournal())[0].epochDay, 9000);
});

test('an empty journal yields an empty library, not a broken join', async () => {
  const { journal } = await journalWithFiles();
  await journal.entries.upsertEntry({ epochDay: 20000, mood: 4 });
  assert.deepEqual(await journal.photoLibrary.inJournal(), []);
});

test('starred reads the library shape, and only the photo table can be starred', async () => {
  const { journal } = await journalWithFiles();
  const { ids } = await oneOfEach(journal);

  await journal.photos.setStarred(ids.milestonePhoto, true);

  assert.deepEqual(await journal.photoLibrary.starred(), [
    {
      id: ids.milestonePhoto,
      fileName: `${ids.milestonePhoto}.jpg`,
      epochDay: 20001,
      source: 'milestone',
      ownerName: 'First appointment',
      starred: true
    }
  ]);
});

test('the library agrees with the tables it reads: nothing is dropped and nothing is doubled', async () => {
  const { db, journal } = await journalWithFiles();
  await oneOfEach(journal);

  const counted = async (table: string) =>
    (await db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))[0].n;
  const stored =
    (await counted('photo')) +
    (await counted('hair_photo')) +
    (await counted('hair_removal_photo')) +
    (await counted('tryout_photo')) +
    (await counted('procedure_photo')) +
    (await counted('video_note'));

  const library = await journal.photoLibrary.inJournal();
  assert.equal(library.length, stored);
  assert.equal(new Set(library.map((photo) => photo.id)).size, stored);
});
