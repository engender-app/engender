import assert from 'node:assert/strict';
import { test } from 'vitest';
import { formatClock, claimPlayback } from './playback.ts';

/* The two things both transports share: how a position is written, and the
   rule that only one of them is ever running. */

test('a position is written the way a recording is read out', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(7), '0:07');
  assert.equal(formatClock(62), '1:02');
  assert.equal(formatClock(600), '10:00');
  assert.equal(formatClock(3601), '1:00:01');
  assert.equal(formatClock(3671), '1:01:11');
});

test('a second is only over when it is over', () => {
  // 7.9 seconds in is still the seventh second: a clock that rounds up
  // shows 0:08 against a 0:07 recording at its very end.
  assert.equal(formatClock(7.9), '0:07');
});

test('a duration nobody knows yet is zero rather than NaN', () => {
  assert.equal(formatClock(Number.NaN), '0:00');
  assert.equal(formatClock(Number.POSITIVE_INFINITY), '0:00');
  assert.equal(formatClock(-4), '0:00');
});

test('starting one thing stops whatever was playing', () => {
  const stopped: string[] = [];
  const first = claimPlayback(() => stopped.push('first'));
  assert.deepEqual([...stopped], []);

  const second = claimPlayback(() => stopped.push('second'));
  assert.deepEqual([...stopped], ['first']);

  claimPlayback(() => stopped.push('third'));
  assert.deepEqual([...stopped], ['first', 'second']);

  // Releasing a claim that has already been taken over stops nothing: the
  // player that lost it has been stopped once already.
  first();
  second();
  assert.deepEqual([...stopped], ['first', 'second']);
});

test('releasing the current claim leaves nothing to stop', () => {
  const stopped: string[] = [];
  const release = claimPlayback(() => stopped.push('first'));
  release();

  claimPlayback(() => stopped.push('second'));
  assert.deepEqual([...stopped], []);
});
