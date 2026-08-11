/* The dimensions, milestones, labs and reminders areas, exercised through
   the driver interface (ticket 07). */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal, type Journal } from './journal.ts';

async function journalWithBuiltIns(): Promise<{ journal: Journal; db: Awaited<ReturnType<typeof migratedDb>> }> {
  const db = await migratedDb();
  const journal = openJournal(db);
  await journal.reconcileBuiltIns();
  return { journal, db };
}

/* dimensions */

test('a custom dimension gets a minted key and reads back; built-ins are marked', async () => {
  const { journal } = await journalWithBuiltIns();
  const created = await journal.dimensions.addCustomDimension({
    name: 'Voice comfort',
    low: 'strained',
    high: 'easy',
    min: 0,
    max: 10
  });

  const dims = await journal.dimensions.getDimensions();
  assert.deepEqual(dims.find((d) => d.key === created.key), {
    key: created.key,
    name: 'Voice comfort',
    low: 'strained',
    high: 'easy',
    min: 0,
    max: 10,
    builtIn: false,
    hidden: false
  });
  assert.equal(dims.find((d) => d.key === 'femininity')?.builtIn, true);
});

test('a custom preset holds its dimensions in order; an unknown key aborts it whole', async () => {
  const { journal, db } = await journalWithBuiltIns();
  const dim = await journal.dimensions.addCustomDimension({ name: 'V', low: 'a', high: 'b', min: 0, max: 100 });
  const preset = await journal.dimensions.addPreset({ name: 'Mine', dims: ['euphoria_dysphoria', dim.key] });

  const stored = (await journal.dimensions.getPresets()).find((p) => p.id === preset.id);
  assert.deepEqual(stored, { id: preset.id, name: 'Mine', builtIn: false, dims: ['euphoria_dysphoria', dim.key] });

  const before = (db.raw.prepare('SELECT COUNT(*) AS n FROM gender_preset').get() as { n: number }).n;
  await assert.rejects(journal.dimensions.addPreset({ name: 'Broken', dims: ['nope'] }), /unknown dimension/);
  const after = (db.raw.prepare('SELECT COUNT(*) AS n FROM gender_preset').get() as { n: number }).n;
  assert.equal(after, before, 'failed preset insert rolled back');
});

test('dimensions hide rather than delete, and their logged values survive hiding', async () => {
  const { journal } = await journalWithBuiltIns();
  const entryId = await journal.entries.upsertEntry({ epochDay: 1, dims: { masculinity: 30 } });

  await journal.dimensions.setDimensionHidden('masculinity', true);

  assert.equal((await journal.dimensions.getDimensions()).find((d) => d.key === 'masculinity')?.hidden, true);
  assert.deepEqual((await journal.entries.getEntry(entryId))?.dims, { masculinity: 30 });
  assert.ok(!('deleteDimension' in journal.dimensions), 'no delete operation exists');
  await assert.rejects(journal.dimensions.setDimensionHidden('nope', true), /unknown dimension/);
});

/* milestones */

test('a milestone round-trips without a kind column and updates by id', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.milestones.upsertMilestone({ epochDay: 20000, name: 'HRT start', templateKey: 'hrt_start' });

  assert.deepEqual(await journal.milestones.getMilestones(), [
    { id, name: 'HRT start', epochDay: 20000, templateKey: 'hrt_start', photo: null }
  ]);

  await journal.milestones.upsertMilestone({ id, name: 'HRT day one', epochDay: 20001 });
  assert.deepEqual(await journal.milestones.getMilestones(), [
    { id, name: 'HRT day one', epochDay: 20001, templateKey: null, photo: null }
  ]);

  await assert.rejects(journal.milestones.upsertMilestone({ id: 'nope', name: 'x', epochDay: 1 }), /unknown milestone/);
});

test('deleting a milestone takes its photo rows and files; twice is success', async () => {
  const db = await migratedDb();
  const removed: string[] = [];
  const journal = openJournal(db, { remove: async (path) => void removed.push(path) });

  const id = await journal.milestones.upsertMilestone({ epochDay: 20000, name: 'HRT start' });
  db.raw.exec(
    `INSERT INTO photo (uuid, milestone_id, file_path, updated_at)
     SELECT 'p1', id, 'photos/p1.jpg', 0 FROM milestone WHERE uuid = '${id}'`
  );

  await journal.milestones.deleteMilestone(id);

  assert.deepEqual(await journal.milestones.getMilestones(), []);
  assert.equal((db.raw.prepare('SELECT COUNT(*) AS n FROM photo').get() as { n: number }).n, 0);
  assert.deepEqual(removed, ['photos/p1.jpg']);

  await journal.milestones.deleteMilestone(id); // idempotent
});

