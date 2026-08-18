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

test('an entry round-trips with mood, note, dimension values, tags and body regions', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.entries.upsertEntry({
    epochDay: 100,
    timestamp: 8_640_000_000,
    mood: 4,
    note: 'łóżko',
    dims: { euphoria_dysphoria: 70, femininity: 55 },
    tags: ['e-happy', 'g-soc-eu'],
    bodyRegions: { chest: 60, voice_throat: 30 }
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
      photos: [],
      recordings: [],
      bodyRegions: { chest: 60, voice_throat: 30 }
    }
  );

  const forDay = await journal.entries.entriesForDay(100);
  assert.deepEqual(forDay.map((e) => e.id), [id]);
});

test('body regions replace as a whole set on update, unlike dimension values', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.entries.upsertEntry({
    epochDay: 100,
    mood: 3,
    bodyRegions: { chest: 40, hairline: 70 }
  });

  await journal.entries.upsertEntry({ id, mood: 3, bodyRegions: { chest: 90 } });

  assert.deepEqual((await journal.entries.getEntry(id))?.bodyRegions, { chest: 90 });
});

test('an entry can log body regions with no dysphoria tag and independently of one', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.entries.upsertEntry({ epochDay: 100, mood: 3, bodyRegions: { chest: 55 } });

  const entry = await journal.entries.getEntry(id);
  assert.deepEqual(entry?.bodyRegions, { chest: 55 });
  assert.deepEqual(entry?.tags, []);
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

test('unknown write ids throw: entry id, dimension key, tag id, body region', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(journal.entries.upsertEntry({ id: 999, mood: 4 }), /unknown entry/);
  await assert.rejects(journal.entries.upsertEntry({ epochDay: 1, mood: 4, dims: { nope: 1 } }), /unknown dimension/);
  await assert.rejects(journal.entries.upsertEntry({ epochDay: 1, mood: 4, tags: ['nope'] }), /unknown tag/);
  await assert.rejects(
    journal.entries.upsertEntry({ epochDay: 1, mood: 4, bodyRegions: { nope: 1 } }),
    /unknown body region/
  );

  const id = await journal.entries.upsertEntry({ epochDay: 1, mood: 4, bodyRegions: { chest: 1 } });
  await assert.rejects(journal.entries.upsertEntry({ id, bodyRegions: { nope: 1 } }), /unknown body region/);
});

test('deleting an entry takes its dimension values, tag links, body regions, photo rows, recording rows and files; twice is success', async () => {
  const db = await migratedDb();
  const files = fakeFileStore(['p1.jpg', 'p1-thumb.jpg', 'r1.webm']);
  const journal = openJournal(db, files);
  await journal.reconcileBuiltIns();

  const id = await journal.entries.upsertEntry({
    epochDay: 100,
    mood: 4,
    dims: { femininity: 60 },
    tags: ['e-happy'],
    bodyRegions: { chest: 30 }
  });
  db.raw.prepare("INSERT INTO photo (uuid, entry_id, file_path, updated_at) VALUES ('p1', ?, 'p1.jpg', 0)").run(id);
  db.raw
    .prepare("INSERT INTO voice_recording (uuid, entry_id, file_path, updated_at) VALUES ('r1', ?, 'r1.webm', 0)")
    .run(id);

  await journal.entries.deleteEntry(id);

  assert.equal(await journal.entries.getEntry(id), undefined);
  for (const table of ['entry_dimension_value', 'entry_tag', 'entry_body_region', 'photo', 'voice_recording']) {
    assert.equal((db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n, 0, table);
  }
  assert.deepEqual(files.names(), [], 'the thumbnail and the recording go with the entry');

  await journal.entries.deleteEntry(id); // idempotent
});

/* Voice recordings (ticket 24): entry-only, sharing the photo file store
   and the same file-before-row / row-before-file ordering (voiceRecordings.ts).
   First-class entry media alongside a photo, so the same rules photos.test.ts
   exercises against journal.photos.attach apply here against upsertEntry's
   attachRecordings/removeRecordingIds instead - there is no separate
   attach/remove call for a recording, since ticket 24 gives it no owner but
   an entry. journal.voice.inJournal (voiceRecordings.test.ts) is the one
   read that lists recordings across entries, for ticket 25's compare
   picker. */

async function journalWithFiles() {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);
  await journal.reconcileBuiltIns();
  return { db, files, journal };
}

