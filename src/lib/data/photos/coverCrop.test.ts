import assert from 'node:assert/strict';
import { test } from 'vitest';
import { coverCrop } from './coverCrop.ts';

/* The part of a camera frame a 3:4 preview shows under object-fit: cover,
   which is also the part a progress photo keeps, so what was lined up
   against the ghost is what gets stored. */

test('a landscape frame keeps a centred 3:4 slice of its full height', () => {
  assert.deepEqual(coverCrop(1920, 1080, 3 / 4), { x: 555, y: 0, width: 810, height: 1080 });
});

test('a tall frame keeps a centred 3:4 slice of its full width', () => {
  assert.deepEqual(coverCrop(1080, 1920, 3 / 4), { x: 0, y: 240, width: 1080, height: 1440 });
});

test('a frame already 3:4 is kept whole', () => {
  assert.deepEqual(coverCrop(960, 1280, 3 / 4), { x: 0, y: 0, width: 960, height: 1280 });
});
