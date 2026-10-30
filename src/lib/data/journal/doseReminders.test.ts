/* Medication reminders derive from the dose schedule (functional audit
   ticket 21): saving a schedule with reminder times creates its reminders,
   changing the schedule or its episode updates them, and ending or hiding
   the episode removes them. Reminders that are not about a scheduled dose
   are never touched. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { todayEpochDay } from '../epochDay.ts';
import { doseAutoSource } from '../autoSource.ts';
import { journalWithBuiltIns } from './test-support.ts';
import type { Journal } from './journal.ts';
import type { DoseScheduleRecurrence } from '../types.ts';

const today = todayEpochDay();

async function episode(journal: Journal, drug = 'Estradiol valerate', startEpochDay = today - 30) {
  return journal.regimen.upsertEpisode({
    drug,
    ester: null,
    dose: 4,
    doseUnit: 'mg',
    route: 'im',
    interval: 'weekly',
    startEpochDay,
    endEpochDay: null,
    endReason: null
  });
}

const schedule = (
  episodeId: string,
  reminderTimes: string[] | null | undefined,
  recurrence: DoseScheduleRecurrence = { kind: 'everyNDays', everyNDays: 1 },
  dosesPerDay = 1
) => ({ episodeId, recurrence, dosesPerDay, doseAmounts: null, autoLogFromEpochDay: null, reminderTimes });

const derived = async (journal: Journal, episodeId: string) =>
  (await journal.reminders.getReminders()).filter((r) => r.autoSource === doseAutoSource(episodeId));

test('creating a schedule with reminder times creates one reminder per time, naming the drug', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await episode(journal);
  await journal.doses.upsertSchedule(schedule(id, ['08:00', '20:00'], { kind: 'everyNDays', everyNDays: 1 }, 2));

  const rows = await derived(journal, id);
  assert.deepEqual(
    rows.map(({ title, time, recurrence, interval, anchorEpochDay, epochDay, enabled, drug }) => ({
      title, time, recurrence, interval, anchorEpochDay, epochDay, enabled, drug
    })),
    [
      { title: 'Estradiol valerate', time: '08:00', recurrence: 'DAILY', interval: null, anchorEpochDay: null, epochDay: null, enabled: true, drug: 'Estradiol valerate' },
      { title: 'Estradiol valerate', time: '20:00', recurrence: 'DAILY', interval: null, anchorEpochDay: null, epochDay: null, enabled: true, drug: 'Estradiol valerate' }
    ]
  );
});

test('a schedule saved without reminder times has none, and switching them off removes them', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await episode(journal);
  await journal.doses.upsertSchedule(schedule(id, null));
  assert.equal((await journal.reminders.getReminders()).length, 0);

  await journal.doses.upsertSchedule(schedule(id, ['09:00']));
  assert.equal((await derived(journal, id)).length, 1);
  await journal.doses.upsertSchedule(schedule(id, []));
  assert.equal((await derived(journal, id)).length, 0);
});

test('changing the schedule updates its reminders in place, keeping a switched-off one off', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await episode(journal, 'Estradiol valerate', today - 30);
  await journal.doses.upsertSchedule(schedule(id, ['19:00']));
  const [before] = await derived(journal, id);
  await journal.reminders.setEnabled(before.id, false);

  await journal.doses.upsertSchedule(schedule(id, ['19:00'], { kind: 'everyNDays', everyNDays: 14 }));
  const [after] = await derived(journal, id);
  assert.equal(after.id, before.id, 'the same row, so a kept notification tap still finds it');
  assert.equal(after.enabled, false);
  assert.equal(after.recurrence, 'EVERY_N_DAYS');
  assert.equal(after.interval, 14);
  assert.equal(after.anchorEpochDay, today - 30);

  await journal.doses.upsertSchedule(schedule(id, ['07:30']));
  const [moved] = await derived(journal, id);
  assert.equal(moved.time, '07:30');
  assert.equal(moved.recurrence, 'DAILY');
});

test('a save that does not mention reminder times leaves them as they are, and follows the new rhythm', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await episode(journal);
  await journal.doses.upsertSchedule(schedule(id, ['08:00', '20:00'], { kind: 'everyNDays', everyNDays: 1 }, 2));
  await journal.doses.upsertSchedule(schedule(id, undefined, { kind: 'weekdays', weekdays: [0, 3] }, 2));
  const rows = await derived(journal, id);
  assert.equal(rows.length, 4, 'two times on two weekdays');
  assert.ok(rows.every((r) => r.recurrence === 'EVERY_N_DAYS' && r.interval === 7));
});

test('renaming the drug or moving the start carries into its reminders', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await episode(journal, 'Estradiol valerate', today - 30);
  await journal.doses.upsertSchedule(schedule(id, ['19:00'], { kind: 'everyNDays', everyNDays: 7 }));
  await journal.regimen.upsertEpisode({
    id,
    drug: 'Estradiol enanthate',
    ester: null,
    dose: 4,
    doseUnit: 'mg',
    route: 'im',
    interval: 'weekly',
    startEpochDay: today - 20,
    endEpochDay: null,
    endReason: null
  });
  const [row] = await derived(journal, id);
  assert.equal(row.title, 'Estradiol enanthate');
  assert.equal(row.drug, 'Estradiol enanthate');
  assert.equal(row.anchorEpochDay, today - 20);
});

test('ending the episode removes its reminders', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await episode(journal);
  await journal.doses.upsertSchedule(schedule(id, ['09:00']));
  await journal.regimen.endEpisode(id, today, 'decidedToStop');
  assert.equal((await derived(journal, id)).length, 0);
});

test('an end day typed into the episode removes them once it has come, not before', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await episode(journal, 'Progesterone', today - 30);
  await journal.doses.upsertSchedule(schedule(id, ['22:00']));
  const edit = {
    id, drug: 'Progesterone', ester: null, dose: 100, doseUnit: 'mg', route: 'oral', interval: 'daily',
    startEpochDay: today - 30, endReason: null
  };

  await journal.regimen.upsertEpisode({ ...edit, endEpochDay: today + 3 });
  assert.equal((await derived(journal, id)).length, 1, 'still running until its end day');
  await journal.doses.reconcileDoseReminders(today + 2);
  assert.equal((await derived(journal, id)).length, 1);
  await journal.doses.reconcileDoseReminders(today + 3);
  assert.equal((await derived(journal, id)).length, 0, 'gone on the end day');

  await journal.regimen.upsertEpisode({ ...edit, endEpochDay: today - 1 });
  await journal.doses.upsertSchedule(schedule(id, ['22:00']));
  assert.equal((await derived(journal, id)).length, 0, 'an ended episode gets none back');
});

test('hiding the episode removes its reminders', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await episode(journal);
  await journal.doses.upsertSchedule(schedule(id, ['09:00']));
  await journal.regimen.setEpisodeHidden(id, true);
  assert.equal((await journal.reminders.getReminders()).length, 0);
});

test('reminders that are not about a scheduled dose are untouched by every one of these writes', async () => {
  const { journal } = await journalWithBuiltIns();
  const plants = await journal.reminders.upsertReminder({
    title: 'Water the plants', time: '18:00', recurrence: 'DAILY', interval: null, anchorEpochDay: null, epochDay: null, enabled: true
  });
  const appointment = await journal.reminders.upsertReminder({
    title: 'Endocrinologist', time: '09:30', recurrence: null, interval: null, anchorEpochDay: null, epochDay: today + 9, enabled: false
  });
  const other = await journal.reminders.upsertReminder({
    title: 'Sertraline', drug: 'Sertraline', time: '10:00', recurrence: 'DAILY', interval: null, anchorEpochDay: null, epochDay: null, enabled: true
  });
  const before = (await journal.reminders.getReminders()).filter((r) => [plants, appointment, other].includes(r.id));

  const id = await episode(journal);
  await journal.doses.upsertSchedule(schedule(id, ['09:00']));
  await journal.doses.upsertSchedule(schedule(id, ['10:00'], { kind: 'everyNDays', everyNDays: 3 }));
  await journal.doses.reconcileDoseReminders(today);
  await journal.regimen.endEpisode(id, today);
  await journal.regimen.setEpisodeHidden(id, true);

  const after = (await journal.reminders.getReminders()).filter((r) => [plants, appointment, other].includes(r.id));
  assert.deepEqual(after, before);
});

test('an older hand-made reminder for the drug is replaced when the schedule first gets reminders', async () => {
  const { journal } = await journalWithBuiltIns();
  const handMade = await journal.reminders.upsertReminder({
    title: 'Progesterone', time: '22:00', recurrence: 'DAILY', interval: null, anchorEpochDay: null, epochDay: null, enabled: true
  });
  const named = await journal.reminders.upsertReminder({
    title: 'Pill', drug: 'progesterone', time: '22:30', recurrence: 'DAILY', interval: null, anchorEpochDay: null, epochDay: null, enabled: true
  });
  const id = await episode(journal, 'Progesterone');

  await journal.doses.upsertSchedule(schedule(id, null));
  assert.equal((await journal.reminders.getReminders()).length, 2, 'nothing happens while the schedule has no reminders');

  await journal.doses.upsertSchedule(schedule(id, ['22:00']));
  const all = await journal.reminders.getReminders();
  assert.ok(!all.some((r) => r.id === handMade), 'the titled one replaced');
  assert.ok(all.some((r) => r.id === named), 'one made with the drug picker is the person\'s own act and stays');
  assert.deepEqual(all.filter((r) => r.autoSource).map((r) => [r.time, r.autoSource]), [['22:00', doseAutoSource(id)]]);

  // Later hand-made ones for the same drug are the person's own business.
  const later = await journal.reminders.upsertReminder({
    title: 'Progesterone', time: '12:00', recurrence: 'DAILY', interval: null, anchorEpochDay: null, epochDay: null, enabled: true
  });
  await journal.doses.upsertSchedule(schedule(id, ['21:00']));
  assert.ok((await journal.reminders.getReminders()).some((r) => r.id === later));
});

test('a derived reminder taken over in the reminders editor leaves the schedule\'s set', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await episode(journal);
  await journal.doses.upsertSchedule(schedule(id, ['09:00']));
  const [row] = await derived(journal, id);
  // The editor's save never passes autoSource (reminders.ts).
  await journal.reminders.upsertReminder({ ...row, autoSource: undefined, time: '11:00' });

  await journal.doses.upsertSchedule(schedule(id, undefined, { kind: 'everyNDays', everyNDays: 2 }));
  const kept = (await journal.reminders.getReminders()).find((r) => r.id === row.id)!;
  assert.equal(kept.time, '11:00');
  assert.equal(kept.recurrence, 'DAILY', 'no longer follows the schedule');
  assert.equal((await derived(journal, id)).length, 0);
});

test('a reminder taken over in the editor is not swallowed when the schedule gets reminders again', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await episode(journal, 'Progesterone');
  await journal.doses.upsertSchedule(schedule(id, ['22:00']));
  const [row] = await derived(journal, id);
  await journal.reminders.upsertReminder({ ...row, autoSource: undefined, time: '23:00' });
  assert.equal((await derived(journal, id)).length, 0, 'the schedule has none of its own now');

  await journal.doses.upsertSchedule(schedule(id, ['08:00']));
  const kept = (await journal.reminders.getReminders()).find((r) => r.id === row.id);
  assert.equal(kept?.time, '23:00');
});
