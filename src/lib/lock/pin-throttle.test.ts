import { afterEach, expect, test, vi } from 'vitest';
import type { AttemptStore } from './throttle';

const native = vi.hoisted(() => ({
  getPinWait: vi.fn(), setPinWait: vi.fn(), resetPinWait: vi.fn()
}));
vi.mock('../android/plugin-registry', () => ({ androidPluginOwners: { lockTiming: 'LockTiming' }, registerAndroidPlugin: () => native }));
const platform = vi.hoisted(() => ({ isAndroid: vi.fn(() => true) }));
vi.mock('$lib/platform', () => platform);

afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetModules(); });

const emptyStore: AttemptStore = { read: () => null, write() {}, clear() {} };

test('a recreated PIN gate restores the native wait despite a forward wall clock jump', async () => {
  const { createPinThrottle } = await import('./pin-throttle');
  let elapsed = 0;
  vi.stubGlobal('performance', { now: () => elapsed });
  native.getPinWait.mockResolvedValue({ remainingMs: 750, fullDelayMs: 1000, proven: true, wrongAttempts: 2, adopted: true });
  const throttle = await createPinThrottle(emptyStore);
  expect(throttle.remainingMs(86_400_000)).toBe(750);
  elapsed = 250;
  expect(throttle.remainingMs(172_800_000)).toBe(500);
});

test('Android displays the native count without incrementing or resetting it at the gate', async () => {
  const { createPinThrottle } = await import('./pin-throttle');
  native.getPinWait.mockResolvedValue({ remainingMs: 0, fullDelayMs: 0, wrongAttempts: 1, adopted: true });
  vi.stubGlobal('performance', { now: () => 0 });
  const write = vi.fn();
  const throttle = await createPinThrottle({ ...emptyStore, write });
  native.getPinWait.mockResolvedValue({ remainingMs: 950, fullDelayMs: 1000, wrongAttempts: 2, adopted: true });
  await throttle.recordWrong(1000);
  expect(write).toHaveBeenLastCalledWith(expect.objectContaining({ wrongAttempts: 2 }));
  expect(throttle.remainingMs(1000)).toBe(950);
  expect(native.setPinWait).not.toHaveBeenCalled();
  await throttle.reset();
  expect(throttle.remainingMs(1000)).toBe(950);
  expect(native.resetPinWait).not.toHaveBeenCalled();
  native.getPinWait.mockResolvedValue({ remainingMs: 0, fullDelayMs: 0, wrongAttempts: 0, adopted: true });
  await throttle.reset();
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


test('Android passes the legacy count and pending marker to the native adoption owner', async () => {
  const { createPinThrottle } = await import('./pin-throttle');
  platform.isAndroid.mockReturnValue(true);
  vi.stubGlobal('performance', { now: () => 0 });
  native.getPinWait.mockResolvedValue({ remainingMs: 60_000, fullDelayMs: 60_000, wrongAttempts: 8, adopted: true });
  const throttle = await createPinThrottle({ ...emptyStore,
    read: () => ({ wrongAttempts: 8, acceptingFrom: 61_000 })
  });
  expect(native.getPinWait).toHaveBeenCalledWith(expect.objectContaining({ legacyWrongAttempts: 8, legacyPending: true }));
  expect(throttle.remainingMs(86_400_000)).toBe(60_000);
});

test('Android rejects an unavailable durable ledger instead of restoring a weaker web count', async () => {
  const { createPinThrottle } = await import('./pin-throttle');
  platform.isAndroid.mockReturnValue(true);
  native.getPinWait.mockRejectedValue(new Error('could not read PIN accounting'));
  await expect(createPinThrottle(emptyStore)).rejects.toThrow('could not read');
});

test('a wrong web PIN keeps its elapsed wait when the gate remounts', async () => {
  platform.isAndroid.mockReturnValue(false);
  const { createPinThrottle } = await import('./pin-throttle');
  let elapsed = 0;
  vi.stubGlobal('performance', { now: () => elapsed });
  vi.spyOn(Date, 'now').mockReturnValue(1000);
  let state: ReturnType<AttemptStore['read']> = null;
  const store: AttemptStore = {
    read: () => state,
    write: (next) => void (state = { ...next }),
    clear: () => void (state = null)
  };
  const before = await createPinThrottle(store);
  await before.recordWrong(1000);
  await before.recordWrong(1000);
  elapsed = 100;
  vi.mocked(Date.now).mockReturnValue(86_400_000);
  const after = await createPinThrottle(store);
  expect(after.remainingMs(86_400_000)).toBe(900);
  expect(state).toEqual({ wrongAttempts: 2, acceptingFrom: 2000 });
  await after.reset();
  expect((await createPinThrottle(store)).remainingMs(86_400_000)).toBe(0);
  expect(native.getPinWait).not.toHaveBeenCalled();
  expect(native.setPinWait).not.toHaveBeenCalled();
  expect(native.resetPinWait).not.toHaveBeenCalled();
});

test('Android mirrors the native wait exactly and refreshes without admitting another attempt', async () => {
  platform.isAndroid.mockReturnValue(true);
  const { createPinThrottle } = await import('./pin-throttle');
  vi.stubGlobal('performance', { now: () => 0 });
  vi.spyOn(Date, 'now').mockReturnValue(1000);
  native.getPinWait.mockResolvedValue({ remainingMs: 2000, fullDelayMs: 2000, wrongAttempts: 3, adopted: true });
  const write = vi.fn();
  const throttle = await createPinThrottle({ ...emptyStore, write });
  expect(write).toHaveBeenLastCalledWith({ wrongAttempts: 3, acceptingFrom: 3000 });
  expect(throttle.remainingMs(86_400_000)).toBe(2000);
  native.getPinWait.mockResolvedValue({ remainingMs: 0, fullDelayMs: 2000, wrongAttempts: 3, adopted: true });
  await throttle.refresh();
  expect(write).toHaveBeenLastCalledWith({ wrongAttempts: 3, acceptingFrom: 0 });
  expect(throttle.remainingMs(86_400_000)).toBe(0);
  expect(native.setPinWait).not.toHaveBeenCalled();
  expect(native.resetPinWait).not.toHaveBeenCalled();
});
