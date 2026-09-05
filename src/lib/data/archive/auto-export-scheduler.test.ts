import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const {
  status,
  notifyFailure,
  runAndroidAutoExport,
  snapshot,
  toast
} = vi.hoisted(() => ({
  status: vi.fn(),
  notifyFailure: vi.fn(),
  runAndroidAutoExport: vi.fn(),
  snapshot: vi.fn(),
  toast: vi.fn()
}));

vi.mock('$lib/platform', () => ({ isAndroid: () => true }));
vi.mock('$lib/paraglide/messages', () => ({
  m: {
    exp_auto_reselect_needed: () => 'reselect',
    notif_export_failure_channel: () => 'Backups',
    notif_export_failure_notice_title: () => 'Scheduled backup failed',
    notif_export_failure_notice_body: () => 'Nothing was saved.'
  }
}));
vi.mock('$lib/stores/toasts.svelte', () => ({ toast }));
vi.mock('$lib/data/prefs/store.svelte', () => ({
  prefs: {
    lastBackupAt: null as number | null,
    backupNoticeDismissed: true,
    /* The registry's own switches for this producer (phase 6 ticket 04), at
       the defaults a journal that has never opened /settings/notifications
       is on. */
    exportFailureNoticeEnabled: true,
    heldExportFailureNotice: false,
    hideNotificationTitles: false,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00'
  }
}));
vi.mock('$lib/data/live/journal.svelte', () => ({
  journal: { archive: { snapshot } }
}));
vi.mock('./android-auto-export-bridge', () => ({
  androidAutoExport: {
    status,
    notifyFailure
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
  /* Fake timers don't advance for a dynamic import's own microtask hop
     (maybeRun's `await import('./android-auto-export')`), so nudge them
     forward once before draining the rest with plain microtask ticks. */
  await vi.advanceTimersByTimeAsync(0);
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

/* A real 2026 date rather than a few seconds past the epoch: quiet hours are
   read off the local wall clock, so the cases below that care about the hour
   set an explicit date, and `lastAttemptAt` is module state that outlives a
   test - a later case landing in 1970 would look like a backup attempted 56
   years in the future and be skipped by the minimum-gap check. */
let nowSeed = new Date(2026, 8, 1).getTime();

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
    snapshot.mockResolvedValue({ journal: { entries: [], dimensions: [], presets: [], tagGroups: [], milestones: [], labResults: [], measurements: [], sideEffects: [], reminders: [] }, files: [], readFile: async () => new Uint8Array() });
    vi.mocked(isDue).mockReturnValue(true);
    runAndroidAutoExport.mockResolvedValue({ outcome: 'ok', writtenAt: 10 });
    prefs.lastBackupAt = null;
    prefs.backupNoticeDismissed = true;
    prefs.exportFailureNoticeEnabled = true;
    prefs.heldExportFailureNotice = false;
    prefs.hideNotificationTitles = false;
    prefs.quietHoursEnabled = false;
  });

  afterEach(() => {
    /* Carry the clock forward past whatever this case moved it to: the
       scheduler's `lastAttemptAt` is module state that outlives a test, and a
       later case landing before it reads as a backup attempted in the future
       and is skipped by the minimum-gap check. */
    nowSeed = Math.max(nowSeed, Date.now());
    stopAutoExportScheduler();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test('runs a due backup immediately on scheduler start (restart path)', async () => {
    startAutoExportScheduler();
    await flush();

    expect(status).toHaveBeenCalled();
    expect(snapshot).toHaveBeenCalled();
    expect(runAndroidAutoExport).toHaveBeenCalled();
  });

  test('does nothing when backup is not due', async () => {
    vi.mocked(isDue).mockReturnValue(false);

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

  test('says nothing on the phone when the backup succeeds', async () => {
    startAutoExportScheduler();
    await flush();

    expect(notifyFailure).not.toHaveBeenCalled();
    expect(prefs.heldExportFailureNotice).toBe(false);
  });

  test('posts the failure notice, localized, when a scheduled run fails', async () => {
    /* The strings used to be English literals inside AutoExportPlugin, which
       made the one notification nobody could turn off also the one nobody
       could read in Polish (phase 6 ticket 04). */
    runAndroidAutoExport.mockResolvedValue({ outcome: 'failed', reason: 'destination-full' });

    startAutoExportScheduler();
    await flush();

    expect(notifyFailure).toHaveBeenCalledWith({
      title: 'Scheduled backup failed',
      body: 'Nothing was saved.',
      channelName: 'Backups'
    });
  });

  test('disguises the notice when hidden titles are on', async () => {
    runAndroidAutoExport.mockResolvedValue({ outcome: 'failed', reason: 'destination-full' });
    prefs.hideNotificationTitles = true;

    startAutoExportScheduler();
    await flush();

    expect(notifyFailure).toHaveBeenCalledWith({ title: 'Backups', body: '', channelName: 'Backups' });
  });

  test('says nothing at all while the kind is switched off', async () => {
    runAndroidAutoExport.mockResolvedValue({ outcome: 'failed', reason: 'destination-full' });
    prefs.exportFailureNoticeEnabled = false;

    startAutoExportScheduler();
    await flush();

    expect(notifyFailure).not.toHaveBeenCalled();
  });

  test('holds a failure inside quiet hours and posts it on a later check outside them', async () => {
    /* The hold this producer needs a flag for: a backup runs weekly, so a
       skipped notice would be a drop rather than a hold. */
    runAndroidAutoExport.mockResolvedValue({ outcome: 'failed', reason: 'destination-full' });
    prefs.quietHoursEnabled = true;
    vi.setSystemTime(new Date(2026, 11, 1, 23, 30));

    startAutoExportScheduler();
    await flush();
    expect(notifyFailure).not.toHaveBeenCalled();
    expect(prefs.heldExportFailureNotice).toBe(true);

    // Nothing fails again; the window simply ends.
    runAndroidAutoExport.mockResolvedValue({ outcome: 'ok', writtenAt: 44 });
    stopAutoExportScheduler();
    vi.setSystemTime(new Date(2026, 11, 2, 8, 0));
    startAutoExportScheduler();
    await flush();

    expect(notifyFailure).toHaveBeenCalledTimes(1);
    expect(prefs.heldExportFailureNotice).toBe(false);
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
