/* The native/normalized split (ADR-0012). What these cases pin down is
   that nothing here ever hands back a number fit to show someone: the
   normalized value is colour input, and the level is a swatch index. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { MOOD_RANGE, heatLevel, normalize, recencyHeatLevel, recencySpan } from './metricRange.ts';

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
  const span = recencySpan([2, 16, 37]);
  assert.equal(recencyHeatLevel(2, span), 4);
  assert.equal(recencyHeatLevel(16, span), 3);
  assert.equal(recencyHeatLevel(37, span), 1);
});

test('a site never used is the empty swatch, not the far end of the ramp', () => {
  // siteRecency answers null for a site with no dose against it ever, and
  // neither a large number nor zero reads as "never".
  const span = recencySpan([3, 3650]);
  assert.equal(recencyHeatLevel(null, span), 0);
  assert.notEqual(recencyHeatLevel(null, span), recencyHeatLevel(3650, span));
});

test('a weekly rotation and a fortnightly one shade the same, because the span is the person\'s own', () => {
  /* The reason this is a span rather than fixed day bands. Six sites on a
     weekly rotation are 0 to 42 days apart and the same six on a
     fortnightly one are 0 to 84; any fixed set of edges puts most of one
     of those two rotations in a single swatch, which is a flat map for
     exactly the person the map is for. */
  const weekly = [0, 7, 14, 21, 28, 35, 42];
  const fortnightly = weekly.map((days) => days * 2);
  assert.deepEqual(
    weekly.map((days) => recencyHeatLevel(days, recencySpan(weekly))),
    fortnightly.map((days) => recencyHeatLevel(days, recencySpan(fortnightly)))
  );
});

test('the ramp reaches every swatch across a real rotation', () => {
  // A ramp with a hole in it is a ramp nobody can read back.
  const weekly = [0, 7, 14, 21, 28, 35, 42];
  const span = recencySpan(weekly);
  assert.deepEqual(
    [...new Set(weekly.map((days) => recencyHeatLevel(days, span)))].sort(),
    [1, 2, 3, 4]
  );
});

test('a span narrower than a week widens to one, so a day apart is not a whole ramp apart', () => {
  /* Someone who injects daily, or who has just started, can have every
     site within a couple of days of every other. Shading that across the
     full ramp would turn "yesterday and the day before" into the map's
     widest possible difference. */
  const span = recencySpan([1, 2]);
  assert.equal(span.max, 7);
  // A day is a seventh of the floor, so the two can still straddle one
  // boundary - what they cannot be is the two ends of the map.
  const apart = Math.abs(recencyHeatLevel(1, span) - recencyHeatLevel(2, span));
  assert.ok(apart <= 1, `one day apart came out ${apart} swatches apart`);
});

test('a span over sites that have never been used is the floor, not zero', () => {
  // Nothing to shade yet, and a range with no width would put the one dose
  // logged today at the bottom of the ramp rather than the top.
  const span = recencySpan([null, null]);
  assert.equal(span.max, 7);
  assert.equal(recencyHeatLevel(0, span), 4);
});

test('a dose dated ahead of today shades as the most recent, not off the ramp', () => {
  // startOfDayTimestamp is a local-midnight read, so a dose logged for
  // tonight can come back as a negative days-since across a timezone edge.
  const span = recencySpan([-1, 20]);
  assert.equal(recencyHeatLevel(-1, span), 4);
});
