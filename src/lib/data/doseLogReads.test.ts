import { test } from 'vitest';
import assert from 'node:assert/strict';
import { journalWithBuiltIns } from './journal/test-support';
import { startOfDayTimestamp } from './epochDay';
import { tablesReadBy } from './live/writes';
import { DOSE_LOG_WINDOW_DAYS, readDoseLog, type DoseLogQuestion } from './doseLogReads';

const TODAY = 20000;

const question = (overrides: Partial<DoseLogQuestion> = {}): DoseLogQuestion => ({
  today: TODAY,
  fromEpochDay: TODAY - DOSE_LOG_WINDOW_DAYS,
  deepLinkedDoseId: null,
  regimenClaims: [],
  ...overrides
});

const oral = (drug: string, epochDay: number) => ({
  drug, timestamp: startOfDayTimestamp(epochDay) + 9 * 3600000, route: 'oral' as const, dose: 2, doseUnit: 'mg'
});

async function twoRegimens() {
  const { journal } = await journalWithBuiltIns();
  for (const drug of ['estradiol', 'progesterone']) {
    const episodeId = await journal.regimen.upsertEpisode({
      drug, ester: null, dose: 2, doseUnit: 'mg', route: 'oral', interval: 'daily',
      startEpochDay: TODAY - 400, endEpochDay: null, endReason: null
    });
    await journal.doses.upsertSchedule({ episodeId, recurrence: { kind: 'everyNDays', everyNDays: 1 },
      dosesPerDay: 1, doseAmounts: null, autoLogFromEpochDay: null });
  }
  return journal;
}

test('every journal call starts before the first await, so a liveQuery sees every table on its first run', async () => {
  const { journal } = await journalWithBuiltIns();
  const called: [string, string][] = [];
  const recording = Object.fromEntries((['regimen', 'doses'] as const).map((area) => [area, new Proxy({}, {
    get: (_target, operation: string) => (...args: unknown[]) => {
      called.push([area, operation]);
      return (journal[area] as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[operation](...args);
    }
  })])) as unknown as Parameters<typeof readDoseLog>[0];

  const pending = readDoseLog(recording, question({ deepLinkedDoseId: 'some-dose' }));
  const beforeAwait = [...called];
  await pending;

  assert.deepEqual(called, beforeAwait, 'no journal call waits on another');
  const observed = new Set(beforeAwait.flatMap(([area, operation]) => tablesReadBy(area, operation)));
  // Everything getComparison would have read, which the log now answers itself.
  for (const table of tablesReadBy('doses', 'getComparison')) assert.ok(observed.has(table), table);
  assert.ok(beforeAwait.some(([, operation]) => operation === 'getDoseById'));
});

test('the log is the window newest first, each row attributed, with the older doses kept for site history', async () => {
  const journal = await twoRegimens();
  const old = await journal.doses.upsertDose(oral('estradiol', TODAY - 200));
  const recent = await journal.doses.upsertDose(oral('estradiol', TODAY - 3));
  const latest = await journal.doses.upsertDose(oral('progesterone', TODAY - 1));

  const log = await readDoseLog(journal, question());
  assert.deepEqual(log.logRows.map((row) => row.dose.id), [latest, recent]);
  assert.deepEqual(log.logRows.map((row) => row.drug), ['progesterone', 'estradiol']);
  assert.equal(log.logRows[1].attribution.episode?.drug, 'estradiol');
  assert.deepEqual(log.allDoses.map((dose) => dose.id), [old, recent, latest]);
  assert.equal(log.hasOlderDoses, true);

  const wider = await readDoseLog(journal, question({ fromEpochDay: TODAY - 3 * DOSE_LOG_WINDOW_DAYS }));
  assert.equal(wider.logRows.length, 3);
  assert.equal(wider.hasOlderDoses, false);
});

test('the schedule view compares against the first claim that names an active drug, the same answer getComparison gives', async () => {
  const journal = await twoRegimens();
  await journal.doses.upsertDose(oral('progesterone', TODAY - 2));

  const log = await readDoseLog(journal, question({ regimenClaims: [null, 'ended drug', 'progesterone', 'estradiol'] }));
  assert.deepEqual(log.activeDrugChoices, ['estradiol', 'progesterone']);
  assert.equal(log.selectedRegimenDrug, 'progesterone');
  assert.deepEqual(log.scheduleView, await journal.doses.getComparison({
    fromEpochDay: TODAY - DOSE_LOG_WINDOW_DAYS, toEpochDay: TODAY, drug: 'progesterone'
  }));
  assert.equal(log.scheduleView?.reason, null);

  // No claim names an active drug: the nearest schedule's, else the first.
  const unclaimed = await readDoseLog(journal, question({ regimenClaims: ['ended drug'] }));
  assert.ok(unclaimed.activeDrugChoices.includes(unclaimed.selectedRegimenDrug!));
});

test('a deep-linked dose is resolved by id whatever the window, and a missing one answers null', async () => {
  const journal = await twoRegimens();
  const old = await journal.doses.upsertDose(oral('estradiol', TODAY - 300));

  const linked = await readDoseLog(journal, question({ deepLinkedDoseId: old }));
  assert.equal(linked.deepLinkedDose?.id, old);
  assert.equal(linked.logRows.length, 0);
  const missing = await readDoseLog(journal, question({ deepLinkedDoseId: 'deleted-dose' }));
  assert.equal(missing.deepLinkedDose, null);
});
