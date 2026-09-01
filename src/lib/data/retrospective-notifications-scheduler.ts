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
   15-minute check.

   The registry's two cross-class rules reach both checks below (phase 6
   ticket 04). Quiet hours need no state here: a check inside the window
   returns before writing its dedup key, so the period or day is still
   qualifying on the next check and the first one after the window ends
   notifies. That is a hold rather than a drop, out of the fifteen-minute
   cadence this file already had. The disguise is notificationText's one
   rule, which these two declared in the registry and did not apply until
   now.

   **The hold does not carry on-this-day across midnight, on purpose.** The
   default window is 22:00 to 07:00, so a day held at 23:30 is next checked
   on the following day, and `onThisDayCandidates(today)` then answers about
   *that* day. Wrapped is unaffected - a week or a month is still the offered
   period the next morning - but an on-this-day notification is about one
   specific day, and posting it at 07:00 would say "on this day" about
   yesterday. So the day's offer lapses with the day rather than arriving
   wrong, and the next qualifying day notifies normally. Nothing is lost that
   the person could have acted on: the Home card carried the same day all day
   and is what the notification only ever pointed at. */

import { journal } from '$lib/data/live/journal.svelte';
import { prefs } from '$lib/data/prefs/store.svelte';
import { m } from '$lib/paraglide/messages';
import { isAndroid } from '$lib/platform';
import { todayEpochDay } from '$lib/data/epochDay';
import { WRAPPED_ENTRY_FLOOR, offeredWrappedPeriod, type WrappedPeriod } from '$lib/data/wrapped';
import { onThisDayCandidates } from '$lib/data/on-this-day';
import { androidRetrospectiveNotifications } from '$lib/retrospective/android-bridge';
/* Relative, not `$lib`: this file's own test runs on the Node tier, where
   the alias does not resolve (ADR-0016), and both of these are pure rules
   the test wants to see actually applied rather than mocked away. */
import { mayFireAt, quietHoursOf } from '../unprompted/quietHours';
import { notificationText } from '../unprompted/notificationText';

let active = false;
let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

const CHECK_EVERY_MS = 15 * 60 * 1000;

function wrappedPeriodKey(period: Pick<WrappedPeriod, 'cadence' | 'start'>): string {
  return `${period.cadence}:${period.start}`;
}


async function checkWrapped(now: Date) {
  if (!prefs.wrappedEnabled || !prefs.wrappedNotificationsEnabled) return;
  if (!mayFireAt(now, quietHoursOf(prefs))) return;

  const period = offeredWrappedPeriod(todayEpochDay());
  const key = wrappedPeriodKey(period);
  if (prefs.lastWrappedNotifiedPeriodKey === key) return;

  const recap = await journal.stats.recap(period.start, period.end);
  if (recap.entryCount < WRAPPED_ENTRY_FLOOR) return;

  await androidRetrospectiveNotifications.notifyWrapped({
    ...notificationText(
      { title: m.wrapped(), body: m.wrapped_notification_body() },
      m.wrapped(),
      prefs.hideNotificationTitles
    ),
    route: `/wrapped/${period.cadence}`,
    channelName: m.wrapped()
  });
  prefs.lastWrappedNotifiedPeriodKey = key;
}

async function checkOnThisDay(now: Date) {
  if (!prefs.onThisDayEnabled || !prefs.onThisDayNotificationsEnabled) return;
  if (!mayFireAt(now, quietHoursOf(prefs))) return;

  const today = todayEpochDay();
  if (prefs.lastOnThisDayNotifiedEpochDay === today) return;

  // Longest lookback first (onThisDayCandidates' own order): with more than
  // one qualifying, the Home card shows all of them but a notification picks
  // one card to open, and the longest lookback is the more notable retelling.
  for (const candidate of onThisDayCandidates(today)) {
    if (!(await journal.stats.isGoodDay(candidate.epochDay))) continue;

    await androidRetrospectiveNotifications.notifyOnThisDay({
      ...notificationText(
        { title: m.on_this_day(), body: m.on_this_day_notification_body() },
        m.on_this_day(),
        prefs.hideNotificationTitles
      ),
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
    const at = new Date();
    await checkWrapped(at);
    await checkOnThisDay(at);
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
