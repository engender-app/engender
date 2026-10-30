/* The clinician visit summary (phase 4 ticket 12): an assembly over rows
   regimen, doses, labs, exposure, sideEffects, cycleEvents, checklists,
   procedures and areaStates own, recomputed on every read. One registry
   since functional-audit ticket 38, which folded the dossier layer that
   used to sit on top of it into it. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { startOfDayTimestamp } from '../epochDay.ts';
import { journalWithBuiltIns } from './test-support.ts';
import {
  CLINICIAN_SUMMARY_SECTIONS,
  CLINICIAN_SUMMARY_SECTION_KEYS,
  CLINICIAN_SUMMARY_TABLES,
  excludedClinicianDrugs,
  makeClinicianSummaryArea,
  regimenDrugNames,
  regimenEsterNote,
  withClinicianDrugIncluded,
  type ClinicianSummarySection
} from './clinicianSummary.ts';
import type { Journal } from './journal.ts';
import { NO_COST } from '../cost.ts';

/* The areas openJournal hands the summary, taken off an open journal so a
   test can build the same area with a section of its own registered. */
const areasOf = (journal: Journal) => ({
  areaStates: journal.areaStates,
  regimen: journal.regimen,
  doses: journal.doses,
  labs: journal.labs,
  exposure: journal.exposure,
  sideEffects: journal.sideEffects,
  cycleEvents: journal.cycleEvents,
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
    endReason: null,
    ...overrides
  });
}

test('assembles regimen episodes, doses, lab results, exposure counters and side effects for the requested range', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 19000);
  await journal.doses.upsertDose({ timestamp: at(19001), route: 'im', dose: 4, doseUnit: 'mg', injectionSite: 'thigh-left', vehicle: 'oil' });
  await journal.labs.upsertResult({ epochDay: 19005, analyte: 'estradiol', value: 150, unit: 'pg/mL', provider: 'Quest' });
  await journal.sideEffects.upsertSideEffect({ name: 'headache', severity: 2, epochDay: 19006, resolvedEpochDay: null });
  await journal.checklists.addToStandaloneChecklist('ask about spironolactone dose');

  const summary = await journal.clinicianSummary.getSummary(19000, 19020);
  const expectedCounters = await journal.exposure.getCounters(19000, 19020);

  assert.equal(summary.sections.regimen!.history.length, 1);
  assert.equal(summary.sections.regimen!.history[0].drug, 'estradiol valerate');
  assert.equal(summary.sections.regimen!.doses.length, 1);
  assert.equal(summary.sections.regimen!.doses[0].route, 'im');
  assert.equal(summary.sections.labs!.length, 1);
  assert.equal(summary.sections.labs![0].analyte, 'estradiol');
  assert.equal(summary.sections.sideEffects!.length, 1);
  assert.equal(summary.sections.sideEffects![0].name, 'headache');
  assert.deepEqual(summary.sections.exposure!, expectedCounters);
  assert.equal(summary.sections.appointmentPrep!.length, 1);
  assert.equal(summary.sections.appointmentPrep![0].content, 'ask about spironolactone dose');
});

test('the appointment prep list prints its full current content regardless of the requested range', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.checklists.addToStandaloneChecklist('ask about spironolactone dose');

  const summary = await journal.clinicianSummary.getSummary(1, 2);

  assert.equal(summary.sections.appointmentPrep!.length, 1);
  assert.equal(summary.sections.appointmentPrep![0].content, 'ask about spironolactone dose');
});

test('an episode superseded before the range starts is left out; the one still ongoing is included with no end day', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 18900, { dose: 2, endEpochDay: 18999 });
  await episode(journal, 19000, { dose: 4 });

  const summary = await journal.clinicianSummary.getSummary(19010, 19020);

  assert.equal(summary.sections.regimen!.history.length, 1);
  assert.equal(summary.sections.regimen!.history[0].dose, 4);
  assert.equal(summary.sections.regimen!.history[0].endEpochDay, null);
});

