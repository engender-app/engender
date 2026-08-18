import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const {
  status,
  revealPassword,
  runAndroidAutoExport,
  snapshot,
  toast
} = vi.hoisted(() => ({
  status: vi.fn(),
  revealPassword: vi.fn(),
  runAndroidAutoExport: vi.fn(),
  snapshot: vi.fn(),
  toast: vi.fn()
}));

vi.mock('$lib/platform', () => ({ isAndroid: () => true }));
vi.mock('$lib/paraglide/messages', () => ({ m: { exp_auto_reselect_needed: () => 'reselect' } }));
vi.mock('$lib/stores/toasts.svelte', () => ({ toast }));
vi.mock('$lib/data/prefs/store.svelte', () => ({ prefs: { lastBackupAt: null as number | null, backupNoticeDismissed: true } }));
vi.mock('$lib/data/live/journal.svelte', () => ({
  journal: { archive: { snapshot } }
}));
vi.mock('./android-auto-export-bridge', () => ({
  androidAutoExport: {
    status,
    revealPassword
  }
}));
vi.mock('./android-auto-export', () => ({
  isDue: vi.fn(),
  runAndroidAutoExport
}));

import { prefs } from '$lib/data/prefs/store.svelte';
import { isDue } from './android-auto-export';
import { startAutoExportScheduler, stopAutoExportScheduler } from './auto-export-scheduler';

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

let nowSeed = 2_000_000;

describe('auto-export scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    nowSeed += 2_000_000;
    vi.setSystemTime(new Date(nowSeed));
    vi.clearAllMocks();
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    });
    status.mockResolvedValue({
      enabled: true,
      schedule: 'weekly',
      destinationUri: 'content://tree/backup',
      destinationLabel: 'backup',
      hasPassword: true,
      nextDueAt: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastFailureReason: null
    });
    revealPassword.mockResolvedValue({ password: 'secret' });
    snapshot.mockResolvedValue({ journal: { entries: [], dimensions: [], presets: [], tagGroups: [], milestones: [], labResults: [], measurements: [], sideEffects: [], reminders: [] }, files: [], readFile: async () => new Uint8Array() });
    vi.mocked(isDue).mockReturnValue(true);
    runAndroidAutoExport.mockResolvedValue({ outcome: 'ok', writtenAt: 10 });
    prefs.lastBackupAt = null;
    prefs.backupNoticeDismissed = true;
  });

  afterEach(() => {
    stopAutoExportScheduler();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test('runs a due backup immediately on scheduler start (restart path)', async () => {
    startAutoExportScheduler();
    await flush();

    expect(status).toHaveBeenCalled();
    expect(revealPassword).toHaveBeenCalled();
    expect(snapshot).toHaveBeenCalled();
    expect(runAndroidAutoExport).toHaveBeenCalled();
  });

  test('does nothing when no password is available', async () => {
    revealPassword.mockResolvedValue({ password: null });

    startAutoExportScheduler();
    await flush();

    expect(runAndroidAutoExport).not.toHaveBeenCalled();
  });

  test('shows reselect toast when scheduled run loses destination access', async () => {
    runAndroidAutoExport.mockResolvedValue({ outcome: 'needs-destination' });

    startAutoExportScheduler();
    await flush();

    expect(toast).toHaveBeenCalledWith('reselect');
  });

  test('retries on the next interval after a failed scheduled run', async () => {
    runAndroidAutoExport
      .mockResolvedValueOnce({ outcome: 'failed', reason: 'destination-full' })
      .mockResolvedValueOnce({ outcome: 'ok', writtenAt: 22 });

    startAutoExportScheduler();
    await flush();
    expect(runAndroidAutoExport).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    await flush();
    expect(runAndroidAutoExport).toHaveBeenCalledTimes(2);
  });

  test('after scheduler restart it re-attempts due backup (process death shape)', async () => {
    runAndroidAutoExport
      .mockResolvedValueOnce({ outcome: 'failed', reason: 'partial-write' })
      .mockResolvedValueOnce({ outcome: 'ok', writtenAt: 33 });

    startAutoExportScheduler();
    await flush();
    expect(runAndroidAutoExport).toHaveBeenCalledTimes(1);

    stopAutoExportScheduler();
    nowSeed += 120_000;
    vi.setSystemTime(new Date(nowSeed));
    startAutoExportScheduler();
    await flush();
    expect(runAndroidAutoExport).toHaveBeenCalledTimes(2);
  });
});
