import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const {
  status,
  notifyFailure,
  runAndroidAutoExport,
  snapshot,
  toast,
  preferenceState
} = vi.hoisted(() => ({
  status: vi.fn(),
  notifyFailure: vi.fn(),
  runAndroidAutoExport: vi.fn(),
  snapshot: vi.fn(),
  toast: vi.fn(),
  preferenceState: {
    lastBackupAt: null as number | null,
    backupNoticeDismissed: true,
    exportFailureNoticeEnabled: true,
    heldExportFailureNotice: false,
    lastExportFailureNotifiedAt: null as number | null,
    hideNotificationTitles: false,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00'
  }
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
  prefs: preferenceState,
  setPreferenceDurably: vi.fn(async (key: keyof typeof preferenceState, value: never) => {
    preferenceState[key] = value;
  })
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
  runAndroidAutoExport
}));

import { prefs } from '$lib/data/prefs/store.svelte';
let startAutoExportScheduler: () => void;
let stopAutoExportScheduler: () => void;

const flush = async () => {
  /* Fake timers don't advance for a dynamic import's own microtask hop
     (maybeRun's `await import('./android-auto-export')`), so nudge them
     forward once before draining the rest with plain microtask ticks. */
  await vi.advanceTimersByTimeAsync(0);
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

/* Quiet hours use local wall time, so each case starts on a real date. */
let stopFreshScheduler: (() => void) | undefined;

let nowSeed = new Date(2026, 8, 1).getTime();

describe('auto-export scheduler', () => {
  beforeEach(async () => {
    vi.resetModules();
    ({ startAutoExportScheduler, stopAutoExportScheduler } = await import('./auto-export-scheduler'));
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
    runAndroidAutoExport.mockResolvedValue({ outcome: 'ok', writtenAt: 10 });
    prefs.lastBackupAt = null;
    prefs.backupNoticeDismissed = true;
    prefs.exportFailureNoticeEnabled = true;
    prefs.heldExportFailureNotice = false;
    prefs.lastExportFailureNotifiedAt = null;
    prefs.hideNotificationTitles = false;
    prefs.quietHoursEnabled = false;
  });

  afterEach(() => {
    // Quiet-hours cases may advance into another day.
    nowSeed = Math.max(nowSeed, Date.now());
    stopAutoExportScheduler();
    stopFreshScheduler?.();
    stopFreshScheduler = undefined;
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

  test('overlapping startup and visibility checks write one backup', async () => {
    let release!: () => void;
    status.mockImplementation(() => new Promise((resolve) => {
      release = () => resolve({ enabled: true, destinationUri: 'content://tree/backup', hasPassword: true });
    }));
    startAutoExportScheduler();
    const visible = vi.mocked(document.addEventListener).mock.calls[0][1] as () => void;
    visible();
    await flush();
    const checks = status.mock.calls.length;
    release();
    await flush();
    expect(checks).toBe(1);
    expect(runAndroidAutoExport).toHaveBeenCalledTimes(1);
  });

  test('does not repack an eligible stage before refresh window', async () => {
    status.mockResolvedValue({ enabled: true, destinationUri: 'content://tree/backup', hasPassword: true, stagedSnapshotAt: nowSeed, nextDueAt: nowSeed + 7 * 86400000 });

    startAutoExportScheduler();
    await flush();

    expect(runAndroidAutoExport).not.toHaveBeenCalled();
  });

  test('keeps an eligible due stage without reopening the native retry window', async () => {
    status.mockResolvedValue({ enabled: true, destinationUri: 'content://tree/backup', hasPassword: true,
      stagedSnapshotAt: nowSeed - 3600000, nextDueAt: nowSeed - 1800000,
      lastFailureAt: nowSeed - 1000, lastFailureReason: 'destination-unavailable' });
    startAutoExportScheduler();
    await flush();
    expect(snapshot).not.toHaveBeenCalled();
    expect(runAndroidAutoExport).not.toHaveBeenCalled();
  });

  test('prepares one stage before due when no encrypted snapshot is available', async () => {
    runAndroidAutoExport.mockResolvedValue({ outcome: 'staged' });
    startAutoExportScheduler();
    await flush();
    expect(runAndroidAutoExport).toHaveBeenCalledWith(expect.objectContaining({ snapshotAt: nowSeed }),
      expect.objectContaining({ scheduled: true }));
    expect(notifyFailure).not.toHaveBeenCalled();
  });

  test('refreshes an older stage once during final day before due', async () => {
    status.mockResolvedValue({ enabled: true, destinationUri: 'content://tree/backup', hasPassword: true,
      stagedSnapshotAt: nowSeed - 2 * 86400000, nextDueAt: nowSeed + 3600000 });
    runAndroidAutoExport.mockResolvedValue({ outcome: 'staged' });
    startAutoExportScheduler();
    await flush();
    expect(snapshot).toHaveBeenCalledTimes(1);
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

  test('a status failure before packing posts the backup failure notice', async () => {
    status.mockRejectedValue(new Error('status unavailable'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      startAutoExportScheduler();
      await flush();
      expect(snapshot).not.toHaveBeenCalled();
      expect(notifyFailure).toHaveBeenCalledTimes(1);
      expect(prefs.lastBackupAt).toBeNull();
    } finally {
      logged.mockRestore();
    }
  });

  test('reports a snapshot failure before packing starts', async () => {
    snapshot.mockRejectedValue(new Error('journal unavailable'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      startAutoExportScheduler();
      await flush();

      expect(runAndroidAutoExport).not.toHaveBeenCalled();
      expect(notifyFailure).toHaveBeenCalledTimes(1);
      expect(prefs.lastBackupAt).toBeNull();
    } finally {
      logged.mockRestore();
    }
  });

  test('holds a pre-pack failure during quiet hours', async () => {
    snapshot.mockRejectedValue(new Error('journal unavailable'));
    prefs.quietHoursEnabled = true;
    const quiet = new Date(nowSeed);
    quiet.setHours(23, 30);
    vi.setSystemTime(quiet);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      startAutoExportScheduler();
      await flush();

      expect(notifyFailure).not.toHaveBeenCalled();
      expect(prefs.heldExportFailureNotice).toBe(true);
    } finally {
      logged.mockRestore();
    }
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

  test('reports one native delivery failure across ticks and a fresh scheduler module', async () => {
    const native = { enabled: true, destinationUri: 'content://tree/backup', hasPassword: true,
      stagedSnapshotAt: null as number | null, nextDueAt: nowSeed,
      lastFailureAt: null as number | null };
    status.mockImplementation(async () => ({ ...native }));
    runAndroidAutoExport.mockImplementationOnce(async () => {
      native.lastFailureAt = nowSeed + 5;
      native.stagedSnapshotAt = nowSeed;
      return { outcome: 'failed', reason: 'destination-full' };
    });

    startAutoExportScheduler();
    await flush();
    expect(notifyFailure).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    await flush();
    expect(runAndroidAutoExport).toHaveBeenCalledTimes(1);
    expect(notifyFailure).toHaveBeenCalledTimes(1);
    expect(prefs.lastExportFailureNotifiedAt).toBe(native.lastFailureAt);

    stopAutoExportScheduler();
    vi.resetModules();
    const fresh = await import('./auto-export-scheduler');
    stopFreshScheduler = fresh.stopAutoExportScheduler;
    fresh.startAutoExportScheduler();
    await flush();
    expect(notifyFailure).toHaveBeenCalledTimes(1);
  });

  test.each(['success', 'destination change'])('a new failure after %s notifies again', async (change) => {
    const native = { enabled: false, lastFailureAt: nowSeed as number | null,
      lastSuccessAt: null as number | null, destinationUri: 'content://tree/backup' };
    status.mockImplementation(async () => ({ ...native }));
    startAutoExportScheduler();
    await flush();
    expect(notifyFailure).toHaveBeenCalledTimes(1);

    native.lastFailureAt = null;
    if (change === 'success') native.lastSuccessAt = nowSeed + 1;
    else native.destinationUri = 'content://tree/new-backup';
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    await flush();
    expect(notifyFailure).toHaveBeenCalledTimes(1);

    expect(prefs.lastExportFailureNotifiedAt).toBeNull();
    // Reusing a timestamp after a cleared native failure is still a new event.
    native.lastFailureAt = nowSeed;
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    await flush();
    expect(notifyFailure).toHaveBeenCalledTimes(2);
    expect(prefs.lastExportFailureNotifiedAt).toBe(native.lastFailureAt);
  });

  test('holds one native failure across a cold module and posts once after quiet hours', async () => {
    const quiet = new Date(nowSeed);
    quiet.setHours(23, 30);
    vi.setSystemTime(quiet);
    prefs.quietHoursEnabled = true;
    status.mockResolvedValue({ enabled: false, lastFailureAt: quiet.getTime() });
    startAutoExportScheduler();
    await flush();
    expect(notifyFailure).not.toHaveBeenCalled();
    expect(prefs.heldExportFailureNotice).toBe(true);

    stopAutoExportScheduler();
    vi.resetModules();
    const fresh = await import('./auto-export-scheduler');
    stopFreshScheduler = fresh.stopAutoExportScheduler;
    const morning = new Date(quiet);
    morning.setDate(morning.getDate() + 1);
    morning.setHours(8, 0);
    vi.setSystemTime(morning);
    fresh.startAutoExportScheduler();
    await flush();
    expect(notifyFailure).toHaveBeenCalledTimes(1);
    expect(prefs.heldExportFailureNotice).toBe(false);

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    await flush();
    expect(notifyFailure).toHaveBeenCalledTimes(1);
  });

  test('does not replay a native failure dropped while notices were off', async () => {
    status.mockResolvedValue({ enabled: false, lastFailureAt: nowSeed });
    prefs.exportFailureNoticeEnabled = false;
    startAutoExportScheduler();
    await flush();
    stopAutoExportScheduler();
    vi.resetModules();
    const fresh = await import('./auto-export-scheduler');
    stopFreshScheduler = fresh.stopAutoExportScheduler;
    prefs.exportFailureNoticeEnabled = true;
    fresh.startAutoExportScheduler();
    await flush();
    expect(notifyFailure).not.toHaveBeenCalled();
  });

  test('retries a native failure notice when posting rejects', async () => {
    status.mockResolvedValue({ enabled: false, lastFailureAt: nowSeed });
    notifyFailure.mockRejectedValueOnce(new Error('notification unavailable'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      startAutoExportScheduler();
      await flush();
      expect(prefs.lastExportFailureNotifiedAt).toBeNull();
      await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
      await flush();
      expect(notifyFailure).toHaveBeenCalledTimes(2);
      expect(prefs.lastExportFailureNotifiedAt).toBe(nowSeed);
    } finally {
      logged.mockRestore();
    }
  });

  test('a distinct native failure notifies after the device clock moves back', async () => {
    const native = { enabled: false, lastFailureAt: nowSeed };
    status.mockImplementation(async () => ({ ...native }));
    startAutoExportScheduler();
    await flush();
    native.lastFailureAt -= 1000;
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    await flush();
    expect(notifyFailure).toHaveBeenCalledTimes(2);
    expect(prefs.lastExportFailureNotifiedAt).toBe(native.lastFailureAt);
  });

  test('a held native notice remains held if posting rejects', async () => {
    const quiet = new Date(nowSeed);
    quiet.setHours(23, 30);
    vi.setSystemTime(quiet);
    prefs.quietHoursEnabled = true;
    status.mockResolvedValue({ enabled: false, lastFailureAt: quiet.getTime() });
    startAutoExportScheduler();
    await flush();
    stopAutoExportScheduler();
    const morning = new Date(quiet);
    morning.setDate(morning.getDate() + 1);
    morning.setHours(8, 0);
    vi.setSystemTime(morning);
    notifyFailure.mockRejectedValueOnce(new Error('notification unavailable'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      startAutoExportScheduler();
      await flush();
      expect(prefs.heldExportFailureNotice).toBe(true);
      await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
      await flush();
      expect(prefs.heldExportFailureNotice).toBe(false);
      expect(notifyFailure).toHaveBeenCalledTimes(2);
    } finally {
      logged.mockRestore();
    }
  });

  test('does not consume a native failure when its quiet-hours hold cannot persist', async () => {
    const quiet = new Date(nowSeed);
    quiet.setHours(23, 30);
    vi.setSystemTime(quiet);
    prefs.quietHoursEnabled = true;
    status.mockResolvedValue({ enabled: false, lastFailureAt: quiet.getTime() });
    const { setPreferenceDurably } = await import('$lib/data/prefs/store.svelte');
    // The production setter logs a refused write and leaves its projection unchanged.
    vi.mocked(setPreferenceDurably).mockImplementationOnce(async () => {});
    startAutoExportScheduler();
    await flush();
    expect(prefs.heldExportFailureNotice).toBe(false);
    expect(prefs.lastExportFailureNotifiedAt).toBeNull();
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    await flush();
    expect(prefs.heldExportFailureNotice).toBe(true);
    expect(prefs.lastExportFailureNotifiedAt).toBe(quiet.getTime());
    expect(notifyFailure).not.toHaveBeenCalled();
  });
});
