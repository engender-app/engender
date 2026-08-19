import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// vitest.config.ts has no SvelteKit plugin (ADR-0017), so the `$lib` alias
// platform-sync.ts uses for buildAndroidReminderPayload does not resolve here.
// payload.test.ts already pins its copy semantics; this mock keeps that
// resolution-only, an identity pass-through so assembleReminderSyncPayload's
// own tests below still check what it decides to pass in.
vi.mock('$lib/reminders/payload', () => ({
  buildAndroidReminderPayload: (input: unknown) => input
}));

import { assembleReminderSyncPayload, coalescing, type PlatformSyncDeps } from './platform-sync';

const TEXTS = {
  channelReminders: 'Reminders',
  channelCheckIn: 'Check-in',
  checkInTitle: 'Daily check-in',
  checkInBody: 'How are you today?'
};

const REMINDER = {
  id: 'r-1',
  title: 'Estradiol patch',
  type: 'med' as const,
  time: '20:00',
  recurrence: 'EVERY_N_DAYS' as const,
  interval: 3,
  anchorEpochDay: 20300,
  epochDay: null,
  enabled: true,
  autoSource: null
};

describe('assembleReminderSyncPayload', () => {
  test('drops in an empty affirmation list when the toggle is off, regardless of what was fetched', () => {
    const payload = assembleReminderSyncPayload({
      reminders: [REMINDER],
      recentEntries: [{ epochDay: 20309 }],
      checkInEnabled: true,
      checkInTime: '21:30',
      checkInAffirmationsEnabled: false,
      affirmationLines: ['You are enough.'],
      hideNotificationTitles: false,
      texts: TEXTS
    });

    expect(payload.checkInAffirmations).toEqual([]);
  });

  test('carries the affirmation lines through when the toggle is on', () => {
    const payload = assembleReminderSyncPayload({
      reminders: [REMINDER],
      recentEntries: [{ epochDay: 20309 }],
      checkInEnabled: true,
      checkInTime: '21:30',
      checkInAffirmationsEnabled: true,
      affirmationLines: ['You are enough.', 'Your pace is the right pace.'],
      hideNotificationTitles: false,
      texts: TEXTS
    });

    expect(payload.checkInAffirmations).toEqual(['You are enough.', 'Your pace is the right pace.']);
  });

  test('takes the latest entry day from the most recent entry', () => {
    const payload = assembleReminderSyncPayload({
      reminders: [],
      recentEntries: [{ epochDay: 20309 }],
      checkInEnabled: false,
      checkInTime: '21:30',
      checkInAffirmationsEnabled: false,
      affirmationLines: [],
      hideNotificationTitles: false,
      texts: TEXTS
    });

    expect(payload.latestEntryEpochDay).toBe(20309);
  });

  test('is null when there is no entry yet', () => {
    const payload = assembleReminderSyncPayload({
      reminders: [],
      recentEntries: [],
      checkInEnabled: false,
      checkInTime: '21:30',
      checkInAffirmationsEnabled: false,
      affirmationLines: [],
      hideNotificationTitles: false,
      texts: TEXTS
    });

    expect(payload.latestEntryEpochDay).toBeNull();
  });
});

describe('coalescing', () => {
  test('queues a call that arrives while one is already running instead of overlapping or dropping it', async () => {
    let inFlight = 0;
    let concurrentPeak = 0;
    let completed = 0;
    const start = coalescing(
      async () => {
        inFlight++;
        concurrentPeak = Math.max(concurrentPeak, inFlight);
        await Promise.resolve();
        completed++;
        inFlight--;
      },
      () => {}
    );

    start();
    start();
    start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(concurrentPeak).toBe(1);
    expect(completed).toBe(2);
  });

  test('reports a failure through onError without breaking future calls', async () => {
    const errors: unknown[] = [];
    let succeed = false;
    const start = coalescing(
      async () => {
        if (!succeed) throw new Error('boom');
      },
      (error) => errors.push(error)
    );

    start();
    await Promise.resolve();
    await Promise.resolve();
    expect(errors).toHaveLength(1);

    succeed = true;
    start();
    await Promise.resolve();
    await Promise.resolve();
    expect(errors).toHaveLength(1);
  });
});