test('attaching a recording on save writes its file and one row, and reads back', async () => {
  const { files, journal } = await journalWithFiles();

  const id = await journal.entries.upsertEntry({ epochDay: 100, mood: 4, attachRecordings: [new Uint8Array([1, 2, 3])] });

  const entry = await journal.entries.getEntry(id);
  assert.equal(entry?.recordings.length, 1);
  const recording = entry!.recordings[0];
  assert.match(recording.id, UUID_PATTERN);
  // Opaque uuid.webm (voiceRecordings/names.ts), not a label from the picker.
  assert.equal(recording.fileName, `${recording.id}.webm`);
  assert.deepEqual(files.names(), [recording.fileName]);
  assert.deepEqual(await files.read(recording.fileName), new Uint8Array([1, 2, 3]));
});

test('an entry carries several recordings, oldest first', async () => {
  const { journal } = await journalWithFiles();

  const id = await journal.entries.upsertEntry({
    epochDay: 100,
    mood: 4,
    attachRecordings: [new Uint8Array([1]), new Uint8Array([2])]
  });

  const entry = await journal.entries.getEntry(id);
  assert.equal(entry?.recordings.length, 2);
});

test('a recording file is written before its row, so a failed write leaves no row at all', async () => {
  const { db, files, journal } = await journalWithFiles();
  files.failNthWrite(1);

  await assert.rejects(
    journal.entries.upsertEntry({ epochDay: 100, mood: 4, attachRecordings: [new Uint8Array([1])] }),
    /disk full/
  );

  assert.equal((await db.query('SELECT id FROM voice_recording')).length, 0);
  assert.deepEqual(files.names(), [], 'no row may point at a recording that never landed');
});

test('a recording alone is not enough without a mood, and nothing is written', async () => {
  const { journal, files } = await journalWithFiles();

  await assert.rejects(
    journal.entries.upsertEntry({ epochDay: 100, attachRecordings: [new Uint8Array([1])] }),
    /needs a mood/
  );
  assert.deepEqual(files.names(), [], 'a rejected save writes no recording files');
});

test('editing an entry adds the recordings it brings without disturbing the ones it has', async () => {
  const { journal } = await journalWithFiles();
  const id = await journal.entries.upsertEntry({ epochDay: 100, mood: 3, attachRecordings: [new Uint8Array([1])] });
  const first = (await journal.entries.getEntry(id))!.recordings[0];

  await journal.entries.upsertEntry({ id, note: 'and another', attachRecordings: [new Uint8Array([2])] });

  const recordings = (await journal.entries.getEntry(id))!.recordings;
  assert.deepEqual(
    recordings.map((r) => r.id),
    [first.id, recordings[1].id]
  );
  assert.equal(recordings.length, 2);
});

test('removing a stored recording drops its row and file, and mood alone cannot be cleared while it remains', async () => {
  const { files, journal } = await journalWithFiles();
  const id = await journal.entries.upsertEntry({ epochDay: 100, mood: 3, attachRecordings: [new Uint8Array([1])] });
  const recordingId = (await journal.entries.getEntry(id))!.recordings[0].id;

  await journal.entries.upsertEntry({ id, removeRecordingIds: [recordingId] });

  assert.deepEqual((await journal.entries.getEntry(id))!.recordings, []);
  assert.deepEqual(files.names(), []);
});

test('an unknown recording id or one belonging to another entry is refused', async () => {
  const { journal } = await journalWithFiles();
  const id = await journal.entries.upsertEntry({ epochDay: 100, mood: 3, attachRecordings: [new Uint8Array([1])] });
  const other = await journal.entries.upsertEntry({ epochDay: 101, mood: 2 });
  const recordingId = (await journal.entries.getEntry(id))!.recordings[0].id;

  await assert.rejects(
    journal.entries.upsertEntry({ id, removeRecordingIds: ['nope'] }),
    /unknown recording/
  );
  await assert.rejects(
    journal.entries.upsertEntry({ id: other, removeRecordingIds: [recordingId] }),
    /does not belong to entry/
  );
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