/* labs */

test('analytes are the presets plus whatever is in use; results order by day', async () => {
  const { journal } = await journalWithBuiltIns();
  assert.deepEqual(await journal.labs.getAnalytes(), ['estradiol', 'testosterone', 'prolactin']);

  await journal.labs.upsertResult({ epochDay: 200, analyte: 'shbg', value: 60, unit: 'nmol/L' });
  const id = await journal.labs.upsertResult({ epochDay: 100, analyte: 'shbg', value: 55, unit: 'nmol/L' });
  assert.deepEqual(await journal.labs.getAnalytes(), ['estradiol', 'testosterone', 'prolactin', 'shbg']);

  const results = await journal.labs.getResults('shbg');
  assert.deepEqual(results.map((r) => r.epochDay), [100, 200]);
  assert.deepEqual(results[0], { id, epochDay: 100, analyte: 'shbg', value: 55, unit: 'nmol/L', note: '' });
});

test('lab results update by id, throw on unknown ids and delete idempotently', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.labs.upsertResult({ epochDay: 100, analyte: 'estradiol', value: 120 });

  await journal.labs.upsertResult({ id, epochDay: 100, analyte: 'estradiol', value: 130, note: 'redraw' });
  assert.equal((await journal.labs.getResults('estradiol'))[0].value, 130);

  await assert.rejects(journal.labs.upsertResult({ id: 'nope', epochDay: 1, analyte: 'x', value: 1 }), /unknown lab/);

  await journal.labs.deleteResult(id);
  await journal.labs.deleteResult(id); // idempotent
  assert.deepEqual(await journal.labs.getResults('estradiol'), []);
});

/* reminders */

test('every rule shape written by the journal passes the schema recurrence CHECK', async () => {
  const { journal } = await journalWithBuiltIns();
  const base = { title: 'x', type: 'med' as const, time: '20:00', enabled: true };
  const none = { interval: null, anchorEpochDay: null, epochDay: null };

  await journal.reminders.upsertReminder({ ...base, ...none, recurrence: 'DAILY' });
  await journal.reminders.upsertReminder({ ...base, ...none, recurrence: 'WEEKLY' });
  await journal.reminders.upsertReminder({ ...base, ...none, recurrence: 'EVERY_N_DAYS', interval: 3, anchorEpochDay: 100 });
  await journal.reminders.upsertReminder({ ...base, ...none, recurrence: null, epochDay: 200 });

  const stored = await journal.reminders.getReminders();
  assert.deepEqual(
    stored.map((r) => [r.recurrence, r.interval, r.anchorEpochDay, r.epochDay]),
    [
      ['DAILY', null, null, null],
      ['WEEKLY', null, null, null],
      ['EVERY_N_DAYS', 3, 100, null],
      [null, null, null, 200]
    ]
  );
});

test("the seed's old vocabulary is rejected before it reaches the schema", async () => {
  const { journal } = await journalWithBuiltIns();
  const base = { title: 'x', type: 'med' as const, time: '20:00', enabled: true };
  const none = { interval: null, anchorEpochDay: null, epochDay: null };

  await assert.rejects(
    journal.reminders.upsertReminder({ ...base, ...none, recurrence: 'EVERY_3_DAYS' as never }),
    /invalid reminder rule/
  );
  // A recurrence that needs its parts cannot be written without them.
  await assert.rejects(
    journal.reminders.upsertReminder({ ...base, ...none, recurrence: 'EVERY_N_DAYS' }),
    /invalid reminder rule/
  );
});

test('reminders update by id, toggle enabled, throw on unknown ids and delete idempotently', async () => {
  const { journal } = await journalWithBuiltIns();
  const none = { interval: null, anchorEpochDay: null, epochDay: null };
  const id = await journal.reminders.upsertReminder({
    title: 'Patch',
    type: 'med',
    time: '20:00',
    enabled: true,
    ...none,
    recurrence: 'DAILY'
  });

  await journal.reminders.setEnabled(id, false);
  assert.equal((await journal.reminders.getReminders())[0].enabled, false);

  await journal.reminders.upsertReminder({
    id,
    title: 'Patch',
    type: 'med',
    time: '21:00',
    enabled: false,
    ...none,
    recurrence: 'WEEKLY'
  });
  assert.equal((await journal.reminders.getReminders())[0].time, '21:00');

  await assert.rejects(journal.reminders.setEnabled('nope', true), /unknown reminder/);

  await journal.reminders.deleteReminder(id);
  await journal.reminders.deleteReminder(id); // idempotent
  assert.deepEqual(await journal.reminders.getReminders(), []);
});
