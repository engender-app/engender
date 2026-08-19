/* Interval mood pattern (phase 5 ticket 09): the pure bucketing math, tested
   without a driver. journal/intervalMoodPattern.test.ts covers the area
   that wires this to the dose log and the day-average queries. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { startOfDayTimestamp } from './epochDay';
import { completedInjectionIntervals, dayOfIntervalPattern, foldByPeriod } from './intervalMoodPattern';
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

test('dayOfIntervalPattern averages a position across every interval that reached it, entry-weighted', () => {
  const intervals = [
    { startEpochDay: DAY_0, length: 14 },
    { startEpochDay: DAY_0 + 14, length: 14 },
    { startEpochDay: DAY_0 + 28, length: 14 }
  ];
  // Day 1 of each interval logs mood 4; day 1 of the third also carries a
  // second entry at 2, so the entry-weighted average is (4+4+4+2)/4 = 3.5,
  // not the day-average-of-day-averages (4+4+3)/3.
  const days = [
    point(DAY_0, 4),
    point(DAY_0 + 14, 4),
    point(DAY_0 + 28, 3, 2)
  ];

  const pattern = dayOfIntervalPattern(days, intervals);

  assert.deepEqual(pattern, [{ position: 1, value: 3.5, count: 3 }]);
});

test('dayOfIntervalPattern drops a position below the 3-interval floor', () => {
  const intervals = [
    { startEpochDay: DAY_0, length: 14 },
    { startEpochDay: DAY_0 + 14, length: 14 }
  ];
  const days = [point(DAY_0, 4), point(DAY_0 + 14, 2)];

  assert.deepEqual(dayOfIntervalPattern(days, intervals), []);
});

test('dayOfIntervalPattern leaves a day too short an interval never reached out of the bucket', () => {
  const intervals = [
    { startEpochDay: DAY_0, length: 10 },
    { startEpochDay: DAY_0 + 10, length: 20 },
    { startEpochDay: DAY_0 + 30, length: 20 }
  ];
  // Only the second interval is long enough to reach day 15 and has
  // anything logged there - below the 3-interval floor on its own.
  const pattern = dayOfIntervalPattern([point(DAY_0 + 10 + 14, 5)], intervals);

  assert.deepEqual(pattern, []);
});

test('foldByPeriod folds every periodLengthDays days starting from fromEpochDay, with no claim of a cycle', () => {
  const days = [
    point(DAY_0, 4),
    point(DAY_0 + 7, 4),
    point(DAY_0 + 14, 2),
    point(DAY_0 + 21, 2),
    point(DAY_0 + 28, 3),
    point(DAY_0 + 35, 3)
  ];

  const pattern = foldByPeriod(days, DAY_0, 14);

  assert.deepEqual(pattern, [
    { position: 1, value: 3, count: 3 },
    { position: 8, value: 3, count: 3 }
  ]);
});
