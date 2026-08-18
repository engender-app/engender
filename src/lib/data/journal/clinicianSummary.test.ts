/* The clinician visit summary (phase 4 ticket 12): an assembly over rows
   regimen, doses, labs, exposure and sideEffects own, recomputed on every
   read. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { startOfDayTimestamp } from '../epochDay.ts';
import { journalWithBuiltIns } from './test-support.ts';
import type { Journal } from './journal.ts';

const at = (epochDay: number, hour = 8) => startOfDayTimestamp(epochDay) + hour * 3600000;

async function episode(journal: Journal, startEpochDay: number, overrides: Partial<Parameters<Journal['regimen']['upsertEpisode']>[0]> = {}) {
  return journal.regimen.upsertEpisode({
    drug: 'estradiol valerate',
    ester: 'valerate',
    dose: 4,
    doseUnit: 'mg',
    route: 'im',
    interval: 'every 2 weeks',
    startEpochDay,
    ...overrides
  });
}

test('assembles regimen episodes, doses, lab results, exposure counters and side effects for the requested range', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 19000);
  await journal.doses.upsertDose({ timestamp: at(19001), route: 'im', dose: 4, doseUnit: 'mg', injectionSite: 'thigh-left', vehicle: 'oil' });
  await journal.labs.upsertResult({ epochDay: 19005, analyte: 'estradiol', value: 150, unit: 'pg/mL', provider: 'Quest' });
  await journal.sideEffects.upsertSideEffect({ name: 'headache', severity: 2, epochDay: 19006 });

  const summary = await journal.clinicianSummary.getSummary(19000, 19020);
  const expectedCounters = await journal.exposure.getCounters(19000, 19020);

  assert.equal(summary.regimenEpisodes.length, 1);
  assert.equal(summary.regimenEpisodes[0].drug, 'estradiol valerate');
  assert.equal(summary.doses.length, 1);
  assert.equal(summary.doses[0].route, 'im');
  assert.equal(summary.labResults.length, 1);
  assert.equal(summary.labResults[0].analyte, 'estradiol');
  assert.equal(summary.sideEffects.length, 1);
  assert.equal(summary.sideEffects[0].name, 'headache');
  assert.deepEqual(summary.exposure, expectedCounters);
});

test('an episode superseded before the range starts is left out; the one still ongoing is included with no end day', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 18900, { dose: 2 });
  await episode(journal, 19000, { dose: 4 });

  const summary = await journal.clinicianSummary.getSummary(19010, 19020);

  assert.equal(summary.regimenEpisodes.length, 1);
  assert.equal(summary.regimenEpisodes[0].dose, 4);
  assert.equal(summary.regimenEpisodes[0].endEpochDay, null);
});

test('an episode superseded inside the range reports the day it ended, even though its successor started outside the range', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 19000, { dose: 2 });
  await episode(journal, 19030, { dose: 4 });

  const summary = await journal.clinicianSummary.getSummary(19000, 19020);

  assert.equal(summary.regimenEpisodes.length, 1);
  assert.equal(summary.regimenEpisodes[0].dose, 2);
  assert.equal(summary.regimenEpisodes[0].endEpochDay, 19029);
});

test('lab results from more than one analyte are merged, filtered to the range and sorted chronologically', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.labs.upsertResult({ epochDay: 19010, analyte: 'testosterone', value: 30, unit: 'ng/dL', provider: '' });
  await journal.labs.upsertResult({ epochDay: 19005, analyte: 'estradiol', value: 150, unit: 'pg/mL', provider: '' });
  await journal.labs.upsertResult({ epochDay: 18990, analyte: 'estradiol', value: 90, unit: 'pg/mL', provider: '' });

  const summary = await journal.clinicianSummary.getSummary(19000, 19020);

  assert.deepEqual(
    summary.labResults.map((r) => r.analyte),
    ['estradiol', 'testosterone']
  );
});

test('with nothing logged at all, every field comes back empty rather than throwing', async () => {
  const { journal } = await journalWithBuiltIns();

  const summary = await journal.clinicianSummary.getSummary(19000, 19020);

  assert.deepEqual(summary, {
    regimenEpisodes: [],
    doses: [],
    labResults: [],
    exposure: { doseTotals: [], routeDays: [], regimenDays: [] },
    sideEffects: []
  });
});