function makeDeps(overrides: Partial<PlatformSyncDeps> = {}): PlatformSyncDeps {
  return {
    isAndroid: () => true,
    isReady: () => true,
    todayEpochDay: () => 20313,
    prefs: {
      checkInEnabled: true,
      checkInTime: '21:30',
      checkInAffirmationsEnabled: false,
      hideNotificationTitles: false,
      disguise: false,
      quickExit: false
    },
    journal: {
      reminders: { getReminders: vi.fn().mockResolvedValue([REMINDER]) },
      entries: { recentDays: vi.fn().mockResolvedValue([{ epochDay: 20309 }]) },
      stock: { reconcileRunOutReminders: vi.fn().mockResolvedValue(undefined) }
    },
    onTablesWritten: vi.fn(),
    androidReminders: {
      sync: vi.fn().mockResolvedValue(undefined),
      consumeLaunchRoute: vi.fn().mockResolvedValue({ route: null })
    },
    androidDisguise: { setDisguised: vi.fn().mockResolvedValue(undefined) },
    androidQuickExit: { setEnabled: vi.fn().mockResolvedValue(undefined) },
    androidBackButton: {
      addListener: vi.fn().mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) }),
      minimizeApp: vi.fn().mockResolvedValue(undefined)
    },
    affirmationLines: () => ['You are enough.'],
    reminderTexts: () => TEXTS,
    isValidLaunchRoute: () => true,
    currentPathname: () => '/',
    goto: vi.fn(),
    ...overrides
  };
}

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

