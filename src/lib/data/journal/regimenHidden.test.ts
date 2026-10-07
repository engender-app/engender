/* Putting a regimen episode away (after-release 07, the promise phase 4
   ticket 01 made): a mistaken or duplicate episode is hidden rather than
   deleted, and every read that draws on the episode history stops seeing
   it - Care, the curve, dose attribution, the clinician summary - until it
   is shown again. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import type { Journal } from './journal.ts';
import { journalWithBuiltIns } from './test-support.ts';

const FROM = 19000;
const TO = 19090;
const at = (epochDay: number) => epochDay * 86_400_000 + 12 * 3_600_000;

async function valerate(journal: Journal, startEpochDay: number) {
  return journal.regimen.upsertEpisode({
    drug: 'estradiol valerate',
    ester: 'valerate',
    dose: 5,
    doseUnit: 'mg',
    route: 'im',
    interval: 'every 7 days',
    startEpochDay,
    endEpochDay: null,
    endReason: null
  });
}

async function injectWeekly(journal: Journal, count: number) {
  for (let i = 0; i < count; i++) {
    await journal.doses.upsertDose({
      timestamp: at(FROM + i * 7),
      route: 'im',
      dose: 5,
      doseUnit: 'mg',
      injectionSite: 'thigh-left',
      vehicle: 'oil'
    });
  }
}

test('a hidden episode leaves getEpisodes, is listed among the hidden ones, and comes back when shown', async () => {
  const { journal } = await journalWithBuiltIns();
  const kept = await valerate(journal, FROM - 30);
  const mistaken = await valerate(journal, FROM - 10);

  await journal.regimen.setEpisodeHidden(mistaken, true);
  assert.deepEqual((await journal.regimen.getEpisodes()).map((e) => e.id), [kept]);
  assert.deepEqual((await journal.regimen.getHiddenEpisodes()).map((e) => e.id), [mistaken]);

  await journal.regimen.setEpisodeHidden(mistaken, false);
  assert.deepEqual((await journal.regimen.getEpisodes()).map((e) => e.id), [kept, mistaken]);
  assert.deepEqual(await journal.regimen.getHiddenEpisodes(), []);
});

test('hiding an unknown episode throws', async () => {
  const { journal } = await journalWithBuiltIns();
  await assert.rejects(journal.regimen.setEpisodeHidden('nope', true), /unknown regimen episode/);
});

test('hasAny does not count an episode that was put away', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await valerate(journal, FROM);
  await journal.regimen.setEpisodeHidden(id, true);
  assert.equal(await journal.regimen.hasAny(), false);
});

test('a hidden episode draws no curve, counts no exposure and is missing from the clinician summary', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await valerate(journal, FROM - 30);
  await injectWeekly(journal, 12);

  const before = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });
  assert.equal(before.injectable.charts.length, 1);
  assert.equal((await journal.clinicianSummary.getSummary(FROM, TO)).regimenEpisodes.length, 1);
  assert.equal((await journal.exposure.getCounters(FROM, TO)).regimenDays.length, 1);

  await journal.regimen.setEpisodeHidden(id, true);

  const after = await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false });
  assert.equal(after.injectable.charts.length, 0);
  const summary = await journal.clinicianSummary.getSummary(FROM, TO);
  assert.deepEqual(summary.regimenEpisodes, []);
  const counters = await journal.exposure.getCounters(FROM, TO);
  assert.deepEqual(counters.regimenDays, []);
  assert.deepEqual(counters.doseTotals, []);

  await journal.regimen.setEpisodeHidden(id, false);
  assert.equal(
    (await journal.hormoneCurve.getCurves({ fromEpochDay: FROM, toEpochDay: TO, fitToOwnLabs: false })).injectable.charts.length,
    1
  );
  assert.equal((await journal.clinicianSummary.getSummary(FROM, TO)).regimenEpisodes.length, 1);
});

test('a hidden episode no longer takes a dose that falls in its range; the one under it does', async () => {
  const { journal } = await journalWithBuiltIns();
  await journal.regimen.upsertEpisode({
    drug: 'estradiol',
    ester: null,
    dose: 2,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: FROM - 60,
    endEpochDay: null,
    endReason: null
  });
  const mistaken = await journal.regimen.upsertEpisode({
    drug: 'spironolactone',
    ester: null,
    dose: 100,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: FROM,
    endEpochDay: null,
    endReason: null
  });
  await journal.doses.upsertDose({ timestamp: at(FROM + 1), route: 'oral', dose: 2, doseUnit: 'mg' });

  // Two drugs running at once: the dose cannot be attributed, so it is set aside.
  assert.equal((await journal.exposure.getCounters(FROM, TO)).excludedDoses, 1);

  await journal.regimen.setEpisodeHidden(mistaken, true);
  const counters = await journal.exposure.getCounters(FROM, TO);
  assert.equal(counters.excludedDoses, 0);
  assert.deepEqual(counters.doseTotals.map((total) => total.drug), ['estradiol']);
});

test('a hidden episode takes its schedule and pauses with it, and is not found by search', async () => {
  const { journal } = await journalWithBuiltIns();
  const id = await valerate(journal, FROM);
  await journal.doses.upsertSchedule({
    episodeId: id,
    recurrence: { kind: 'everyNDays', everyNDays: 7 },
    dosesPerDay: 1,
    doseAmounts: null,
    autoLogFromEpochDay: null
  });
  await journal.doses.upsertPause({ episodeId: id, startEpochDay: FROM + 3, endEpochDay: FROM + 5, reason: 'planned' });
  assert.equal((await journal.doses.getSchedules()).length, 1);
  assert.equal((await journal.doses.getPauses()).length, 1);
  const found = await journal.textSearch.search({ query: 'valerate', today: TO, limit: 10 });
  assert.ok(found.hits.some((hit) => hit.area === 'regimenEpisodes'));

  await journal.regimen.setEpisodeHidden(id, true);

  assert.deepEqual(await journal.doses.getSchedules(), []);
  assert.deepEqual(await journal.doses.getPauses(), []);
  const hidden = await journal.textSearch.search({ query: 'valerate', today: TO, limit: 10 });
  assert.ok(!hidden.hits.some((hit) => hit.area === 'regimenEpisodes'));
});