test('an ended episode inside the range reports its own stored end day, whatever else starts outside the range (phase 5 ticket 38)', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 19000, { dose: 2, endEpochDay: 19029 });
  await episode(journal, 19030, { dose: 4 });

  const summary = await journal.clinicianSummary.getSummary(19000, 19020);

  assert.equal(summary.sections.regimen!.history.length, 1);
  assert.equal(summary.sections.regimen!.history[0].dose, 2);
  assert.equal(summary.sections.regimen!.history[0].endEpochDay, 19029);
});

test('lab results from more than one analyte are merged, filtered to the range and sorted chronologically', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.labs.upsertResult({ epochDay: 19010, analyte: 'testosterone', value: 30, unit: 'ng/dL', provider: '' });
  await journal.labs.upsertResult({ epochDay: 19005, analyte: 'estradiol', value: 150, unit: 'pg/mL', provider: '' });
  await journal.labs.upsertResult({ epochDay: 18990, analyte: 'estradiol', value: 90, unit: 'pg/mL', provider: '' });

  const summary = await journal.clinicianSummary.getSummary(19000, 19020);

  assert.deepEqual(
    summary.sections.labs!.map((r) => r.analyte),
    ['estradiol', 'testosterone']
  );
});

test('with nothing logged at all, every section comes back empty rather than throwing', async () => {
  const { journal } = await journalWithBuiltIns();

  const summary = await journal.clinicianSummary.getSummary(19000, 19020, { generatedAtEpochDay: 19021 });

  assert.deepEqual(summary, {
    fromEpochDay: 19000,
    toEpochDay: 19020,
    generatedAtEpochDay: 19021,
    sections: {
      demographics: { name: '', pronouns: null, dob: null },
      regimen: { current: [], history: [], doses: [] },
      exposure: { doseTotals: [], routeDays: [], regimenDays: [], excludedDoses: 0 },
      labs: [],
      sideEffects: [],
      cycleEvents: [],
      appointmentPrep: [],
      procedures: [],
      finishedAreas: []
    }
  });
});

/* Functional-audit ticket 38: the registry is the page. Every part the
   printed summary carries, the personal details at its top included, is a
   section here, in the order the page prints them - which put the prep list
   before procedures and finished areas all along, whatever the old
   registry's own order said, because the dossier layer drew its blocks in
   its own order. */
test('a section is registered for each part the page prints, in the order it prints', async () => {
  const printed = [
    'demographics',
    'regimen',
    'exposure',
    'labs',
    'sideEffects',
    'cycleEvents',
    'appointmentPrep',
    'procedures',
    'finishedAreas'
  ];
  assert.deepEqual(CLINICIAN_SUMMARY_SECTIONS.map((s) => s.key), printed);
  assert.deepEqual(CLINICIAN_SUMMARY_SECTION_KEYS, printed);
});

/* writes.ts spells the union out because importing the registry there
   would put it on the first screen's path; this holds the copy to the
   sections, so a section's tables cannot drift from what a summary re-runs
   on. */
test('getSummary depends on the tables the registered sections read, and no others', () => {
  const union = new Set(CLINICIAN_SUMMARY_SECTIONS.flatMap((s) => s.tables));
  assert.deepEqual([...CLINICIAN_SUMMARY_TABLES].sort(), [...union].sort());
  assert.equal(CLINICIAN_SUMMARY_TABLES.length, union.size);
});

test('a section switched off comes back as null and reads nothing', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.labs.upsertResult({ epochDay: 19005, analyte: 'estradiol', value: 150, unit: 'pg/mL', provider: '' });
  await journal.sideEffects.upsertSideEffect({ name: 'headache', severity: 2, epochDay: 19006, resolvedEpochDay: null });

  let labReads = 0;
  const areas = areasOf(journal);
  const labs = { ...areas.labs, getResultsInRange: (from: number, to: number) => (labReads++, areas.labs.getResultsInRange(from, to)) };
  const summary = await makeClinicianSummaryArea({ ...areas, labs }).getSummary(19000, 19020, {
    inclusion: { labs: false, demographics: false }
  });

  assert.equal(summary.sections.labs, null);
  assert.equal(summary.sections.demographics, null);
  assert.equal(labReads, 0);
  assert.equal(summary.sections.sideEffects!.length, 1);
});

