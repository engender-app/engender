import { test, expect } from 'vitest';
import {
  createAttemptThrottle,
  delayAfterWrongAttempts,
  MAX_DELAY_MS,
  type AttemptState,
  type AttemptStore
} from './throttle.ts';

function fakeStore(initial: AttemptState | null = null) {
  let held = initial;
  const store: AttemptStore = {
    read: () => held,
    write: (state) => void (held = { ...state }),
    clear: () => void (held = null)
  };
  return { store, held: () => held };
}

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

test('the count survives the page it was made on', () => {
  const { store, held } = fakeStore();
  const before = createAttemptThrottle(store);
  before.recordWrong(0);
  before.recordWrong(0);
  expect(held()).toEqual({ wrongAttempts: 2, acceptingFrom: delayAfterWrongAttempts(2) });

  // A reload: same storage, a throttle that has never seen an attempt.
  const after = createAttemptThrottle(store);
  expect(after.remainingMs(0)).toBe(delayAfterWrongAttempts(2));
  after.recordWrong(0);
  expect(after.remainingMs(0)).toBe(delayAfterWrongAttempts(3));
});

test('a correct PIN clears the stored count too', () => {
  const { store, held } = fakeStore();
  const throttle = createAttemptThrottle(store);
  throttle.recordWrong(0);
  throttle.recordWrong(0);

  throttle.reset();

  expect(held()).toBe(null);
  expect(createAttemptThrottle(store).remainingMs(0)).toBe(0);
});

test('a stored moment in the far future costs one delay, not a lockout', () => {
  const { store } = fakeStore({ wrongAttempts: 2, acceptingFrom: 8.64e15 });

  expect(createAttemptThrottle(store).remainingMs(0)).toBe(delayAfterWrongAttempts(2));
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
