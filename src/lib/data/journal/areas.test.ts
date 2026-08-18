/* The dimensions, milestones, labs and reminders areas, exercised through
   the driver interface (ticket 07). */

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
  assert.deepEqual(await journal.labs.getAnalytes(), ['estradiol', 'testosterone', 'prolactin']);

  await journal.labs.upsertResult({ epochDay: 200, analyte: 'shbg', value: 60, unit: 'nmol/L' });
  const id = await journal.labs.upsertResult({ epochDay: 100, analyte: 'shbg', value: 55, unit: 'nmol/L' });
  assert.deepEqual(await journal.labs.getAnalytes(), ['estradiol', 'testosterone', 'prolactin', 'shbg']);

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

test('each of the four effects keeps its own marker', async () => {
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
