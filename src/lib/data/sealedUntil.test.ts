import { test } from 'vitest';
import assert from 'node:assert/strict';
import { isSealedUntil } from './sealedUntil.ts';

test('sealed while the unlock day is still ahead of today', () => {
  assert.equal(isSealedUntil(105, 100), true);
});

test('open on the unlock day itself, and every day after', () => {
  assert.equal(isSealedUntil(100, 100), false);
  assert.equal(isSealedUntil(100, 105), false);
});
