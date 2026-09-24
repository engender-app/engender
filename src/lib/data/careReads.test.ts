import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns } from './journal/test-support';
import { startOfDayTimestamp } from './epochDay';
import { CARE_DOSE_TOTAL_WINDOW_DAYS, readCare } from './careReads';
import { countingDriver } from './journal/test-support';
import { openJournal } from './journal/journal';
import { migratedDb } from './sqlite/test-support/migrated-db';
import { fakeFileStore } from './photos/test-support/fake-file-store';

const TODAY = 20000;

test('Care keeps the actual last dose across episode changes and outside the totals window', async () => {
  const { journal } = await journalWithBuiltIns();
  const episode = {
    drug: 'estradiol valerate', ester: 'valerate', dose: 4, doseUnit: 'mg',
    route: 'im', interval: 'every 2 weeks', startEpochDay: TODAY - 300,
    endEpochDay: TODAY - 100, endReason: 'switchedDrugOrRoute' as const
  };
  await journal.regimen.upsertEpisode(episode);
  const current = await journal.regimen.upsertEpisode({ ...episode, dose: 3,
    startEpochDay: TODAY - 100, endEpochDay: null, endReason: null });
  const doseId = await journal.doses.upsertDose({ timestamp: startOfDayTimestamp(TODAY - 150),
    drug: episode.drug, route: 'im', dose: 4, doseUnit: 'mg', injectionSite: 'thigh-left', vehicle: 'oil' });

  const care = await readCare(journal, TODAY);
  assert.equal(care.lanes.length, 1);
  assert.equal(care.lanes[0].episode.id, current);
  assert.equal(care.lanes[0].lastDoseEpochDay, TODAY - 150);
  assert.equal(care.lanes[0].lastDoseId, doseId);
  assert.deepEqual(care.lanes[0].doseTotals, []);
  assert.equal(care.lanes[0].runOut, null);
  assert.equal(care.latestLab, null);
});

test('concurrent drugs keep their own pauses, totals and stock', async () => {
  const { journal } = await journalWithBuiltIns();
  for (const drug of ['estradiol', 'progesterone']) {
    const episodeId = await journal.regimen.upsertEpisode({
      drug, ester: null, dose: 2, doseUnit: 'mg', route: 'oral', interval: 'daily',
      startEpochDay: TODAY - 10, endEpochDay: null, endReason: null
    });
    await journal.doses.upsertSchedule({ episodeId, recurrence: { kind: 'everyNDays', everyNDays: 1 },
      dosesPerDay: 1, doseAmounts: null, autoLogFromEpochDay: null });
    if (drug === 'progesterone') {
      await journal.doses.upsertPause({ episodeId, startEpochDay: TODAY - 2, endEpochDay: null, reason: 'planned' });
    }
    await journal.doses.upsertDose({ drug, timestamp: startOfDayTimestamp(TODAY - 3),
      route: 'oral', dose: drug === 'estradiol' ? 2 : 4, doseUnit: 'mg' });
  }
  await journal.stock.upsertEntry({ drug: 'estradiol', quantity: 10, unit: 'pills', recordedEpochDay: TODAY - 5 });
  const care = await readCare(journal, TODAY);
  const estradiol = care.lanes.find((lane) => lane.episode.drug === 'estradiol')!;
  const progesterone = care.lanes.find((lane) => lane.episode.drug === 'progesterone')!;
  assert.equal(estradiol.nextDoseEpochDay, TODAY);
  assert.equal(progesterone.nextDoseEpochDay, null);
  assert.equal(estradiol.doseTotals[0].total, 2);
  assert.equal(progesterone.doseTotals[0].total, 4);
  assert.equal(estradiol.runOut?.projection.remaining, 9);
  assert.equal(progesterone.runOut, null);
});

test('Care waits for totals and rejects the whole answer if totals fail', async () => {
  const { journal } = await journalWithBuiltIns();
  let release!: (value: Awaited<ReturnType<typeof journal.exposure.getCounters>>) => void;
  const totals = new Promise<Awaited<ReturnType<typeof journal.exposure.getCounters>>>((resolve) => { release = resolve; });
  let published = false;
  const pending = readCare({ ...journal, exposure: { getCounters: () => totals } }, TODAY)
    .then((value) => { published = true; return value; });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(published, false);
  release({ doseTotals: [], routeDays: [], regimenDays: [], excludedDoses: 0 });
  assert.deepEqual((await pending).lanes, []);
  await assert.rejects(readCare({ ...journal, exposure: {
    getCounters: async () => { throw new Error('totals unavailable'); }
  } }, TODAY), /totals unavailable/);
});

test('Care reads only the totals window of the log when every lane has a dose in it (ticket 221)', async () => {
  const doseReadsFrom: number[] = [];
  const db = await migratedDb();
  const counting = countingDriver(db, {
    onQuery: (sql, params) => {
      if (/FROM dose_event\s+WHERE timestamp >= \?/.test(sql)) doseReadsFrom.push(Number(params?.[0]));
    }
  });
  const journal = openJournal(counting.driver, fakeFileStore());
  await journal.reconcileBuiltIns();
  await journal.regimen.upsertEpisode({
    drug: 'estradiol', ester: null, dose: 2, doseUnit: 'mg', route: 'oral', interval: 'daily',
    startEpochDay: TODAY - 800, endEpochDay: null, endReason: null
  });
  await journal.doses.upsertDose({ drug: 'estradiol', timestamp: startOfDayTimestamp(TODAY - 700),
    route: 'oral', dose: 2, doseUnit: 'mg' });
  await journal.doses.upsertDose({ drug: 'estradiol', timestamp: startOfDayTimestamp(TODAY - 2),
    route: 'oral', dose: 2, doseUnit: 'mg' });
  doseReadsFrom.length = 0;

  const care = await readCare(journal, TODAY);
  assert.equal(care.lanes[0].lastDoseEpochDay, TODAY - 2);
  assert.ok(doseReadsFrom.length > 0);
  assert.ok(
    doseReadsFrom.every((from) => from >= startOfDayTimestamp(TODAY - CARE_DOSE_TOTAL_WINDOW_DAYS + 1)),
    'no read reached back past the totals window'
  );
});

test('a lane with nothing ever logged has no last dose, through the fallback (ticket 221)', async () => {
  const { journal } = await journalWithBuiltIns();
  const episodeId = await journal.regimen.upsertEpisode({
    drug: 'spironolactone', ester: null, dose: 100, doseUnit: 'mg', route: 'oral', interval: 'daily',
    startEpochDay: TODAY, endEpochDay: null, endReason: null
  });
  await journal.doses.upsertSchedule({ episodeId, recurrence: { kind: 'everyNDays', everyNDays: 1 },
    dosesPerDay: 1, doseAmounts: null, autoLogFromEpochDay: null });
  const care = await readCare(journal, TODAY);
  assert.equal(care.lanes[0].lastDoseEpochDay, null);
  assert.equal(care.lanes[0].lastDoseId, null);
  assert.equal(care.lanes[0].nextDoseEpochDay, TODAY);
});
