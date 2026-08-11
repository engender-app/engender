import { test, expect } from 'vitest';
import { createAttemptThrottle, delayAfterWrongAttempts, MAX_DELAY_MS } from './throttle.ts';

test('the first wrong attempt is free and every one after it waits longer', () => {
  expect(delayAfterWrongAttempts(0)).toBe(0);
  expect(delayAfterWrongAttempts(1)).toBe(0);

  const delays = Array.from({ length: 8 }, (_, i) => delayAfterWrongAttempts(i + 2));
  expect(delays[0]).toBeGreaterThan(0);
  for (let i = 1; i < delays.length; i++) {
    if (delays[i - 1] < MAX_DELAY_MS) expect(delays[i]).toBeGreaterThan(delays[i - 1]);
  }
});

test('the delay stops growing at the cap instead of running away', () => {
  expect(delayAfterWrongAttempts(2000)).toBe(MAX_DELAY_MS);
  expect(delayAfterWrongAttempts(2001)).toBe(MAX_DELAY_MS);
});

test('nothing is owed until a second attempt goes wrong', () => {
  const throttle = createAttemptThrottle();
  expect(throttle.remainingMs(1000)).toBe(0);

  throttle.recordWrong(1000);
  expect(throttle.remainingMs(1000)).toBe(0);

  throttle.recordWrong(1000);
  expect(throttle.remainingMs(1000)).toBe(delayAfterWrongAttempts(2));
});

test('the wait counts down and reaches zero on its own', () => {
  const throttle = createAttemptThrottle();
  throttle.recordWrong(0);
  throttle.recordWrong(0);
  const owed = delayAfterWrongAttempts(2);

  expect(throttle.remainingMs(owed / 2)).toBe(owed / 2);
  expect(throttle.remainingMs(owed)).toBe(0);
  expect(throttle.remainingMs(owed + 10_000)).toBe(0);
});

test('a correct PIN clears both the wait and the growth', () => {
  const throttle = createAttemptThrottle();
  for (const _ of [1, 2, 3, 4]) throttle.recordWrong(0);
  expect(throttle.remainingMs(0)).toBeGreaterThan(delayAfterWrongAttempts(2));

  throttle.reset();
  expect(throttle.remainingMs(0)).toBe(0);

  throttle.recordWrong(0);
  throttle.recordWrong(0);
  expect(throttle.remainingMs(0)).toBe(delayAfterWrongAttempts(2));
});
