/* The felt-sense area: one table, every row a tryout's. A milestone held readings too cut
   them. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns, UUID_PATTERN } from './test-support.ts';

async function withTryout() {
  const { journal } = await journalWithBuiltIns();
  const tryoutId = await journal.tryouts.upsertTryout({
    kind: 'name',
    label: 'Alex',
    startEpochDay: 100,
    endEpochDay: null
  });
  return { journal, tryoutId };
}

test('a felt-sense entry round-trips its mood and note, newest first, for a tryout owner', async () => {
  const { journal, tryoutId } = await withTryout();

  const earlier = await journal.feltSense.add({ tryoutId }, { epochDay: 100, mood: 2, note: 'awkward' });
  const later = await journal.feltSense.add({ tryoutId }, { epochDay: 110, mood: 4 });

  assert.match(later, UUID_PATTERN);
  assert.deepEqual(await journal.feltSense.forTryout(tryoutId), [
    { id: later, epochDay: 110, mood: 4, note: null },
    { id: earlier, epochDay: 100, mood: 2, note: 'awkward' }
  ]);
});

test('an owner can carry more than one felt-sense observation over its lifespan', async () => {
  const { journal, tryoutId } = await withTryout();

  await journal.feltSense.add({ tryoutId }, { epochDay: 100, mood: 3 });
  await journal.feltSense.add({ tryoutId }, { epochDay: 120, mood: 4 });
  await journal.feltSense.add({ tryoutId }, { epochDay: 140, mood: 5 });

  assert.equal((await journal.feltSense.forTryout(tryoutId)).length, 3);
});

test('an unknown owner and an out-of-range mood are refused before either reaches the schema', async () => {
  const { journal, tryoutId } = await withTryout();

  await assert.rejects(journal.feltSense.add({ tryoutId: 'nope' }, { epochDay: 100, mood: 3 }));
  await assert.rejects(journal.feltSense.add({ tryoutId }, { epochDay: 100, mood: 0 }), /invalid mood/);
  await assert.rejects(journal.feltSense.add({ tryoutId }, { epochDay: 100, mood: 6 }), /invalid mood/);
});

test('deleting a felt-sense entry is idempotent and leaves its owner and its other entries alone', async () => {
  const { journal, tryoutId } = await withTryout();
  const gone = await journal.feltSense.add({ tryoutId }, { epochDay: 100, mood: 2 });
  const kept = await journal.feltSense.add({ tryoutId }, { epochDay: 110, mood: 4 });

  await journal.feltSense.remove(gone);
  await journal.feltSense.remove(gone); // idempotent

  assert.deepEqual((await journal.feltSense.forTryout(tryoutId)).map((e) => e.id), [kept]);
  assert.equal((await journal.tryouts.getTryouts()).length, 1);
});

/* One query for a screen drawing several tryouts at once. */
test('every tryout\'s readings come back grouped and oldest first, and a tryout with none is absent', async () => {
  const { journal } = await journalWithBuiltIns();
  const alex = await journal.tryouts.upsertTryout({
    kind: 'name',
    label: 'Alex',
    startEpochDay: 100,
    endEpochDay: null
  });
  const theyThem = await journal.tryouts.upsertTryout({
    kind: 'pronouns',
    label: 'they/them',
    startEpochDay: 120,
    endEpochDay: null
  });
  const quiet = await journal.tryouts.upsertTryout({
    kind: 'style',
    label: 'shorter hair',
    startEpochDay: 130,
    endEpochDay: null
  });
  const later = await journal.feltSense.add({ tryoutId: alex }, { epochDay: 140, mood: 4 });
  const earlier = await journal.feltSense.add({ tryoutId: alex }, { epochDay: 110, mood: 2, note: 'awkward' });
  const only = await journal.feltSense.add({ tryoutId: theyThem }, { epochDay: 125, mood: 5 });

  const byTryout = await journal.feltSense.byTryout();

  assert.deepEqual(byTryout.get(alex), [
    { id: earlier, epochDay: 110, mood: 2, note: 'awkward' },
    { id: later, epochDay: 140, mood: 4, note: null }
  ]);
  assert.deepEqual(byTryout.get(theyThem), [{ id: only, epochDay: 125, mood: 5, note: null }]);
  assert.equal(byTryout.has(quiet), false, 'a tryout with no readings is absent rather than empty');
  assert.equal(byTryout.size, 2);
});
