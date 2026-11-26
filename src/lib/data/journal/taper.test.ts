/* The taper area's own reads: a times-a-day
   stage round-trips through the schedule's JSON, and a day's sessions say
   which of the day's expected sessions each one is. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal } from './journal.ts';

async function journalWithTaper() {
  const journal = openJournal(await migratedDb(), fakeFileStore());
  const procedureId = await journal.procedures.upsertProcedure({ name: 'vaginoplasty', kind: 'vaginoplasty' });
  await journal.taper.upsertTaper({
    procedureId,
    startEpochDay: 100,
    stages: [
      { everyNDays: 1, timesPerDay: 3, days: 2 }, // 100, 101: three a day
      { everyNDays: 2, days: 4 } // 102, 104: one each
    ]
  });
  return journal;
}

test('a times-a-day stage reads back as it was saved', async () => {
  const journal = await journalWithTaper();
  assert.deepEqual((await journal.taper.getTaper())?.stages, [
    { everyNDays: 1, timesPerDay: 3, days: 2 },
    { everyNDays: 2, days: 4 }
  ]);
});

test("a day's sessions are numbered against what the schedule expected that day", async () => {
  const journal = await journalWithTaper();
  await journal.taper.upsertSession({ epochDay: 100, note: 'morning' });
  await journal.taper.upsertSession({ epochDay: 100, note: '' });
  await journal.taper.upsertSession({ epochDay: 102 });
  await journal.taper.upsertSession({ epochDay: 103, note: 'extra' });

  const slots = async (day: number) =>
    (await journal.taper.getDaySessions(day)).map((s) => [s.note, s.slot && [s.slot.index, s.slot.count]]);

  assert.deepEqual(await slots(100), [['morning', [1, 3]], ['', [2, 3]]]);
  // One a day is not worth numbering, and a day the schedule did not ask
  // for keeps its session with no number at all.
  assert.deepEqual(await slots(102), [['', null]]);
  assert.deepEqual(await slots(103), [['extra', null]]);
});

test('sessions past what a day expected are not numbered past it', async () => {
  const journal = await journalWithTaper();
  for (let i = 0; i < 4; i += 1) await journal.taper.upsertSession({ epochDay: 101, note: String(i) });
  assert.deepEqual(
    (await journal.taper.getDaySessions(101)).map((s) => s.slot?.index ?? null),
    [1, 2, 3, null]
  );
});

test('with no schedule, a day still lists its sessions, unnumbered', async () => {
  const journal = openJournal(await migratedDb(), fakeFileStore());
  await journal.taper.upsertSession({ epochDay: 100 });
  assert.deepEqual((await journal.taper.getDaySessions(100)).map((s) => s.slot), [null]);
});
