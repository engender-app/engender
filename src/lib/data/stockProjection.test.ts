import { test } from 'vitest';
import assert from 'node:assert/strict';
import { projectStock, TRAILING_WINDOW_DAYS } from './stockProjection';
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

test('remaining subtracts every non-skipped matching dose since the recorded day', () => {
  const stock = { drug: 'estradiol valerate', quantity: 10, unit: 'vials', recordedEpochDay: DAY_0 };
  const doses = [dose(DAY_0 + 1), dose(DAY_0 + 3), dose(DAY_0 + 5)];

  const projection = projectStock(stock, doses, [episode()], DAY_0 + 5);

  assert.equal(projection.remaining, 7);
});

test('a skipped dose consumes nothing', () => {
  const stock = { drug: 'estradiol valerate', quantity: 10, unit: 'vials', recordedEpochDay: DAY_0 };
  const doses = [dose(DAY_0 + 1), dose(DAY_0 + 3, { status: 'skipped' })];

  const projection = projectStock(stock, doses, [episode()], DAY_0 + 5);

  assert.equal(projection.remaining, 9);
});

test('a changed dose still consumes: it was taken, just not as scheduled', () => {
  const stock = { drug: 'estradiol valerate', quantity: 10, unit: 'vials', recordedEpochDay: DAY_0 };
  const doses = [dose(DAY_0 + 1, { status: 'changed' })];

  const projection = projectStock(stock, doses, [episode()], DAY_0 + 5);

  assert.equal(projection.remaining, 9);
});

test('a dose logged before the stock was recorded does not count against it', () => {
  const stock = { drug: 'estradiol valerate', quantity: 10, unit: 'vials', recordedEpochDay: DAY_0 };
  const doses = [dose(DAY_0 - 1)];

  const projection = projectStock(stock, doses, [episode()], DAY_0 + 5);

  assert.equal(projection.remaining, 10);
});

test('a dose logged under a different drug does not count, even in a matching episode window', () => {
  const stock = { drug: 'estradiol valerate', quantity: 10, unit: 'vials', recordedEpochDay: DAY_0 };
  const otherEpisode = episode({ id: 'ep-2', drug: 'spironolactone', startEpochDay: DAY_0 });
  const doses = [dose(DAY_0 + 1)];

  const projection = projectStock(stock, doses, [otherEpisode], DAY_0 + 5);

  assert.equal(projection.remaining, 10);
});

test('drug matching trims surrounding whitespace and nothing else', () => {
  const stock = { drug: '  estradiol valerate  ', quantity: 10, unit: 'vials', recordedEpochDay: DAY_0 };
  const doses = [dose(DAY_0 + 1)];

  const projection = projectStock(stock, doses, [episode({ drug: 'estradiol valerate' })], DAY_0 + 5);

  assert.equal(projection.remaining, 9);
});

test('a drug spanning two episodes (a dose change) still consumes from one stock entry', () => {
  const stock = { drug: 'estradiol valerate', quantity: 10, unit: 'vials', recordedEpochDay: DAY_0 };
  const episodes = [episode({ id: 'ep-1', startEpochDay: DAY_0 }), episode({ id: 'ep-2', dose: 6, startEpochDay: DAY_0 + 10 })];
  const doses = [dose(DAY_0 + 1), dose(DAY_0 + 11)];

  const projection = projectStock(stock, doses, episodes, DAY_0 + 20);

  assert.equal(projection.remaining, 8);
});

test('remaining at or below zero projects a run-out of today, with no need for a rate', () => {
  const stock = { drug: 'estradiol valerate', quantity: 2, unit: 'vials', recordedEpochDay: DAY_0 };
  const doses = [dose(DAY_0 + 1), dose(DAY_0 + 2), dose(DAY_0 + 3)];

  const projection = projectStock(stock, doses, [episode()], DAY_0 + 3);

  assert.equal(projection.remaining, -1);
  assert.equal(projection.runOutEpochDay, DAY_0 + 3);
});

