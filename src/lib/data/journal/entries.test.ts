/* The entries area, exercised through the driver interface (ticket 07).
   The preset-switch regression test is the one that matters most here:
   dimension values belong to the entry, not to the preset that was active
   when they were logged. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal } from './journal.ts';
import { countingDriver, journalWithBuiltIns, UUID_PATTERN } from './test-support.ts';

async function countingJournalWithBuiltIns() {
  const db = await migratedDb();
  const counting = countingDriver(db);
  const journal = openJournal(counting.driver, fakeFileStore());
  await journal.reconcileBuiltIns();
  return {
    journal,
    roundTrips: counting.roundTrips,
    resetRoundTrips: counting.resetRoundTrips
  };
}

test('an entry round-trips with mood, note, dimension values and tags', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.entries.upsertEntry({
    epochDay: 100,
    timestamp: 8_640_000_000,
    mood: 4,
    note: 'łóżko',
    dims: { euphoria_dysphoria: 70, femininity: 55 },
    tags: ['e-happy', 'g-soc-eu']
  });

  const entry = await journal.entries.getEntry(id);
  // Tags are a set; their read-back order is not part of the contract.
  assert.deepEqual(
    { ...entry, tags: entry?.tags.toSorted() },
    {
      id,
      epochDay: 100,
      timestamp: 8_640_000_000,
      mood: 4,
      note: 'łóżko',
      dims: { euphoria_dysphoria: 70, femininity: 55 },
      tags: ['e-happy', 'g-soc-eu'],
      photos: []
    }
  );

  const forDay = await journal.entries.entriesForDay(100);
  assert.deepEqual(forDay.map((e) => e.id), [id]);
});

test('rows carry a minted uuid and inserts never read lastInsertRowid blind', async () => {
  const { journal, db } = await journalWithBuiltIns();
  const first = await journal.entries.upsertEntry({ epochDay: 1, mood: 3 });
  const second = await journal.entries.upsertEntry({ epochDay: 1, mood: 5 });
  assert.notEqual(first, second);

  const uuids = db.raw
    .prepare('SELECT uuid FROM entry ORDER BY id')
    .all()
    .map((r) => (r as { uuid: string }).uuid);
  assert.equal(new Set(uuids).size, 2);
  for (const uuid of uuids) {
    assert.match(uuid, UUID_PATTERN);
  }
});

test('switching the active preset and re-saving preserves values for dimensions not in the preset', async () => {
  const { journal } = await journalWithBuiltIns();
  // Logged under the wide preset: five dimensions... well, three are enough.
  const id = await journal.entries.upsertEntry({
    epochDay: 100,
    mood: 3,
    dims: { euphoria_dysphoria: 70, masculinity: 20, binary_nonbinary: 80 }
  });

  // Re-saved under the narrow preset: the editor sends only its dimensions.
  await journal.entries.upsertEntry({ id, mood: 3, dims: { euphoria_dysphoria: 40 }, note: 'edited' });

  const entry = await journal.entries.getEntry(id);
  assert.deepEqual(entry?.dims, { euphoria_dysphoria: 40, masculinity: 20, binary_nonbinary: 80 });
  assert.equal(entry?.note, 'edited');
});

test('tags replace as a whole set on update, unlike dimension values', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.entries.upsertEntry({ epochDay: 100, mood: 3, tags: ['e-happy', 'e-calm'] });

  await journal.entries.upsertEntry({ id, mood: 3, tags: ['e-sad'] });

  assert.deepEqual((await journal.entries.getEntry(id))?.tags, ['e-sad']);
});

test('saving without a mood is rejected, moodful edits keep their mood, and moodless rows stay readable', async () => {
  const { journal, db } = await journalWithBuiltIns();
  await assert.rejects(journal.entries.upsertEntry({ epochDay: 100, note: '   ' }), /needs a mood/);

  const id = await journal.entries.upsertEntry({ epochDay: 100, mood: 4 });
  await journal.entries.upsertEntry({ id, note: 'edited without resupplying the mood' });
  assert.equal((await journal.entries.getEntry(id))?.mood, 4);

  db.raw.prepare(
    "INSERT INTO entry (uuid, epoch_day, timestamp, mood, note, updated_at) VALUES ('moodless-read', 101, 0, NULL, '', 0)"
  ).run();
  const moodlessId = db.raw.prepare("SELECT id FROM entry WHERE uuid = 'moodless-read'").get() as { id: number };
  assert.equal((await journal.entries.getEntry(moodlessId.id))?.mood, null);
  await assert.rejects(journal.entries.upsertEntry({ id: moodlessId.id, note: 'cannot save yet' }), /needs a mood/);
});

test('unknown write ids throw: entry id, dimension key, tag id', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(journal.entries.upsertEntry({ id: 999, mood: 4 }), /unknown entry/);
  await assert.rejects(journal.entries.upsertEntry({ epochDay: 1, mood: 4, dims: { nope: 1 } }), /unknown dimension/);
  await assert.rejects(journal.entries.upsertEntry({ epochDay: 1, mood: 4, tags: ['nope'] }), /unknown tag/);
});

test('deleting an entry takes its dimension values, tag links, photo rows and files; twice is success', async () => {
  const db = await migratedDb();
  const files = fakeFileStore(['p1.jpg', 'p1-thumb.jpg']);
  const journal = openJournal(db, files);
  await journal.reconcileBuiltIns();

  const id = await journal.entries.upsertEntry({
    epochDay: 100,
    mood: 4,
    dims: { femininity: 60 },
    tags: ['e-happy']
  });
  db.raw.prepare("INSERT INTO photo (uuid, entry_id, file_path, updated_at) VALUES ('p1', ?, 'p1.jpg', 0)").run(id);

  await journal.entries.deleteEntry(id);

  assert.equal(await journal.entries.getEntry(id), undefined);
  for (const table of ['entry_dimension_value', 'entry_tag', 'photo']) {
    assert.equal((db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n, 0, table);
  }
  assert.deepEqual(files.names(), [], 'the thumbnail goes with the photo');

  await journal.entries.deleteEntry(id); // idempotent
});

test('creating an entry costs fixed round trips however many tags and dimension values it carries', async () => {
  const { journal, roundTrips, resetRoundTrips } = await countingJournalWithBuiltIns();

  resetRoundTrips();
  await journal.entries.upsertEntry({
    epochDay: 100,
    mood: 3,
    dims: { femininity: 55 },
    tags: ['e-happy']
  });
  const oneEach = roundTrips();

  resetRoundTrips();
  await journal.entries.upsertEntry({
    epochDay: 101,
    mood: 3,
    dims: {
      euphoria_dysphoria: 10,
      femininity: 20,
      masculinity: 30,
      binary_nonbinary: 40,
      agender_gendered: 50
    },
    tags: ['e-happy', 'e-calm', 'e-hopeful', 'a-exercise', 'g-body-eu']
  });
  const manyEach = roundTrips();

  assert.deepEqual(
    manyEach,
    oneEach,
    `create scaled by value count: one=${JSON.stringify(oneEach)} many=${JSON.stringify(manyEach)}`
  );
});

test('updating an entry costs fixed round trips however many tags and dimension values it rewrites', async () => {
  const { journal, roundTrips, resetRoundTrips } = await countingJournalWithBuiltIns();
  const oneId = await journal.entries.upsertEntry({ epochDay: 100, mood: 3, note: 'one' });
  const manyId = await journal.entries.upsertEntry({ epochDay: 101, mood: 3, note: 'many' });

  resetRoundTrips();
  await journal.entries.upsertEntry({
    id: oneId,
    mood: 4,
    dims: { femininity: 55 },
    tags: ['e-happy']
  });
  const oneEach = roundTrips();

  resetRoundTrips();
  await journal.entries.upsertEntry({
    id: manyId,
    mood: 4,
    dims: {
      euphoria_dysphoria: 10,
      femininity: 20,
      masculinity: 30,
      binary_nonbinary: 40,
      agender_gendered: 50
    },
    tags: ['e-happy', 'e-calm', 'e-hopeful', 'a-exercise', 'g-body-eu']
  });
  const manyEach = roundTrips();

  assert.deepEqual(
    manyEach,
    oneEach,
    `update scaled by value count: one=${JSON.stringify(oneEach)} many=${JSON.stringify(manyEach)}`
  );
});

/* The bounded reads the screens use (ticket 08). A screen renders a
   handful of days or a page of hits, and none of them may pull the whole
   entry table across the worker boundary to do it. */

