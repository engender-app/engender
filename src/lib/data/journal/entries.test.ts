/* The entries area, exercised through the driver interface (ticket 07).
   The preset-switch regression test is the one that matters most here:
   dimension values belong to the entry, not to the preset that was active
   when they were logged. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal } from './journal.ts';
import { journalWithBuiltIns, UUID_PATTERN } from './test-support.ts';

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

test('switching the active preset and re-saving preserves values for axes not in the preset', async () => {
  const { journal } = await journalWithBuiltIns();
  // Logged under the wide preset: five axes... well, three are enough.
  const id = await journal.entries.upsertEntry({
    epochDay: 100,
    dims: { euphoria_dysphoria: 70, masculinity: 20, binary_nonbinary: 80 }
  });

  // Re-saved under the narrow preset: the editor sends only its axes.
  await journal.entries.upsertEntry({ id, dims: { euphoria_dysphoria: 40 }, note: 'edited' });

  const entry = await journal.entries.getEntry(id);
  assert.deepEqual(entry?.dims, { euphoria_dysphoria: 40, masculinity: 20, binary_nonbinary: 80 });
  assert.equal(entry?.note, 'edited');
});

test('tags replace as a whole set on update, unlike dimension values', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.entries.upsertEntry({ epochDay: 100, tags: ['e-happy', 'e-calm'] });

  await journal.entries.upsertEntry({ id, tags: ['e-sad'] });

  assert.deepEqual((await journal.entries.getEntry(id))?.tags, ['e-sad']);
});

test('saving an entry with nothing in it is rejected, on insert and on update', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(journal.entries.upsertEntry({ epochDay: 100, note: '   ' }), /needs a mood/);

  const id = await journal.entries.upsertEntry({ epochDay: 100, mood: 4 });
  await assert.rejects(journal.entries.upsertEntry({ id, mood: null }), /needs a mood/);
  // The failed update left the entry intact.
  assert.equal((await journal.entries.getEntry(id))?.mood, 4);
});

test('unknown write ids throw: entry id, dimension key, tag id', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(journal.entries.upsertEntry({ id: 999, mood: 4 }), /unknown entry/);
  await assert.rejects(journal.entries.upsertEntry({ epochDay: 1, dims: { nope: 1 } }), /unknown dimension/);
  await assert.rejects(journal.entries.upsertEntry({ epochDay: 1, tags: ['nope'] }), /unknown tag/);
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
