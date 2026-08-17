import { test } from 'vitest';
import assert from 'node:assert/strict';
import { cumulativeDoseTotals, daysOnEachRoute, timeOnEachRegimen } from './exposureCounters';
import { startOfDayTimestamp } from './epochDay';
import type { DoseEvent, RegimenEpisode } from './types';

const DAY_0 = 20000;

function episode(overrides: Partial<RegimenEpisode> = {}): RegimenEpisode {
  return {
    id: 'ep-1',
    drug: 'estradiol valerate',
    ester: 'valerate',
    dose: 4,
    doseUnit: 'mg',
    route: 'im',
    interval: 'every 2 weeks',
    startEpochDay: DAY_0,
    hidden: false,
    ...overrides
  };
}

function dose(epochDay: number, overrides: Partial<DoseEvent> = {}): DoseEvent {
  return {
    id: `dose-${epochDay}-${Math.random()}`,
    timestamp: startOfDayTimestamp(epochDay) + 1000,
    dose: 4,
    doseUnit: 'mg',
    status: 'taken',
    scheduled: null,
    route: 'im',
    injectionSite: null,
    vehicle: null,
    ...overrides
  } as DoseEvent;
}

test('cumulativeDoseTotals sums non-skipped doses in range by drug, route and unit', () => {
  const doses = [dose(DAY_0 + 1), dose(DAY_0 + 15), dose(DAY_0 + 30)];

  const totals = cumulativeDoseTotals(doses, [episode()], DAY_0, DAY_0 + 30);

  assert.deepEqual(totals, [{ drug: 'estradiol valerate', route: 'im', doseUnit: 'mg', total: 12 }]);
});

test('a skipped dose contributes nothing: it was not taken', () => {
  const doses = [dose(DAY_0 + 1), dose(DAY_0 + 15, { status: 'skipped' })];

  const totals = cumulativeDoseTotals(doses, [episode()], DAY_0, DAY_0 + 30);

  assert.equal(totals[0].total, 4);
});

test('a changed dose still counts: it was taken, just not as scheduled', () => {
  const doses = [dose(DAY_0 + 1, { status: 'changed' })];

  const totals = cumulativeDoseTotals(doses, [episode()], DAY_0, DAY_0 + 30);

  assert.equal(totals[0].total, 4);
});

test('a dose outside the requested range is left out even when the caller hands in a wider set', () => {
  const doses = [dose(DAY_0 - 1), dose(DAY_0 + 5), dose(DAY_0 + 31)];

  const totals = cumulativeDoseTotals(doses, [episode()], DAY_0, DAY_0 + 30);

  assert.equal(totals[0].total, 4);
});

test('a dose with no episode to resolve against is left out: there is no drug to report it against', () => {
  const doses = [dose(DAY_0 - 100)];

  const totals = cumulativeDoseTotals(doses, [episode({ startEpochDay: DAY_0 })], DAY_0 - 100, DAY_0 + 30);

  assert.deepEqual(totals, []);
});

test('a route change reports as two totals, never converted into one', () => {
  const oral = episode({ id: 'ep-1', route: 'oral', startEpochDay: DAY_0 });
  const im = episode({ id: 'ep-2', route: 'im', startEpochDay: DAY_0 + 10 });
  const doses = [dose(DAY_0 + 1, { route: 'oral' }), dose(DAY_0 + 15, { route: 'im' })];

  const totals = cumulativeDoseTotals(doses, [oral, im], DAY_0, DAY_0 + 30);

  assert.equal(totals.length, 2);
  assert.deepEqual(
    totals.map((t) => t.route).sort(),
    ['im', 'oral']
  );
});

test('two drugs across two episodes in range are reported separately, sorted by drug name', () => {
  const spiro = episode({ id: 'ep-1', drug: 'spironolactone', route: 'oral', startEpochDay: DAY_0 });
  const estradiol = episode({ id: 'ep-2', drug: 'estradiol', route: 'oral', startEpochDay: DAY_0 + 10 });
  const doses = [dose(DAY_0 + 1, { route: 'oral' }), dose(DAY_0 + 11, { route: 'oral' })];

  const totals = cumulativeDoseTotals(doses, [spiro, estradiol], DAY_0, DAY_0 + 20);

  assert.deepEqual(
    totals.map((t) => t.drug),
    ['estradiol', 'spironolactone']
  );
});

test('timeOnEachRegimen reports each episode’s own overlap with the range, not a combined figure', () => {
  const first = episode({ id: 'ep-1', startEpochDay: DAY_0 });
  const second = episode({ id: 'ep-2', dose: 6, startEpochDay: DAY_0 + 10 });

  const rows = timeOnEachRegimen([first, second], DAY_0, DAY_0 + 19);

  assert.deepEqual(
    rows.map((r) => ({ episodeId: r.episodeId, days: r.days })),
    [
      { episodeId: 'ep-1', days: 10 },
      { episodeId: 'ep-2', days: 10 }
    ]
  );
});

test('the latest episode is still ongoing: its overlap runs through the range’s own end', () => {
  const only = episode({ startEpochDay: DAY_0 });

  const rows = timeOnEachRegimen([only], DAY_0 + 5, DAY_0 + 14);

  assert.equal(rows[0].days, 10);
});

test('an episode entirely before the range contributes nothing', () => {
  const early = episode({ id: 'ep-1', startEpochDay: DAY_0 });
  const later = episode({ id: 'ep-2', startEpochDay: DAY_0 + 10 });

  const rows = timeOnEachRegimen([early, later], DAY_0 + 10, DAY_0 + 20);

  assert.deepEqual(
    rows.map((r) => r.episodeId),
    ['ep-2']
  );
});

test('a hidden episode still counts: hiding is a picker filter, not a deletion from history', () => {
  const hidden = episode({ startEpochDay: DAY_0, hidden: true });

  const rows = timeOnEachRegimen([hidden], DAY_0, DAY_0 + 9);

  assert.equal(rows[0].days, 10);
});

test('daysOnEachRoute sums overlap days across every episode that used the route', () => {
  const first = episode({ id: 'ep-1', route: 'oral', startEpochDay: DAY_0 });
  const second = episode({ id: 'ep-2', route: 'oral', dose: 6, startEpochDay: DAY_0 + 10 });

  const rows = daysOnEachRoute([first, second], DAY_0, DAY_0 + 19);

  assert.deepEqual(rows, [{ route: 'oral', days: 20 }]);
});

test('two routes across the range report as two separate totals', () => {
  const oral = episode({ id: 'ep-1', route: 'oral', startEpochDay: DAY_0 });
  const im = episode({ id: 'ep-2', route: 'im', startEpochDay: DAY_0 + 10 });

  const rows = daysOnEachRoute([oral, im], DAY_0, DAY_0 + 19);

  assert.deepEqual(rows, [
    { route: 'im', days: 10 },
    { route: 'oral', days: 10 }
  ]);
});
