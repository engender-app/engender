/* Opt-in local notifications for wrapped and on-this-day (phase 4 features
   ticket 04), modelled on auto-export-scheduler.ts rather than on the
   reminders' AlarmManager path: both checks below need a live journal read
   (recap's entry count, isGoodDay), which only JS can do, so there is no
   payload worth handing to native ahead of time. A periodic foreground check
   decides "is this due" and calls straight through to a one-shot native
   notify, the same shape auto-export's scheduled failure notice uses.

   Each feature gets at most one outstanding notification per period (wrapped)
   or per day (on-this-day) - lastWrappedNotifiedPeriodKey and
   lastOnThisDayNotifiedEpochDay are the dedup, so a period or day that stays
   qualifying for its whole freshness window is not renotified on every
   15-minute check. */

import { journal } from '$lib/data/live/journal.svelte';
import { prefs } from '$lib/data/prefs/store.svelte';
import { m } from '$lib/paraglide/messages';
import { isAndroid } from '$lib/platform';
import { todayEpochDay } from '$lib/data/epochDay';
import { WRAPPED_ENTRY_FLOOR, offeredWrappedPeriod, type WrappedPeriod } from '$lib/data/wrapped';
import { onThisDayCandidates } from '$lib/data/on-this-day';
import { androidRetrospectiveNotifications } from '$lib/retrospective/android-bridge';

let active = false;
let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

const CHECK_EVERY_MS = 15 * 60 * 1000;

function wrappedPeriodKey(period: Pick<WrappedPeriod, 'cadence' | 'start'>): string {
  return `${period.cadence}:${period.start}`;
}

async function checkWrapped() {
  if (!prefs.wrappedEnabled || !prefs.wrappedNotificationsEnabled) return;

  const period = offeredWrappedPeriod(todayEpochDay());
  const key = wrappedPeriodKey(period);
  if (prefs.lastWrappedNotifiedPeriodKey === key) return;

  const recap = await journal.stats.recap(period.start, period.end);
  if (recap.entryCount < WRAPPED_ENTRY_FLOOR) return;

  await androidRetrospectiveNotifications.notifyWrapped({
    title: m.wrapped(),
    body: m.wrapped_notification_body(),
    route: `/wrapped/${period.cadence}`,
    channelName: m.wrapped()
  });
  prefs.lastWrappedNotifiedPeriodKey = key;
}

async function checkOnThisDay() {
  if (!prefs.onThisDayEnabled || !prefs.onThisDayNotificationsEnabled) return;

  const today = todayEpochDay();
  if (prefs.lastOnThisDayNotifiedEpochDay === today) return;

  // Longest lookback first (onThisDayCandidates' own order): with more than
  // one qualifying, the Home card shows all of them but a notification picks
  // one card to open, and the longest lookback is the more notable retelling.
  for (const candidate of onThisDayCandidates(today)) {
    if (!(await journal.stats.isGoodDay(candidate.epochDay))) continue;

    await androidRetrospectiveNotifications.notifyOnThisDay({
      title: m.on_this_day(),
      body: m.on_this_day_notification_body(),
      route: `/on-this-day?lookback=${candidate.key}`,
      channelName: m.on_this_day()
    });
    prefs.lastOnThisDayNotifiedEpochDay = today;
    return;
  }
}

async function maybeRun() {
  if (!active || running || !isAndroid()) return;
  running = true;
  try {
    await checkWrapped();
    await checkOnThisDay();
  } catch (error) {
    console.error('retrospective notification check failed', error);
  } finally {
    running = false;
  }
}

export function startRetrospectiveNotificationsScheduler() {
  if (active || !isAndroid()) return;
  active = true;
  void maybeRun();
  timer = setInterval(() => void maybeRun(), CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', onVisibility);
}

export function stopRetrospectiveNotificationsScheduler() {
  if (!active) return;
  active = false;
  if (timer) clearInterval(timer);
  timer = null;
  document.removeEventListener('visibilitychange', onVisibility);
}

function onVisibility() {
  if (document.visibilityState === 'visible') void maybeRun();
}
