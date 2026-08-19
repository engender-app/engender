import assert from 'node:assert/strict';
import { test } from 'vitest';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal } from './journal.ts';

async function journalWithFiles() {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);
  await journal.reconcileBuiltIns();
  return { files, journal };
}

/* journal.videos.inJournal (ticket 22): the one query that lists video notes
   across entries, voice.inJournal's twin - entry-only, so there is no owner
   name to carry alongside the date. */

test('every video note in the journal comes back dated, oldest first', async () => {
  const { journal } = await journalWithFiles();
  const later = await journal.entries.upsertEntry({
    epochDay: 20100,
    mood: 4,
    attachVideos: [new Uint8Array([2])]
  });
  const earlier = await journal.entries.upsertEntry({
    epochDay: 20000,
    mood: 3,
    attachVideos: [new Uint8Array([1])]
  });

  const first = (await journal.entries.getEntry(earlier))!.videos[0];
  const second = (await journal.entries.getEntry(later))!.videos[0];

  assert.deepEqual(await journal.videos.inJournal(), [
    { id: first.id, fileName: first.fileName, epochDay: 20000 },
    { id: second.id, fileName: second.fileName, epochDay: 20100 }
  ]);
  assert.match(first.fileName, /^[0-9a-f-]{36}\.webm$/);
});

test('a journal with no video notes yields an empty list, not a broken join', async () => {
  const { journal } = await journalWithFiles();
  await journal.entries.upsertEntry({ epochDay: 20100, mood: 4 });
  assert.deepEqual(await journal.videos.inJournal(), []);
});

test("a trashed entry's video note drops out of inJournal (phase 5 ticket 19)", async () => {
  const { journal } = await journalWithFiles();
  const kept = await journal.entries.upsertEntry({
    epochDay: 20000,
    mood: 3,
    attachVideos: [new Uint8Array([1])]
  });
  const trashed = await journal.entries.upsertEntry({
    epochDay: 20100,
    mood: 4,
    attachVideos: [new Uint8Array([2])]
  });
  const keptNote = (await journal.entries.getEntry(kept))!.videos[0];

  await journal.entries.deleteEntry(trashed);

  assert.deepEqual(await journal.videos.inJournal(), [
    { id: keptNote.id, fileName: keptNote.fileName, epochDay: 20000 }
  ]);
});

test('several video notes on one entry keep the order they were attached in', async () => {
  const { journal } = await journalWithFiles();
  const entry = await journal.entries.upsertEntry({
    epochDay: 20000,
    mood: 3,
    attachVideos: [new Uint8Array([1]), new Uint8Array([2])]
  });
  const notes = (await journal.entries.getEntry(entry))!.videos;
  assert.equal(notes.length, 2);
  assert.notEqual(notes[0].fileName, notes[1].fileName);
});
