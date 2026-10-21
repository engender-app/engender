/* FA 04: with the closed lists out of SQL, the write path is what keeps an
   unknown word out of a journal, and the label functions are what keep an
   unknown stored word readable. Both read the sets in rowValues.ts. */

import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal } from './journal.ts';

vi.mock('$lib/paraglide/messages', async () => await import('../../paraglide/messages.js'));
const labels = await import('../vocabulary/labels.ts');
const { reminderTypeLabel } = await import('../vocabulary/reminderLabel.ts');
const { m } = await import('../../paraglide/messages.js');

async function open() {
  const db = await migratedDb();
  return { db, journal: openJournal(db, fakeFileStore()) };
}
const count = async (db: Awaited<ReturnType<typeof open>>['db'], table: string) =>
  (await db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))[0].n;

test('every write path refuses a word outside its set, naming it, and writes nothing', async () => {
  const { db, journal } = await open();
  await assert.rejects(journal.tally.log({ epochDay: 1, kind: 'confused' as never }), /tally kind: confused/);
  await assert.rejects(
    journal.cycleEvents.upsertCycleEvent({ epochDay: 1, kind: 'irregular' as never }),
    /cycle event kind: irregular/
  );
  await assert.rejects(
    journal.tryouts.upsertTryout({ kind: 'hat' as never, label: 'x', description: null, startEpochDay: 1, endEpochDay: null }),
    /tryout kind: hat/
  );
  await assert.rejects(
    journal.reminders.upsertReminder({ title: 'x', type: 'walk' as never, time: '09:00', recurrence: 'DAILY', interval: null, anchorEpochDay: null, epochDay: null, enabled: true }),
    /reminder type: walk/
  );
  await assert.rejects(
    journal.hairRemoval.upsertSession({ epochDay: 1, area: 'chin', method: 'wax' as never, painRating: 2 }),
    /hair-removal method: wax/
  );
  await assert.rejects(
    journal.hairRemoval.upsertSession({ epochDay: 1, area: 'knees', method: 'laser', painRating: 2 }),
    /hair-removal area: knees/
  );
  for (const table of ['tally_event', 'cycle_event', 'tryout', 'reminder', 'hair_removal_session']) {
    assert.equal(await count(db, table), 0, `${table} stayed empty`);
  }
});

test('an unknown word already stored reads back and renders as other', async () => {
  const { db, journal } = await open();
  await db.run(`INSERT INTO tryout (uuid, kind, label, start_epoch_day, updated_at) VALUES ('t', 'hat', 'Fedora', 1, 1)`);
  await db.run(`INSERT INTO cycle_event (uuid, epoch_day, kind, updated_at) VALUES ('c', 1, 'irregular', 1)`);
  await db.run(`INSERT INTO hair_removal_session (uuid, epoch_day, area, method, provider, updated_at) VALUES ('h', 1, 'knees', 'wax', '', 1)`);
  await db.run(`INSERT INTO reminder (uuid, title, type, time, recurrence, updated_at) VALUES ('r', 'x', 'walk', '09:00', 'DAILY', 1)`);

  const [tryout] = await journal.tryouts.getTryouts();
  const [cycle] = await journal.cycleEvents.getCycleEvents();
  const [session] = await journal.hairRemoval.getSessions();
  const [reminder] = await journal.reminders.getReminders();
  assert.equal(labels.tryoutKindName(tryout.kind), m.tryout_kind_other());
  assert.equal(labels.cycleEventKindName(cycle.kind), m.cycle_event_kind_other());
  assert.equal(labels.hairRemovalAreaName(session.area), m.hair_removal_area_other());
  assert.equal(labels.hairRemovalMethodName(session.method), m.hair_removal_method_other());
  assert.equal(reminderTypeLabel(reminder.type), m.rem_type_other());
  assert.equal(session.painRating, null);
  // A word the code knows still gets its own name.
  assert.equal(labels.tryoutKindName('name'), m.tryout_kind_name());
});
