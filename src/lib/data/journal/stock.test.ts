/* The medication stock area (phase 4 ticket 04): one row per drug, its
   projection derived from the dose log, and the run-out reminder it
   reconciles through RemindersArea. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { startOfDayTimestamp } from '../epochDay.ts';
import { journalWithBuiltIns, UUID_PATTERN } from './test-support.ts';
import type { Journal } from './journal.ts';
import type { SqliteDriver } from '../sqlite/driver.ts';
import type { RemindersArea } from './reminders.ts';
import { makeStockArea } from './stock.ts';
import { STOCK_PREFIX, stockAutoSource } from '../autoSource.ts';
import { projectStock } from '../stockProjection.ts';

const DIED = /the process died here/;

/** A driver that stops running statements matching `sql`, and a reminders
    area that stops deleting - the two points a process can die between
    deleteEntry's two writes. Neither comes back. */
const driverDyingOn = (driver: SqliteDriver, sql: string): SqliteDriver => ({
  ...driver,
  run(statement, params) {
    if (statement.includes(sql)) throw new Error('the process died here');
    return driver.run(statement, params);
  }
});

const remindersDyingOnDelete = (reminders: RemindersArea): RemindersArea => ({
  ...reminders,
  deleteReminder() {
    throw new Error('the process died here');
  }
});

const at = (epochDay: number, hour = 8) => startOfDayTimestamp(epochDay) + hour * 3600000;

async function episode(journal: Journal, startEpochDay: number, drug: string) {
  return journal.regimen.upsertEpisode({
    drug,
    ester: null,
    dose: 2,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay,
    endEpochDay: null,
    endReason: null
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
      reminderDismissed: false,
      openedEpochDay: null,
      inUseWindowDays: null,
      inUseEndEpochDay: null
    }
  ]);
});

test('an opened date and an in-use window round-trip, stored as typed', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.stock.upsertEntry({
    drug: 'estradiol valerate',
    quantity: 10,
    unit: 'vials',
    recordedEpochDay: 19000,
    openedEpochDay: 19002,
    inUseWindowDays: 28
  });

  const [entry] = await journal.stock.getEntries();
  assert.equal(entry.openedEpochDay, 19002);
  assert.equal(entry.inUseWindowDays, 28);
  assert.equal(entry.inUseEndEpochDay, null);
});

test('an opened date and an explicit end date round-trip, stored as typed', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.stock.upsertEntry({
    drug: 'estradiol valerate',
    quantity: 10,
    unit: 'vials',
    recordedEpochDay: 19000,
    openedEpochDay: 19002,
    inUseEndEpochDay: 19030
  });

  const [entry] = await journal.stock.getEntries();
  assert.equal(entry.openedEpochDay, 19002);
  assert.equal(entry.inUseWindowDays, null);
  assert.equal(entry.inUseEndEpochDay, 19030);
});

test('a fresh count carries the opened date and window forward when the editor resubmits them', async () => {
  const { journal } = await journalWithBuiltIns();
  const first = await journal.stock.upsertEntry({
    drug: 'estradiol valerate',
    quantity: 10,
    unit: 'vials',
    recordedEpochDay: 19000,
    openedEpochDay: 19002,
    inUseWindowDays: 28
  });

  const second = await journal.stock.upsertEntry({
    drug: 'estradiol valerate',
    quantity: 30,
    unit: 'vials',
    recordedEpochDay: 19010,
    openedEpochDay: 19002,
    inUseWindowDays: 28
  });

  assert.equal(second, first);
  const [entry] = await journal.stock.getEntries();
  assert.equal(entry.quantity, 30);
  assert.equal(entry.openedEpochDay, 19002);
  assert.equal(entry.inUseWindowDays, 28);
});

test('an opened date and in-use window do not change the run-out projection', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 19000, 'estradiol');
  await journal.stock.upsertEntry({
    drug: 'estradiol',
    quantity: 10,
    unit: 'pills',
    recordedEpochDay: 19000,
    openedEpochDay: 19000,
    inUseWindowDays: 5
  });
  await journal.doses.upsertDose({ timestamp: at(19001), route: 'oral', dose: 2, doseUnit: 'mg' });
  await journal.doses.upsertDose({ timestamp: at(19002), route: 'oral', dose: 2, doseUnit: 'mg' });

  const [row] = await journal.stock.getProjections(19002);

  assert.equal(row.projection.remaining, 8);
  assert.equal(row.projection.runOutEpochDay, 19014);
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

