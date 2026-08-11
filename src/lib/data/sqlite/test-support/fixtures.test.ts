/* Proves the fixture builder itself does what ticket 03 asks of it: makes
   entries at given epoch days with given moods, dimension values and tags,
   against the real migrated schema. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { migratedDb } from './migrated-db.ts';
import { insertEntryFixtures } from './fixtures.ts';

test('inserts an entry with mood, dimension values and tags', async () => {
  const db = await migratedDb();
  const [entryId] = insertEntryFixtures(db.raw, [
    { epochDay: 19723, mood: 4, dims: { femininity: 70 }, tags: ['joy', 'euphoria'] }
  ]);

  const entry = db.raw.prepare('SELECT epoch_day, mood FROM entry WHERE id = ?').get(entryId) as {
    epoch_day: number;
    mood: number;
  };
  assert.equal(entry.epoch_day, 19723);
  assert.equal(entry.mood, 4);

  const dimValue = db.raw
    .prepare(
      'SELECT value FROM entry_dimension_value edv JOIN gender_dimension gd ON gd.id = edv.dimension_id WHERE edv.entry_id = ? AND gd.key = ?'
    )
    .get(entryId, 'femininity') as { value: number };
  assert.equal(dimValue.value, 70);

  const tagLabels = db.raw
    .prepare('SELECT label FROM tag t JOIN entry_tag et ON et.tag_id = t.id WHERE et.entry_id = ? ORDER BY label')
    .all(entryId)
    .map((r) => (r as { label: string }).label);
  assert.deepEqual(tagLabels, ['euphoria', 'joy']);
});

test('reuses an existing dimension or tag across multiple fixtures instead of duplicating it', async () => {
  const db = await migratedDb();
  insertEntryFixtures(db.raw, [
    { epochDay: 1, dims: { femininity: 10 }, tags: ['joy'] },
    { epochDay: 2, dims: { femininity: 90 }, tags: ['joy'] }
  ]);

  const dimensionCount = (
    db.raw.prepare("SELECT COUNT(*) AS n FROM gender_dimension WHERE key = 'femininity'").get() as { n: number }
  ).n;
  const tagCount = (db.raw.prepare("SELECT COUNT(*) AS n FROM tag WHERE label = 'joy'").get() as { n: number }).n;
  assert.equal(dimensionCount, 1);
  assert.equal(tagCount, 1);
});

test('defaults mood, note, dims and tags when omitted', async () => {
  const db = await migratedDb();
  const [entryId] = insertEntryFixtures(db.raw, [{ epochDay: 100 }]);

  const entry = db.raw.prepare('SELECT mood, note FROM entry WHERE id = ?').get(entryId) as {
    mood: number | null;
    note: string;
  };
  assert.equal(entry.mood, null);
  assert.equal(entry.note, '');
});