describe('startAndroidPlatformSync / stopAndroidPlatformSync', () => {
  let windowListeners: Record<string, Array<() => void>>;
  let documentListeners: Record<string, Array<() => void>>;
  // Module state (`subscribedToTableWrites`) is deliberately permanent for the
  // module's lifetime - see platform-sync.ts's own comment on why. That means
  // each test needs its own fresh copy of the module, not the one the top-level
  // `assembleReminderSyncPayload`/`coalescing` tests already imported.
  let platformSync: typeof import('./platform-sync');

  beforeEach(async () => {
    windowListeners = {};
    documentListeners = {};
    vi.stubGlobal('window', {
      location: { pathname: '/' },
      history: { length: 1, back: vi.fn() },
      addEventListener: vi.fn((event: string, listener: () => void) => {
        (windowListeners[event] ??= []).push(listener);
      }),
      removeEventListener: vi.fn((event: string, listener: () => void) => {
        windowListeners[event] = (windowListeners[event] ?? []).filter((l) => l !== listener);
      })
    });
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      addEventListener: vi.fn((event: string, listener: () => void) => {
        (documentListeners[event] ??= []).push(listener);
      }),
      removeEventListener: vi.fn((event: string, listener: () => void) => {
        documentListeners[event] = (documentListeners[event] ?? []).filter((l) => l !== listener);
      })
    });
    vi.resetModules();
    platformSync = await import('./platform-sync');
  });

  afterEach(() => {
    platformSync.stopAndroidPlatformSync();
    vi.unstubAllGlobals();
  });

  test('runs the initial reminder sync, stock reconciliation, disguise and quick-exit sync on start', async () => {
    const deps = makeDeps();
    platformSync.startAndroidPlatformSync(deps);
    await flush();

    expect(deps.androidReminders.sync).toHaveBeenCalledTimes(1);
    expect(deps.journal.stock.reconcileRunOutReminders).toHaveBeenCalledWith(20313);
    expect(deps.androidDisguise.setDisguised).toHaveBeenCalledWith({ disguised: false });
    expect(deps.androidQuickExit.setEnabled).toHaveBeenCalledWith({ enabled: false });
  });

  test('subscribes to reminder/entry and dose/stock writes exactly once, ever', async () => {
    const onTablesWritten = vi.fn();
    const firstDeps = makeDeps({ onTablesWritten });
    platformSync.startAndroidPlatformSync(firstDeps);
    await flush();
    expect(onTablesWritten).toHaveBeenCalledTimes(2);

    // A restart - as every preference change in +layout.svelte's effect
    // triggers - must not add another subscription: onTablesWritten has no
    // unsubscribe, so a second one would leak for the rest of the session.
    platformSync.stopAndroidPlatformSync();
    const secondDeps = makeDeps({ onTablesWritten });
    platformSync.startAndroidPlatformSync(secondDeps);
    await flush();
    expect(onTablesWritten).toHaveBeenCalledTimes(2);
  });

  test('resyncs reminder schedules when a reminder or entry write is announced', async () => {
    const onTablesWritten = vi.fn();
    const deps = makeDeps({ onTablesWritten });
    platformSync.startAndroidPlatformSync(deps);
    await flush();
    const notifyReminderWrites = onTablesWritten.mock.calls[0][0] as (tables: string[]) => void;

    notifyReminderWrites(['entry']);
    await flush();

    expect(deps.androidReminders.sync).toHaveBeenCalledTimes(2);
  });

  test('reconciles stock run-out reminders when a dose or stock write is announced', async () => {
    const onTablesWritten = vi.fn();
    const deps = makeDeps({ onTablesWritten });
    platformSync.startAndroidPlatformSync(deps);
    await flush();
    const notifyStockWrites = onTablesWritten.mock.calls[1][0] as (tables: string[]) => void;

    notifyStockWrites(['stock']);
    await flush();

    expect(deps.journal.stock.reconcileRunOutReminders).toHaveBeenCalledTimes(2);
  });

  test('resyncs on visibility change and consumes a pending launch route', async () => {
    const deps = makeDeps({ isValidLaunchRoute: (route) => route === '/entry/new/today' });
    (deps.androidReminders.consumeLaunchRoute as ReturnType<typeof vi.fn>).mockResolvedValue({
      route: '/entry/new/today'
    });
    platformSync.startAndroidPlatformSync(deps);
    await flush();
    expect(deps.goto).toHaveBeenCalledWith('/entry/new/today');

    (deps.goto as ReturnType<typeof vi.fn>).mockClear();
    (deps.androidReminders.sync as ReturnType<typeof vi.fn>).mockClear();
    documentListeners.visibilitychange[0]();
    await flush();

    expect(deps.androidReminders.sync).toHaveBeenCalledTimes(1);
    expect(deps.goto).toHaveBeenCalledWith('/entry/new/today');
  });

  test('leaves nothing behind after stop: every removable listener it attached is removed', async () => {
    const deps = makeDeps();
    const removeBackButtonHandle = vi.fn().mockResolvedValue(undefined);
    deps.androidBackButton.addListener = vi.fn().mockResolvedValue({ remove: removeBackButtonHandle });

    platformSync.startAndroidPlatformSync(deps);
    await flush();
    expect(windowListeners.focus).toHaveLength(1);
    expect(documentListeners.visibilitychange).toHaveLength(1);

    platformSync.stopAndroidPlatformSync();
    await flush();

    expect(windowListeners.focus ?? []).toHaveLength(0);
    expect(documentListeners.visibilitychange ?? []).toHaveLength(0);
    expect(removeBackButtonHandle).toHaveBeenCalledTimes(1);
  });

  test('stopping is a no-op when nothing is active', () => {
    expect(() => platformSync.stopAndroidPlatformSync()).not.toThrow();
  });

  test('starting again while active stops the previous run first, so nothing doubles up', async () => {
    const firstDeps = makeDeps();
    platformSync.startAndroidPlatformSync(firstDeps);
    await flush();

    const secondDeps = makeDeps();
    platformSync.startAndroidPlatformSync(secondDeps);
    await flush();

    expect(windowListeners.focus).toHaveLength(1);
    expect(documentListeners.visibilitychange).toHaveLength(1);

    platformSync.stopAndroidPlatformSync();
    await flush();
    expect(windowListeners.focus ?? []).toHaveLength(0);
    expect(documentListeners.visibilitychange ?? []).toHaveLength(0);
  });
});
