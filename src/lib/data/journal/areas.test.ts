/* The dimensions, milestones, labs, reminders and hair-progress areas,
   exercised through the driver interface (ticket 07). */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal } from './journal.ts';
import { journalWithBuiltIns, UUID_PATTERN } from './test-support.ts';
import { timestampAtLocalTime } from '../epochDay.ts';
import type { Journal } from './journal.ts';
import type { LabResultInput } from './labs.ts';
import type { LabResult } from '../types.ts';

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
  const entryId = await journal.entries.upsertEntry({ epochDay: 1, mood: 3, dims: { masculinity: 30 } });

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
    {
      id,
      name: 'HRT start',
      epochDay: 20000,
      description: '',
      templateKey: 'hrt_start',
      roadmapGoalKey: null,
      procedureId: null,
      tryoutId: null,
      procedureName: null,
      tryoutLabel: null,
      customRoadmapGoalText: null,
      photo: null
    }
  ]);

  await journal.milestones.upsertMilestone({ id, name: 'HRT day one', epochDay: 20001 });
  assert.deepEqual(await journal.milestones.getMilestones(), [
    {
      id,
      name: 'HRT day one',
      epochDay: 20001,
      description: '',
      templateKey: null,
      roadmapGoalKey: null,
      procedureId: null,
      tryoutId: null,
      procedureName: null,
      tryoutLabel: null,
      customRoadmapGoalText: null,
      photo: null
    }
  ]);

  await assert.rejects(journal.milestones.upsertMilestone({ id: 'nope', name: 'x', epochDay: 1 }), /unknown milestone/);
});

test('a milestone description survives a resync that omits it, and only an explicit edit changes it', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.milestones.upsertMilestone({
    epochDay: 20000,
    name: 'HRT start',
    description: 'the pharmacist barely looked up'
  });

  // A resync that names roadmapGoalKey/procedureId/tryoutId already leaves
  // links it doesn't know about alone (procedures.ts); the description
  // follows the same rule, so a plain rename must not clear it.
  await journal.milestones.upsertMilestone({ id, name: 'HRT start (renamed)', epochDay: 20000 });
  assert.equal(
    (await journal.milestones.getMilestones())[0].description,
    'the pharmacist barely looked up'
  );

  await journal.milestones.upsertMilestone({ id, name: 'HRT start (renamed)', epochDay: 20000, description: '' });
  assert.equal((await journal.milestones.getMilestones())[0].description, '');
});

test('deleting a milestone takes its photo rows and files; twice is success', async () => {
  const db = await migratedDb();
  const files = fakeFileStore(['p1.jpg', 'p1-thumb.jpg']);
  const journal = openJournal(db, files);

  const id = await journal.milestones.upsertMilestone({ epochDay: 20000, name: 'HRT start' });
  db.raw.exec(
    `INSERT INTO photo (uuid, milestone_id, file_path, updated_at)
     SELECT 'p1', id, 'p1.jpg', 0 FROM milestone WHERE uuid = '${id}'`
  );

  await journal.milestones.deleteMilestone(id);

  assert.deepEqual(await journal.milestones.getMilestones(), []);
  assert.equal((db.raw.prepare('SELECT COUNT(*) AS n FROM photo').get() as { n: number }).n, 0);
  assert.deepEqual(files.names(), [], 'the thumbnail goes with the photo');

  await journal.milestones.deleteMilestone(id); // idempotent
});

/* labs */

test('analytes are the presets plus whatever is in use; results order by day', async () => {
  const { journal } = await journalWithBuiltIns();
  assert.deepEqual(await journal.labs.getAnalytes(), ['testosterone', 'estradiol', 'prolactin']);

  await journal.labs.upsertResult({ epochDay: 200, analyte: 'shbg', value: 60, unit: 'nmol/L' });
  const id = await journal.labs.upsertResult({ epochDay: 100, analyte: 'shbg', value: 55, unit: 'nmol/L' });
  assert.deepEqual(await journal.labs.getAnalytes(), ['testosterone', 'estradiol', 'prolactin', 'shbg']);

  const results = await journal.labs.getResults('shbg');
  assert.deepEqual(results.map((r) => r.epochDay), [100, 200]);
  assert.deepEqual(results[0], {
    id,
    epochDay: 100,
    analyte: 'shbg',
    value: 55,
    unit: 'nmol/L',
    note: '',
    drawTime: null,
    provider: '',
    timing: null
  });
});

test('the analytes in use are only the ones with a result, because a trend needs data', async () => {
  const { journal } = await journalWithBuiltIns();
  assert.deepEqual(await journal.labs.getUsedAnalytes(), []);

  await journal.labs.upsertResult({ epochDay: 100, analyte: 'estradiol', value: 120 });
  await journal.labs.upsertResult({ epochDay: 101, analyte: 'shbg', value: 60 });

  assert.deepEqual(await journal.labs.getUsedAnalytes(), ['estradiol', 'shbg']);
});

test('the most recent analyte is whichever result was last saved or edited, or null with none', async () => {
  const { journal } = await journalWithBuiltIns();
  assert.equal(await journal.labs.getMostRecentAnalyte(), null);

  await journal.labs.upsertResult({ epochDay: 100, analyte: 'estradiol', value: 120 });
  assert.equal(await journal.labs.getMostRecentAnalyte(), 'estradiol');

  const id = await journal.labs.upsertResult({ epochDay: 50, analyte: 'testosterone', value: 480 });
  assert.equal(await journal.labs.getMostRecentAnalyte(), 'testosterone', 'saved after the estradiol result despite the earlier draw day');

  await journal.labs.upsertResult({ id, epochDay: 50, analyte: 'testosterone', value: 490 });
  assert.equal(await journal.labs.getMostRecentAnalyte(), 'testosterone', 'editing it keeps it the most recent');

  await journal.labs.deleteResult(id);
  assert.equal(await journal.labs.getMostRecentAnalyte(), 'estradiol', 'the deleted result stops counting');
});

