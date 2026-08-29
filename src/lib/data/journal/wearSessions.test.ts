/* The binder/tucking wear log (phase 5 ticket 04, CONTEXT: "Wear session"):
   the live/backfill duality is a null-vs-set duration_ms, and the optional
   reminder is reconciled by an auto_source marker rather than stored on the
   session itself. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { startOfDayTimestamp } from '../epochDay.ts';
import { journalWithBuiltIns, UUID_PATTERN } from './test-support.ts';
import { hoursMinutesOf, hoursMinutesSecondsOf } from './wearSessions.ts';

test('hoursMinutesOf formats milliseconds span into hours and minutes', () => {
  assert.deepEqual(hoursMinutesOf(0), { hours: 0, minutes: 0 });
  assert.deepEqual(hoursMinutesOf(59000), { hours: 0, minutes: 0 });
  assert.deepEqual(hoursMinutesOf(60000), { hours: 0, minutes: 1 });
  assert.deepEqual(hoursMinutesOf(3600000), { hours: 1, minutes: 0 });
  assert.deepEqual(hoursMinutesOf(3 * 3600000 + 15 * 60000 + 45000), { hours: 3, minutes: 15 });
});

test('hoursMinutesSecondsOf formats milliseconds span into hours, minutes and seconds', () => {
  assert.deepEqual(hoursMinutesSecondsOf(0), { hours: 0, minutes: 0, seconds: 0 });
  assert.deepEqual(hoursMinutesSecondsOf(59000), { hours: 0, minutes: 0, seconds: 59 });
  assert.deepEqual(hoursMinutesSecondsOf(60000), { hours: 0, minutes: 1, seconds: 0 });
  assert.deepEqual(hoursMinutesSecondsOf(3 * 3600000 + 15 * 60000 + 45000), { hours: 3, minutes: 15, seconds: 45 });
});

const at = (epochDay: number, hour = 8) => startOfDayTimestamp(epochDay) + hour * 3600000;

test('a live session starts with no duration, and stopping it sets one', async () => {
  const { journal } = await journalWithBuiltIns();
  const start = at(19000, 9);
  const id = await journal.wearSessions.upsertSession({ startTimestamp: start, durationMs: null });
  assert.match(id, UUID_PATTERN);

  const running = await journal.wearSessions.getRunningSession();
  assert.deepEqual(running, { id, startTimestamp: start, durationMs: null, note: null });

  await journal.wearSessions.upsertSession({ id, startTimestamp: start, durationMs: 3 * 3600000 });
  assert.equal(await journal.wearSessions.getRunningSession(), null);

  const [session] = await journal.wearSessions.getSessions(19000, 19000);
  assert.deepEqual(session, { id, startTimestamp: start, durationMs: 3 * 3600000, note: null });
});

test('a backfilled session never has a null duration and carries an optional note', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.wearSessions.upsertSession({
    startTimestamp: at(19000),
    durationMs: 5 * 3600000,
    note: 'a bit tight by hour 4'
  });

  const [session] = await journal.wearSessions.getSessions(19000, 19000);
  assert.equal(session.durationMs, 5 * 3600000);
  assert.equal(session.note, 'a bit tight by hour 4');
  assert.equal(await journal.wearSessions.getRunningSession(), null);
});

test('sessions read back oldest first, and the range is inclusive of both days', async () => {
  const { journal } = await journalWithBuiltIns();
  const later = await journal.wearSessions.upsertSession({ startTimestamp: at(102), durationMs: 3600000 });
  const earlier = await journal.wearSessions.upsertSession({ startTimestamp: at(100), durationMs: 3600000 });
  await journal.wearSessions.upsertSession({ startTimestamp: at(103), durationMs: 3600000 });

  const ids = (await journal.wearSessions.getSessions(100, 102)).map((s) => s.id);
  assert.deepEqual(ids, [earlier, later]);
});

test('a wear session carries no mood, dimension values, tags or note beyond its own free-text field, and writes no entry row', async () => {
  const { journal, db } = await journalWithBuiltIns();
  await journal.wearSessions.upsertSession({ startTimestamp: at(19000), durationMs: 3600000 });

  const [session] = await journal.wearSessions.getSessions(19000, 19000);
  for (const field of ['mood', 'tags', 'dimensionValues']) {
    assert.ok(!(field in session), `a wear session must not carry ${field}`);
  }

  const entries = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM entry');
  assert.equal(entries[0].n, 0, 'a wear session is its own record type, not an Entry');
});

test('an optional reminder is created N hours after the start, with no app-imposed maximum', async () => {
  const { journal } = await journalWithBuiltIns();
  const start = at(19000, 20); // 20:00 local
  const id = await journal.wearSessions.upsertSession({
    startTimestamp: start,
    durationMs: null,
    reminderHoursAfterStart: 30, // past midnight and past 24h - nothing here caps it
    reminderTitle: 'Binder check-in'
  });

  const reminders = await journal.reminders.getReminders();
  assert.equal(reminders.length, 1);
  const [reminder] = reminders;
  assert.equal(reminder.autoSource, `wear:${id}`);
  assert.equal(reminder.title, 'Binder check-in');
  assert.equal(reminder.type, 'other');
  assert.equal(reminder.recurrence, null);
  assert.equal(reminder.time, '02:00'); // 20:00 + 30h = 02:00 two days later
  assert.equal(reminder.epochDay, 19002);
});

test('saving with reminderHoursAfterStart null clears a previously created reminder', async () => {
  const { journal } = await journalWithBuiltIns();
  const start = at(19000, 9);
  const id = await journal.wearSessions.upsertSession({
    startTimestamp: start,
    durationMs: null,
    reminderHoursAfterStart: 4,
    reminderTitle: 'Binder check-in'
  });
  assert.equal((await journal.reminders.getReminders()).length, 1);

  await journal.wearSessions.upsertSession({
    id,
    startTimestamp: start,
    durationMs: 4 * 3600000,
    reminderHoursAfterStart: null
  });
  assert.equal((await journal.reminders.getReminders()).length, 0);
});

test('omitting reminderHoursAfterStart on an edit leaves an existing reminder untouched', async () => {
  const { journal } = await journalWithBuiltIns();
  const start = at(19000, 9);
  const id = await journal.wearSessions.upsertSession({
    startTimestamp: start,
    durationMs: null,
    reminderHoursAfterStart: 4,
    reminderTitle: 'Binder check-in'
  });

  await journal.wearSessions.upsertSession({ id, startTimestamp: start, durationMs: 4 * 3600000, note: 'fine' });

  const reminders = await journal.reminders.getReminders();
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].autoSource, `wear:${id}`);
});

test('deleting a session clears its own reminder', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.wearSessions.upsertSession({
    startTimestamp: at(19000),
    durationMs: null,
    reminderHoursAfterStart: 6,
    reminderTitle: 'Binder check-in'
  });
  assert.equal((await journal.reminders.getReminders()).length, 1);

  await journal.wearSessions.deleteSession(id);
  assert.equal((await journal.reminders.getReminders()).length, 0);
  assert.equal(await journal.wearSessions.getRunningSession(), null);
});
