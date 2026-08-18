/* The exposure counters area (phase 4 ticket 05): a view over the dose log
   and the regimen episode history, recomputed on every read. */

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

test('getCounters combines dose totals, route days and regimen days over the requested range', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 19000);
  await journal.doses.upsertDose({ timestamp: at(19001), route: 'oral', dose: 4, doseUnit: 'mg' });
  await journal.doses.upsertDose({ timestamp: at(19015), route: 'oral', dose: 4, doseUnit: 'mg' });

  const counters = await journal.exposure.getCounters(19000, 19020);

  assert.deepEqual(counters.doseTotals, [{ drug: 'estradiol valerate', route: 'oral', doseUnit: 'mg', total: 8 }]);
  assert.deepEqual(counters.routeDays, [{ route: 'im', days: 21 }]);
  assert.equal(counters.regimenDays.length, 1);
  assert.equal(counters.regimenDays[0].days, 21);
});

test('a dose logged outside the range is left out of the dose totals', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 19000);
  await journal.doses.upsertDose({ timestamp: at(18990), route: 'oral', dose: 4, doseUnit: 'mg' });

  const counters = await journal.exposure.getCounters(19000, 19020);

  assert.deepEqual(counters.doseTotals, []);
});

test('with no episodes and no doses at all, every counter comes back empty rather than throwing', async () => {
  const { journal } = await journalWithBuiltIns();

  const counters = await journal.exposure.getCounters(19000, 19020);

  assert.deepEqual(counters, { doseTotals: [], routeDays: [], regimenDays: [] });
});

test('a dose change to a new episode on the same route still folds into one route-days total', async () => {
  const { journal } = await journalWithBuiltIns();
  await episode(journal, 19000);
  await episode(journal, 19010, { dose: 6 });

  const counters = await journal.exposure.getCounters(19000, 19019);

  assert.deepEqual(counters.routeDays, [{ route: 'im', days: 20 }]);
  assert.equal(counters.regimenDays.length, 2);
});