test('the latest result is the one drawn most recently, whatever analyte it is', async () => {
  const { journal } = await journalWithBuiltIns();
  assert.equal(await journal.labs.getLatestResult(), null);

  await journal.labs.upsertResult({ epochDay: 100, analyte: 'estradiol', value: 120, unit: 'pmol/L' });
  const earlier = await journal.labs.getLatestResult();
  assert.equal(earlier?.analyte, 'estradiol');
  assert.equal(earlier?.epochDay, 100);

  await journal.labs.upsertResult({ epochDay: 50, analyte: 'testosterone', value: 480 });
  assert.equal(
    (await journal.labs.getLatestResult())?.analyte,
    'estradiol',
    'saved later but drawn earlier, so it is not the latest draw'
  );

  await journal.labs.upsertResult({ epochDay: 120, analyte: 'shbg', value: 60 });
  assert.equal((await journal.labs.getLatestResult())?.analyte, 'shbg');

  /* One slip, two analytes: the tie goes to whichever was saved last, which
     is the reading a person was looking at when they typed it in. */
  await journal.labs.upsertResult({ epochDay: 120, analyte: 'prolactin', value: 300 });
  assert.equal((await journal.labs.getLatestResult())?.analyte, 'prolactin');

  const id = await journal.labs.upsertResult({ epochDay: 200, analyte: 'estradiol', value: 400 });
  assert.equal((await journal.labs.getLatestResult())?.epochDay, 200);
  await journal.labs.deleteResult(id);
  assert.equal((await journal.labs.getLatestResult())?.epochDay, 120, 'the deleted result stops counting');
});

test('a lab result without a unit stays blank rather than acquiring a placeholder', async () => {
  const { journal } = await journalWithBuiltIns();

  await journal.labs.upsertResult({ epochDay: 100, analyte: 'estradiol', value: 120 });

  assert.equal((await journal.labs.getResults('estradiol'))[0].unit, '');
});

test('two units on one analyte are two series, drawn from the values as logged', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.labs.upsertResult({ epochDay: 100, analyte: 'testosterone', value: 480, unit: 'ng/dL' });
  await journal.labs.upsertResult({ epochDay: 200, analyte: 'testosterone', value: 27, unit: 'ng/dL' });
  await journal.labs.upsertResult({ epochDay: 300, analyte: 'testosterone', value: 0.9, unit: 'nmol/L' });

  const series = await journal.labs.getSeries('testosterone');
  assert.deepEqual(
    series.map((s) => [s.unit, s.results.map((r) => r.value)]),
    [
      ['ng/dL', [480, 27]],
      ['nmol/L', [0.9]]
    ]
  );
  // The whole point: 0.9 nmol/L is about 26 ng/dL, and nothing here says so.
  assert.deepEqual((await journal.labs.getResults('testosterone')).map((r) => r.value), [480, 27, 0.9]);
});

test('a blank unit is its own series, and only surrounding whitespace is normalized away', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.labs.upsertResult({ epochDay: 100, analyte: 'estradiol', value: 41 });
  await journal.labs.upsertResult({ epochDay: 200, analyte: 'estradiol', value: 96, unit: 'ng/dL' });
  await journal.labs.upsertResult({ epochDay: 300, analyte: 'estradiol', value: 148, unit: '  ng/dL ' });
  await journal.labs.upsertResult({ epochDay: 400, analyte: 'estradiol', value: 173, unit: 'ng/dl' });

  assert.deepEqual(
    (await journal.labs.getSeries('estradiol')).map((s) => [s.unit, s.results.map((r) => r.value)]),
    [
      ['', [41]],
      ['ng/dL', [96, 148]],
      ['ng/dl', [173]]
    ]
  );
});

test('a series carries the unit as stored, so nothing is rewritten to make the key work', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.labs.upsertResult({ epochDay: 100, analyte: 'estradiol', value: 41, unit: ' pg/mL ' });

  assert.equal((await journal.labs.getResults('estradiol'))[0].unit, ' pg/mL ');
  assert.equal((await journal.labs.getSeries('estradiol'))[0].unit, 'pg/mL');
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

/* measurements */

test('a measurement round-trips with no episode reference, ordered by day', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.measurements.upsertMeasurement({ type: 'waist', epochDay: 200, value: 79, unit: 'cm' });
  const id = await journal.measurements.upsertMeasurement({ type: 'waist', epochDay: 100, value: 82, unit: 'cm' });

  const measurements = await journal.measurements.getMeasurements('waist');
  assert.deepEqual(measurements.map((r) => r.epochDay), [100, 200]);
  assert.deepEqual(measurements[0], { id, type: 'waist', epochDay: 100, value: 82, unit: 'cm' });
});

test('each type keeps its own measurements; another type is not returned', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.measurements.upsertMeasurement({ type: 'waist', epochDay: 100, value: 80, unit: 'cm' });
  await journal.measurements.upsertMeasurement({ type: 'hips', epochDay: 100, value: 95, unit: 'cm' });

  assert.equal((await journal.measurements.getMeasurements('waist')).length, 1);
  assert.equal((await journal.measurements.getMeasurements('hips')).length, 1);
  assert.deepEqual(await journal.measurements.getMeasurements('chest'), []);
});

test('two units on one type are two series, drawn from the values as logged', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.measurements.upsertMeasurement({ type: 'waist', epochDay: 100, value: 82, unit: 'cm' });
  await journal.measurements.upsertMeasurement({ type: 'waist', epochDay: 200, value: 79, unit: 'cm' });
  await journal.measurements.upsertMeasurement({ type: 'waist', epochDay: 300, value: 31, unit: 'in' });

  const series = await journal.measurements.getSeries('waist');
  assert.deepEqual(
    series.map((s) => [s.unit, s.measurements.map((r) => r.value)]),
    [
      ['cm', [82, 79]],
      ['in', [31]]
    ]
  );
  // The whole point: 31 in is about 79 cm, and nothing here says so.
  assert.deepEqual((await journal.measurements.getMeasurements('waist')).map((r) => r.value), [82, 79, 31]);
});

test('a range read returns every type within the days it was asked for', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.measurements.upsertMeasurement({ type: 'waist', epochDay: 100, value: 82, unit: 'cm' });
  await journal.measurements.upsertMeasurement({ type: 'hips', epochDay: 150, value: 96, unit: 'cm' });
  await journal.measurements.upsertMeasurement({ type: 'waist', epochDay: 200, value: 79, unit: 'cm' });

  const inRange = await journal.measurements.getMeasurementsInRange(120, 180);
  assert.deepEqual(
    inRange.map((r) => [r.type, r.epochDay]),
    [['hips', 150]]
  );
});

test('measurements update by id, throw on unknown ids and delete idempotently', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.measurements.upsertMeasurement({ type: 'waist', epochDay: 100, value: 82, unit: 'cm' });

  await journal.measurements.upsertMeasurement({ id, type: 'waist', epochDay: 100, value: 81, unit: 'cm' });
  assert.equal((await journal.measurements.getMeasurements('waist'))[0].value, 81);

  await assert.rejects(
    journal.measurements.upsertMeasurement({ id: 'nope', type: 'waist', epochDay: 1, value: 1, unit: 'cm' }),
    /unknown measurement/
  );

  await journal.measurements.deleteMeasurement(id);
  await journal.measurements.deleteMeasurement(id); // idempotent
  assert.deepEqual(await journal.measurements.getMeasurements('waist'), []);
});

/* measurement types (phase 5 ticket 29) */

