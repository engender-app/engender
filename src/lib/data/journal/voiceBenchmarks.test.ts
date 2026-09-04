import assert from 'node:assert/strict';
import { test } from 'vitest';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal } from './journal.ts';
import { sweepOrphanPhotos } from './photos.ts';

async function journalWithFiles() {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);
  await journal.reconcileBuiltIns();
  return { journal, files, db };
}

/* The benchmark area (phase 5 deepening ticket 15, CONTEXT: "Voice
   benchmark"). A benchmark is a day's standardized take, not an entry's
   memo, so nothing here goes through entries.ts. */

const metrics = {
  f0MedianHz: 180.4,
  f0P10Hz: 168.2,
  f0P90Hz: 205.9,
  semitoneSd: 2.4,
  wordsPerMinute: 142.5
};

const passage = () => new Uint8Array([1, 2, 3]);
const vowelAudio = () => new Uint8Array([4, 5, 6]);

test('a benchmark saves its metrics and both audio files', async () => {
  const { journal, files } = await journalWithFiles();

  const id = await journal.voiceBenchmarks.saveBenchmark({
    epochDay: 20300,
    passageKey: 'builtin',
    passageAudio: passage(),
    vowelAudio: vowelAudio(),
    ...metrics,
    f1Hz: 690,
    f2Hz: 1240,
    snrDb: 24.5
  });

  const [saved] = await journal.voiceBenchmarks.getBenchmarks();
  assert.equal(saved.id, id);
  assert.equal(saved.epochDay, 20300);
  assert.equal(saved.passageKey, 'builtin');
  assert.equal(saved.f0MedianHz, 180.4);
  assert.equal(saved.f0P10Hz, 168.2);
  assert.equal(saved.f0P90Hz, 205.9);
  assert.equal(saved.semitoneSd, 2.4);
  assert.equal(saved.wordsPerMinute, 142.5);
  assert.equal(saved.f1Hz, 690);
  assert.equal(saved.f2Hz, 1240);
  assert.equal(saved.snrDb, 24.5);
  assert.equal(saved.note, null);
  assert.ok(saved.timestamp > 0);

  assert.deepEqual(await files.read(saved.passageFileName), passage());
  assert.ok(saved.vowelFileName);
  assert.deepEqual(await files.read(saved.vowelFileName), vowelAudio());
  // Two files, not one file under two names.
  assert.notEqual(saved.passageFileName, saved.vowelFileName);
});

test('a session with a skipped vowel saves with nulls rather than failing', async () => {
  const { journal, files } = await journalWithFiles();

  await journal.voiceBenchmarks.saveBenchmark({
    epochDay: 20300,
    passageKey: 'builtin',
    passageAudio: passage(),
    vowelAudio: null,
    ...metrics,
    f1Hz: null,
    f2Hz: null,
    snrDb: null
  });

  const [saved] = await journal.voiceBenchmarks.getBenchmarks();
  assert.equal(saved.vowelFileName, null);
  assert.equal(saved.f1Hz, null);
  assert.equal(saved.f2Hz, null);
  assert.equal(saved.snrDb, null);
  assert.equal(saved.f0MedianHz, 180.4);
  assert.deepEqual(await files.list(), [saved.passageFileName]);
});

test("a person's own note travels with the take", async () => {
  const { journal } = await journalWithFiles();
  await journal.voiceBenchmarks.saveBenchmark({
    epochDay: 20300,
    passageKey: 'builtin',
    passageAudio: passage(),
    vowelAudio: null,
    note: 'first one after two weeks off',
    ...metrics,
    f1Hz: null,
    f2Hz: null,
    snrDb: null
  });
  const [saved] = await journal.voiceBenchmarks.getBenchmarks();
  assert.equal(saved.note, 'first one after two weeks off');
});

test('benchmarks come back oldest first, with a distinct identity each', async () => {
  const { journal } = await journalWithFiles();
  const save = (epochDay: number) =>
    journal.voiceBenchmarks.saveBenchmark({
      epochDay,
      passageKey: 'builtin',
      passageAudio: passage(),
      vowelAudio: null,
      ...metrics,
      f1Hz: null,
      f2Hz: null,
      snrDb: null
    });

  const later = await save(20400);
  const earlier = await save(20100);

  assert.deepEqual(
    (await journal.voiceBenchmarks.getBenchmarks()).map((b) => b.id),
    [earlier, later]
  );
  assert.notEqual(earlier, later);
});

