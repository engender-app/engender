/* Everything that runs while the app is ready on Android and nowhere else:
   reminder schedule sync, medication stock run-out reconciliation, launch-route
   consumption, visibility/focus resync, the back button, the disguise alias and
   the quick-exit mirror. These seven pieces used to be seven separate effects
   in +layout.svelte, accumulated one at a time because
   no narrower seam existed for "Android, and the journal is open" - this is that
   seam.

   Dependencies arrive as arguments rather than imports so this module can run in
   the Node tier with fakes: no Svelte runes here, `$state` is not defined
   there. Reacting to a preference such as `checkInEnabled` still needs
   real Svelte reactivity, though, and that only exists in a `.svelte` file - so
   +layout.svelte's one platform-sync effect reads every preference this module
   cares about and calls `startAndroidPlatformSync` again on any of their changes.
   Because that effect returns `stop`, Svelte tears the previous run down before
   the next one starts, so a change to e.g. `quickExit` also re-runs the reminder
   resync and re-attaches the visibility/back-button listeners, not only the
   quick-exit sync. That is wasted work, not a behaviour change: the bridges are
   themselves no-ops when nothing actually changed, and re-attaching a listener
   that was just removed is what the original effects already did whenever their
   own dependency changed.

   `onTablesWritten` (tableVersions.notify.ts) has no unsubscribe - a write
   announcer built to outlive every one of its listeners for the app's whole
   session. Subscribing to it again on every restart would leak a listener per
   preference change, compounding for as long as the app runs, so the two
   subscriptions below are the one piece that does not follow the "safe to
   repeat" rule above: each is made exactly once, guarded the same way the
   original effects guarded it with `remindersListenerAttached` and
   `stockReminderListenerAttached`. */

import type { Reminder } from '$lib/data/types';
/* Relative, not `$lib/...`: platform-sync.test.ts's vitest config has no
   SvelteKit plugin and cannot resolve the alias, and this pure module
   (unlike buildAndroidReminderPayload below) has no reason to be mocked
   out. */
import { isPausedOn } from '../data/journalingPause';
import { isWearAutoSource } from '../data/autoSource';
import type { AreaStates } from '../data/areaState';
import { unpromptedQuiet } from '../unprompted/registry';
import { quietHoursOf, type QuietHours } from '../unprompted/quietHours';
import { buildAndroidReminderPayload } from '$lib/reminders/payload';
import type { AndroidReminderSyncPayload, AndroidReminderTexts } from '$lib/reminders/android-bridge';
import { resolveAndroidBackAction } from './back-navigation';

export interface PlatformSyncDeps {
  isAndroid: () => boolean;
  isReady: () => boolean;
  todayEpochDay: () => number;
  prefs: {
    checkInEnabled: boolean;
    checkInTime: string;
    checkInAffirmationsEnabled: boolean;
    hideNotificationTitles: boolean;
    /** The unprompted registry's two reminder switches. Gated here rather
        than by editing the rows themselves: a person who
        turns reminders off keeps every rule exactly as they wrote it, and
        turning them back on schedules the same alarms again. */
    remindersEnabled: boolean;
    wearElapsedEnabled: boolean;
    quietHoursEnabled: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
    disguise: boolean;
    quickExit: boolean;
  };
  journal: {
    reminders: { getReminders(): Promise<Reminder[]> };
    entries: { recentDays(dayCount: number): Promise<Array<{ epochDay: number }>> };
    stock: { reconcileRunOutReminders(asOfEpochDay: number): Promise<void> };
    /** The journaling pause: while one covers today, the check-in prompt
        goes quiet while a journaling pause runs, without touching the
        `checkInEnabled` preference itself. */
    journalingPauses: { getPauses(): Promise<Array<{ startEpochDay: number; endEpochDay: number | null }>> };
    /** Which areas are hidden or finished: finishing the wear log stops
        its elapsed prompts the same way the preference does, and for the
        same reason the pause above is read here rather than written into
        a preference. */
    areaStates: { getAreaStates(): Promise<AreaStates> };
  };
  onTablesWritten: (listener: (tables: string[]) => void) => void;
  androidReminders: {
    sync(payload: AndroidReminderSyncPayload): Promise<void>;
    consumeLaunchRoute(): Promise<{ route: string | null }>;
  };
  androidDisguise: { setDisguised(options: { disguised: boolean }): Promise<void> };
  androidQuickExit: { setEnabled(options: { enabled: boolean }): Promise<void> };
  androidBackButton: {
    addListener(eventName: 'backButton', listener: () => void): Promise<{ remove(): Promise<void> }>;
    minimizeApp(): Promise<void>;
  };
  affirmationLines: () => string[];
  reminderTexts: () => AndroidReminderTexts;
  isValidLaunchRoute: (route: string) => boolean;
  currentPathname: () => string;
  goto: (path: string, options?: { replaceState?: boolean }) => Promise<void> | void;
}