test('a custom measurement type gets a minted key and reads back; built-ins are marked', async () => {
  const { journal } = await journalWithBuiltIns();
  const created = await journal.measurements.addCustomMeasurementType('Shoulders');

  const types = await journal.measurements.getMeasurementTypes();
  assert.deepEqual(types.find((t) => t.key === created.key), {
    key: created.key,
    name: 'Shoulders',
    builtIn: false,
    hidden: false
  });
  assert.equal(types.find((t) => t.key === 'waist')?.builtIn, true);
});

test('measurement types hide rather than delete, and their logged rows survive hiding', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.measurements.upsertMeasurement({ type: 'waist', epochDay: 100, value: 80, unit: 'cm' });

  await journal.measurements.setMeasurementTypeHidden('waist', true);

  assert.equal((await journal.measurements.getMeasurementTypes()).find((t) => t.key === 'waist')?.hidden, true);
  assert.deepEqual((await journal.measurements.getMeasurements('waist')).map((m) => m.id), [id]);
  assert.ok(!('deleteMeasurementType' in journal.measurements), 'no delete operation exists');
  await assert.rejects(journal.measurements.setMeasurementTypeHidden('nope', true), /unknown measurement type/);
});

test('a custom measurement type hides on the same terms as a built-in', async () => {
  const { journal } = await journalWithBuiltIns();
  const created = await journal.measurements.addCustomMeasurementType('Shoulders');

  await journal.measurements.setMeasurementTypeHidden(created.key, true);

  assert.equal((await journal.measurements.getMeasurementTypes()).find((t) => t.key === created.key)?.hidden, true);
});

/* size records */

test('a size record round-trips with no episode reference, ordered by day', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.sizeRecords.upsertRecord({ epochDay: 200, category: 'pants', size: '32', brand: 'Levi\'s', fitNote: 'true to size' });
  const id = await journal.sizeRecords.upsertRecord({ epochDay: 100, category: 'pants', size: '30', brand: '', fitNote: '' });

  const records = await journal.sizeRecords.getRecords();
  assert.deepEqual(records.map((r) => r.epochDay), [100, 200]);
  assert.deepEqual(records[0], { id, epochDay: 100, category: 'pants', size: '30', brand: '', fitNote: '' });
});

test('each category keeps its own records; another category is not returned', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.sizeRecords.upsertRecord({ epochDay: 100, category: 'shirts', size: 'M', brand: '', fitNote: '' });
  await journal.sizeRecords.upsertRecord({ epochDay: 100, category: 'shoes', size: '9', brand: '', fitNote: '' });

  assert.equal((await journal.sizeRecords.getRecordsByCategory('shirts')).length, 1);
  assert.equal((await journal.sizeRecords.getRecordsByCategory('shoes')).length, 1);
  assert.deepEqual(await journal.sizeRecords.getRecordsByCategory('pants'), []);
});

test('size records update by id, throw on unknown ids and delete idempotently', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.sizeRecords.upsertRecord({ epochDay: 100, category: 'shirts', size: 'M', brand: '', fitNote: '' });

  await journal.sizeRecords.upsertRecord({ id, epochDay: 100, category: 'shirts', size: 'L', brand: '', fitNote: '' });
  assert.equal((await journal.sizeRecords.getRecords())[0].size, 'L');

  await assert.rejects(
    journal.sizeRecords.upsertRecord({ id: 'nope', epochDay: 1, category: 'shirts', size: 'M', brand: '', fitNote: '' }),
    /unknown size record/
  );

  await journal.sizeRecords.deleteRecord(id);
  await journal.sizeRecords.deleteRecord(id); // idempotent
  assert.deepEqual(await journal.sizeRecords.getRecords(), []);
});

test('a category outside the closed vocabulary is refused before it reaches the schema', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(
    journal.sizeRecords.upsertRecord({ epochDay: 100, category: 'upper_lip', size: 'M', brand: '', fitNote: '' }),
    /invalid garment category/
  );
});

test('brand and fit note are stored as typed, with no list and no normalization', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.sizeRecords.upsertRecord({ epochDay: 100, category: 'shirts', size: 'M', brand: '  Uniqlo ', fitNote: 'Runs Small' });
  await journal.sizeRecords.upsertRecord({ epochDay: 101, category: 'shirts', size: 'L' });

  assert.deepEqual(
    (await journal.sizeRecords.getRecords()).map((r) => [r.brand, r.fitNote]),
    [
      ['  Uniqlo ', 'Runs Small'],
      ['', '']
    ]
  );
});

/* lab draw context (phase 4 ticket 03) */

const DRAW_DAY = 20000;
const drawn = (time: string) => timestampAtLocalTime(DRAW_DAY, time);

/** A lab result saved against a dose log built by `logDoses`. */
async function labWithDoses(
  logDoses: (journal: Journal) => Promise<unknown>,
  input: Partial<LabResultInput> = {}
): Promise<LabResult> {
  const { journal } = await journalWithBuiltIns();
  await logDoses(journal);
  await journal.labs.upsertResult({ epochDay: DRAW_DAY, analyte: 'estradiol', value: 400, ...input });
  return (await journal.labs.getResults('estradiol'))[0];
}

test('an oral regimen stamps a lab result with hours since the last dose', async () => {
  const result = await labWithDoses(
    (journal) => journal.doses.upsertDose({ timestamp: drawn('20:00') - 86400000, route: 'oral', dose: 2, doseUnit: 'mg' }),
    { drawTime: '08:00' }
  );
  assert.deepEqual(result.timing, { route: 'oral', hoursSinceDose: 12 });
});

test('a sublingual, patch or gel regimen stamps hours too', async () => {
  for (const route of ['sublingual', 'patch', 'gel'] as const) {
    const result = await labWithDoses(
      (journal) =>
        journal.doses.upsertDose(
          route === 'sublingual'
            ? { timestamp: drawn('06:00'), route, dose: 2, doseUnit: 'mg' }
            : { timestamp: drawn('06:00'), route, dose: 2, doseUnit: 'mg', applicationSite: 'thigh' }
        ),
      { drawTime: '09:00' }
    );
    assert.deepEqual(result.timing, { route, hoursSinceDose: 3 });
  }
});

test('an IM or SC regimen stamps day-of-interval instead of an hours figure', async () => {
  for (const route of ['im', 'sc'] as const) {
    const result = await labWithDoses(
      (journal) =>
        journal.doses.upsertDose({
          timestamp: drawn('08:00') - 6 * 86400000,
          route,
          dose: 5,
          doseUnit: 'mg',
          injectionSite: 'thigh-left',
          vehicle: 'oil'
        }),
      { drawTime: '08:00' }
    );
    assert.deepEqual(result.timing, { route, dayOfInterval: 7 });
  }
});

