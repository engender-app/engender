/* The journal book (phase 5 ticket 17): a keepsake assembly over rows
   entries, milestones and side effects own, recomputed on every read. The
   inclusion picker is what these tests are mostly about - what a book
   carries has to be decided by the choice, not by the renderer deciding
   what to draw. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal, type Journal } from './journal.ts';
import { JOURNAL_BOOK_DEFAULT_INCLUSION, type JournalBookInclusion } from './journalBook.ts';

const shot = (full: string, thumb: string) => ({
  full: new Uint8Array([...full].map((c) => c.charCodeAt(0))),
  thumb: new Uint8Array([...thumb].map((c) => c.charCodeAt(0)))
});

async function journalWithFiles(): Promise<Journal> {
  const journal = openJournal(await migratedDb(), fakeFileStore());
  await journal.reconcileBuiltIns();
  return journal;
}

const everything: JournalBookInclusion = {
  entries: true,
  photos: true,
  tags: true,
  dysphoriaEuphoriaTags: true,
  milestones: true,
  sideEffects: true,
  openingPage: true
};

/** One journal holding one of each record type the picker offers, all inside
    [20_000, 20_010] except the two rows each read has to leave outside. */
async function seeded(): Promise<Journal> {
  const journal = await journalWithFiles();
  await journal.entries.upsertEntry({
    epochDay: 20_001,
    mood: 4,
    note: 'first light',
    tags: ['g-euphoria'],
    attachPhotos: [shot('full-bytes', 'thumb-bytes')]
  });
  await journal.entries.upsertEntry({ epochDay: 19_000, mood: 2, note: 'before the range' });
  await journal.milestones.upsertMilestone({ name: 'first appointment', epochDay: 20_002 });
  await journal.milestones.upsertMilestone({ name: 'long before', epochDay: 19_001 });
  await journal.sideEffects.upsertSideEffect({ name: 'headache', severity: 2, epochDay: 20_004 });
  await journal.sideEffects.upsertSideEffect({ name: 'older headache', severity: 2, epochDay: 19_003 });
  return journal;
}

test('the default inclusion carries entries, their photos and milestones, and nothing sensitive', async () => {
  const journal = await seeded();

  const book = await journal.journalBook.getBook(20_000, 20_010, JOURNAL_BOOK_DEFAULT_INCLUSION);

  assert.equal(book.entries.length, 1);
  assert.equal(book.entries[0].note, 'first light');
  assert.equal(book.entries[0].photos.length, 1);
  assert.equal(book.milestones.length, 1);
  assert.equal(book.milestones[0].name, 'first appointment');
  assert.deepEqual(book.entries[0].tags, []);
  assert.deepEqual(book.sideEffects, []);
  assert.equal(book.opening, null);
});

test('every record type appears once it is chosen', async () => {
  const journal = await seeded();

  const book = await journal.journalBook.getBook(20_000, 20_010, everything);

  assert.deepEqual(book.entries[0].tags, ['g-euphoria']);
  assert.equal(book.sideEffects.length, 1);
  assert.equal(book.sideEffects[0].name, 'headache');
  assert.notEqual(book.opening, null);
  assert.equal(book.opening?.entryCount, 1);
});

test('a record type left out is absent even when the range holds one', async () => {
  const journal = await seeded();

  const book = await journal.journalBook.getBook(20_000, 20_010, {
    ...everything,
    entries: false,
    photos: false,
    milestones: false
  });

  assert.deepEqual(book.entries, []);
  assert.deepEqual(book.milestones, []);
  assert.equal(book.sideEffects.length, 1);
});

test('an entry carries no photo when photos are left out', async () => {
  const journal = await seeded();

  const book = await journal.journalBook.getBook(20_000, 20_010, { ...everything, photos: false });

  assert.equal(book.entries.length, 1);
  assert.deepEqual(book.entries[0].photos, []);
});

test('every section is filtered to the chosen range', async () => {
  const journal = await seeded();

  const book = await journal.journalBook.getBook(19_000, 19_003, everything);

  assert.equal(book.entries.length, 1);
  assert.equal(book.entries[0].note, 'before the range');
  assert.equal(book.milestones.length, 1);
  assert.equal(book.milestones[0].name, 'long before');
  assert.equal(book.sideEffects.length, 1);
  assert.equal(book.sideEffects[0].name, 'older headache');
});

test('entries read oldest first, the order a book is bound in', async () => {
  const journal = await journalWithFiles();
  await journal.entries.upsertEntry({ epochDay: 20_005, mood: 3, note: 'later' });
  await journal.entries.upsertEntry({ epochDay: 20_001, mood: 3, note: 'earlier' });

  const book = await journal.journalBook.getBook(20_000, 20_010, JOURNAL_BOOK_DEFAULT_INCLUSION);

  assert.deepEqual(
    book.entries.map((entry) => entry.note),
    ['earlier', 'later']
  );
});

test('an ordinary tag and a dysphoria/euphoria tag are two separate switches', async () => {
  const journal = await journalWithFiles();
  await journal.entries.upsertEntry({
    epochDay: 20_001,
    mood: 3,
    note: 'mixed day',
    tags: ['e-happy', 'g-euphoria']
  });

  const onlyOrdinary = await journal.journalBook.getBook(20_000, 20_010, {
    ...JOURNAL_BOOK_DEFAULT_INCLUSION,
    tags: true
  });
  assert.deepEqual(onlyOrdinary.entries[0].tags, ['e-happy']);

  const onlySensitive = await journal.journalBook.getBook(20_000, 20_010, {
    ...JOURNAL_BOOK_DEFAULT_INCLUSION,
    dysphoriaEuphoriaTags: true
  });
  assert.deepEqual(onlySensitive.entries[0].tags, ['g-euphoria']);
});

test('a trashed entry stays out of the book', async () => {
  const journal = await journalWithFiles();
  const id = await journal.entries.upsertEntry({ epochDay: 20_001, mood: 3, note: 'regretted' });
  await journal.entries.deleteEntry(id);

  const book = await journal.journalBook.getBook(20_000, 20_010, JOURNAL_BOOK_DEFAULT_INCLUSION);

  assert.deepEqual(book.entries, []);
});
