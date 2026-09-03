/* The generalised day re-keying (phase 8 features ticket 16): both rules,
   tested without a driver. The repeating rule's cases are the ones
   dayOfIntervalPattern carried before it became a caller of this - they are
   here unchanged on purpose, because "the existing chart answers identically
   for every input its current tests cover" is the ticket's own proof that
   the generalisation did not move anything. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { rekeyDaySeries } from './dayKeying';
import type { DayAverage } from './journal/stats';

const DAY_0 = 20000;
const TODAY = DAY_0 + 400;

function point(day: number, value: number, count = 1): DayAverage {
  return { day, value, count };
}

const repeating = (intervals: { startEpochDay: number; length: number }[]) =>
  ({ type: 'repeating', intervals }) as const;

const anchored = (anchorEpochDay: number, todayEpochDay = TODAY) =>
  ({ type: 'anchored', anchorEpochDay, todayEpochDay }) as const;

test('repeating averages a position across every interval that reached it, entry-weighted', () => {
  const intervals = [
    { startEpochDay: DAY_0, length: 14 },
    { startEpochDay: DAY_0 + 14, length: 14 },
    { startEpochDay: DAY_0 + 28, length: 14 }
  ];
  // Day 1 of each interval logs mood 4; day 1 of the third also carries a
  // second entry at 2, so the entry-weighted average is (4+4+4+2)/4 = 3.5,
  // not the day-average-of-day-averages (4+4+3)/3.
  const days = [point(DAY_0, 4), point(DAY_0 + 14, 4), point(DAY_0 + 28, 3, 2)];

  assert.deepEqual(rekeyDaySeries(days, repeating(intervals)), [
    { position: 1, value: 3.5, count: 3 }
  ]);
});

test('repeating drops a position below the 3-interval floor', () => {
  const intervals = [
    { startEpochDay: DAY_0, length: 14 },
    { startEpochDay: DAY_0 + 14, length: 14 }
  ];

  assert.deepEqual(rekeyDaySeries([point(DAY_0, 4), point(DAY_0 + 14, 2)], repeating(intervals)), []);
});

test('repeating leaves a day too short an interval never reached out of the bucket', () => {
  const intervals = [
    { startEpochDay: DAY_0, length: 10 },
    { startEpochDay: DAY_0 + 10, length: 20 },
    { startEpochDay: DAY_0 + 30, length: 20 }
  ];
  // Only the second interval is long enough to reach day 15 and has
  // anything logged there - below the 3-interval floor on its own.
  assert.deepEqual(rekeyDaySeries([point(DAY_0 + 10 + 14, 5)], repeating(intervals)), []);
});

test('repeating folds a day the clock has not reached - it takes no today to consult', () => {
  const intervals = [
    { startEpochDay: DAY_0, length: 5 },
    { startEpochDay: DAY_0 + 5, length: 5 },
    { startEpochDay: DAY_0 + 10, length: 5 }
  ];
  // Every one of these days is in the future, and all three still fold onto
  // position 1: the repeating rule excludes what the intervals it was
  // handed exclude and nothing else. That it cannot be handed a today at
  // all is the type's job; that a future day is kept is this test's.
  const days = [point(DAY_0, 4), point(DAY_0 + 5, 4), point(DAY_0 + 10, 4)];

  assert.deepEqual(rekeyDaySeries(days, repeating(intervals)), [{ position: 1, value: 4, count: 3 }]);
});

test('anchored keys day zero to the anchor and counts up from it', () => {
  const days = [point(DAY_0, 2), point(DAY_0 + 1, 3), point(DAY_0 + 14, 5)];

  assert.deepEqual(rekeyDaySeries(days, anchored(DAY_0)), [
    { position: 0, value: 2, count: 1 },
    { position: 1, value: 3, count: 1 },
    { position: 14, value: 5, count: 1 }
  ]);
});

test('a series straddling the anchor keeps its pre-anchor side as negative positions', () => {
  const days = [point(DAY_0 - 30, 1), point(DAY_0 - 1, 2), point(DAY_0, 3), point(DAY_0 + 7, 4)];

  assert.deepEqual(rekeyDaySeries(days, anchored(DAY_0)), [
    { position: -30, value: 1, count: 1 },
    { position: -1, value: 2, count: 1 },
    { position: 0, value: 3, count: 1 },
    { position: 7, value: 4, count: 1 }
  ]);
});

test('an anchor in the future plots every logged day as a countdown', () => {
  const anchor = DAY_0 + 60;
  const days = [point(DAY_0, 3), point(DAY_0 + 30, 4)];

  assert.deepEqual(rekeyDaySeries(days, anchored(anchor, DAY_0 + 40)), [
    { position: -60, value: 3, count: 1 },
    { position: -30, value: 4, count: 1 }
  ]);
});

test('anchored drops a day after today - a future-dated row would draw past the end of the axis', () => {
  const days = [point(DAY_0, 3), point(DAY_0 + 5, 4), point(DAY_0 + 90, 5)];

  assert.deepEqual(rekeyDaySeries(days, anchored(DAY_0, DAY_0 + 5)), [
    { position: 0, value: 3, count: 1 },
    { position: 5, value: 4, count: 1 }
  ]);
});

test('anchored keeps a single day - the repeating floor guards an average across days and there is none here', () => {
  assert.deepEqual(rekeyDaySeries([point(DAY_0 + 3, 4)], anchored(DAY_0)), [
    { position: 3, value: 4, count: 1 }
  ]);
});

test('anchored on the anchor day itself is position zero, not position one', () => {
  assert.deepEqual(rekeyDaySeries([point(DAY_0, 4)], anchored(DAY_0, DAY_0)), [
    { position: 0, value: 4, count: 1 }
  ]);
});

test('an empty series re-keys to nothing under either rule', () => {
  assert.deepEqual(rekeyDaySeries([], anchored(DAY_0)), []);
  assert.deepEqual(rekeyDaySeries([], repeating([{ startEpochDay: DAY_0, length: 14 }])), []);
});