test('a lab result with no dose logged before it saves with no timing context', async () => {
  const result = await labWithDoses(async () => {}, { drawTime: '08:00' });
  assert.equal(result.timing, null);
});

test('a dose logged after the draw is not what the context is measured from', async () => {
  const result = await labWithDoses(
    (journal) => journal.doses.upsertDose({ timestamp: drawn('10:00'), route: 'oral', dose: 2, doseUnit: 'mg' }),
    { drawTime: '08:00' }
  );
  assert.equal(result.timing, null);
});

/* A skipped dose is one that was expected and not taken, so hours since it
   would be hours since nothing happened. */
test('a skipped dose is passed over in favour of the last dose actually taken', async () => {
  const result = await labWithDoses(async (journal) => {
    await journal.doses.upsertDose({ timestamp: drawn('08:00') - 86400000, route: 'oral', dose: 2, doseUnit: 'mg' });
    await journal.doses.upsertDose({
      timestamp: drawn('06:00'),
      route: 'oral',
      dose: 2,
      doseUnit: 'mg',
      status: 'skipped'
    });
  }, { drawTime: '08:00' });
  assert.deepEqual(result.timing, { route: 'oral', hoursSinceDose: 24 });
});

test('a changed dose did happen, so the context is measured from it', async () => {
  const result = await labWithDoses(
    (journal) =>
      journal.doses.upsertDose({
        timestamp: drawn('06:00'),
        route: 'oral',
        dose: 1,
        doseUnit: 'mg',
        status: 'changed',
        scheduled: { dose: 2, route: 'oral', timestamp: drawn('06:00') }
      }),
    { drawTime: '08:00' }
  );
  assert.deepEqual(result.timing, { route: 'oral', hoursSinceDose: 2 });
});

/* Ticket 03, box 6. The reason the figure is stored rather than derived on
   read: a dose corrected in November must not rewrite the context on a draw
   from August that someone has already discussed at an appointment. */
test('editing a past dose event leaves an already-saved timing context alone', async () => {
  const { journal } = await journalWithBuiltIns();
  const doseId = await journal.doses.upsertDose({
    timestamp: drawn('08:00') - 86400000,
    route: 'oral',
    dose: 2,
    doseUnit: 'mg'
  });
  await journal.labs.upsertResult({ epochDay: DRAW_DAY, analyte: 'estradiol', value: 400, drawTime: '08:00' });
  assert.deepEqual((await journal.labs.getResults('estradiol'))[0].timing, { route: 'oral', hoursSinceDose: 24 });

  await journal.doses.upsertDose({ id: doseId, timestamp: drawn('02:00'), route: 'oral', dose: 2, doseUnit: 'mg' });

  assert.deepEqual((await journal.labs.getResults('estradiol'))[0].timing, { route: 'oral', hoursSinceDose: 24 });
});

test('editing a lab result for any other reason leaves its timing context alone', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.doses.upsertDose({ timestamp: drawn('08:00') - 86400000, route: 'oral', dose: 2, doseUnit: 'mg' });
  const id = await journal.labs.upsertResult({
    epochDay: DRAW_DAY,
    analyte: 'estradiol',
    value: 400,
    drawTime: '08:00'
  });
  await journal.doses.upsertDose({ timestamp: drawn('07:00'), route: 'oral', dose: 2, doseUnit: 'mg' });

  await journal.labs.upsertResult({
    id,
    epochDay: DRAW_DAY,
    analyte: 'estradiol',
    value: 410,
    drawTime: '08:00',
    note: 'corrected off the slip'
  });

  const result = (await journal.labs.getResults('estradiol'))[0];
  assert.equal(result.value, 410);
  assert.deepEqual(result.timing, { route: 'oral', hoursSinceDose: 24 });
});

/* The other half of the freeze rule: moving the draw voids the old figure
   outright, so it is re-derived. Without this, a result saved with no draw
   time could never be given one afterwards. */
test('correcting the draw day or time re-derives the context', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.doses.upsertDose({ timestamp: drawn('06:00'), route: 'oral', dose: 2, doseUnit: 'mg' });
  const id = await journal.labs.upsertResult({ epochDay: DRAW_DAY, analyte: 'estradiol', value: 400 });
  assert.equal((await journal.labs.getResults('estradiol'))[0].timing, null);

  await journal.labs.upsertResult({ id, epochDay: DRAW_DAY, analyte: 'estradiol', value: 400, drawTime: '09:00' });

  assert.deepEqual((await journal.labs.getResults('estradiol'))[0].timing, { route: 'oral', hoursSinceDose: 3 });
});

test('a provider is stored as typed, with no list and no normalization', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.labs.upsertResult({ epochDay: 100, analyte: 'estradiol', value: 400, provider: '  Diagnostyka ' });
  await journal.labs.upsertResult({ epochDay: 101, analyte: 'estradiol', value: 410, provider: 'diagnostyka' });
  await journal.labs.upsertResult({ epochDay: 102, analyte: 'estradiol', value: 420 });

  assert.deepEqual(
    (await journal.labs.getResults('estradiol')).map((r) => r.provider),
    ['  Diagnostyka ', 'diagnostyka', '']
  );
});

/* side effects */

test('a side effect round-trips with no episode reference, ordered by day', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.sideEffects.upsertSideEffect({ name: 'nausea', severity: 2, epochDay: 200 });
  const id = await journal.sideEffects.upsertSideEffect({ name: 'hot flashes', severity: 4, epochDay: 100 });

  const effects = await journal.sideEffects.getSideEffects();
  assert.deepEqual(effects.map((e) => e.epochDay), [100, 200]);
  assert.deepEqual(effects[0], { id, name: 'hot flashes', severity: 4, epochDay: 100 });
});

test('a range read returns only the days it was asked for', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.sideEffects.upsertSideEffect({ name: 'nausea', severity: 2, epochDay: 100 });
  await journal.sideEffects.upsertSideEffect({ name: 'headache', severity: 1, epochDay: 150 });
  await journal.sideEffects.upsertSideEffect({ name: 'fatigue', severity: 3, epochDay: 200 });

  const inRange = await journal.sideEffects.getSideEffectsInRange(120, 180);
  assert.deepEqual(inRange.map((e) => e.name), ['headache']);
});

test('side effects update by id, throw on unknown ids and delete idempotently', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.sideEffects.upsertSideEffect({ name: 'nausea', severity: 2, epochDay: 100 });

  await journal.sideEffects.upsertSideEffect({ id, name: 'nausea', severity: 3, epochDay: 100 });
  assert.equal((await journal.sideEffects.getSideEffects())[0].severity, 3);

  await assert.rejects(
    journal.sideEffects.upsertSideEffect({ id: 'nope', name: 'x', severity: 1, epochDay: 1 }),
    /unknown side effect/
  );

  await journal.sideEffects.deleteSideEffect(id);
  await journal.sideEffects.deleteSideEffect(id); // idempotent
  assert.deepEqual(await journal.sideEffects.getSideEffects(), []);
});