test('the personal details are what was typed for this print, never a tryout', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.tryouts.upsertTryout({ kind: 'pronouns', label: 'she/her', startEpochDay: 18990, endEpochDay: null });

  const typed = await journal.clinicianSummary.getSummary(19000, 19010, {
    demographics: { name: 'Alex Doe', dob: '1995-05-15', pronouns: 'they/them' }
  });
  const untyped = await journal.clinicianSummary.getSummary(19000, 19010, { demographics: { name: 'Alicja' } });

  assert.deepEqual(typed.sections.demographics, { name: 'Alex Doe', dob: '1995-05-15', pronouns: 'they/them' });
  assert.equal(untyped.sections.demographics!.pronouns, null);
});

test('the regimen part names the episodes still running on the range\'s last day as current', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 19000, { drug: 'Estradiol Valerate' });
  await episode(journal, 18900, { drug: 'Spironolactone', endEpochDay: 19004 });
  await episode(journal, 19050, { drug: 'Progesterone' });

  const { regimen } = (await journal.clinicianSummary.getSummary(19000, 19010)).sections;

  assert.deepEqual(regimen!.history.map((e) => e.drug).sort(), ['Estradiol Valerate', 'Spironolactone']);
  assert.deepEqual(regimen!.current.map((e) => e.drug), ['Estradiol Valerate']);
});

test('cycle events in the range are a section like the others', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.cycleEvents.upsertCycleEvent({ epochDay: 19003, kind: 'spotting' });
  await journal.cycleEvents.upsertCycleEvent({ epochDay: 18000, kind: 'spotting' });

  const summary = await journal.clinicianSummary.getSummary(19000, 19010);

  assert.deepEqual(summary.sections.cycleEvents!.map((e) => e.epochDay), [19003]);
});

/* Ticket 08 reserved an `autoLogged` field for ticket 11 to fill; ticket 11
   put `source` on the dose itself instead, so what the row carries is the
   journal's own answer and the summary adds nothing. */
test("carries each dose's source, so the print can mark the ones a schedule wrote", async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 19000);
  await journal.doses.upsertDose({ timestamp: at(19001), route: 'im', dose: 4, doseUnit: 'mg', injectionSite: 'thigh-left', vehicle: 'oil' });

  const { regimen } = (await journal.clinicianSummary.getSummary(19000, 19020)).sections;

  assert.deepEqual(regimen!.doses.map((dose) => dose.source), ['person']);
});

test('registering a section is enough for it to reach a generated summary, with no change to the assembly', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.sideEffects.upsertSideEffect({ name: 'headache', severity: 2, epochDay: 19006, resolvedEpochDay: null });

  const throwaway: ClinicianSummarySection = {
    key: 'throwaway',
    // No table, because it reads no row: the section hands its own two
    // arguments back.
    tables: [],
    read: async ({ fromEpochDay, toEpochDay }) => [fromEpochDay, toEpochDay]
  };
  const withThrowaway = makeClinicianSummaryArea(areasOf(journal), [...CLINICIAN_SUMMARY_SECTIONS, throwaway]);
  const summary = await withThrowaway.getSummary(19000, 19020);

  assert.deepEqual((summary.sections as unknown as Record<string, unknown>).throwaway, [19000, 19020]);
  // The registered sections still come back alongside it.
  assert.equal(summary.sections.sideEffects!.length, 1);
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

  assert.deepEqual(summary.sections.procedures!, [
    {
      id,
      name: 'top surgery',
      surgeryEpochDay: 18000,
      consults: [{ id: summary.sections.procedures![0].consults[0].id, epochDay: 17900 }],
      notes: 'drains out on day five',
      photoEpochDays: [18002],
      checklistItems: [{ id: item.id, content: 'buy gauze', checked: true, carriedForward: false }],
      kind: 'custom',
      dilationOptIn: false,
      archived: false,
      cost: NO_COST
    }
  ]);
});

test('a procedure with no checklist yet prints an empty one rather than nothing', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.procedures.upsertProcedure({ name: 'orchiectomy' });

  const summary = await journal.clinicianSummary.getSummary(19000, 19020);

  assert.deepEqual(summary.sections.procedures![0].checklistItems, []);
  assert.deepEqual(summary.sections.procedures![0].photoEpochDays, []);
  assert.equal(summary.sections.procedures![0].surgeryEpochDay, null);
});