test('recentDays returns whole days, newest day first, and stops at the day count', async () => {
  const { journal } = await journalWithBuiltIns();
  // Day 100 has two entries, so the boundary counts days rather than rows.
  await journal.entries.upsertEntry({ epochDay: 100, timestamp: 10, mood: 1 });
  await journal.entries.upsertEntry({ epochDay: 100, timestamp: 20, mood: 2 });
  await journal.entries.upsertEntry({ epochDay: 102, mood: 3 });
  await journal.entries.upsertEntry({ epochDay: 105, mood: 4 });

  const recent = await journal.entries.recentDays(2);
  assert.deepEqual(
    recent.map((e) => [e.epochDay, e.mood]),
    [
      [105, 4],
      [102, 3]
    ]
  );

  // Both of day 100's entries arrive together, newest within the day first.
  const three = await journal.entries.recentDays(3);
  assert.deepEqual(
    three.map((e) => [e.epochDay, e.mood]),
    [
      [105, 4],
      [102, 3],
      [100, 2],
      [100, 1]
    ]
  );
});

test('recentDays on an empty journal is empty rather than an error', async () => {
  const { journal } = await journalWithBuiltIns();
  assert.deepEqual(await journal.entries.recentDays(5), []);
});

test('entriesWithTag reads newest first, up to the limit, by key or by uuid', async () => {
  const { journal } = await journalWithBuiltIns();
  const custom = await journal.tags.addTag('gender', 'voice practice');
  await journal.entries.upsertEntry({ epochDay: 100, mood: 1, tags: ['e-happy'] });
  await journal.entries.upsertEntry({ epochDay: 101, mood: 2, tags: ['e-happy', custom.id] });
  await journal.entries.upsertEntry({ epochDay: 102, mood: 3, tags: ['e-sad'] });
  await journal.entries.upsertEntry({ epochDay: 103, mood: 4, tags: ['e-happy'] });

  const happy = await journal.entries.entriesWithTag('e-happy', 10);
  assert.deepEqual(happy.map((e) => e.epochDay), [103, 101, 100]);

  assert.deepEqual((await journal.entries.entriesWithTag('e-happy', 2)).map((e) => e.epochDay), [103, 101]);
  assert.deepEqual((await journal.entries.entriesWithTag(custom.id, 10)).map((e) => e.epochDay), [101]);
  assert.deepEqual(await journal.entries.entriesWithTag('no-such-tag', 10), []);
});