/** Wraps `run` so a call while one is already in flight is queued rather than
    overlapped or dropped: a write landing mid-sync still gets a fresh sync once
    the current one finishes, but two never run at once. Shared by the reminder
    schedule sync and the stock run-out reconciliation below - both need exactly
    this shape, and a second copy of the flag/queue dance had already crept in
    once before they shared it. */
export function coalescing(run: () => Promise<void>, onError: (error: unknown) => void): () => void {
  let running = false;
  let queued = false;
  const start = (): void => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    run()
      .catch(onError)
      .finally(() => {
        running = false;
        if (queued) {
          queued = false;
          start();
        }
      });
  };
  return start;
}

/** Which reminder rows may actually be scheduled, given the unprompted
    registry's two switches. The rows themselves are untouched by either:
    this is the one choke point every reminder alarm
    passes through, native side included, so filtering here is what makes
    "off" mean off for the whole path rather than for whichever caller
    remembered to check.

    A wear session's elapsed prompt is an ordinary Reminder row on a `wear:`
    marker (CONTEXT.md), which is why `wearElapsedEnabled` is a filter over
    the same list rather than a producer of its own.

    Finishing the wear log takes those prompts with it. Applied here rather
    than at the call site for the reason
    above: this is where "off" is made to mean off for the native side too,
    and an area that has gone quiet is off. Which area the prompt belongs to
    is the unprompted registry's answer, not this file's. */
export function schedulableReminders(
  reminders: Reminder[],
  gates: {
    remindersEnabled: boolean;
    wearElapsedEnabled: boolean;
    areaStates: AreaStates;
    todayEpochDay: number;
  }
): Reminder[] {
  if (!gates.remindersEnabled) return [];
  const wearElapsed =
    gates.wearElapsedEnabled && !unpromptedQuiet('wear-elapsed', gates.areaStates, gates.todayEpochDay);
  if (wearElapsed) return reminders;
  return reminders.filter((reminder) => !isWearAutoSource(reminder.autoSource));
}

/** The one piece of the reminder schedule sync with an actual decision in it:
    which rows may be scheduled at all, an empty affirmation list when the
    toggle is off rather than none fetched, and the latest entry's day or null
    when there is none yet.

    Quiet hours rides along as three fields rather than being applied here.
    The window has to be read against each alarm's own fire time, and those
    are computed on the Java side from the rule (ReminderPlanner), before any
    WebView exists - so what crosses the bridge is the window itself and
    QuietHours.java does the holding. */
export function assembleReminderSyncPayload(input: {
  reminders: Reminder[];
  recentEntries: Array<{ epochDay: number }>;
  checkInEnabled: boolean;
  checkInTime: string;
  checkInAffirmationsEnabled: boolean;
  affirmationLines: string[];
  hideNotificationTitles: boolean;
  remindersEnabled: boolean;
  wearElapsedEnabled: boolean;
  /** Which areas are hidden or finished, and the day to read a finish
      against. */
  areaStates: AreaStates;
  todayEpochDay: number;
  quietHours: QuietHours;
  /** Whether a journaling pause covers today. Gated here, not by clearing
      the `checkInEnabled` preference, so the prompt resumes on its own
      once the pause ends. */
  pausedToday: boolean;
  texts: AndroidReminderTexts;
}): AndroidReminderSyncPayload {
  return buildAndroidReminderPayload({
    reminders: schedulableReminders(input.reminders, input),
    checkInEnabled: input.checkInEnabled && !input.pausedToday,
    checkInTime: input.checkInTime,
    checkInAffirmations: input.checkInAffirmationsEnabled ? input.affirmationLines : [],
    latestEntryEpochDay: input.recentEntries[0]?.epochDay ?? null,
    hideNotificationTitles: input.hideNotificationTitles,
    quietHours: input.quietHours,
    texts: input.texts
  });
}

let currentDeps: PlatformSyncDeps | null = null;

function activeDeps(): PlatformSyncDeps {
  if (!currentDeps) throw new Error('platform-sync: called before startAndroidPlatformSync');
  return currentDeps;
}

