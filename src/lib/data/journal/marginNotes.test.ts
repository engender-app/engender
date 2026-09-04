/* The margin note area (phase 8 features ticket 07, CONTEXT: "Margin
   note"): one table, exactly one owner, an entry - and the entry's own note
   untouched by everything here (the byte-identical contract is
   contract-suite.ts's own assertion, run against a real driver). */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns, UUID_PATTERN } from './test-support.ts';

async function withEntry() {
  const { journal } = await journalWithBuiltIns();
  const entryId = await journal.entries.upsertEntry({ epochDay: 100, mood: 3, note: 'written on the day' });
  return { journal, entryId };
}

test('a margin note round-trips its own day and text, oldest first, for one entry', async () => {
  const { journal, entryId } = await withEntry();

  const earlier = await journal.marginNotes.add({ entryId, epochDay: 200, text: 'first thought' });
  const later = await journal.marginNotes.add({ entryId, epochDay: 300, text: 'second thought' });

  assert.match(earlier, UUID_PATTERN);
  const byEntry = await journal.marginNotes.forEntries([entryId]);
  assert.deepEqual(byEntry.get(entryId), [
    { id: earlier, epochDay: 200, text: 'first thought' },
    { id: later, epochDay: 300, text: 'second thought' }
  ]);
});

test('an entry with no margin notes is absent from the map, not present and empty', async () => {
  const { journal, entryId } = await withEntry();

  const byEntry = await journal.marginNotes.forEntries([entryId]);
  assert.equal(byEntry.has(entryId), false);
});

test('forEntries batches every named entry in one read and keeps them apart', async () => {
  const { journal, entryId: firstEntry } = await withEntry();
  const secondEntry = await journal.entries.upsertEntry({ epochDay: 101, mood: 4, note: 'a second entry' });

  const forFirst = await journal.marginNotes.add({ entryId: firstEntry, epochDay: 200, text: 'about the first' });
  const forSecond = await journal.marginNotes.add({ entryId: secondEntry, epochDay: 200, text: 'about the second' });

  const byEntry = await journal.marginNotes.forEntries([firstEntry, secondEntry]);
  assert.deepEqual(byEntry.get(firstEntry)?.map((n) => n.id), [forFirst]);
  assert.deepEqual(byEntry.get(secondEntry)?.map((n) => n.id), [forSecond]);
});

test('adding a margin note to an unknown entry throws before writing anything', async () => {
  const { journal, entryId } = await withEntry();

  await assert.rejects(() => journal.marginNotes.add({ entryId: entryId + 999, epochDay: 200, text: 'nope' }));

  assert.equal((await journal.marginNotes.forEntries([entryId])).has(entryId), false);
});

test('adding a margin note to a trashed entry throws the same way', async () => {
  const { journal, entryId } = await withEntry();
  await journal.entries.deleteEntry(entryId);

  await assert.rejects(() => journal.marginNotes.add({ entryId, epochDay: 200, text: 'too late' }));
});

test('editing a margin note changes its text and leaves its day and id alone', async () => {
  const { journal, entryId } = await withEntry();
  const id = await journal.marginNotes.add({ entryId, epochDay: 200, text: 'first draft' });

  await journal.marginNotes.edit(id, 'corrected');

  const byEntry = await journal.marginNotes.forEntries([entryId]);
  assert.deepEqual(byEntry.get(entryId), [{ id, epochDay: 200, text: 'corrected' }]);
});

test('editing an unknown margin note throws (ADR-0053)', async () => {
  const { journal } = await journalWithBuiltIns();

  await assert.rejects(() => journal.marginNotes.edit('not-a-real-id', 'anything'));
});

test('removing a margin note is idempotent (ADR-0053)', async () => {
  const { journal, entryId } = await withEntry();
  const id = await journal.marginNotes.add({ entryId, epochDay: 200, text: 'gone soon' });

  await journal.marginNotes.remove(id);
  await journal.marginNotes.remove(id); // does not throw

  assert.equal((await journal.marginNotes.forEntries([entryId])).has(entryId), false);
});
