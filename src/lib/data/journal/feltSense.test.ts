/* The felt-sense area (phase 5 ticket 24, CONTEXT: "Felt-sense entry"):
   one table, exactly one owner per row, a Tryout or a Milestone. */

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

async function withMilestone() {
  const { journal } = await journalWithBuiltIns();
  const milestoneId = await journal.milestones.upsertMilestone({ name: 'Started HRT', epochDay: 100 });
  return { journal, milestoneId };
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

test('a felt-sense entry round-trips for a milestone owner too, the same shape a tryout owner gets', async () => {
  const { journal, milestoneId } = await withMilestone();

  const earlier = await journal.feltSense.add({ milestoneId }, { epochDay: 100, mood: 5, note: 'relieved' });
  const later = await journal.feltSense.add({ milestoneId }, { epochDay: 465, mood: 4, note: 'a year on' });

  assert.deepEqual(await journal.feltSense.forMilestone(milestoneId), [
    { id: later, epochDay: 465, mood: 4, note: 'a year on' },
    { id: earlier, epochDay: 100, mood: 5, note: 'relieved' }
  ]);
});

test("a tryout's felt-sense entries and a milestone's stay apart, even read side by side", async () => {
  const { journal } = await journalWithBuiltIns();
  const tryoutId = await journal.tryouts.upsertTryout({ kind: 'name', label: 'Alex', startEpochDay: 100, endEpochDay: null });
  const milestoneId = await journal.milestones.upsertMilestone({ name: 'Started HRT', epochDay: 100 });

  const forTryout = await journal.feltSense.add({ tryoutId }, { epochDay: 100, mood: 3 });
  const forMilestone = await journal.feltSense.add({ milestoneId }, { epochDay: 100, mood: 3 });

  assert.deepEqual((await journal.feltSense.forTryout(tryoutId)).map((e) => e.id), [forTryout]);
  assert.deepEqual((await journal.feltSense.forMilestone(milestoneId)).map((e) => e.id), [forMilestone]);
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
  await assert.rejects(journal.feltSense.add({ milestoneId: 'nope' }, { epochDay: 100, mood: 3 }));
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

test('deleting a milestone takes its felt-sense history with it', async () => {
  const { journal, db } = await journalWithBuiltIns();
  const milestoneId = await journal.milestones.upsertMilestone({ name: 'Started HRT', epochDay: 100 });
  await journal.feltSense.add({ milestoneId }, { epochDay: 100, mood: 5 });

  await journal.milestones.deleteMilestone(milestoneId);
  await journal.milestones.deleteMilestone(milestoneId); // idempotent

  assert.deepEqual(await journal.milestones.getMilestones(), []);
  const rows = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM felt_sense');
  assert.equal(rows[0].n, 0);
});

test('the latest felt-sense day for several tryouts comes back in one read, absent when a tryout has none', async () => {
  const { journal } = await journalWithBuiltIns();
  const withEntries = await journal.tryouts.upsertTryout({
    kind: 'name',
    label: 'Alex',
    startEpochDay: 100,
    endEpochDay: null
  });
  const withNone = await journal.tryouts.upsertTryout({
    kind: 'pronouns',
    label: 'they/them',
    startEpochDay: 100,
    endEpochDay: null
  });
  const notAskedAbout = await journal.tryouts.upsertTryout({
    kind: 'name',
    label: 'Sam',
    startEpochDay: 100,
    endEpochDay: null
  });
  await journal.feltSense.add({ tryoutId: withEntries }, { epochDay: 100, mood: 2 });
  await journal.feltSense.add({ tryoutId: withEntries }, { epochDay: 130, mood: 4 });
  await journal.feltSense.add({ tryoutId: withEntries }, { epochDay: 120, mood: 3 });
  await journal.feltSense.add({ tryoutId: notAskedAbout }, { epochDay: 200, mood: 5 });

  const latest = await journal.feltSense.latestDaysForTryouts([withEntries, withNone]);

  assert.deepEqual([...latest], [[withEntries, 130]]);
});

test('asking for no tryouts answers an empty map, and a milestone entry never lands in it', async () => {
  const { journal } = await journalWithBuiltIns();
  const tryoutId = await journal.tryouts.upsertTryout({
    kind: 'name',
    label: 'Alex',
    startEpochDay: 100,
    endEpochDay: null
  });
  const milestoneId = await journal.milestones.upsertMilestone({ name: 'Started HRT', epochDay: 100 });
  await journal.feltSense.add({ milestoneId }, { epochDay: 150, mood: 5 });

  assert.equal((await journal.feltSense.latestDaysForTryouts([])).size, 0);
  assert.equal((await journal.feltSense.latestDaysForTryouts([tryoutId])).size, 0);
});

/* One query for a screen drawing several tryouts at once (ticket 53). */
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
  const milestoneId = await journal.milestones.upsertMilestone({ name: 'Started HRT', epochDay: 100 });

  const later = await journal.feltSense.add({ tryoutId: alex }, { epochDay: 140, mood: 4 });
  const earlier = await journal.feltSense.add({ tryoutId: alex }, { epochDay: 110, mood: 2, note: 'awkward' });
  const only = await journal.feltSense.add({ tryoutId: theyThem }, { epochDay: 125, mood: 5 });
  await journal.feltSense.add({ milestoneId }, { epochDay: 150, mood: 3 });

  const byTryout = await journal.feltSense.byTryout();

  assert.deepEqual(byTryout.get(alex), [
    { id: earlier, epochDay: 110, mood: 2, note: 'awkward' },
    { id: later, epochDay: 140, mood: 4, note: null }
  ]);
  assert.deepEqual(byTryout.get(theyThem), [{ id: only, epochDay: 125, mood: 5, note: null }]);
  assert.equal(byTryout.has(quiet), false, 'a tryout with no readings is absent rather than empty');
  assert.equal(byTryout.size, 2, 'and a milestone\'s reading never lands in it');
});
