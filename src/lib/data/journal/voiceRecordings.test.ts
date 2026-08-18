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
  return { journal };
}

/* journal.voice.inJournal (ticket 25): the one query that lists recordings
   across entries, mirroring photos.inJournal's shape but entry-only, so
   there is no owner name to carry alongside the date. */

test('every recording in the journal comes back dated, oldest first', async () => {
  const { journal } = await journalWithFiles();
  const later = await journal.entries.upsertEntry({
    epochDay: 20100,
    mood: 4,
    attachRecordings: [new Uint8Array([2])]
  });
  const earlier = await journal.entries.upsertEntry({
    epochDay: 20000,
    mood: 3,
    attachRecordings: [new Uint8Array([1])]
  });

  const first = (await journal.entries.getEntry(earlier))!.recordings[0];
  const second = (await journal.entries.getEntry(later))!.recordings[0];

  assert.deepEqual(await journal.voice.inJournal(), [
    { id: first.id, fileName: first.fileName, epochDay: 20000 },
    { id: second.id, fileName: second.fileName, epochDay: 20100 }
  ]);
});

test('a journal with no recordings yields an empty list, not a broken join', async () => {
  const { journal } = await journalWithFiles();
  await journal.entries.upsertEntry({ epochDay: 20100, mood: 4 });
  assert.deepEqual(await journal.voice.inJournal(), []);
});

test('an entry with several recordings orders them oldest first alongside another entry', async () => {
  const { journal } = await journalWithFiles();
  const entryId = await journal.entries.upsertEntry({
    epochDay: 20000,
    mood: 3,
    attachRecordings: [new Uint8Array([1]), new Uint8Array([2])]
  });
  const [first, second] = (await journal.entries.getEntry(entryId))!.recordings;

  assert.deepEqual(
    (await journal.voice.inJournal()).map((r) => r.id),
    [first.id, second.id]
  );
});