/* Phase 8 features ticket 04: when a stream ended. */

test('the summary says which streams ended and when, whatever the range', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.areaStates.setAreasFinished(['hairRemovalSessions'], 18500);

  // A window that starts long after the day it ended. A course that stopped
  // before the range is exactly what explains a flat stretch inside it, so
  // this section is unfiltered like procedures.
  const summary = await journal.clinicianSummary.getSummary(19000, 19020);

  assert.deepEqual(summary.sections.finishedAreas!, [{ key: 'hair-removal', epochDay: 18500 }]);
});

test('an area that is only hidden says nothing to a clinician', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.areaStates.setAreasHidden(['wearSessions'], true);

  const summary = await journal.clinicianSummary.getSummary(19000, 19020);

  assert.deepEqual(summary.sections.finishedAreas!, []);
});

test('un-finishing takes the line back off the page', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.areaStates.setAreasFinished(['wearSessions'], 19010);
  await journal.areaStates.setAreasFinished(['wearSessions'], null);

  const summary = await journal.clinicianSummary.getSummary(19000, 19020);

  assert.deepEqual(summary.sections.finishedAreas!, []);
});

/* Phase 8 features ticket 39: excluding a drug from the range sheet drops
   its rows from regimen, dose-history and exposure, and nothing else. */

test('excluding a drug drops its regimen episode, keeps everyone else\'s', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 19000, { drug: 'estradiol valerate' });
  await episode(journal, 19000, { drug: 'spironolactone', route: 'oral', doseUnit: 'mg' });

  const summary = await journal.clinicianSummary.getSummary(19000, 19020, { excludedDrugs: new Set(['spironolactone']) });

  assert.deepEqual(
    summary.sections.regimen!.history.map((e) => e.drug),
    ['estradiol valerate']
  );
});

test('excluding a drug drops the doses attributed to it through the episode history, not just doses naming it directly', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 19000, { drug: 'estradiol valerate' });
  await journal.doses.upsertDose({ timestamp: at(19001), route: 'im', dose: 4, doseUnit: 'mg', injectionSite: 'thigh-left', vehicle: 'oil' });

  const withoutDrug = await journal.clinicianSummary.getSummary(19000, 19020, { excludedDrugs: new Set([' ESTRADIOL VALERATE ']) });
  const withDrug = await journal.clinicianSummary.getSummary(19000, 19020);

  assert.equal(withoutDrug.sections.regimen!.doses.length, 0);
  assert.equal(withDrug.sections.regimen!.doses.length, 1);
});

test('a dose that cannot be attributed to any drug is never dropped by an exclusion', async () => {
  const { journal } = await journalWithBuiltIns();
  // Two concurrent episodes for different drugs: the dose names none of
  // its own, so attributeDrug can't resolve it (ambiguous).
  await episode(journal, 19000, { drug: 'estradiol valerate' });
  await episode(journal, 19000, { drug: 'spironolactone', route: 'oral', doseUnit: 'mg' });
  await journal.doses.upsertDose({ timestamp: at(19001), route: 'im', dose: 4, doseUnit: 'mg', injectionSite: 'thigh-left', vehicle: 'oil' });

  const summary = await journal.clinicianSummary.getSummary(19000, 19020, { excludedDrugs: new Set(['estradiol valerate']) });

  assert.equal(summary.sections.regimen!.doses.length, 1);
});

