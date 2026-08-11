/* The native/normalized split (ADR-0012). What these cases pin down is
   that nothing here ever hands back a number fit to show someone: the
   normalized value is colour input, and the level is a swatch index. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { MOOD_RANGE, heatLevel, normalize } from './metricRange.ts';

test('a value normalizes to where it sits in its own range', () => {
  assert.equal(normalize(1, MOOD_RANGE), 0);
  assert.equal(normalize(3, MOOD_RANGE), 0.5);
  assert.equal(normalize(5, MOOD_RANGE), 1);

  assert.equal(normalize(0, { min: 0, max: 100 }), 0);
  assert.equal(normalize(50, { min: 0, max: 100 }), 0.5);
  assert.equal(normalize(100, { min: 0, max: 100 }), 1);
});

test('ranges of different sizes shade comparably, which is the whole point', () => {
  // The reason a normalized value exists at all: mood 4 of 5 and 7 of a
  // 0-10 custom dimension are both three-quarters of the way up, so they
  // get the same colour even though 4 and 7 are not comparable numbers.
  assert.equal(normalize(4, MOOD_RANGE), normalize(7.5, { min: 0, max: 10 }));
  assert.equal(heatLevel(4, MOOD_RANGE), heatLevel(75, { min: 0, max: 100 }));
});

test('a value outside its range clamps rather than colouring off the end', () => {
  assert.equal(normalize(-20, { min: 0, max: 100 }), 0);
  assert.equal(normalize(140, { min: 0, max: 100 }), 1);
  assert.equal(heatLevel(140, { min: 0, max: 100 }), 4);
});

test('a range with no width normalizes to its floor instead of dividing by zero', () => {
  assert.equal(normalize(7, { min: 7, max: 7 }), 0);
});

test('no value is level 0; every value is at least level 1', () => {
  // A logged low is not the same as a day with nothing on it, and the
  // calendar has to be able to tell them apart at a glance.
  assert.equal(heatLevel(null, MOOD_RANGE), 0);
  assert.equal(heatLevel(1, MOOD_RANGE), 1);
  assert.equal(heatLevel(0, { min: 0, max: 100 }), 1);
});

test('levels step evenly across the range', () => {
  const range = { min: 0, max: 100 };
  assert.deepEqual(
    [0, 25, 26, 50, 51, 75, 76, 100].map((v) => heatLevel(v, range)),
    [1, 1, 2, 2, 3, 3, 4, 4]
  );
});
