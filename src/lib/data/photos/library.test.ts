import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { Journal } from '../journal/journal';
import {
  chipOf,
  chipsFor,
  deleteFromOwner,
  libraryDeletable,
  narrowTo,
  photoChipFromQuery,
  yearMarks,
  type LibraryPhoto
} from './library.ts';

const photo = (id: string, source: LibraryPhoto['source'], epochDay: number): LibraryPhoto => ({
  id,
  fileName: `${id}.jpg`,
  epochDay,
  source,
  ownerName: null,
  ownerId: id,
  starred: false
});

test('the chip row is everything plus one chip per source present, in the fixed order', () => {
  const photos = [
    photo('a', 'procedure', 20000),
    photo('b', 'entry', 20001),
    photo('c', 'hairRemoval', 20002),
    photo('d', 'video', 20003)
  ];

  assert.deepEqual(chipsFor(photos), ['everything', 'body', 'hair', 'surgery', 'video']);
});

test('a source with no photographs draws no chip', () => {
  const photos = [photo('a', 'entry', 20000), photo('b', 'tryout', 20001)];
  assert.deepEqual(chipsFor(photos), ['everything', 'body', 'tryouts']);
});

test('Starred chip appears with starred photos and narrows across source chips', () => {
  const entry = { ...photo('entry', 'entry', 20000), starred: true };
  const milestone = { ...photo('milestone', 'milestone', 20001), starred: true };
  const hair = photo('hair', 'hairRemoval', 20002);
  const photos = [entry, milestone, hair];

  assert.deepEqual(chipsFor(photos), ['everything', 'body', 'hair', 'starred']);
  assert.deepEqual(narrowTo(photos, 'starred').map((p) => p.id), ['entry', 'milestone']);
  assert.equal(photoChipFromQuery('starred'), 'starred');
  assert.equal(chipsFor([hair]).includes('starred'), false);
  assert.deepEqual(chipsFor([entry]), ['everything', 'body', 'starred']);
});

test('one source draws no chip row at all: everything and it would be the same grid', () => {
  assert.deepEqual(chipsFor([photo('a', 'entry', 20000), photo('b', 'milestone', 20001)]), []);
  assert.deepEqual(chipsFor([]), []);
});

test('body covers entry and milestone photos, hair covers removal, progress has its own chip', () => {
  const photos = [
    photo('a', 'entry', 20000),
    photo('b', 'milestone', 20001),
    photo('c', 'progress', 20002),
    photo('d', 'hairRemoval', 20003),
    photo('e', 'tryout', 20004),
    photo('f', 'procedure', 20005),
    photo('g', 'video', 20006)
  ];

  const ids = (chip: Parameters<typeof narrowTo>[1]) => narrowTo(photos, chip).map((p) => p.id);
  assert.deepEqual(ids('everything'), ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  assert.deepEqual(ids('body'), ['a', 'b']);
  assert.deepEqual(ids('progress'), ['c']);
  assert.deepEqual(ids('hair'), ['d']);
  assert.deepEqual(ids('tryouts'), ['e']);
  assert.deepEqual(ids('surgery'), ['f']);
  assert.deepEqual(ids('video'), ['g']);
});

test('every source answers to exactly one chip', () => {
  const sources: LibraryPhoto['source'][] = [
    'entry',
    'milestone',
    'hairRemoval',
    'tryout',
    'procedure',
    'video',
    'progress'
  ];
  for (const source of sources) {
    const one = [photo('x', source, 20000)];
    assert.deepEqual(narrowTo(one, chipOf(source)), one, `${source} is not under ${chipOf(source)}`);
  }
});

test('the query names a chip, and anything else opens on everything', () => {
  assert.equal(photoChipFromQuery('hair'), 'hair');
  assert.equal(photoChipFromQuery('everything'), 'everything');
  assert.equal(photoChipFromQuery(null), 'everything');
  assert.equal(photoChipFromQuery('entry'), 'everything', 'a source key is not a chip key');
  assert.equal(photoChipFromQuery('nonsense'), 'everything');
});

test('a chip the library no longer holds falls back to everything', () => {
  const photos = [photo('a', 'entry', 20000), photo('b', 'hairRemoval', 20001)];
  assert.deepEqual(narrowTo(photos, 'tryouts'), [], 'narrowing itself stays literal');
  assert.equal(chipsFor(photos).includes('tryouts'), false);
});

/* 19723 is 1 January 2024 and 20089 is 1 January 2025 in UTC; the marks are
   read off the local calendar, so the assertions below take the year from
   the same helper the module does rather than naming one. */
test('a year mark is the first photograph of each year, and one year gets none', () => {
  const year = (epochDay: number) => new Date(epochDay * 86400000).getUTCFullYear();
  const photos = [
    photo('a', 'entry', 19723),
    photo('b', 'entry', 19800),
    photo('c', 'progress', 20089),
    photo('d', 'progress', 20100)
  ];

  const marks = yearMarks(photos);
  assert.deepEqual(
    marks.map((mark) => mark.id),
    ['a', 'c']
  );
  assert.deepEqual(
    marks.map((mark) => mark.year),
    [year(19723), year(20089)]
  );

  assert.deepEqual(yearMarks([photo('a', 'entry', 19723), photo('b', 'entry', 19800)]), []);
  assert.deepEqual(yearMarks([]), []);
});

const fakeJournal = () => {
  const calls: string[] = [];
  const record = (area: string) => async (id: string) => { calls.push(`${area}:${id}`); };
  const journal = {
    photos: { remove: record('photos') },
    hairRemoval: { deletePhoto: record('hairRemoval') },
    tryouts: { deletePhoto: record('tryouts') },
    procedures: { deletePhoto: record('procedures') },
    progressPhotos: { deletePhoto: record('progressPhotos') }
  } as unknown as Journal;
  return { journal, calls };
};

test('a photograph deleted from the library goes through the area that owns it', async () => {
  const { journal, calls } = fakeJournal();
  for (const source of ['entry', 'milestone', 'hairRemoval', 'tryout', 'procedure', 'progress'] as const) {
    await deleteFromOwner(journal, photo(`${source}-1`, source, 0));
  }
  assert.deepEqual(calls, [
    'photos:entry-1',
    'photos:milestone-1',
    'hairRemoval:hairRemoval-1',
    'tryouts:tryout-1',
    'procedures:procedure-1',
    'progressPhotos:progress-1'
  ]);
});

test('a video note cannot be deleted from the library: only its entry deletes it', async () => {
  assert.equal(libraryDeletable(photo('v', 'video', 0)), false);
  assert.equal(libraryDeletable(photo('e', 'entry', 0)), true);
  await assert.rejects(deleteFromOwner(fakeJournal().journal, photo('v', 'video', 0)));
});
