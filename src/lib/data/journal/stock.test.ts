/* The medication stock area (phase 4 ticket 04): one row per drug, its
   projection derived from the dose log, and the run-out reminder it
   reconciles through RemindersArea. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { startOfDayTimestamp } from '../epochDay.ts';
import { journalWithBuiltIns, UUID_PATTERN } from './test-support.ts';
import type { Journal } from './journal.ts';

const at = (epochDay: number, hour = 8) => startOfDayTimestamp(epochDay) + hour * 3600000;

async function episode(journal: Journal, startEpochDay: number, drug: string) {
  return journal.regimen.upsertEpisode({
    drug,
    ester: null,
    dose: 2,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay
  });
}

test('an entry gets a minted uuid id and round-trips every field', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.stock.upsertEntry({
    drug: 'estradiol valerate',
    quantity: 10,
    unit: 'vials',
    recordedEpochDay: 19000
  });
  assert.match(id, UUID_PATTERN);

  assert.deepEqual(await journal.stock.getEntries(), [
    {
      id,
      drug: 'estradiol valerate',
      quantity: 10,
      unit: 'vials',
      recordedEpochDay: 19000,
      reminderEverCreated: false,
      reminderDismissed: false
    }
  ]);
});

test('a second entry for the same drug replaces the first rather than adding a row', async () => {
  const { journal } = await journalWithBuiltIns();
  const first = await journal.stock.upsertEntry({ drug: 'estradiol', quantity: 10, unit: 'pills', recordedEpochDay: 19000 });

  const second = await journal.stock.upsertEntry({ drug: 'estradiol', quantity: 30, unit: 'pills', recordedEpochDay: 19010 });

  assert.equal(second, first);
  const entries = await journal.stock.getEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].quantity, 30);
  assert.equal(entries[0].recordedEpochDay, 19010);
});

test('drug names are matched trimmed, the same as an analyte or a lab provider', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.stock.upsertEntry({ drug: 'estradiol', quantity: 10, unit: 'pills', recordedEpochDay: 19000 });

  await journal.stock.upsertEntry({ drug: '  estradiol  ', quantity: 5, unit: 'pills', recordedEpochDay: 19005 });

  const entries = await journal.stock.getEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].drug, 'estradiol');
  assert.equal(entries[0].quantity, 5);
});

test('deleting an unknown id throws', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(journal.stock.deleteEntry('nope'), /unknown/);
});

test('getProjections derives remaining from the dose log, matched by drug', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 19000, 'estradiol');
  await journal.stock.upsertEntry({ drug: 'estradiol', quantity: 10, unit: 'pills', recordedEpochDay: 19000 });
  await journal.doses.upsertDose({ timestamp: at(19001), route: 'oral', dose: 2, doseUnit: 'mg' });
  await journal.doses.upsertDose({ timestamp: at(19002), route: 'oral', dose: 2, doseUnit: 'mg' });

  const [row] = await journal.stock.getProjections(19002);

  assert.equal(row.entry.drug, 'estradiol');
  assert.equal(row.projection.remaining, 8);
});

test('reconciling with no data to project from does nothing', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.stock.upsertEntry({ drug: 'estradiol', quantity: 10, unit: 'pills', recordedEpochDay: 19000 });

  await journal.stock.reconcileRunOutReminders(19000);

  assert.deepEqual(await journal.reminders.getReminders(), []);
});

test('reconciling with an approaching run-out creates a marked reminder', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 19000, 'estradiol');
  await journal.stock.upsertEntry({ drug: 'estradiol', quantity: 3, unit: 'pills', recordedEpochDay: 19000 });
  for (let day = 19000; day <= 19002; day++) {
    await journal.doses.upsertDose({ timestamp: at(day), route: 'oral', dose: 2, doseUnit: 'mg' });
  }

  await journal.stock.reconcileRunOutReminders(19002);

  const reminders = await journal.reminders.getReminders();
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].autoSource, 'stock:estradiol');
  assert.equal(reminders[0].title, 'estradiol');
  assert.equal(reminders[0].type, 'med');
  assert.equal(reminders[0].recurrence, null);

  const [entry] = await journal.stock.getEntries();
  assert.equal(entry.reminderEverCreated, true);
  assert.equal(entry.reminderDismissed, false);
});

test('reconciling again after more doses move the same reminder rather than adding a second', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 19000, 'estradiol');
  await journal.stock.upsertEntry({ drug: 'estradiol', quantity: 20, unit: 'pills', recordedEpochDay: 19000 });
  await journal.doses.upsertDose({ timestamp: at(19000), route: 'oral', dose: 2, doseUnit: 'mg' });
  await journal.stock.reconcileRunOutReminders(19000);
  const first = (await journal.reminders.getReminders())[0];

  await journal.doses.upsertDose({ timestamp: at(19001), route: 'oral', dose: 2, doseUnit: 'mg' });
  await journal.stock.reconcileRunOutReminders(19001);

  const reminders = await journal.reminders.getReminders();
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].id, first.id);
});

test('a person deleting the auto reminder by hand stops it from being recreated on the next write', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 19000, 'estradiol');
  await journal.stock.upsertEntry({ drug: 'estradiol', quantity: 3, unit: 'pills', recordedEpochDay: 19000 });
  await journal.doses.upsertDose({ timestamp: at(19000), route: 'oral', dose: 2, doseUnit: 'mg' });
  await journal.stock.reconcileRunOutReminders(19000);
  const [created] = await journal.reminders.getReminders();

  await journal.reminders.deleteReminder(created.id);
  await journal.doses.upsertDose({ timestamp: at(19001), route: 'oral', dose: 2, doseUnit: 'mg' });
  await journal.stock.reconcileRunOutReminders(19001);

  assert.deepEqual(await journal.reminders.getReminders(), []);
  const [entry] = await journal.stock.getEntries();
  assert.equal(entry.reminderDismissed, true);
});

test('a person editing the auto reminder through the ordinary editor also stops future rewrites', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 19000, 'estradiol');
  await journal.stock.upsertEntry({ drug: 'estradiol', quantity: 3, unit: 'pills', recordedEpochDay: 19000 });
  await journal.doses.upsertDose({ timestamp: at(19000), route: 'oral', dose: 2, doseUnit: 'mg' });
  await journal.stock.reconcileRunOutReminders(19000);
  const [created] = await journal.reminders.getReminders();

  // The general reminders editor's form has no autoSource field, so a save
  // through it never passes one - which is what clears the marker, the
  // same as a person renaming their own reminder.
  await journal.reminders.upsertReminder({
    id: created.id,
    title: 'my own title',
    type: created.type,
    time: created.time,
    recurrence: created.recurrence,
    interval: created.interval,
    anchorEpochDay: created.anchorEpochDay,
    epochDay: created.epochDay,
    enabled: created.enabled
  });
  await journal.doses.upsertDose({ timestamp: at(19001), route: 'oral', dose: 2, doseUnit: 'mg' });
  await journal.stock.reconcileRunOutReminders(19001);

  const reminders = await journal.reminders.getReminders();
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].title, 'my own title');
  assert.equal(reminders[0].autoSource, null);
});

test('recording a fresh stock count re-arms a dismissed reminder', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 19000, 'estradiol');
  await journal.stock.upsertEntry({ drug: 'estradiol', quantity: 3, unit: 'pills', recordedEpochDay: 19000 });
  await journal.doses.upsertDose({ timestamp: at(19000), route: 'oral', dose: 2, doseUnit: 'mg' });
  await journal.stock.reconcileRunOutReminders(19000);
  const [created] = await journal.reminders.getReminders();
  await journal.reminders.deleteReminder(created.id);
  await journal.stock.reconcileRunOutReminders(19000);
  assert.equal((await journal.stock.getEntries())[0].reminderDismissed, true);

  await journal.stock.upsertEntry({ drug: 'estradiol', quantity: 30, unit: 'pills', recordedEpochDay: 19000 });
  const [entry] = await journal.stock.getEntries();
  assert.equal(entry.reminderDismissed, false);
  assert.equal(entry.reminderEverCreated, false);
});

test('a projection pushed far out by a generous refill moves the same reminder rather than adding a second', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 19000, 'estradiol');
  await journal.stock.upsertEntry({ drug: 'estradiol', quantity: 3, unit: 'pills', recordedEpochDay: 19000 });
  await journal.doses.upsertDose({ timestamp: at(19000), route: 'oral', dose: 2, doseUnit: 'mg' });
  await journal.stock.reconcileRunOutReminders(19000);
  const [before] = await journal.reminders.getReminders();

  // A fresh, generous count moves the projection far out - the reminder
  // should follow it, not disappear just for moving later.
  await journal.stock.upsertEntry({ drug: 'estradiol', quantity: 1000, unit: 'pills', recordedEpochDay: 19000 });
  await journal.doses.upsertDose({ timestamp: at(19001), route: 'oral', dose: 2, doseUnit: 'mg' });
  await journal.stock.reconcileRunOutReminders(19001);

  const reminders = await journal.reminders.getReminders();
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].id, before.id);
  assert.ok(reminders[0].epochDay !== null && reminders[0].epochDay > before.epochDay!);
});

test('deleting a stock entry drops its auto-managed reminder too', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 19000, 'estradiol');
  const stockId = await journal.stock.upsertEntry({ drug: 'estradiol', quantity: 3, unit: 'pills', recordedEpochDay: 19000 });
  await journal.doses.upsertDose({ timestamp: at(19000), route: 'oral', dose: 2, doseUnit: 'mg' });
  await journal.stock.reconcileRunOutReminders(19000);
  assert.equal((await journal.reminders.getReminders()).length, 1);

  await journal.stock.deleteEntry(stockId);

  assert.deepEqual(await journal.reminders.getReminders(), []);
});
