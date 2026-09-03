/* The era area (phase 6 ticket 01, ADR-0049, CONTEXT: "Era"). The two
   invariants themselves are eras.ts's own tests; what is asked here is that
   the area actually enforces them before writing, and that an era with an
   open bound survives the round trip. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns, UUID_PATTERN } from './test-support.ts';

test('an era can be created with no start, with no end, with neither and with both', async () => {
  const { journal } = await journalWithBuiltIns();
  const before = await journal.eras.upsertEra({ name: 'before I knew', startEpochDay: null, endEpochDay: 19000 });
  await journal.eras.upsertEra({ name: 'first year', startEpochDay: 19001, endEpochDay: 19365 });
  await journal.eras.upsertEra({ name: 'now', startEpochDay: 19366, endEpochDay: null });

  assert.match(before, UUID_PATTERN);
  const eras = await journal.eras.getEras();
  assert.deepEqual(eras.map((e) => [e.name, e.startEpochDay, e.endEpochDay]), [
    ['before I knew', null, 19000],
    ['first year', 19001, 19365],
    ['now', 19366, null]
  ]);

  const { journal: second } = await journalWithBuiltIns();
  await second.eras.upsertEra({ name: 'all of it', startEpochDay: null, endEpochDay: null });
  assert.deepEqual(await second.eras.getEras(), [
    { id: (await second.eras.getEras())[0].id, name: 'all of it', startEpochDay: null, endEpochDay: null }
  ]);
});

test('a second era with no start is refused, naming the one that already has none', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.eras.upsertEra({ name: 'before I knew', startEpochDay: null, endEpochDay: 19000 });
  await assert.rejects(
    journal.eras.upsertEra({ name: 'earlier still', startEpochDay: null, endEpochDay: 18000 }),
    /before I knew/
  );
  assert.equal((await journal.eras.getEras()).length, 1);
});

test('an overlapping era is refused, naming the era it overlaps', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.eras.upsertEra({ name: 'first year', startEpochDay: 19001, endEpochDay: 19365 });
  await assert.rejects(
    journal.eras.upsertEra({ name: 'the move', startEpochDay: 19300, endEpochDay: 19400 }),
    /overlaps.*first year/
  );
  assert.equal((await journal.eras.getEras()).length, 1);
});

test('an era being edited is not counted against itself', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.eras.upsertEra({ name: 'first year', startEpochDay: 19001, endEpochDay: 19365 });
  await journal.eras.upsertEra({ id, name: 'the first year', startEpochDay: 19001, endEpochDay: 19400 });

  const eras = await journal.eras.getEras();
  assert.deepEqual(eras, [{ id, name: 'the first year', startEpochDay: 19001, endEpochDay: 19400 }]);
});

test('editing an unknown era throws rather than inserting one', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(
    journal.eras.upsertEra({ id: 'not-here', name: 'ghost', startEpochDay: 1, endEpochDay: 2 }),
    /not-here/
  );
});

test('an era is deleted outright, and nothing references it to block that', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.eras.upsertEra({ name: 'first year', startEpochDay: 19001, endEpochDay: 19365 });
  await journal.eras.deleteEra(id);
  await journal.eras.deleteEra(id); // idempotent
  assert.deepEqual(await journal.eras.getEras(), []);
});

test('eras read back in timeline order, the open start first', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.eras.upsertEra({ name: 'now', startEpochDay: 19366, endEpochDay: null });
  await journal.eras.upsertEra({ name: 'before I knew', startEpochDay: null, endEpochDay: 19000 });
  await journal.eras.upsertEra({ name: 'first year', startEpochDay: 19001, endEpochDay: 19365 });

  assert.deepEqual(
    (await journal.eras.getEras()).map((e) => e.name),
    ['before I knew', 'first year', 'now']
  );
});

test('the journal bounds an open era clamps against are the first and last day it holds', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.entries.upsertEntry({ epochDay: 19100, timestamp: 1, mood: 3, note: 'a' });
  await journal.entries.upsertEntry({ epochDay: 19300, timestamp: 2, mood: 4, note: 'b' });

  assert.deepEqual(await journal.eras.getJournalBounds(), { firstEpochDay: 19100, lastEpochDay: 19300 });
});

test('an empty journal has no bounds to clamp against', async () => {
  const { journal } = await journalWithBuiltIns();
  assert.equal(await journal.eras.getJournalBounds(), null);
});
