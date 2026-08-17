import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const { recap, isGoodDay, notifyWrapped, notifyOnThisDay, offeredWrappedPeriod, onThisDayCandidates } = vi.hoisted(
  () => ({
    recap: vi.fn(),
    isGoodDay: vi.fn(),
    notifyWrapped: vi.fn(),
    notifyOnThisDay: vi.fn(),
    offeredWrappedPeriod: vi.fn(),
    onThisDayCandidates: vi.fn()
  })
);

const TODAY = 20313;

vi.mock('$lib/platform', () => ({ isAndroid: () => true }));
vi.mock('$lib/data/epochDay', () => ({ todayEpochDay: () => TODAY }));
vi.mock('$lib/paraglide/messages', () => ({
  m: {
    wrapped: () => 'Wrapped',
    wrapped_notification_body: () => 'Open the app to look back.',
    on_this_day: () => 'On this day',
    on_this_day_notification_body: () => 'Open the app to look back on a good day.'
  }
}));
vi.mock('$lib/data/prefs/store.svelte', () => ({
  prefs: {
    wrappedEnabled: true,
    wrappedNotificationsEnabled: true,
    onThisDayEnabled: true,
    onThisDayNotificationsEnabled: true,
    lastWrappedNotifiedPeriodKey: null as string | null,
    lastOnThisDayNotifiedEpochDay: null as number | null
  }
}));
vi.mock('$lib/data/live/journal.svelte', () => ({
  journal: { stats: { recap, isGoodDay } }
}));
vi.mock('$lib/data/wrapped', () => ({ WRAPPED_ENTRY_FLOOR: 5, offeredWrappedPeriod }));
vi.mock('$lib/data/on-this-day', () => ({ onThisDayCandidates }));
vi.mock('$lib/retrospective/android-bridge', () => ({
  androidRetrospectiveNotifications: { notifyWrapped, notifyOnThisDay }
}));

import { prefs } from '$lib/data/prefs/store.svelte';
import {
  startRetrospectiveNotificationsScheduler,
  stopRetrospectiveNotificationsScheduler
} from './retrospective-notifications-scheduler';

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

const WEEK_PERIOD = { cadence: 'week', start: 20300, end: 20306, year: 2026, month: null };

const CANDIDATES = [
  { key: 'year', epochDay: TODAY - 365 },
  { key: 'sixMonths', epochDay: TODAY - 182 },
  { key: 'month', epochDay: TODAY - 30 }
];

let nowSeed = new Date('2026-08-18T12:00:00Z').getTime();

describe('retrospective notifications scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(nowSeed));
    // resetAllMocks, not clearAllMocks: a prior test's queued
    // mockResolvedValueOnce values (e.g. isGoodDay's) can go unconsumed when
    // checkOnThisDay returns early on its first match, and clearAllMocks
    // leaves queued implementations in place - only a full reset drops them.
    vi.resetAllMocks();
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    });
    offeredWrappedPeriod.mockReturnValue(WEEK_PERIOD);
    onThisDayCandidates.mockReturnValue(CANDIDATES);
    recap.mockResolvedValue({ entryCount: 10 });
    isGoodDay.mockResolvedValue(false);
    prefs.wrappedEnabled = true;
    prefs.wrappedNotificationsEnabled = true;
    prefs.onThisDayEnabled = true;
    prefs.onThisDayNotificationsEnabled = true;
    prefs.lastWrappedNotifiedPeriodKey = null;
    prefs.lastOnThisDayNotifiedEpochDay = null;
  });

  afterEach(() => {
    stopRetrospectiveNotificationsScheduler();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test('fires a wrapped notification once entries clear the floor and records the period', async () => {
    startRetrospectiveNotificationsScheduler();
    await flush();

    expect(notifyWrapped).toHaveBeenCalledTimes(1);
    expect(notifyWrapped).toHaveBeenCalledWith(
      expect.objectContaining({ route: '/wrapped/week', title: 'Wrapped' })
    );
    expect(prefs.lastWrappedNotifiedPeriodKey).toBe('week:20300');
  });

  test('does not notify wrapped when entries are under the floor', async () => {
    recap.mockResolvedValue({ entryCount: 2 });

    startRetrospectiveNotificationsScheduler();
    await flush();

    expect(notifyWrapped).not.toHaveBeenCalled();
  });

  test('does not repeat the wrapped notification for the same period on the next check', async () => {
    startRetrospectiveNotificationsScheduler();
    await flush();
    expect(notifyWrapped).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    await flush();
    expect(notifyWrapped).toHaveBeenCalledTimes(1);
  });

  test('notifies again once a new period is offered', async () => {
    startRetrospectiveNotificationsScheduler();
    await flush();
    expect(notifyWrapped).toHaveBeenCalledTimes(1);

    offeredWrappedPeriod.mockReturnValue({ cadence: 'month', start: 20270, end: 20299, year: 2026, month: 6 });
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    await flush();

    expect(notifyWrapped).toHaveBeenCalledTimes(2);
    expect(prefs.lastWrappedNotifiedPeriodKey).toBe('month:20270');
  });

  test('does not notify wrapped when the Home-card toggle is off, even with notifications on', async () => {
    prefs.wrappedEnabled = false;

    startRetrospectiveNotificationsScheduler();
    await flush();

    expect(notifyWrapped).not.toHaveBeenCalled();
  });

  test('does not notify wrapped when the notification toggle is off', async () => {
    prefs.wrappedNotificationsEnabled = false;

    startRetrospectiveNotificationsScheduler();
    await flush();

    expect(notifyWrapped).not.toHaveBeenCalled();
  });

  test('fires an on-this-day notification for the longest qualifying lookback', async () => {
    isGoodDay.mockResolvedValueOnce(false).mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    startRetrospectiveNotificationsScheduler();
    await flush();

    expect(notifyOnThisDay).toHaveBeenCalledTimes(1);
    expect(notifyOnThisDay).toHaveBeenCalledWith(
      expect.objectContaining({ route: '/on-this-day?lookback=sixMonths', title: 'On this day' })
    );
    expect(prefs.lastOnThisDayNotifiedEpochDay).toBe(TODAY);
  });

  test('does not notify on-this-day when no lookback qualifies', async () => {
    isGoodDay.mockResolvedValue(false);

    startRetrospectiveNotificationsScheduler();
    await flush();

    expect(notifyOnThisDay).not.toHaveBeenCalled();
  });

  test('does not repeat the on-this-day notification for the same day', async () => {
    isGoodDay.mockResolvedValue(true);

    startRetrospectiveNotificationsScheduler();
    await flush();
    expect(notifyOnThisDay).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    await flush();
    expect(notifyOnThisDay).toHaveBeenCalledTimes(1);
  });

  test('does not notify on-this-day when its own Home-card toggle is off', async () => {
    isGoodDay.mockResolvedValue(true);
    prefs.onThisDayEnabled = false;

    startRetrospectiveNotificationsScheduler();
    await flush();

    expect(notifyOnThisDay).not.toHaveBeenCalled();
  });
});
