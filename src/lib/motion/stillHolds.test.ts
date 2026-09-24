import assert from 'node:assert/strict';
import { test } from 'vitest';
import { isMoving, movingWindows, untilNextWindow, untilWindowEnds } from './stillHolds.ts';

/* face-glance and face-blink's own keyframes (components.css), as
   getKeyframes() hands them over: one entry per offset. */
const GLANCE = [
  { offset: 0, value: 'a' },
  { offset: 0.31, value: 'a' },
  { offset: 0.324, value: 'b' },
  { offset: 0.643, value: 'b' },
  { offset: 0.657, value: 'c' },
  { offset: 0.976, value: 'c' },
  { offset: 0.99, value: 'a' },
  { offset: 1, value: 'a' }
];
const BLINK = [
  { offset: 0, value: 'open' },
  { offset: 0.92, value: 'open' },
  { offset: 0.95, value: 'shut' },
  { offset: 1, value: 'open' }
];

test('the glance moves only across its three saccades, and the blink across its closing and opening', () => {
  assert.deepEqual(movingWindows(GLANCE), [
    { from: 0.31, to: 0.324 },
    { from: 0.643, to: 0.657 },
    { from: 0.976, to: 0.99 }
  ]);
  assert.deepEqual(movingWindows(BLINK), [{ from: 0.92, to: 1 }]);
});

test('a face is moving only inside a window, give or take the margin', () => {
  const w = movingWindows(GLANCE);
  const duration = 10000;
  // 3100ms into a 10s cycle is the first saccade's start.
  assert.equal(isMoving(3000, duration, 0, w, 0), false);
  assert.equal(isMoving(3150, duration, 0, w, 0), true);
  assert.equal(isMoving(3080, duration, 0, w, 30), true, 'resumed a little early');
  assert.equal(isMoving(3300, duration, 0, w, 30), false);
  // The same point one cycle later, and with a delay in front.
  assert.equal(isMoving(13150, duration, 0, w, 0), true);
  assert.equal(isMoving(5150, duration, 2000, w, 0), true);
  assert.equal(isMoving(1500, duration, 2000, w, 0), false, 'inside the delay');
});

test('the time to the next window and to the end of this one', () => {
  const w = movingWindows(BLINK);
  const duration = 4600;
  // The blink starts closing at 92% = 4232ms.
  assert.equal(untilNextWindow(1000, duration, 0, w, 0), 3232);
  assert.equal(untilNextWindow(1000, duration, 0, w, 32), 3200);
  assert.equal(untilNextWindow(4300, duration, 0, w, 0), 0, 'in the window already');
  assert.equal(Math.round(untilWindowEnds(4300, duration, 0, w, 0)), 300);
  // Inside the delay, the first window is counted from the delay's end.
  assert.equal(untilNextWindow(500, duration, 2100, w, 0), 2100 + 4232 - 500);
  // After a window, the next is one cycle on.
  assert.equal(untilNextWindow(4700, duration, 0, w, 0), 4232 + 4600 - 4700);
});