test('a severity outside the 1-5 scale is refused before it reaches the schema', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(
    journal.sideEffects.upsertSideEffect({ name: 'nausea', severity: 0, epochDay: 100 }),
    /invalid severity/
  );
  await assert.rejects(
    journal.sideEffects.upsertSideEffect({ name: 'nausea', severity: 6, epochDay: 100 }),
    /invalid severity/
  );
  await assert.rejects(
    journal.sideEffects.upsertSideEffect({ name: 'nausea', severity: 2.5, epochDay: 100 }),
    /invalid severity/
  );
});

/* cycle events (phase 5 ticket 03) */

test('a cycle event round-trips with no episode reference, ordered by day', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.cycleEvents.upsertCycleEvent({ kind: 'spotting', epochDay: 200 });
  const id = await journal.cycleEvents.upsertCycleEvent({ kind: 'period_occurred', epochDay: 100 });

  const events = await journal.cycleEvents.getCycleEvents();
  assert.deepEqual(events.map((e) => e.epochDay), [100, 200]);
  assert.deepEqual(events[0], { id, kind: 'period_occurred', epochDay: 100 });
});

test('a cycle event range read returns only the days it was asked for', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.cycleEvents.upsertCycleEvent({ kind: 'period_occurred', epochDay: 100 });
  await journal.cycleEvents.upsertCycleEvent({ kind: 'spotting', epochDay: 150 });
  await journal.cycleEvents.upsertCycleEvent({ kind: 'nothing_this_month', epochDay: 200 });

  const inRange = await journal.cycleEvents.getCycleEventsInRange(120, 180);
  assert.deepEqual(inRange.map((e) => e.kind), ['spotting']);
});

test('cycle events update by id, throw on unknown ids and delete idempotently', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.cycleEvents.upsertCycleEvent({ kind: 'period_occurred', epochDay: 100 });

  await journal.cycleEvents.upsertCycleEvent({ id, kind: 'spotting', epochDay: 100 });
  assert.equal((await journal.cycleEvents.getCycleEvents())[0].kind, 'spotting');

  await assert.rejects(
    journal.cycleEvents.upsertCycleEvent({ id: 'nope', kind: 'period_occurred', epochDay: 1 }),
    /unknown cycle event/
  );

  await journal.cycleEvents.deleteCycleEvent(id);
  await journal.cycleEvents.deleteCycleEvent(id); // idempotent
  assert.deepEqual(await journal.cycleEvents.getCycleEvents(), []);
});

/* journaling pause (phase 5 ticket 21) */

test('a journaling pause round-trips with no episode reference, ordered by start day', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.journalingPauses.upsertPause({ startEpochDay: 200, endEpochDay: 210 });
  const id = await journal.journalingPauses.upsertPause({ startEpochDay: 100, endEpochDay: null });

  const pauses = await journal.journalingPauses.getPauses();
  assert.deepEqual(pauses.map((p) => p.startEpochDay), [100, 200]);
  assert.deepEqual(pauses[0], { id, startEpochDay: 100, endEpochDay: null });
});

test('journaling pauses update by id, throw on unknown ids and delete idempotently', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.journalingPauses.upsertPause({ startEpochDay: 100, endEpochDay: null });

  await journal.journalingPauses.upsertPause({ id, startEpochDay: 100, endEpochDay: 105 });
  assert.equal((await journal.journalingPauses.getPauses())[0].endEpochDay, 105);

  await assert.rejects(
    journal.journalingPauses.upsertPause({ id: 'nope', startEpochDay: 1, endEpochDay: null }),
    /unknown journaling pause/
  );

  await journal.journalingPauses.deletePause(id);
  await journal.journalingPauses.deletePause(id); // idempotent
  assert.deepEqual(await journal.journalingPauses.getPauses(), []);
});

/* personal effects timeline (phase 4 ticket 07) */

test('no marker exists until an effect is set; getMarkers only returns what was marked', async () => {
  const { journal } = await journalWithBuiltIns();
  assert.deepEqual(await journal.personalEffects.getMarkers(), []);

  const id = await journal.personalEffects.upsertMarker({ effect: 'breast_development', firstNoticedEpochDay: 19180 });
  assert.match(id, UUID_PATTERN);

  assert.deepEqual(await journal.personalEffects.getMarkers(), [
    { id, effect: 'breast_development', firstNoticedEpochDay: 19180 }
  ]);
});

test('a second marker for the same effect replaces the date rather than adding a row', async () => {
  const { journal } = await journalWithBuiltIns();
  const first = await journal.personalEffects.upsertMarker({ effect: 'skin_softening', firstNoticedEpochDay: 19100 });

  const second = await journal.personalEffects.upsertMarker({ effect: 'skin_softening', firstNoticedEpochDay: 19120 });

  assert.equal(second, first);
  const markers = await journal.personalEffects.getMarkers();
  assert.equal(markers.length, 1);
  assert.equal(markers[0].firstNoticedEpochDay, 19120);
});

test('each of the eight effects keeps its own marker', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.personalEffects.upsertMarker({ effect: 'breast_development', firstNoticedEpochDay: 100 });
  await journal.personalEffects.upsertMarker({ effect: 'fat_redistribution', firstNoticedEpochDay: 200 });

  const markers = await journal.personalEffects.getMarkers();
  assert.equal(markers.length, 2);
  assert.deepEqual(
    markers.map((m) => m.effect).toSorted(),
    ['breast_development', 'fat_redistribution']
  );
});

/* masculinizing effects timeline pack (phase 5 ticket 02) */

test('masculinizing fat redistribution is a distinct marker from fat redistribution, not the same one read two ways', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.personalEffects.upsertMarker({ effect: 'fat_redistribution', firstNoticedEpochDay: 100 });
  await journal.personalEffects.upsertMarker({ effect: 'masculinizing_fat_redistribution', firstNoticedEpochDay: 200 });

  const markers = await journal.personalEffects.getMarkers();
  assert.equal(markers.length, 2);
  assert.deepEqual(
    markers.map((m) => m.effect).toSorted(),
    ['fat_redistribution', 'masculinizing_fat_redistribution']
  );
});

test('each new masculinizing marker (voice drop, facial/body hair, cycle cessation) can be set independently', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.personalEffects.upsertMarker({ effect: 'voice_drop', firstNoticedEpochDay: 100 });
  await journal.personalEffects.upsertMarker({ effect: 'facial_body_hair', firstNoticedEpochDay: 200 });
  await journal.personalEffects.upsertMarker({ effect: 'cycle_cessation', firstNoticedEpochDay: 300 });

  const markers = await journal.personalEffects.getMarkers();
  assert.deepEqual(
    markers.map((m) => m.effect).toSorted(),
    ['cycle_cessation', 'facial_body_hair', 'voice_drop']
  );
});

