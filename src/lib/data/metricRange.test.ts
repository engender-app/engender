/* The native/normalized split (ADR-0012). What these cases pin down is
   that nothing here ever hands back a number fit to show someone: the
   normalized value is colour input, and the level is a swatch index. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { MOOD_RANGE, heatLevel, normalize, recencyHeatLevel } from './metricRange.ts';

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

/* Recency as colour (phase 6 ticket 13). The injection map's dots shade by
   how long ago each site was used, so "days since" has to become a swatch
   index the same way a metric value does - here rather than in the map,
   because ADR-0012 keeps one place where a native number turns into
   colour. */

test('the most recent use is the strongest swatch and a longer gap is a fainter one', () => {
  // Deliberately this way round. Fading with time describes what happened;
  // shading the longest-ago site strongest would be the app pointing at
  // where to inject next, which is the one verdict this map never gives.
  assert.equal(recencyHeatLevel(0), 4);
  assert.equal(recencyHeatLevel(3), 3);
  assert.equal(recencyHeatLevel(12), 2);
  assert.equal(recencyHeatLevel(200), 1);
});

test('a site never used is the empty swatch, not the far end of the ramp', () => {
  // siteRecency answers null for a site with no dose against it ever, and
  // neither a large number nor zero reads as "never".
  assert.equal(recencyHeatLevel(null), 0);
  assert.notEqual(recencyHeatLevel(null), recencyHeatLevel(3650));
});

test('the bands land on every swatch the ramp has and on no others', () => {
  // The band edges and HEAT_LEVELS have to stay in step: three edges make
  // four bands. Drift either way and some swatch is never drawn, which is
  // a ramp with a hole in it.
  const levels = new Set(
    Array.from({ length: 400 }, (_, days) => recencyHeatLevel(days))
  );
  assert.deepEqual([...levels].sort(), [1, 2, 3, 4]);
});

test('a dose dated ahead of today shades as the most recent, not off the ramp', () => {
  // startOfDayTimestamp is a local-midnight read, so a dose logged for
  // tonight can come back as a negative days-since across a timezone edge.
  assert.equal(recencyHeatLevel(-1), 4);
});
