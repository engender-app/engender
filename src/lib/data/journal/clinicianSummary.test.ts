/* The clinician visit summary (phase 4 ticket 12): an assembly over rows
   regimen, doses, labs, exposure, sideEffects, checklists and procedures
   own, recomputed on every read. */

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
  checklists: journal.checklists,
  procedures: journal.procedures
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
    endEpochDay: null,
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
  await episode(journal, 18900, { dose: 2, endEpochDay: 18999 });
  await episode(journal, 19000, { dose: 4 });

  const summary = await journal.clinicianSummary.getSummary(19010, 19020);

  assert.equal(summary.regimenEpisodes.length, 1);
  assert.equal(summary.regimenEpisodes[0].dose, 4);
  assert.equal(summary.regimenEpisodes[0].endEpochDay, null);
});

test('an ended episode inside the range reports its own stored end day, whatever else starts outside the range (phase 5 ticket 38)', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 19000, { dose: 2, endEpochDay: 19029 });
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
    exposure: { doseTotals: [], routeDays: [], regimenDays: [], excludedDoses: 0 },
    sideEffects: [],
    procedures: [],
    appointmentPrepItems: []
  });
});

test('a section is registered for each part of the summary, in the order it prints', async () => {
  assert.deepEqual(
    CLINICIAN_SUMMARY_SECTIONS.map((s) => s.key),
    ['regimenEpisodes', 'doses', 'labResults', 'exposure', 'sideEffects', 'procedures', 'appointmentPrepItems']
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

test("a procedure prints its dates, notes, recovery photo days and checklist state, whatever the range", async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await journal.procedures.upsertProcedure({ name: 'top surgery', surgeryEpochDay: 18000 });
  await journal.procedures.addConsult(id, 17900);
  await journal.procedures.setNotes(id, 'drains out on day five');
  await journal.procedures.addPhoto(id, 18002, { full: new Uint8Array([1]), thumb: new Uint8Array([2]) });
  const item = await journal.procedures.addChecklistItem(id, 'buy gauze');
  await journal.checklists.setItemChecked(item.id, true);

  // A range that excludes every one of those days: a procedure is an ongoing
  // journey rather than a dated event, so it is not filtered out of the
  // summary the way a dose or a lab result is.
  const summary = await journal.clinicianSummary.getSummary(19000, 19020);

  assert.deepEqual(summary.procedures, [
    {
      id,
      name: 'top surgery',
      surgeryEpochDay: 18000,
      consults: [{ id: summary.procedures[0].consults[0].id, epochDay: 17900 }],
      notes: 'drains out on day five',
      photoEpochDays: [18002],
      checklistItems: [{ id: item.id, content: 'buy gauze', checked: true, carriedForward: false }]
    }
  ]);
});

test('a procedure with no checklist yet prints an empty one rather than nothing', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.procedures.upsertProcedure({ name: 'orchiectomy' });

  const summary = await journal.clinicianSummary.getSummary(19000, 19020);

  assert.deepEqual(summary.procedures[0].checklistItems, []);
  assert.deepEqual(summary.procedures[0].photoEpochDays, []);
  assert.equal(summary.procedures[0].surgeryEpochDay, null);
});

test("the appointment prep list still prints last, after the procedures section", async () => {
  const keys = CLINICIAN_SUMMARY_SECTIONS.map((s) => s.key);
  assert.equal(keys.at(-1), 'appointmentPrepItems', 'ticket 11 asked for it as the summary\'s final page');
  assert.ok(keys.indexOf('procedures') < keys.indexOf('appointmentPrepItems'));
});