test('an unrecognized effect is refused before it reaches the schema', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(
    journal.personalEffects.upsertMarker({ effect: 'not_a_real_effect' as never, firstNoticedEpochDay: 100 })
  );
});

test('clearing a marker is the undo for a mistaken date, and is idempotent', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.personalEffects.upsertMarker({ effect: 'hair_changes', firstNoticedEpochDay: 100 });

  await journal.personalEffects.clearMarker('hair_changes');
  await journal.personalEffects.clearMarker('hair_changes'); // idempotent

  assert.deepEqual(await journal.personalEffects.getMarkers(), []);
});

/* hair progress (phase 4 ticket 09) */

const nh = (epochDay: number, stage: string) => ({ epochDay, scale: 'norwood_hamilton', stage });

test('a staging round-trips with no anchor reference, ordered by day', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.hairProgress.upsertStage(nh(200, '3v'));
  const id = await journal.hairProgress.upsertStage(nh(100, '2'));

  const stages = await journal.hairProgress.getStages();
  assert.deepEqual(stages.map((s) => s.epochDay), [100, 200]);
  assert.deepEqual(stages[0], { id, epochDay: 100, scale: 'norwood_hamilton', stage: '2', description: '' });
});

test('re-staging adds a row rather than replacing the last one - it is a series', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.hairProgress.upsertStage(nh(100, '2'));
  await journal.hairProgress.upsertStage(nh(200, '3'));

  assert.equal((await journal.hairProgress.getStages()).length, 2);
});

test('stagings update by id, throw on unknown ids and delete idempotently', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.hairProgress.upsertStage(nh(100, '2'));

  await journal.hairProgress.upsertStage({ id, ...nh(100, '2a') });
  assert.equal((await journal.hairProgress.getStages())[0].stage, '2a');

  await assert.rejects(journal.hairProgress.upsertStage({ id: 'nope', ...nh(1, '1') }), /unknown hair stage/);

  await journal.hairProgress.deleteStage(id);
  await journal.hairProgress.deleteStage(id); // idempotent
  assert.deepEqual(await journal.hairProgress.getStages(), []);
});

test('an unrecognized stage is refused before it reaches the schema', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(journal.hairProgress.upsertStage(nh(100, 'not_a_real_stage')));
});

/* ticket 33: a second scale, and a pattern neither describes */

test('a staging keeps the scale it was recorded against', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.hairProgress.upsertStage(nh(100, '3'));
  await journal.hairProgress.upsertStage({ epochDay: 200, scale: 'sinclair', stage: '3' });

  const stages = await journal.hairProgress.getStages();
  // Both say '3' and neither means what the other means.
  assert.deepEqual(
    stages.map((s) => [s.scale, s.stage]),
    [
      ['norwood_hamilton', '3'],
      ['sinclair', '3']
    ]
  );
});

test('a grade from the wrong scale is refused, though it is a grade somewhere', async () => {
  const { journal } = await journalWithBuiltIns();

  await assert.rejects(journal.hairProgress.upsertStage({ epochDay: 100, scale: 'sinclair', stage: '3v' }), /sinclair/);
  await assert.rejects(journal.hairProgress.upsertStage({ epochDay: 100, scale: 'ludwig', stage: 'ii' }), /ludwig/);
});

test("a pattern neither scale describes is recorded in the person's own words", async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.hairProgress.upsertStage({
    epochDay: 100,
    scale: 'other',
    stage: '',
    description: 'thinner all over the top, parting unchanged'
  });

  assert.deepEqual((await journal.hairProgress.getStages())[0], {
    id,
    epochDay: 100,
    scale: 'other',
    stage: '',
    description: 'thinner all over the top, parting unchanged'
  });
});

test('neither of these, with nothing written down, is still a record', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.hairProgress.upsertStage({ epochDay: 100, scale: 'other', stage: '' });

  assert.equal((await journal.hairProgress.getStages())[0].description, '');
});

test("changing a staging's scale keeps the stagings recorded under the other one", async () => {
  const { journal } = await journalWithBuiltIns();
  const kept = await journal.hairProgress.upsertStage(nh(100, '3'));
  const moving = await journal.hairProgress.upsertStage(nh(200, '4'));

  await journal.hairProgress.upsertStage({ id: moving, epochDay: 200, scale: 'sinclair', stage: '2' });

  const stages = await journal.hairProgress.getStages();
  assert.deepEqual(
    stages.map((s) => [s.id, s.scale, s.stage]),
    [
      [kept, 'norwood_hamilton', '3'],
      [moving, 'sinclair', '2']
    ]
  );
});

test('prose does not survive a move back onto a graded scale', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.hairProgress.upsertStage({
    epochDay: 100,
    scale: 'other',
    stage: '',
    description: 'thinner all over'
  });

  await journal.hairProgress.upsertStage({ id, ...nh(100, '3'), description: 'thinner all over' });

  assert.equal((await journal.hairProgress.getStages())[0].description, '');
});

test('a hair photo writes both files and its own row, distinct from the shared photo table', async () => {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);

  const id = await journal.hairProgress.addPhoto(19000, {
    full: new Uint8Array([1]),
    thumb: new Uint8Array([2])
  });

  assert.match(id, UUID_PATTERN);
  const photos = await journal.hairProgress.getPhotos();
  assert.deepEqual(photos, [{ id, epochDay: 19000, fileName: `${id}.jpg` }]);
  assert.deepEqual(files.names(), [`${id}-thumb.jpg`, `${id}.jpg`]);
  assert.equal((db.raw.prepare('SELECT COUNT(*) AS n FROM photo').get() as { n: number }).n, 0, 'not a third owner on `photo`');
});

test('hair photos order oldest first and delete takes the row and its files; twice is success', async () => {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);

  const first = await journal.hairProgress.addPhoto(19100, { full: new Uint8Array([1]), thumb: new Uint8Array([2]) });
  const second = await journal.hairProgress.addPhoto(19000, { full: new Uint8Array([3]), thumb: new Uint8Array([4]) });

  assert.deepEqual(
    (await journal.hairProgress.getPhotos()).map((p) => p.id),
    [second, first]
  );

  await journal.hairProgress.deletePhoto(first);
  assert.deepEqual(files.names(), [`${second}-thumb.jpg`, `${second}.jpg`]);

  await journal.hairProgress.deletePhoto(first); // idempotent
});

/* hair removal (phase 5 ticket 08) */