test('a custom passage is recorded as its own series key', async () => {
  const { journal } = await journalWithFiles();
  await journal.voiceBenchmarks.saveBenchmark({
    epochDay: 20300,
    passageKey: 'custom',
    passageAudio: passage(),
    vowelAudio: null,
    ...metrics,
    f1Hz: null,
    f2Hz: null,
    snrDb: null
  });
  const [saved] = await journal.voiceBenchmarks.getBenchmarks();
  assert.equal(saved.passageKey, 'custom');
});

test('deleting a benchmark removes the row and both its audio files', async () => {
  const { journal, files } = await journalWithFiles();
  const id = await journal.voiceBenchmarks.saveBenchmark({
    epochDay: 20300,
    passageKey: 'builtin',
    passageAudio: passage(),
    vowelAudio: vowelAudio(),
    ...metrics,
    f1Hz: 690,
    f2Hz: 1240,
    snrDb: 24.5
  });

  await journal.voiceBenchmarks.deleteBenchmark(id);

  assert.deepEqual(await journal.voiceBenchmarks.getBenchmarks(), []);
  assert.deepEqual(await files.list(), []);
});

test('a benchmark with no vowel take deletes cleanly with one file', async () => {
  const { journal, files } = await journalWithFiles();
  const id = await journal.voiceBenchmarks.saveBenchmark({
    epochDay: 20300,
    passageKey: 'builtin',
    passageAudio: passage(),
    vowelAudio: null,
    ...metrics,
    f1Hz: null,
    f2Hz: null,
    snrDb: null
  });

  await journal.voiceBenchmarks.deleteBenchmark(id);

  assert.deepEqual(await journal.voiceBenchmarks.getBenchmarks(), []);
  assert.deepEqual(await files.list(), []);
});

test('deleting a benchmark leaves another one untouched', async () => {
  const { journal, files } = await journalWithFiles();
  const kept = await journal.voiceBenchmarks.saveBenchmark({
    epochDay: 20100,
    passageKey: 'builtin',
    passageAudio: passage(),
    vowelAudio: null,
    ...metrics,
    f1Hz: null,
    f2Hz: null,
    snrDb: null
  });
  const removed = await journal.voiceBenchmarks.saveBenchmark({
    epochDay: 20300,
    passageKey: 'builtin',
    passageAudio: passage(),
    vowelAudio: vowelAudio(),
    ...metrics,
    f1Hz: 690,
    f2Hz: 1240,
    snrDb: 24.5
  });

  await journal.voiceBenchmarks.deleteBenchmark(removed);

  const remaining = await journal.voiceBenchmarks.getBenchmarks();
  assert.deepEqual(remaining.map((b) => b.id), [kept]);
  assert.deepEqual(await files.list(), [remaining[0].passageFileName]);
});

test('the boot sweep leaves a benchmark its audio', async () => {
  const { journal, files, db } = await journalWithFiles();
  await journal.voiceBenchmarks.saveBenchmark({
    epochDay: 20300,
    passageKey: 'builtin',
    passageAudio: passage(),
    vowelAudio: vowelAudio(),
    ...metrics,
    f1Hz: 690,
    f2Hz: 1240,
    snrDb: 24.5
  });
  const before = (await files.list()).sort();

  await sweepOrphanPhotos(db, files);

  assert.deepEqual((await files.list()).sort(), before);
});

/* The stored pitch track (phase 8 features ticket 09). Two cases, and the
   second is the one the screen has to survive: every benchmark taken before
   schema v58 has no track at all, because the frames it would have come
   from were never kept. */

test('a benchmark keeps the pitch track it was handed', async () => {
  const { journal } = await journalWithFiles();

  await journal.voiceBenchmarks.saveBenchmark({
    epochDay: 20301,
    passageKey: 'builtin',
    passageAudio: passage(),
    vowelAudio: null,
    ...metrics,
    f1Hz: null,
    f2Hz: null,
    snrDb: null,
    pitchTrack: '180.4,,176.2,181.0'
  });

  const [saved] = await journal.voiceBenchmarks.getBenchmarks();
  assert.equal(saved.pitchTrack, '180.4,,176.2,181.0');
});

test('a benchmark saved without a track reads back with none', async () => {
  const { journal } = await journalWithFiles();

  await journal.voiceBenchmarks.saveBenchmark({
    epochDay: 20302,
    passageKey: 'builtin',
    passageAudio: passage(),
    vowelAudio: null,
    ...metrics,
    f1Hz: null,
    f2Hz: null,
    snrDb: null
  });

  const [saved] = await journal.voiceBenchmarks.getBenchmarks();
  assert.equal(saved.pitchTrack, null);
});
