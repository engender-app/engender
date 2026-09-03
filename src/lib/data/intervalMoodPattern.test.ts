/* Interval mood pattern (phase 5 ticket 09): turning a journal into a
   repeating keying, tested without a driver. The bucketing the two folds
   below hand their intervals to moved to dayKeying.ts in phase 8 ticket 16
   and its cases moved to dayKeying.test.ts with it.
   journal/intervalMoodPattern.test.ts covers the area that wires this to
   the dose log and the day-average queries. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { startOfDayTimestamp } from './epochDay';
import { completedInjectionIntervals, foldByCustomInterval } from './intervalMoodPattern';
import type { DayAverage } from './journal/stats';
import type { DoseEvent } from './types';

const DAY_0 = 20000;

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

function point(day: number, value: number, count = 1): DayAverage {
  return { day, value, count };
}

test('completedInjectionIntervals spans consecutive injections, oldest first', () => {
  const intervals = completedInjectionIntervals([dose(DAY_0), dose(DAY_0 + 14), dose(DAY_0 + 28)]);

  assert.deepEqual(intervals, [
    { startEpochDay: DAY_0, length: 14 },
    { startEpochDay: DAY_0 + 14, length: 14 }
  ]);
});

test('the span since the latest injection is left out - it has no length yet', () => {
  const intervals = completedInjectionIntervals([dose(DAY_0), dose(DAY_0 + 14)]);

  assert.deepEqual(intervals, [{ startEpochDay: DAY_0, length: 14 }]);
});

test('a skipped dose never happened and starts no interval', () => {
  const intervals = completedInjectionIntervals([dose(DAY_0), dose(DAY_0 + 7, { status: 'skipped' }), dose(DAY_0 + 14)]);

  assert.deepEqual(intervals, [{ startEpochDay: DAY_0, length: 14 }]);
});

test('oral and sublingual doses carry no interval - only IM/SC depots have one', () => {
  const intervals = completedInjectionIntervals([dose(DAY_0, { route: 'oral' }), dose(DAY_0 + 14, { route: 'oral' })]);

  assert.deepEqual(intervals, []);
});

test('foldByCustomInterval folds every intervalLengthDays days starting from fromEpochDay, with no claim of a cycle', () => {
  // A multiple of 14, so position 1 falls on it - the anchor is the epoch
  // itself (epochDayFromTimestamp counts from 1970-01-01), not this test's
  // own start day.
  const BASE = 20006;
  const days = [
    point(BASE, 4),
    point(BASE + 7, 4),
    point(BASE + 14, 2),
    point(BASE + 21, 2),
    point(BASE + 28, 3),
    point(BASE + 35, 3)
  ];

  const pattern = foldByCustomInterval(days, 14);

  assert.deepEqual(pattern, [
    { position: 1, value: 3, count: 3 },
    { position: 8, value: 3, count: 3 }
  ]);
});