test('deleting an unknown id changes nothing', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.stock.upsertEntry({ drug: 'estradiol', quantity: 10, unit: 'pills', recordedEpochDay: 19000 });

  await journal.stock.deleteEntry('nope');

  assert.equal((await journal.stock.getEntries()).length, 1);
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

/* Two writes with no transaction around them, so the question is what a
   death between them leaves behind. The reminder is deleted first because
   reconcileRunOutReminders only ever visits drugs that still have a
   medication_stock row: a reminder outliving its row is unreachable by
   every path that could clear it, and keeps firing for a drug the journal
   no longer counts. */
test('a death mid-delete cannot leave a reminder for a drug with no stock row', async () => {
  const { journal, db } = await journalWithBuiltIns();
  await episode(journal, 19000, 'estradiol');
  const stockId = await journal.stock.upsertEntry({ drug: 'estradiol', quantity: 3, unit: 'pills', recordedEpochDay: 19000 });
  await journal.doses.upsertDose({ timestamp: at(19000), route: 'oral', dose: 2, doseUnit: 'mg' });
  await journal.stock.reconcileRunOutReminders(19000);
  const [auto] = await journal.reminders.getReminders();

  /** Every run-out reminder whose drug the journal no longer counts - the
      state nothing can clear, and so the one no interruption may leave. */
  const orphaned = async () => {
    const counted = new Set((await journal.stock.getEntries()).map((entry) => stockAutoSource(entry.drug)));
    return (await journal.reminders.getReminders()).filter(
      (reminder) => reminder.autoSource?.startsWith(STOCK_PREFIX) && !counted.has(reminder.autoSource)
    );
  };

  // Dying on the reminder, the first of the two writes: nothing was
  // written, so both the row and its reminder are still here.
  const beforeTheReminder = makeStockArea(db, journal.doses, journal.regimen, remindersDyingOnDelete(journal.reminders));
  await assert.rejects(beforeTheReminder.deleteEntry(stockId), DIED);
  assert.deepEqual(await orphaned(), []);
  assert.deepEqual((await journal.reminders.getReminders()).map((reminder) => reminder.id), [auto.id]);
  assert.equal((await journal.stock.getEntries()).length, 1);

  // Dying on the row, the second: the reminder is gone and the row it
  // belonged to survives, which is the state reconcileRunOutReminders
  // still visits - it iterates the rows that exist.
  const beforeTheRow = makeStockArea(
    driverDyingOn(db, 'DELETE FROM medication_stock'),
    journal.doses,
    journal.regimen,
    journal.reminders
  );
  await assert.rejects(beforeTheRow.deleteEntry(stockId), DIED);
  assert.deepEqual(await orphaned(), []);
  assert.deepEqual(await journal.reminders.getReminders(), []);
  await journal.stock.reconcileRunOutReminders(19000);
  assert.deepEqual(await journal.reminders.getReminders(), []);

  // And the delete retries from there.
  await journal.stock.deleteEntry(stockId);
  assert.deepEqual(await journal.stock.getEntries(), []);
  assert.deepEqual(await journal.reminders.getReminders(), []);
});

/* Phase 8 audit ticket 26: the projections used to be reduced out of every
   dose the log held once one count was old. These pin the figures against
   projectStock, which still counts the doses in JS, so the two ways of
   arriving at a projection cannot drift. */
async function assertProjectionsMatchTheDoses(journal: Journal, asOfEpochDay: number, what: string) {
  const rows = await journal.stock.getProjections(asOfEpochDay);
  const entries = await journal.stock.getEntries();
  const episodes = await journal.regimen.getEpisodes();
  const earliest = Math.min(...entries.map((entry) => entry.recordedEpochDay), asOfEpochDay);
  const doses = await journal.doses.getDoses(earliest, asOfEpochDay);

  assert.deepEqual(
    rows.map((row) => row.projection),
    entries.map((entry) => projectStock(entry, doses, episodes, asOfEpochDay)),
    what
  );
}

test('a years-old count projects the same figures as counting every dose would', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 100, 'estradiol');

  // Daily doses over three years, none of them naming a drug - so every one
  // resolves through the episode, which is the expensive case.
  for (let day = 100; day <= 1200; day += 1) {
    await journal.doses.upsertDose({ timestamp: at(day), route: 'oral', dose: 2, doseUnit: 'mg' });
  }
  // One count taken at the very start and one taken near the end, the shape
  // the long-journal fixture is built to provoke.
  await journal.stock.upsertEntry({ drug: 'estradiol', quantity: 900, unit: 'tablets', recordedEpochDay: 100 });
  await journal.stock.upsertEntry({ drug: 'spironolactone', quantity: 30, unit: 'tablets', recordedEpochDay: 1190 });

  await assertProjectionsMatchTheDoses(journal, 1200, 'a years-old count and a recent one');

  // The old count has been outrun: 1101 doses against a count of 900.
  const [estradiol] = (await journal.stock.getProjections(1200)).filter((row) => row.entry.drug === 'estradiol');
  assert.equal(estradiol.projection.remaining, -201, 'remaining is free to go negative');
  assert.equal(estradiol.projection.runOutEpochDay, 1200, 'already outrun, so the run-out day is today');
});

