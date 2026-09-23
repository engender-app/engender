import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const { startExport, stopExport, startRetro, stopRetro } = vi.hoisted(() => ({
  startExport: vi.fn(),
  stopExport: vi.fn(),
  startRetro: vi.fn(),
  stopRetro: vi.fn()
}));

vi.mock('./archive/auto-export-scheduler', () => ({
  startAutoExportScheduler: startExport,
  stopAutoExportScheduler: stopExport
}));
vi.mock('./retrospective-notifications-scheduler', () => ({
  startRetrospectiveNotificationsScheduler: startRetro,
  stopRetrospectiveNotificationsScheduler: stopRetro
}));

import { CHECK_EVERY_MS, periodicCheck, startBackgroundSchedulers } from './backgroundSchedulers';

const listeners = new Map<string, () => void>();
const doc = {
  visibilityState: 'visible' as DocumentVisibilityState,
  addEventListener: vi.fn((type: string, fn: () => void) => listeners.set(type, fn)),
  removeEventListener: vi.fn((type: string) => listeners.delete(type))
};

const flush = async () => {
  await vi.advanceTimersByTimeAsync(0);
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  listeners.clear();
  doc.visibilityState = 'visible';
  vi.stubGlobal('document', doc);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('a periodic check', () => {
  test('runs on start, then every fifteen minutes', async () => {
    const run = vi.fn();
    const check = periodicCheck(run);
    check.start();
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS);
    expect(run).toHaveBeenCalledTimes(2);
    expect(CHECK_EVERY_MS).toBe(15 * 60 * 1000);
    check.stop();
  });

  test('runs again when the app comes back to the foreground, not when it leaves', () => {
    const run = vi.fn();
    const check = periodicCheck(run);
    check.start();

    doc.visibilityState = 'hidden';
    listeners.get('visibilitychange')?.();
    expect(run).toHaveBeenCalledTimes(1);

    doc.visibilityState = 'visible';
    listeners.get('visibilitychange')?.();
    expect(run).toHaveBeenCalledTimes(2);
    check.stop();
  });

  test('starting twice is one schedule', async () => {
    const run = vi.fn();
    const check = periodicCheck(run);
    check.start();
    check.start();
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS);
    expect(run).toHaveBeenCalledTimes(2);
    check.stop();
  });

  test('stops running on the timer and on visibility once stopped', async () => {
    const run = vi.fn();
    const check = periodicCheck(run);
    check.start();
    check.stop();

    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS * 2);
    expect(listeners.has('visibilitychange')).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('the two background schedulers', () => {
  test('start together and stop together', async () => {
    const stop = startBackgroundSchedulers();
    await flush();
    expect(startExport).toHaveBeenCalledTimes(1);
    expect(startRetro).toHaveBeenCalledTimes(1);

    stop();
    expect(stopExport).toHaveBeenCalledTimes(1);
    expect(stopRetro).toHaveBeenCalledTimes(1);
  });

  test('never start if stopped before their modules arrive', async () => {
    const stop = startBackgroundSchedulers();
    stop();
    await flush();

    expect(startExport).not.toHaveBeenCalled();
    expect(startRetro).not.toHaveBeenCalled();
  });
});
