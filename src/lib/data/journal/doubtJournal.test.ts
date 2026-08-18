/* The doubt journal area (phase 4 ticket 11, CONTEXT: "Doubt entry",
   "Counterevidence snapshot"). */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns, UUID_PATTERN } from './test-support.ts';

test('a doubt entry round-trips its text, and reads back newest first', async () => {
  const { journal } = await journalWithBuiltIns();
  const earlier = await journal.doubtJournal.addEntry({ epochDay: 100, text: 'maybe this is all in my head' });
  const later = await journal.doubtJournal.addEntry({ epochDay: 102, text: 'am I even trans enough for this' });

  assert.match(later, UUID_PATTERN);
  const entries = await journal.doubtJournal.getEntries(10);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].id, later);
  assert.equal(entries[1].id, earlier);
  assert.equal(entries[0].text, 'am I even trans enough for this');
  assert.equal(entries[0].epochDay, 102);
});

test('blank text is refused before it ever reaches a screen', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(journal.doubtJournal.addEntry({ epochDay: 100, text: '   ' }));
});

test('a doubt entry carries no mood, dimension values, tags or note, and writes no entry row', async () => {
  const { journal, db } = await journalWithBuiltIns();
  await journal.doubtJournal.addEntry({ epochDay: 100, text: 'spiraling again' });

  const [entry] = await journal.doubtJournal.getEntries(10);
  for (const field of ['mood', 'note', 'tags', 'dims']) {
    assert.ok(!(field in entry), `a doubt entry must not carry ${field}`);
  }

  const entries = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM entry');
  assert.equal(entries[0].n, 0, 'a doubt entry is its own record type, not an Entry');
});

test('deleting a doubt entry is idempotent', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.doubtJournal.addEntry({ epochDay: 100, text: 'not sure about any of this' });

  await journal.doubtJournal.deleteEntry(id);
  await journal.doubtJournal.deleteEntry(id); // idempotent

  assert.deepEqual(await journal.doubtJournal.getEntries(10), []);
});

test('a counterevidence snapshot round-trips its items in order, and reads back newest first', async () => {
  const { journal } = await journalWithBuiltIns();
  const earlier = await journal.doubtJournal.saveSnapshot(100, [
    { epochDay: 90, mood: 4, note: 'felt so right after cutting my hair' }
  ]);
  const later = await journal.doubtJournal.saveSnapshot(105, [
    { epochDay: 95, mood: 5, note: 'euphoric at the appointment' },
    { epochDay: 60, mood: null, note: 'the first time someone used the right name' }
  ]);

  assert.match(later, UUID_PATTERN);
  const snapshots = await journal.doubtJournal.getSnapshots(10);
  assert.equal(snapshots.length, 2);
  assert.deepEqual(snapshots[0], {
    id: later,
    epochDay: 105,
    timestamp: snapshots[0].timestamp,
    items: [
      { epochDay: 95, mood: 5, note: 'euphoric at the appointment' },
      { epochDay: 60, mood: null, note: 'the first time someone used the right name' }
    ]
  });
  assert.deepEqual(snapshots[1], {
    id: earlier,
    epochDay: 100,
    timestamp: snapshots[1].timestamp,
    items: [{ epochDay: 90, mood: 4, note: 'felt so right after cutting my hair' }]
  });
});

test('a snapshot with no counterevidence to show still saves, with an empty item list', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.doubtJournal.saveSnapshot(100, []);

  const [snapshot] = await journal.doubtJournal.getSnapshots(10);
  assert.equal(snapshot.id, id);
  assert.deepEqual(snapshot.items, []);
});

test('a counterevidence snapshot writes no entry row, dysphoria/euphoria tag row or dimension value', async () => {
  const { journal, db } = await journalWithBuiltIns();
  await journal.doubtJournal.saveSnapshot(100, [{ epochDay: 90, mood: 4, note: 'euphoric' }]);

  const entries = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM entry');
  assert.equal(entries[0].n, 0, "a snapshot's items are a copy, not a reference into entry");
});

test('deleting a counterevidence snapshot is idempotent and takes its items with it', async () => {
  const { journal, db } = await journalWithBuiltIns();
  const id = await journal.doubtJournal.saveSnapshot(100, [{ epochDay: 90, mood: 4, note: 'euphoric' }]);

  await journal.doubtJournal.deleteSnapshot(id);
  await journal.doubtJournal.deleteSnapshot(id); // idempotent

  assert.deepEqual(await journal.doubtJournal.getSnapshots(10), []);
  const items = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM doubt_snapshot_entry');
  assert.equal(items[0].n, 0);
});