test('excluding a drug drops its exposure dose totals and regimen days, keeps route days and excluded doses as they were', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 19000, { drug: 'estradiol valerate' });
  await journal.doses.upsertDose({ timestamp: at(19001), route: 'im', dose: 4, doseUnit: 'mg', injectionSite: 'thigh-left', vehicle: 'oil' });

  const withDrug = await journal.clinicianSummary.getSummary(19000, 19020);
  const withoutDrug = await journal.clinicianSummary.getSummary(19000, 19020, { excludedDrugs: new Set([' ESTRADIOL VALERATE ']) });

  assert.equal(withDrug.sections.exposure!.doseTotals.length, 1);
  assert.deepEqual(withoutDrug.sections.exposure!.doseTotals, []);
  assert.deepEqual(withoutDrug.sections.exposure!.regimenDays, []);
  // Not drug-keyed rows: unaffected by the exclusion.
  assert.deepEqual(withoutDrug.sections.exposure!.routeDays, withDrug.sections.exposure!.routeDays);
  assert.equal(withoutDrug.sections.exposure!.excludedDoses, withDrug.sections.exposure!.excludedDoses);
});

test('excluding a drug leaves labs and side effects untouched - neither is keyed by drug', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 19000, { drug: 'estradiol valerate' });
  await journal.labs.upsertResult({ epochDay: 19005, analyte: 'estradiol', value: 150, unit: 'pg/mL', provider: 'Quest' });
  await journal.sideEffects.upsertSideEffect({ name: 'headache', severity: 2, epochDay: 19006, resolvedEpochDay: null });

  const summary = await journal.clinicianSummary.getSummary(19000, 19020, { excludedDrugs: new Set(['estradiol valerate']) });

  assert.equal(summary.sections.labs!.length, 1);
  assert.equal(summary.sections.sideEffects!.length, 1);
});

test('with no exclusion set, getSummary keeps printing every drug (default parameter)', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 19000, { drug: 'estradiol valerate' });

  const summary = await journal.clinicianSummary.getSummary(19000, 19020);

  assert.equal(summary.sections.regimen!.history.length, 1);
});

/* The printing choices the sheet makes (phase 8 features ticket 39,
   after-release 22), beside the registry they choose from. */

test('lists every distinct drug name across the given episodes once, sorted, keeping the first spelling', () => {
  const first = { drug: 'Estradiol Valerate' } as Parameters<typeof regimenDrugNames>[0][number];
  const later = { drug: 'Progesterone' } as typeof first;

  assert.deepEqual(regimenDrugNames([later, first, { ...first, drug: ' ESTRADIOL VALERATE ' }]), ['Estradiol Valerate', 'Progesterone']);
  assert.deepEqual(regimenDrugNames([]), []);
});

test('preserves saved exclusions under alternate spellings after deduplication', () => {
  const names = ['Estradiol Valerate'];
  const preferences = { ' ESTRADIOL VALERATE ': true, 'Estradiol Valerate': false, Progesterone: true };

  assert.deepEqual([...excludedClinicianDrugs(names, preferences)], ['Estradiol Valerate']);
  const included = withClinicianDrugIncluded(preferences, names[0], true);
  assert.deepEqual([...excludedClinicianDrugs(names, included)], []);
  assert.deepEqual(included, { ' ESTRADIOL VALERATE ': false, 'Estradiol Valerate': false, Progesterone: true });
  const excluded = withClinicianDrugIncluded(included, 'estradiol valerate', false);
  assert.deepEqual([...excludedClinicianDrugs(names, excluded)], ['Estradiol Valerate']);
  assert.deepEqual(excluded, { ' ESTRADIOL VALERATE ': true, 'Estradiol Valerate': true, 'estradiol valerate': true, Progesterone: true });
});

/* After-release 22 (L04-06): the regimen cell read "Estradiol valerate
   (valerate)", naming the ester twice. */
test('names an ester beside the drug only when the drug name does not already, by whole words', () => {
  assert.equal(regimenEsterNote('Estradiol', 'valerate'), 'valerate');
  assert.equal(regimenEsterNote('Testosterone', 'cypionate'), 'cypionate');
  assert.equal(regimenEsterNote('Estradiol valerate', 'valerate'), null);
  assert.equal(regimenEsterNote('Estradiol Valerate', 'valerate'), null);
  assert.equal(regimenEsterNote('Testosterone CYPIONATE', ' Cypionate '), null);
  assert.equal(regimenEsterNote('Spironolactone', null), null);
  assert.equal(regimenEsterNote('Spironolactone', '  '), null);
  assert.equal(regimenEsterNote('Estradiol enanthate-free', 'enanthat'), 'enanthat');
});
