import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  OWN_SPREAD_MIN_READINGS,
  OWN_SPREAD_WINDOW_DAYS,
  aboveOwnSpread,
  ownSpreadFence
} from './ownSpread.ts';

const TODAY = 20200;

/** `count` days ending on `TODAY`, each carrying `value`. Enough of them to
    clear the minimum on its own, so a test about the fence never fails for
    the sample-size reason instead. */
function flat(value: number, count = OWN_SPREAD_MIN_READINGS): { epochDay: number; value: number }[] {
  return Array.from({ length: count }, (_, i) => ({ epochDay: TODAY - i, value }));
}

test('no fence at all below the minimum number of readings', () => {
  const short = flat(1, OWN_SPREAD_MIN_READINGS - 2);
  short.push({ epochDay: TODAY - 30, value: 99 });

  assert.equal(short.length, OWN_SPREAD_MIN_READINGS - 1);
  assert.equal(ownSpreadFence(short, TODAY), null);
  // And the obvious outlier in it goes unmarked, which is the whole point.
  assert.deepEqual(aboveOwnSpread(short, TODAY), []);
});

test('a fence appears at exactly the minimum', () => {
  assert.notEqual(ownSpreadFence(flat(1), TODAY), null);
});

test('an unvarying run marks nothing, because nothing is above it', () => {
  assert.deepEqual(aboveOwnSpread(flat(3), TODAY), []);
});

test('a day above the fence is marked and the ones under it are not', () => {
  const readings = flat(1, 20);
  readings[0] = { epochDay: TODAY, value: 9 };
  readings[1] = { epochDay: TODAY - 1, value: 2 };

  const marked = aboveOwnSpread(readings, TODAY);
  assert.deepEqual(
    marked.map((r) => r.value),
    [2, 9]
  );
});

test('strictly above: a day sitting exactly on the fence is not marked', () => {
  // p25 = 2, p75 = 4, so the fence is 4 + 1.5 * 2 = 7.
  const readings = [2, 2, 2, 2, 4, 4, 4, 4].map((value, i) => ({ epochDay: TODAY - i, value }));
  assert.equal(ownSpreadFence(readings, TODAY), 7);

  readings.push({ epochDay: TODAY - 8, value: 7 });
  assert.deepEqual(aboveOwnSpread(readings, TODAY), []);

  readings.push({ epochDay: TODAY - 9, value: 8 });
  assert.deepEqual(
    aboveOwnSpread(readings, TODAY).map((r) => r.value),
    [8]
  );
});

test('the fence is the person as they are now: older readings do not vote', () => {
  const recent = flat(1, 12);
  const longAgo = Array.from({ length: 40 }, (_, i) => ({
    epochDay: TODAY - OWN_SPREAD_WINDOW_DAYS - i,
    value: 50
  }));

  const fenceNow = ownSpreadFence(recent, TODAY);
  assert.equal(ownSpreadFence([...recent, ...longAgo], TODAY), fenceNow);
});

test('a day outside the window is still judged, and against that same fence', () => {
  // The chart can draw further back than the fence's own window. Those days
  // are measured against the fence rather than dropped, so a chart never has
  // a stretch where nothing can be marked.
  const readings = flat(1, 12);
  readings.push({ epochDay: TODAY - OWN_SPREAD_WINDOW_DAYS - 5, value: 9 });

  assert.deepEqual(
    aboveOwnSpread(readings, TODAY).map((r) => r.epochDay),
    [TODAY - OWN_SPREAD_WINDOW_DAYS - 5]
  );
});

test('a reading dated after today does not vote and is never marked', () => {
  const readings = flat(1, 12);
  readings.push({ epochDay: TODAY + 3, value: 40 });

  assert.equal(ownSpreadFence(readings, TODAY), ownSpreadFence(flat(1, 12), TODAY));
  assert.deepEqual(aboveOwnSpread(readings, TODAY), []);
});

test('the marked days come back in date order whatever order they arrived in', () => {
  const readings = flat(1, 12);
  readings.push({ epochDay: TODAY - 2, value: 30 });
  readings.push({ epochDay: TODAY - 40, value: 20 });

  assert.deepEqual(
    aboveOwnSpread(readings, TODAY).map((r) => r.epochDay),
    [TODAY - 40, TODAY - 2]
  );
});
