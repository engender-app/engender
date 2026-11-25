/* A scroller's cue says "more" only at an end that has more behind it
   (tester report 02, ticket 09). */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { edgesWithMore } from './scrollCues.ts';

test('a scroller that fits has more at neither end', () => {
  assert.deepEqual(edgesWithMore(0, 320, 320), { start: false, end: false });
});

test('at the start, more lies only at the end', () => {
  assert.deepEqual(edgesWithMore(0, 320, 900), { start: false, end: true });
});

test('in the middle, at both ends; at the far end, only at the start', () => {
  assert.deepEqual(edgesWithMore(200, 320, 900), { start: true, end: true });
  assert.deepEqual(edgesWithMore(580, 320, 900), { start: true, end: false });
});

test('a fractional position at either end counts as the end', () => {
  assert.deepEqual(edgesWithMore(0.5, 320, 900), { start: false, end: true });
  assert.deepEqual(edgesWithMore(579.4, 320, 900), { start: true, end: false });
});

test('right to left, where the position runs negative', () => {
  assert.deepEqual(edgesWithMore(-200, 320, 900), { start: true, end: true });
});