test('concurrent episodes naming different drugs leave their doses out of every count', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 100, 'estradiol');
  await journal.regimen.upsertEpisode({
    drug: 'spironolactone',
    ester: null,
    dose: 50,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: 150,
    endEpochDay: 179,
    endReason: null
  });

  // Days 150-179 have two episodes for different drugs, so a dose naming
  // nothing there is ambiguous and counts against neither drug.
  for (let day = 140; day <= 190; day += 1) {
    await journal.doses.upsertDose({ timestamp: at(day), route: 'oral', dose: 2, doseUnit: 'mg' });
  }
  await journal.stock.upsertEntry({ drug: 'estradiol', quantity: 100, unit: 'tablets', recordedEpochDay: 140 });

  await assertProjectionsMatchTheDoses(journal, 190, 'a stretch of concurrent episodes');

  const [row] = await journal.stock.getProjections(190);
  assert.equal(row.projection.excludedDoses, 30, 'the thirty ambiguous days are counted and left out');
  assert.equal(row.projection.remaining, 100 - 21, 'only the unambiguous doses consume the count');
});

test('a dose naming its own drug counts even where the episodes are ambiguous', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 100, 'estradiol');
  await journal.regimen.upsertEpisode({
    drug: 'spironolactone',
    ester: null,
    dose: 50,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: 100,
    endEpochDay: null,
    endReason: null
  });

  for (let day = 100; day <= 109; day += 1) {
    await journal.doses.upsertDose({
      timestamp: at(day),
      route: 'oral',
      dose: 2,
      doseUnit: 'mg',
      // Trailing space on purpose: a drug is matched trimmed, everywhere.
      drug: day % 2 === 0 ? 'estradiol ' : null
    });
  }
  await journal.stock.upsertEntry({ drug: 'estradiol', quantity: 10, unit: 'tablets', recordedEpochDay: 100 });

  await assertProjectionsMatchTheDoses(journal, 109, 'named doses among ambiguous ones');

  const [row] = await journal.stock.getProjections(109);
  assert.equal(row.projection.remaining, 5, 'the five named doses count');
  assert.equal(row.projection.excludedDoses, 5, 'the five unnamed ones are ambiguous');
});

test('an entry counted after the day asked about consumes nothing and has no rate', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 100, 'estradiol');
  await journal.doses.upsertDose({ timestamp: at(100), route: 'oral', dose: 2, doseUnit: 'mg' });
  await journal.stock.upsertEntry({ drug: 'estradiol', quantity: 20, unit: 'tablets', recordedEpochDay: 300 });

  const [row] = await journal.stock.getProjections(200);
  assert.deepEqual(row.projection, { remaining: 20, dailyRate: null, runOutEpochDay: null, excludedDoses: 0 });
});