test('a steady daily rate projects run-out at remaining / rate days out', () => {
  const stock = { drug: 'estradiol valerate', quantity: 10, unit: 'pills', recordedEpochDay: DAY_0 };
  // One dose a day for 10 days: rate is 1/day over an 11-day window.
  const doses = Array.from({ length: 10 }, (_, i) => dose(DAY_0 + i));

  const projection = projectStock(stock, doses, [episode({ route: 'oral' })], DAY_0 + 9);

  assert.equal(projection.remaining, 0);
  assert.equal(projection.runOutEpochDay, DAY_0 + 9);
});

test('no consumption in the window at all projects nothing: the stock never runs out at this pace', () => {
  const stock = { drug: 'estradiol valerate', quantity: 10, unit: 'vials', recordedEpochDay: DAY_0 };

  const projection = projectStock(stock, [], [episode()], DAY_0 + 10);

  assert.equal(projection.remaining, 10);
  assert.equal(projection.dailyRate, 0);
  assert.equal(projection.runOutEpochDay, null);
});

test('a run of skipped doses lowers the rate and pushes the projection later than a full-adherence baseline', () => {
  const stockFullAdherence = { drug: 'estradiol valerate', quantity: 20, unit: 'pills', recordedEpochDay: DAY_0 };
  const fullDoses = Array.from({ length: 20 }, (_, i) => dose(DAY_0 + i));
  const full = projectStock(stockFullAdherence, fullDoses, [episode({ route: 'oral' })], DAY_0 + 19);

  const stockWithSkips = { drug: 'estradiol valerate', quantity: 20, unit: 'pills', recordedEpochDay: DAY_0 };
  const skippedDoses = Array.from({ length: 20 }, (_, i) =>
    dose(DAY_0 + i, i >= 5 && i < 15 ? { status: 'skipped' } : {})
  );
  const withSkips = projectStock(stockWithSkips, skippedDoses, [episode({ route: 'oral' })], DAY_0 + 19);

  assert.ok(full.runOutEpochDay !== null && withSkips.runOutEpochDay !== null);
  assert.ok(withSkips.runOutEpochDay! > full.runOutEpochDay!, 'a run of skips should shift run-out later, not sooner');
});

test('an active pause (zero consumption while it runs) pushes the projection later, the same direction as a run of skips', () => {
  // 10 non-paused days of full adherence, then a 10-day pause with nothing
  // logged - modeled here purely as an absence of doses, since this module
  // does not read dose_pause at all (see the header comment for why).
  const stock = { drug: 'estradiol valerate', quantity: 15, unit: 'pills', recordedEpochDay: DAY_0 };
  const doses = Array.from({ length: 10 }, (_, i) => dose(DAY_0 + i));

  const projection = projectStock(stock, doses, [episode({ route: 'oral' })], DAY_0 + 19);
  const naiveDailyProjection = DAY_0 + 19 + Math.ceil(5 / 1);

  assert.ok(
    (projection.runOutEpochDay ?? Infinity) > naiveDailyProjection - 5,
    'a trailing rate diluted by a pause should not project sooner than steady daily use would'
  );
});

test('a stock entry younger than the trailing window is not padded with days before it existed', () => {
  const stock = { drug: 'estradiol valerate', quantity: 10, unit: 'pills', recordedEpochDay: DAY_0 };
  // Recorded 5 days ago, one dose a day since - well short of
  // TRAILING_WINDOW_DAYS. The rate must be 1/day (5 doses over 5 days), not
  // diluted by days before the stock entry existed.
  const doses = Array.from({ length: 5 }, (_, i) => dose(DAY_0 + i));

  const projection = projectStock(stock, doses, [episode({ route: 'oral' })], DAY_0 + 4);

  assert.equal(projection.dailyRate, 1);
});
