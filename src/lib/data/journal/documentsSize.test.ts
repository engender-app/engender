/* The documents index's byte-to-unit rule (phase 10 redesign ticket 58). */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { bytesToDisplaySize } from './documentsSize.ts';

test('under a megabyte reads in KB', () => {
  assert.deepEqual(bytesToDisplaySize(340 * 1024), { value: 340, unit: 'KB' });
});

test('a megabyte or more reads in MB', () => {
  assert.deepEqual(bytesToDisplaySize(6.2 * 1024 * 1024), { value: 6.2, unit: 'MB' });
});

test('exactly one megabyte is MB, not 1024 KB', () => {
  assert.deepEqual(bytesToDisplaySize(1024 * 1024), { value: 1, unit: 'MB' });
});

test('an empty vault still reads as a unit, not a bare zero', () => {
  assert.deepEqual(bytesToDisplaySize(0), { value: 0, unit: 'KB' });
});
