/* The revisits area (phase 8 features ticket 08, ADR-0045). */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns, UUID_PATTERN } from './test-support.ts';

test('setting a revisit round-trips its day, and reads back by entry', async () => {
  const { journal } = await journalWithBuiltIns();
  const entryId = await journal.entries.upsertEntry({ epochDay: 100, timestamp: 1, mood: 3, note: 'a' });

  await journal.revisits.setRevisit({ entryId, createdEpochDay: 100, targetEpochDay: 200 });

  const revisit = await journal.revisits.getRevisitForEntry(entryId);
  assert.match(revisit!.id, UUID_PATTERN);
  assert.equal(revisit!.entryId, entryId);
  assert.equal(revisit!.entryEpochDay, 100);
  assert.equal(revisit!.createdEpochDay, 100);
  assert.equal(revisit!.targetEpochDay, 200);
});

test('an entry with no revisit reads back as null', async () => {
  const { journal } = await journalWithBuiltIns();
  const entryId = await journal.entries.upsertEntry({ epochDay: 100, timestamp: 1, mood: 3, note: 'a' });

  assert.equal(await journal.revisits.getRevisitForEntry(entryId), null);
});

test('setting a revisit twice for the same entry replaces the day rather than adding a second row', async () => {
  const { journal, db } = await journalWithBuiltIns();
  const entryId = await journal.entries.upsertEntry({ epochDay: 100, timestamp: 1, mood: 3, note: 'a' });

  await journal.revisits.setRevisit({ entryId, createdEpochDay: 100, targetEpochDay: 200 });
  const first = await journal.revisits.getRevisitForEntry(entryId);
  await journal.revisits.setRevisit({ entryId, createdEpochDay: 100, targetEpochDay: 300 });
  const second = await journal.revisits.getRevisitForEntry(entryId);

  assert.equal(second!.id, first!.id, 'the same row changes day, rather than a second one being minted');
  assert.equal(second!.targetEpochDay, 300);

  const rows = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM revisit');
  assert.equal(rows[0].n, 1);
});

test('deleting a revisit is idempotent', async () => {
  const { journal } = await journalWithBuiltIns();
  const entryId = await journal.entries.upsertEntry({ epochDay: 100, timestamp: 1, mood: 3, note: 'a' });
  await journal.revisits.setRevisit({ entryId, createdEpochDay: 100, targetEpochDay: 200 });
  const revisit = await journal.revisits.getRevisitForEntry(entryId);

  await journal.revisits.deleteRevisit(revisit!.id);
  await journal.revisits.deleteRevisit(revisit!.id); // idempotent

  assert.equal(await journal.revisits.getRevisitForEntry(entryId), null);
});

test('a revisit due today or in the past is due; one dated ahead is not', async () => {
  const { journal } = await journalWithBuiltIns();
  const due = await journal.entries.upsertEntry({ epochDay: 100, timestamp: 1, mood: 3, note: 'a' });
  const notYet = await journal.entries.upsertEntry({ epochDay: 101, timestamp: 2, mood: 3, note: 'b' });
  await journal.revisits.setRevisit({ entryId: due, createdEpochDay: 100, targetEpochDay: 200 });
  await journal.revisits.setRevisit({ entryId: notYet, createdEpochDay: 100, targetEpochDay: 250 });

  const dueRevisits = await journal.revisits.getDueRevisits(200);
  assert.equal(dueRevisits.length, 1);
  assert.equal(dueRevisits[0].entryId, due);
});

test('due revisits read back earliest target day first', async () => {
  const { journal } = await journalWithBuiltIns();
  const later = await journal.entries.upsertEntry({ epochDay: 100, timestamp: 1, mood: 3, note: 'a' });
  const sooner = await journal.entries.upsertEntry({ epochDay: 100, timestamp: 2, mood: 3, note: 'b' });
  await journal.revisits.setRevisit({ entryId: later, createdEpochDay: 100, targetEpochDay: 180 });
  await journal.revisits.setRevisit({ entryId: sooner, createdEpochDay: 100, targetEpochDay: 150 });

  const dueRevisits = await journal.revisits.getDueRevisits(200);
  assert.deepEqual(
    dueRevisits.map((r) => r.entryId),
    [sooner, later]
  );
});

test('a due revisit whose entry has been deleted stops offering', async () => {
  const { journal } = await journalWithBuiltIns();
  const entryId = await journal.entries.upsertEntry({ epochDay: 100, timestamp: 1, mood: 3, note: 'a' });
  await journal.revisits.setRevisit({ entryId, createdEpochDay: 100, targetEpochDay: 150 });

  await journal.entries.deleteEntry(entryId);

  assert.deepEqual(await journal.revisits.getDueRevisits(200), []);
});

test('setting a revisit for an unknown entry throws', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(journal.revisits.setRevisit({ entryId: 99999, createdEpochDay: 100, targetEpochDay: 200 }));
});
