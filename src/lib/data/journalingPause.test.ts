/* Pure: no clock, no database (phase 5 ticket 21). */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { isPausedOn, pauseCoversDay } from './journalingPause.ts';

test('pauseCoversDay is true from the start day through the end day, inclusive', () => {
  const pause = { startEpochDay: 100, endEpochDay: 105 };
  assert.equal(pauseCoversDay(pause, 99), false);
  assert.equal(pauseCoversDay(pause, 100), true);
  assert.equal(pauseCoversDay(pause, 103), true);
  assert.equal(pauseCoversDay(pause, 105), true);
  assert.equal(pauseCoversDay(pause, 106), false);
});

test('a null end day covers every day from the start onward - still running', () => {
  const pause = { startEpochDay: 100, endEpochDay: null };
  assert.equal(pauseCoversDay(pause, 99), false);
  assert.equal(pauseCoversDay(pause, 100), true);
  assert.equal(pauseCoversDay(pause, 10_000), true);
});

test('isPausedOn is true when any one of several pauses covers the day', () => {
  const pauses = [
    { startEpochDay: 100, endEpochDay: 105 },
    { startEpochDay: 200, endEpochDay: null }
  ];
  assert.equal(isPausedOn(pauses, 102), true);
  assert.equal(isPausedOn(pauses, 250), true);
  assert.equal(isPausedOn(pauses, 150), false);
  assert.equal(isPausedOn([], 100), false);
});
