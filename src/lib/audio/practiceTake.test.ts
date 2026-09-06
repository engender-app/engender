/* Per-take arithmetic for a practice session. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { practiceTakeStats } from './practiceTake.ts';
import type { PitchFrame } from './pitch.ts';

function frame(hz: number | null): PitchFrame {
  return { atSeconds: 0, hz };
}

test('the true minimum, maximum and median of the voiced frames', () => {
  const stats = practiceTakeStats([frame(100), frame(140), frame(120), frame(null), frame(160)]);
  assert.deepEqual(stats, { minHz: 100, maxHz: 160, medianHz: 130 });
});

test('unvoiced frames never enter the figures', () => {
  const stats = practiceTakeStats([frame(null), frame(200), frame(null)]);
  assert.deepEqual(stats, { minHz: 200, maxHz: 200, medianHz: 200 });
});

test('nothing voiced at all is null, not zero', () => {
  assert.equal(practiceTakeStats([frame(null), frame(null)]), null);
  assert.equal(practiceTakeStats([]), null);
});

test('one creaky frame is exactly what a true minimum is for', () => {
  // The whole reason a benchmark reports p10/p90 instead: a single low
  // outlier moves a true min the way it would not move a percentile. A
  // practice take reports the true value anyway, because the person knows
  // what they just did (the ticket's own reasoning).
  const stats = practiceTakeStats([frame(150), frame(148), frame(80), frame(152)]);
  assert.equal(stats?.minHz, 80);
});