test('a hair-removal session round-trips with no episode reference, ordered by day', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.hairRemoval.upsertSession({
    epochDay: 200,
    area: 'legs',
    method: 'laser',
    painRating: 2,
    cost: '300 PLN',
    provider: 'Klinika Laserowa'
  });
  const id = await journal.hairRemoval.upsertSession({
    epochDay: 100,
    area: 'upper_lip',
    method: 'electrolysis',
    painRating: 4,
    cost: '',
    provider: ''
  });

  const sessions = await journal.hairRemoval.getSessions();
  assert.deepEqual(sessions.map((s) => s.epochDay), [100, 200]);
  assert.deepEqual(sessions[0], {
    id,
    epochDay: 100,
    area: 'upper_lip',
    method: 'electrolysis',
    painRating: 4,
    cost: '',
    provider: ''
  });
});

test('hair-removal sessions update by id, throw on unknown ids and delete idempotently', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.hairRemoval.upsertSession({
    epochDay: 100,
    area: 'chin',
    method: 'laser',
    painRating: 2,
    cost: '',
    provider: ''
  });

  await journal.hairRemoval.upsertSession({ id, epochDay: 100, area: 'chin', method: 'laser', painRating: 3, cost: '', provider: '' });
  assert.equal((await journal.hairRemoval.getSessions())[0].painRating, 3);

  await assert.rejects(
    journal.hairRemoval.upsertSession({ id: 'nope', epochDay: 1, area: 'chin', method: 'laser', painRating: 1, cost: '', provider: '' }),
    /unknown hair removal session/
  );

  await journal.hairRemoval.deleteSession(id);
  await journal.hairRemoval.deleteSession(id); // idempotent
  assert.deepEqual(await journal.hairRemoval.getSessions(), []);
});

test('an area outside the closed vocabulary is refused before it reaches the schema', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(
    journal.hairRemoval.upsertSession({
      epochDay: 100,
      area: 'face_jaw', // a BODY_REGION_KEYS key, not a hair-removal area
      method: 'laser',
      painRating: 2,
      cost: '',
      provider: ''
    }),
    /invalid hair-removal area/
  );
});

test('a pain rating outside the 1-5 scale is refused before it reaches the schema', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(
    journal.hairRemoval.upsertSession({ epochDay: 100, area: 'chin', method: 'laser', painRating: 0, cost: '', provider: '' }),
    /invalid pain rating/
  );
  await assert.rejects(
    journal.hairRemoval.upsertSession({ epochDay: 100, area: 'chin', method: 'laser', painRating: 6, cost: '', provider: '' }),
    /invalid pain rating/
  );
});

test('cost and provider are stored as typed, with no list and no normalization', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.hairRemoval.upsertSession({
    epochDay: 100,
    area: 'chin',
    method: 'laser',
    painRating: 2,
    cost: '  250 PLN ',
    provider: 'diagnostyka'
  });
  await journal.hairRemoval.upsertSession({ epochDay: 101, area: 'chin', method: 'laser', painRating: 2 });

  assert.deepEqual(
    (await journal.hairRemoval.getSessions()).map((s) => [s.cost, s.provider]),
    [
      ['  250 PLN ', 'diagnostyka'],
      ['', '']
    ]
  );
});

test('a session photo writes both files and its own row, distinct from `photo` and `hair_photo`', async () => {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);
  const sessionId = await journal.hairRemoval.upsertSession({
    epochDay: 100,
    area: 'chin',
    method: 'laser',
    painRating: 2,
    cost: '',
    provider: ''
  });

  const id = await journal.hairRemoval.addPhoto(sessionId, { full: new Uint8Array([1]), thumb: new Uint8Array([2]) });

  assert.match(id, UUID_PATTERN);
  assert.deepEqual(await journal.hairRemoval.getPhotos(sessionId), [{ id, sessionId, fileName: `${id}.jpg` }]);
  assert.deepEqual(files.names(), [`${id}-thumb.jpg`, `${id}.jpg`]);
  assert.equal((db.raw.prepare('SELECT COUNT(*) AS n FROM photo').get() as { n: number }).n, 0, 'not a third owner on `photo`');
  assert.equal((db.raw.prepare('SELECT COUNT(*) AS n FROM hair_photo').get() as { n: number }).n, 0, 'not hair_photo either');
});

test('adding a photo to an unknown session throws before any file lands', async () => {
  const files = fakeFileStore();
  const journal = openJournal(await migratedDb(), files);

  await assert.rejects(
    journal.hairRemoval.addPhoto('nope', { full: new Uint8Array([1]), thumb: new Uint8Array([2]) }),
    /unknown hair removal session/
  );
  assert.deepEqual(files.names(), []);
});

test('session photos order oldest first and delete takes the row and its files; twice is success', async () => {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);
  const sessionId = await journal.hairRemoval.upsertSession({
    epochDay: 100,
    area: 'chin',
    method: 'laser',
    painRating: 2,
    cost: '',
    provider: ''
  });

  const first = await journal.hairRemoval.addPhoto(sessionId, { full: new Uint8Array([1]), thumb: new Uint8Array([2]) });
  const second = await journal.hairRemoval.addPhoto(sessionId, { full: new Uint8Array([3]), thumb: new Uint8Array([4]) });

  assert.deepEqual(
    (await journal.hairRemoval.getPhotos(sessionId)).map((p) => p.id),
    [first, second]
  );

  await journal.hairRemoval.deletePhoto(first);
  assert.deepEqual(files.names(), [`${second}-thumb.jpg`, `${second}.jpg`]);

  await journal.hairRemoval.deletePhoto(first); // idempotent
});

test('deleting a session cascades to its photos', async () => {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);
  const sessionId = await journal.hairRemoval.upsertSession({
    epochDay: 100,
    area: 'chin',
    method: 'laser',
    painRating: 2,
    cost: '',
    provider: ''
  });
  await journal.hairRemoval.addPhoto(sessionId, { full: new Uint8Array([1]), thumb: new Uint8Array([2]) });

  await journal.hairRemoval.deleteSession(sessionId);

  assert.equal(
    (db.raw.prepare('SELECT COUNT(*) AS n FROM hair_removal_photo').get() as { n: number }).n,
    0,
    'ON DELETE CASCADE removed the photo row too'
  );
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

/* procedures (phase 5 ticket 07) */

test('a procedure round-trips with a free-text name and an optional surgery date, ordered by that date', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.procedures.upsertProcedure({ name: 'top surgery', surgeryEpochDay: 20100, notes: '' });
  const unscheduled = await journal.procedures.upsertProcedure({ name: 'facial feminization surgery' });
  const earlier = await journal.procedures.upsertProcedure({ name: 'orchiectomy', surgeryEpochDay: 20000 });

  const procedures = await journal.procedures.getProcedures();
  assert.deepEqual(
    procedures.map((p) => p.name),
    ['orchiectomy', 'top surgery', 'facial feminization surgery'],
    'dated ones first, oldest first; an undated one has nowhere to sort to but the end'
  );
  assert.deepEqual(procedures[0], {
    id: earlier,
    name: 'orchiectomy',
    surgeryEpochDay: 20000,
    notes: '',
    consults: []
  });
  assert.equal(procedures[2].surgeryEpochDay, null);
  assert.equal(procedures[2].id, unscheduled);
  assert.match(earlier, UUID_PATTERN);
});

