/* The clinician visit summary (phase 4 ticket 12): an assembly over rows
   regimen, doses, labs, exposure, sideEffects and checklists own, recomputed
   on every read. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { startOfDayTimestamp } from '../epochDay.ts';
import { journalWithBuiltIns } from './test-support.ts';
import { CLINICIAN_SUMMARY_SECTIONS, makeClinicianSummaryArea, type ClinicianSummarySection } from './clinicianSummary.ts';
import type { Journal } from './journal.ts';

/* The areas openJournal hands the summary, taken off an open journal so a
   test can build the same area with a section of its own registered. */
const areasOf = (journal: Journal) => ({
  regimen: journal.regimen,
  doses: journal.doses,
  labs: journal.labs,
  exposure: journal.exposure,
  sideEffects: journal.sideEffects,
  checklists: journal.checklists
});

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
  await journal.checklists.addToStandaloneChecklist('ask about spironolactone dose');

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
  assert.equal(summary.appointmentPrepItems.length, 1);
  assert.equal(summary.appointmentPrepItems[0].content, 'ask about spironolactone dose');
});

test('the appointment prep list prints its full current content regardless of the requested range', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.checklists.addToStandaloneChecklist('ask about spironolactone dose');

  const summary = await journal.clinicianSummary.getSummary(1, 2);

  assert.equal(summary.appointmentPrepItems.length, 1);
  assert.equal(summary.appointmentPrepItems[0].content, 'ask about spironolactone dose');
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
    sideEffects: [],
    appointmentPrepItems: []
  });
});

test('a section is registered for each part of the summary, in the order it prints', async () => {
  assert.deepEqual(
    CLINICIAN_SUMMARY_SECTIONS.map((s) => s.key),
    ['regimenEpisodes', 'doses', 'labResults', 'exposure', 'sideEffects', 'appointmentPrepItems']
  );
});

test('registering a section is enough for it to reach a generated summary, with no change to the assembly', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.sideEffects.upsertSideEffect({ name: 'headache', severity: 2, epochDay: 19006 });

  const throwaway: ClinicianSummarySection = {
    key: 'throwaway',
    read: async ({ fromEpochDay, toEpochDay }) => [fromEpochDay, toEpochDay]
  };
  const withThrowaway = makeClinicianSummaryArea(areasOf(journal), [...CLINICIAN_SUMMARY_SECTIONS, throwaway]);
  const summary = await withThrowaway.getSummary(19000, 19020);

  assert.deepEqual((summary as unknown as Record<string, unknown>).throwaway, [19000, 19020]);
  // The five that were hand-assembled before still come back alongside it.
  assert.equal(summary.sideEffects.length, 1);
});