test('searchEntries stops at the limit it is given, keeping the newest hits', async () => {
  const { journal } = await journalWithBuiltIns();
  for (const day of [100, 101, 102, 103]) {
    await journal.entries.upsertEntry({ epochDay: day, mood: 4, note: 'coffee with Marta' });
  }

  assert.deepEqual(
    (await journal.entries.searchEntries('coffee', [], 2)).map((e) => e.epochDay),
    [103, 102]
  );
});

test('the match count counts every match, not just the page that was asked for', async () => {
  const { journal } = await journalWithBuiltIns();
  for (const day of [100, 101, 102, 103]) {
    await journal.entries.upsertEntry({ epochDay: day, mood: 4, note: 'coffee with Marta' });
  }
  await journal.entries.upsertEntry({ epochDay: 104, mood: 2, note: 'tea instead' });

  assert.equal((await journal.entries.searchEntries('coffee', [], 2)).length, 2);
  assert.equal(await journal.entries.countSearchMatches('coffee', []), 4);
});

test('the count matches on tags as well as notes, and counts an entry matching both once', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, mood: 4, note: 'felt hopeful', tags: ['e-hopeful'] });
  await journal.entries.upsertEntry({ epochDay: 101, mood: 3, tags: ['e-hopeful'] });

  assert.equal(await journal.entries.countSearchMatches('hopeful', ['e-hopeful']), 2);
});

test('a query with nothing searchable in it counts zero rather than everything', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 100, mood: 4, note: 'coffee' });

  assert.equal(await journal.entries.countSearchMatches('...', []), 0);
});