test('several procedures coexist, each with its own dates, notes and checklist', async () => {
  const { journal } = await journalWithBuiltIns();
  const top = await journal.procedures.upsertProcedure({ name: 'top surgery', surgeryEpochDay: 20000 });
  const ffs = await journal.procedures.upsertProcedure({ name: 'FFS', surgeryEpochDay: 20200 });

  await journal.procedures.addConsult(top, 19900);
  await journal.procedures.addConsult(ffs, 20100);
  await journal.procedures.setNotes(top, 'drains out on day 5');
  await journal.procedures.addChecklistItem(top, 'buy gauze');

  const procedures = await journal.procedures.getProcedures();
  const [first, second] = procedures;
  assert.deepEqual(first.consults.map((c) => c.epochDay), [19900]);
  assert.equal(first.notes, 'drains out on day 5');
  assert.deepEqual(second.consults.map((c) => c.epochDay), [20100]);
  assert.equal(second.notes, '');

  assert.deepEqual((await journal.procedures.getChecklist(top))?.items.map((i) => i.content), ['buy gauze']);
  assert.equal(await journal.procedures.getChecklist(ffs), undefined, 'a procedure with no items has no checklist yet');
});

test('consult dates are a list, oldest first, and each one can be dropped on its own', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.procedures.upsertProcedure({ name: 'top surgery' });

  const second = await journal.procedures.addConsult(id, 19950);
  await journal.procedures.addConsult(id, 19900);

  const days = async () => (await journal.procedures.getProcedures())[0].consults.map((c) => c.epochDay);
  assert.deepEqual(await days(), [19900, 19950]);

  await journal.procedures.deleteConsult(second);
  assert.deepEqual(await days(), [19900]);
  await journal.procedures.deleteConsult(second); // idempotent
});

test('a procedure updates by id, throws on unknown ids and deletes idempotently', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.procedures.upsertProcedure({ name: 'top surgery', surgeryEpochDay: 20000 });

  await journal.procedures.upsertProcedure({ id, name: 'top surgery (double incision)', surgeryEpochDay: 20001 });
  const [procedure] = await journal.procedures.getProcedures();
  assert.equal(procedure.name, 'top surgery (double incision)');
  assert.equal(procedure.surgeryEpochDay, 20001);

  await assert.rejects(journal.procedures.upsertProcedure({ id: 'nope', name: 'x' }), /unknown procedure/);
  await assert.rejects(journal.procedures.setNotes('nope', 'x'), /unknown procedure/);
  await assert.rejects(journal.procedures.addConsult('nope', 1), /unknown procedure/);

  await journal.procedures.deleteProcedure(id);
  await journal.procedures.deleteProcedure(id); // idempotent
  assert.deepEqual(await journal.procedures.getProcedures(), []);
});

test('a surgery date can be cleared back to none once set', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.procedures.upsertProcedure({ name: 'top surgery', surgeryEpochDay: 20000 });

  await journal.procedures.upsertProcedure({ id, name: 'top surgery', surgeryEpochDay: null });

  assert.equal((await journal.procedures.getProcedures())[0].surgeryEpochDay, null);
});

test('a recovery photo is dated, belongs to one procedure, and its files go when it does', async () => {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);
  const id = await journal.procedures.upsertProcedure({ name: 'top surgery', surgeryEpochDay: 20000 });

  const later = await journal.procedures.addPhoto(id, 20010, { full: new Uint8Array([7]), thumb: new Uint8Array([3]) });
  await journal.procedures.addPhoto(id, 20002, { full: new Uint8Array([7]), thumb: new Uint8Array([2]) });

  const photos = await journal.procedures.getPhotos(id);
  assert.deepEqual(photos.map((p) => p.epochDay), [20002, 20010], 'oldest first');
  assert.deepEqual(photos.map((p) => p.procedureId), [id, id]);
  assert.equal(files.names().length, 4, 'two photos, each a full and a thumbnail');

  await journal.procedures.deletePhoto(later);
  assert.deepEqual((await journal.procedures.getPhotos(id)).map((p) => p.epochDay), [20002]);
  assert.equal(files.names().length, 2);
  await journal.procedures.deletePhoto(later); // idempotent

  await assert.rejects(journal.procedures.addPhoto('nope', 20000, { full: new Uint8Array([1]), thumb: new Uint8Array([1]) }), /unknown procedure/);
});

test('deleting a procedure takes its consults, photos, photo files and checklist with it', async () => {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);
  const id = await journal.procedures.upsertProcedure({ name: 'top surgery', surgeryEpochDay: 20000 });
  await journal.procedures.addConsult(id, 19900);
  await journal.procedures.addPhoto(id, 20002, { full: new Uint8Array([7]), thumb: new Uint8Array([2]) });
  await journal.procedures.addChecklistItem(id, 'buy gauze');

  await journal.procedures.deleteProcedure(id);

  assert.deepEqual(await journal.procedures.getProcedures(), []);
  assert.deepEqual(await journal.procedures.getPhotos(id), []);
  assert.deepEqual(files.names(), [], 'a recovery photo is not left behind as an orphan');
  assert.equal(await journal.procedures.getChecklist(id), undefined);
  assert.deepEqual(await journal.checklists.getStandaloneChecklist(), undefined, 'and the appointment prep list is untouched');
});

test("a procedure's checklist is an ordinary owned checklist, created on the first item", async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.procedures.upsertProcedure({ name: 'top surgery' });

  const item = await journal.procedures.addChecklistItem(id, 'buy gauze');
  await journal.checklists.setItemChecked(item.id, true);

  const checklist = await journal.procedures.getChecklist(id);
  assert.deepEqual(checklist?.owner, { kind: 'procedure', id });
  assert.deepEqual(checklist?.items, [{ id: item.id, content: 'buy gauze', checked: true, carriedForward: false }]);

  await journal.procedures.addChecklistItem(id, 'ask about scar cream');
  assert.equal((await journal.procedures.getChecklist(id))?.items.length, 2, 'the second item joins the same checklist');

  await assert.rejects(journal.procedures.addChecklistItem('nope', 'x'), /unknown procedure/);
});
