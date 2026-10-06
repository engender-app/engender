import { afterEach, expect, test, vi } from 'vitest';
import type { AttemptStore } from './throttle';

const native = vi.hoisted(() => ({
  getPinWait: vi.fn(), setPinWait: vi.fn(), resetPinWait: vi.fn()
}));
vi.mock('./lock-timing-bridge', () => ({ androidLockTiming: native }));
const platform = vi.hoisted(() => ({ isAndroid: vi.fn(() => true) }));
vi.mock('$lib/platform', () => platform);

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetModules(); });

const emptyStore: AttemptStore = { read: () => null, write() {}, clear() {} };

test('a recreated PIN gate restores the native wait despite a forward wall clock jump', async () => {
  const { createPinThrottle } = await import('./pin-throttle');
  let elapsed = 0;
  vi.stubGlobal('performance', { now: () => elapsed });
  native.getPinWait.mockResolvedValue({ remainingMs: 750, fullDelayMs: 1000, proven: true });
  const throttle = await createPinThrottle(emptyStore);
  expect(throttle.remainingMs(86_400_000)).toBe(750);
  elapsed = 250;
  expect(throttle.remainingMs(172_800_000)).toBe(500);
});

test('wrong attempts reach the native mirror and a correct PIN clears it', async () => {
  const { createPinThrottle } = await import('./pin-throttle');
  native.getPinWait.mockResolvedValue({ remainingMs: 0, fullDelayMs: 0, proven: true });
  vi.stubGlobal('performance', { now: () => 0 });
  native.setPinWait.mockResolvedValue(undefined);
  native.resetPinWait.mockResolvedValue(undefined);
  const throttle = await createPinThrottle(emptyStore);
  await throttle.recordWrong(1000);
  await throttle.recordWrong(1000);
  expect(native.setPinWait).toHaveBeenLastCalledWith({ remainingMs: 1000, fullDelayMs: 1000 });
  await throttle.reset();
  expect(native.resetPinWait).toHaveBeenCalled();
  expect(throttle.remainingMs(1000)).toBe(0);
});


test('a restored web wait survives remounting the gate after a clock jump', async () => {
  const { createPinThrottle } = await import('./pin-throttle');
  platform.isAndroid.mockReturnValue(false);
  let elapsed = 0;
  vi.stubGlobal('performance', { now: () => elapsed });
  vi.spyOn(Date, 'now').mockReturnValue(1000);
  const store: AttemptStore = {
    ...emptyStore, read: () => ({ wrongAttempts: 2, acceptingFrom: 2000 })
  };
  const before = await createPinThrottle(store);
  expect(before.remainingMs(1000)).toBe(1000);
  elapsed = 250;
  vi.mocked(Date.now).mockReturnValue(86_400_000);
  const after = await createPinThrottle(store);
  expect(after.remainingMs(86_400_000)).toBe(750);
  await after.reset();
  platform.isAndroid.mockReturnValue(true);
});


test('an Android install without a persisted native deadline cannot bypass its web wait', async () => {
  const { createPinThrottle } = await import('./pin-throttle');
  platform.isAndroid.mockReturnValue(true);
  vi.stubGlobal('performance', { now: () => 0 });
  vi.spyOn(Date, 'now').mockReturnValue(86_400_000);
  native.getPinWait.mockResolvedValue({ remainingMs: 0, fullDelayMs: 0, proven: false });
  const throttle = await createPinThrottle({ ...emptyStore,
    read: () => ({ wrongAttempts: 8, acceptingFrom: 61_000 })
  });
  expect(throttle.remainingMs(86_400_000)).toBe(60_000);
});


test('process death between storing a miss and mirroring it cannot reuse an older paid wait', async () => {
  const { createPinThrottle } = await import('./pin-throttle');
  platform.isAndroid.mockReturnValue(true);
  vi.stubGlobal('performance', { now: () => 0 });
  vi.spyOn(Date, 'now').mockReturnValue(86_400_000);
  native.getPinWait.mockResolvedValue({ remainingMs: 0, fullDelayMs: 0, proven: true });
  const throttle = await createPinThrottle({ ...emptyStore,
    read: () => ({ wrongAttempts: 8, acceptingFrom: 61_000 })
  });
  expect(throttle.remainingMs(86_400_000)).toBe(60_000);
});