const syncReminderSchedules = coalescing(
  async () => {
    const deps = activeDeps();
    if (!deps.isAndroid() || !deps.isReady()) return;
    const [reminders, recentEntries, pauses, areaStates] = await Promise.all([
      deps.journal.reminders.getReminders(),
      deps.journal.entries.recentDays(1),
      deps.journal.journalingPauses.getPauses(),
      deps.journal.areaStates.getAreaStates()
    ]);
    await deps.androidReminders.sync(
      assembleReminderSyncPayload({
        reminders,
        recentEntries,
        checkInEnabled: deps.prefs.checkInEnabled,
        checkInTime: deps.prefs.checkInTime,
        checkInAffirmationsEnabled: deps.prefs.checkInAffirmationsEnabled,
        affirmationLines: deps.affirmationLines(),
        hideNotificationTitles: deps.prefs.hideNotificationTitles,
        remindersEnabled: deps.prefs.remindersEnabled,
        wearElapsedEnabled: deps.prefs.wearElapsedEnabled,
        areaStates,
        todayEpochDay: deps.todayEpochDay(),
        quietHours: quietHoursOf(deps.prefs),
        pausedToday: isPausedOn(pauses, deps.todayEpochDay()),
        texts: deps.reminderTexts()
      })
    );
  },
  (error) => console.error('Could not sync Android reminder schedules', error)
);

const reconcileStockRunOutReminders = coalescing(
  async () => {
    const deps = activeDeps();
    if (!deps.isAndroid() || !deps.isReady()) return;
    await deps.journal.stock.reconcileRunOutReminders(deps.todayEpochDay());
  },
  (error) => console.error('Could not reconcile the medication stock run-out reminder', error)
);

async function consumeReminderLaunchRoute() {
  const deps = activeDeps();
  if (!deps.isAndroid() || !deps.isReady()) return;
  try {
    const { route } = await deps.androidReminders.consumeLaunchRoute();
    if (!route || !deps.isValidLaunchRoute(route) || route === deps.currentPathname()) return;
    await deps.goto(route);
  } catch (error) {
    console.error('Could not consume reminder launch route', error);
  }
}

let subscribedToTableWrites = false;
let active = false;
let stopCurrent: (() => void) | null = null;

/** Starts every Android-only sync and returns the matching stop. Safe to call
    while already active - it stops the previous run first, so nothing it
    started outlives a stop. The two `onTablesWritten` subscriptions are the one
    exception: made once for the module's whole lifetime, never repeated, because
    the write announcer they register with has no way to unsubscribe them. */
export function startAndroidPlatformSync(deps: PlatformSyncDeps): () => void {
  if (active) stopAndroidPlatformSync();
  active = true;
  currentDeps = deps;

  if (!subscribedToTableWrites) {
    subscribedToTableWrites = true;
    deps.onTablesWritten((tables) => {
      if (tables.includes('reminder') || tables.includes('entry') || tables.includes('journalingPause')) {
        void syncReminderSchedules();
      }
    });
    deps.onTablesWritten((tables) => {
      if (tables.includes('dose') || tables.includes('stock')) void reconcileStockRunOutReminders();
    });
  }

  void syncReminderSchedules();
  void consumeReminderLaunchRoute();
  void reconcileStockRunOutReminders();

  const onVisibleOrFocused = () => {
    if (document.visibilityState !== 'visible') return;
    void syncReminderSchedules();
    void consumeReminderLaunchRoute();
  };
  window.addEventListener('focus', onVisibleOrFocused);
  document.addEventListener('visibilitychange', onVisibleOrFocused);

  let backButtonTornDown = false;
  let removeBackButtonListener: (() => void) | null = null;
  void deps.androidBackButton
    .addListener('backButton', () => {
      switch (resolveAndroidBackAction(window.location.pathname, window.history.length)) {
        case 'minimize':
          void deps.androidBackButton.minimizeApp();
          return;
        case 'history-back':
          window.history.back();
          return;
        case 'go-home':
          void deps.goto('/', { replaceState: true });
      }
    })
    .then((handle) => {
      if (backButtonTornDown) {
        void handle.remove();
        return;
      }
      removeBackButtonListener = () => {
        void handle.remove();
      };
    })
    .catch((error) => {
      console.error('Could not attach Android back-button handler', error);
    });

  void deps.androidDisguise.setDisguised({ disguised: deps.prefs.disguise });
  void deps.androidQuickExit.setEnabled({ enabled: deps.prefs.quickExit });

  stopCurrent = () => {
    if (!active) return;
    active = false;
    window.removeEventListener('focus', onVisibleOrFocused);
    document.removeEventListener('visibilitychange', onVisibleOrFocused);
    backButtonTornDown = true;
    removeBackButtonListener?.();
    removeBackButtonListener = null;
  };
  return stopAndroidPlatformSync;
}

/** Tears down everything the matching `startAndroidPlatformSync` started, other
    than the two permanent `onTablesWritten` subscriptions (see above - nothing
    can tear those down). A no-op when nothing is active, so it is safe to call
    from a stale reference or twice in a row. */
export function stopAndroidPlatformSync(): void {
  stopCurrent?.();
}
