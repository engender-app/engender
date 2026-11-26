/* Everything that runs while the app is ready on Android and nowhere else:
   reminder schedule sync, medication stock run-out reconciliation, launch-route
   consumption, visibility/focus resync, the back button, the disguise alias and
   the lock-timing mirror. These seven pieces used to be seven separate effects
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
   the next one starts, so a change to e.g. `lockAfter` also re-runs the reminder
   resync and re-attaches the visibility/back-button listeners, not only the
   lock-timing sync. That is wasted work, not a behaviour change: the bridges are
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

import type { DoseSchedule, RegimenEpisode, Reminder } from '$lib/data/types';
import type { ReminderWordsContext } from '$lib/data/vocabulary/doseReminderLabel';
import type { LockAfter } from '../data/prefs/catalogue';
/* Relative, not `$lib/...`: platform-sync.test.ts's vitest config has no
   SvelteKit plugin and cannot resolve the alias, and this pure module
   (unlike buildAndroidReminderPayload below) has no reason to be mocked
   out. */
import { isWearAutoSource } from '../data/autoSource';
import type { AreaStates } from '../data/areaState';
import { unpromptedQuiet } from '../unprompted/registry';
import { quietHoursOf, type QuietHours } from '../unprompted/quietHours';
import { buildAndroidReminderPayload } from '$lib/reminders/payload';
import type { AndroidReminderSyncPayload, AndroidReminderTexts } from '$lib/reminders/android-bridge';
import type { DoseActionOutcome, PendingDoseAction } from '$lib/reminders/doseActions';
import { dismissActiveOverlay, hasActiveOverlay } from '../components/overlayLock';
import { setupBack } from '../onboarding/back';
import { cancelStepPreview, stepBack } from '../navigation/stepBack';
import { connectStepPreview, type StepBackBridge } from './step-preview';
import { resolveAndroidBackAction } from './back-navigation';

/* PlatformSyncDeps stays exported only for its own test (AU-09 test-only
   review). */
export interface PlatformSyncDeps {
  isAndroid: () => boolean;
  isReady: () => boolean;
  todayEpochDay: () => number;
  prefs: {
    checkInEnabled: boolean;
    checkInTime: string;
    /** Read by the native scheduler while the app is closed, so a pause
        holds without the app open (checkIn.ts). */
    checkInPausedThrough: number | null;
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
    /** The launcher icon follows the flag (ticket 50), which is why a
        palette change reaches this module at all. */
    palette: string;
    launcherIconShape: 'current' | 'round';
    lockAfter: LockAfter;
    allowScreenCapture: boolean;
  };
  journal: {
    reminders: { getReminders(): Promise<Reminder[]> };
    entries: { recentDays(dayCount: number): Promise<Array<{ epochDay: number }>> };
    stock: { reconcileRunOutReminders(asOfEpochDay: number): Promise<unknown> };
    /** Removes a schedule's reminders once its episode's end day has come
        (functional audit ticket 21): every write already keeps them in
        step, but an end day can arrive while the app is closed. */
    doses: {
      reconcileDoseReminders(asOfEpochDay: number): Promise<unknown>;
      getSchedules(): Promise<DoseSchedule[]>;
    };
    /** With the schedules: what a medication reminder's notification says
        it reminds about (ticket 21). */
    regimen: { getEpisodes(): Promise<RegimenEpisode[]> };
    /** Which areas are hidden or finished: finishing the wear log stops
        its elapsed prompts the same way the preference does, read here
        rather than written into a preference. */
    areaStates: { getAreaStates(): Promise<AreaStates> };
  };
  onTablesWritten: (listener: (tables: string[]) => void) => void;
  androidReminders: {
    sync(payload: AndroidReminderSyncPayload): Promise<void>;
    consumeLaunchRoute(): Promise<{ route: string | null }>;
    pendingDoseActions(): Promise<{ actions: PendingDoseAction[] }>;
    clearDoseActions(options: { ids: string[] }): Promise<void>;
  };
  /** Taken and Skip from a medication reminder's notification (functional
      audit ticket 20): `apply` writes one kept tap into the open journal
      (doseActions.ts), `confirm` tells the person what it did, and
      `resolveLaunchRoute` turns a dose reminder's route into its drug's
      dose log. Injected, like everything else here that reaches the
      journal or the screen. */
  doseActions: {
    apply(action: PendingDoseAction): Promise<DoseActionOutcome>;
    confirm(outcome: DoseActionOutcome): void;
    resolveLaunchRoute(route: string): Promise<string>;
  };
  androidDisguise: { setLauncherIdentity(options: { disguised: boolean; palette: string; shape: 'current' | 'round' }): Promise<void> };
  androidLockTiming: { setTiming(options: { timing: LockAfter }): Promise<void> };
  androidScreenCapture: { setAllowed(options: { allowed: boolean }): Promise<void> };
  androidBackButton: {
    addListener(eventName: 'backButton', listener: () => void): Promise<{ remove(): Promise<void> }>;
    minimizeApp(): Promise<void>;
  };
  /** The predictive step back (./step-preview.ts). Absent, Back works as it
      always has and nothing is drawn under the gesture. */
  androidStepBack?: StepBackBridge;
  reminderTexts: () => AndroidReminderTexts;
  /** A reminder notification's title and text (doseReminderLabel.ts),
      injected because it speaks paraglide. */
  reminderNotification: (reminder: Reminder, context: ReminderWordsContext) => { title: string; text: string };
  isValidLaunchRoute: (route: string) => boolean;
  currentPathname: () => string;
  goto: (path: string) => Promise<void> | void;
  /* Both from $lib/navigation/smart-back, injected rather than imported for
     the reason every other SvelteKit-shaped thing here is: this module runs
     in the Node tier, which has no `$app/*` (ADR-0017). */
  replaceRoute: (path: string) => Promise<void> | void;
  navigationDepth: () => number;
  isGateActive: () => boolean;
}

/** Wraps `run` so a call while one is already in flight is queued rather than
    overlapped or dropped: a write landing mid-sync still gets a fresh sync once
    the current one finishes, but two never run at once. Shared by the reminder
    schedule sync and the stock run-out reconciliation below - both need exactly
    this shape, and a second copy of the flag/queue dance had already crept in
    once before they shared it. */
/* coalescing stays exported only for its own test (AU-09 test-only review). */
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
/* schedulableReminders stays exported only for its own test (AU-09 test-only
   review). */
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
    which rows may be scheduled at all, and the latest entry's day or null
    when there is none yet.

    Quiet hours rides along as three fields rather than being applied here.
    The window has to be read against each alarm's own fire time, and those
    are computed on the Java side from the rule (ReminderPlanner), before any
    WebView exists - so what crosses the bridge is the window itself and
    QuietHours.java does the holding. */
/* assembleReminderSyncPayload stays exported only for its own test (AU-09
   test-only review). */
export function assembleReminderSyncPayload(input: {
  reminders: Reminder[];
  recentEntries: Array<{ epochDay: number }>;
  checkInEnabled: boolean;
  checkInTime: string;
  checkInPausedThrough: number | null;
  hideNotificationTitles: boolean;
  remindersEnabled: boolean;
  wearElapsedEnabled: boolean;
  /** Which areas are hidden or finished, and the day to read a finish
      against. */
  areaStates: AreaStates;
  todayEpochDay: number;
  quietHours: QuietHours;
  texts: AndroidReminderTexts;
  /** What each reminder's notification says. Without it a notification
      shows the stored title over the time, as it did before ticket 21. */
  notificationWords?: (reminder: Reminder) => { title: string; text: string };
}): AndroidReminderSyncPayload {
  const words = input.notificationWords;
  return buildAndroidReminderPayload({
    reminders: schedulableReminders(input.reminders, input).map((reminder) => (words ? { ...reminder, ...words(reminder) } : reminder)),
    checkInEnabled: input.checkInEnabled,
    checkInTime: input.checkInTime,
    checkInPausedThrough: input.checkInPausedThrough,
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
    if (!active) return;
    const deps = activeDeps();
    if (!deps.isAndroid() || !deps.isReady()) return;
    const [reminders, recentEntries, areaStates, episodes, schedules] = await Promise.all([
      deps.journal.reminders.getReminders(),
      deps.journal.entries.recentDays(1),
      deps.journal.areaStates.getAreaStates(),
      deps.journal.regimen.getEpisodes(),
      deps.journal.doses.getSchedules()
    ]);
    const context: ReminderWordsContext = { reminders, episodes, schedules, todayEpochDay: deps.todayEpochDay() };
    if (!active || currentDeps !== deps || !deps.isReady()) return;
    await deps.androidReminders.sync(
      assembleReminderSyncPayload({
        reminders,
        recentEntries,
        checkInEnabled: deps.prefs.checkInEnabled,
        checkInTime: deps.prefs.checkInTime,
        checkInPausedThrough: deps.prefs.checkInPausedThrough,
        hideNotificationTitles: deps.prefs.hideNotificationTitles,
        remindersEnabled: deps.prefs.remindersEnabled,
        wearElapsedEnabled: deps.prefs.wearElapsedEnabled,
        areaStates,
        todayEpochDay: deps.todayEpochDay(),
        quietHours: quietHoursOf(deps.prefs),
        texts: deps.reminderTexts(),
        notificationWords: (reminder) => deps.reminderNotification(reminder, context)
      })
    );
  },
  (error) => console.error('Could not sync Android reminder schedules', error)
);

/** Runs the reminder sync now, for a caller that has just changed what the
    phone holds (the old-copy retry and erase on the reminders screen). */
export function resyncReminderSchedules(): void {
  void syncReminderSchedules();
}

const reconcileStockRunOutReminders = coalescing(
  async () => {
    if (!active) return;
    const deps = activeDeps();
    if (!deps.isAndroid() || !deps.isReady()) return;
    await deps.journal.stock.reconcileRunOutReminders(deps.todayEpochDay());
  },
  (error) => console.error('Could not reconcile the medication stock run-out reminder', error)
);

const reconcileDoseReminders = coalescing(
  async () => {
    if (!active) return;
    const deps = activeDeps();
    if (!deps.isAndroid() || !deps.isReady()) return;
    await deps.journal.doses.reconcileDoseReminders(deps.todayEpochDay());
  },
  (error) => console.error('Could not reconcile the dose schedule reminders', error)
);

/* Each kept tap is applied on its own, so one that fails to write stays in
   the native store for the next pass while the rest are cleared. Cleared
   before they are confirmed: a toast for a tap that then replays would say
   the same thing twice, and the replay itself writes nothing. */
const applyPendingDoseActions = coalescing(
  async () => {
    if (!active) return;
    const deps = activeDeps();
    if (!deps.isAndroid() || !deps.isReady()) return;
    const { actions } = await deps.androidReminders.pendingDoseActions();
    const outcomes: DoseActionOutcome[] = [];
    for (const action of actions) {
      if (!active || currentDeps !== deps || !deps.isReady()) break;
      try {
        outcomes.push(await deps.doseActions.apply(action));
      } catch (error) {
        console.error('Could not apply a dose reminder action', error);
      }
    }
    if (outcomes.length === 0) return;
    await deps.androidReminders.clearDoseActions({ ids: outcomes.map((outcome) => outcome.id) });
    for (const outcome of outcomes) deps.doseActions.confirm(outcome);
  },
  (error) => console.error('Could not apply dose reminder actions', error)
);

async function consumeReminderLaunchRoute() {
  const deps = activeDeps();
  if (!deps.isAndroid() || !deps.isReady()) return;
  try {
    const { route: raw } = await deps.androidReminders.consumeLaunchRoute();
    if (!raw || !deps.isValidLaunchRoute(raw)) return;
    const route = await deps.doseActions.resolveLaunchRoute(raw);
    if (route === deps.currentPathname()) return;
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
      if (
        tables.includes('reminder') || tables.includes('entry') || tables.includes('areaState')
      ) {
        void syncReminderSchedules();
      }
    });
    deps.onTablesWritten((tables) => {
      if (tables.includes('dose') || tables.includes('stock')) void reconcileStockRunOutReminders();
    });
  }

  void syncReminderSchedules();
  void applyPendingDoseActions();
  void consumeReminderLaunchRoute();
  void reconcileStockRunOutReminders();
  void reconcileDoseReminders();

  const onVisibleOrFocused = () => {
    if (document.visibilityState !== 'visible') return;
    void syncReminderSchedules();
    void applyPendingDoseActions();
    void consumeReminderLaunchRoute();
  };
  window.addEventListener('focus', onVisibleOrFocused);
  document.addEventListener('visibilitychange', onVisibleOrFocused);
  /* MainActivity.onNewIntent calls this when a notification is touched while
     the app is already in front: nothing paused, so neither event above
     fires and the route it stored would wait for the next one. */
  const native = window as unknown as { __launchRouteFromNative?: () => void };
  native.__launchRouteFromNative = () => void consumeReminderLaunchRoute();

  let backButtonTornDown = false;
  let removeBackButtonListener: (() => void) | null = null;
  void deps.androidBackButton
    .addListener('backButton', () => {
      if (backButtonTornDown) return;
      /* A step back drawn under the gesture is committed by stepBack()
         below; anything that takes this Back before it returns the drawing
         to rest first, so it is never left half drawn. */
      if (deps.isGateActive()) {
        cancelStepPreview();
        void deps.androidBackButton.minimizeApp();
        return;
      }
      if (dismissActiveOverlay() || (window.location.pathname === '/onboarding' && setupBack())) {
        cancelStepPreview();
        return;
      }
      if (stepBack()) return;
      cancelStepPreview();
      switch (resolveAndroidBackAction(window.location.pathname, deps.navigationDepth())) {
        case 'minimize':
          void deps.androidBackButton.minimizeApp();
          return;
        case 'history-back':
          window.history.back();
          return;
        case 'go-home':
          /* Replaces rather than pushes: this is the app running out of
             history, so home should be the entry it runs out on, not a
             second one stacked on the screen it could not go back from. */
          void deps.replaceRoute('/');
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

  if (deps.isReady()) {
    void deps.androidDisguise.setLauncherIdentity({
      disguised: deps.prefs.disguise,
      palette: deps.prefs.palette,
      shape: deps.prefs.launcherIconShape
    }).catch(console.error);
    void deps.androidLockTiming.setTiming({ timing: deps.prefs.lockAfter }).catch(console.error);
    void deps.androidScreenCapture.setAllowed({ allowed: deps.prefs.allowScreenCapture }).catch(console.error);
  }

  const stopStepPreview = deps.androidStepBack
    ? connectStepPreview(deps.androidStepBack, { isGateActive: deps.isGateActive, hasActiveOverlay })
    : undefined;

  stopCurrent = () => {
    if (!active) return;
    active = false;
    stopStepPreview?.();
    window.removeEventListener('focus', onVisibleOrFocused);
    document.removeEventListener('visibilitychange', onVisibleOrFocused);
    delete native.__launchRouteFromNative;
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
/* stopAndroidPlatformSync stays exported only for its own test (AU-09
   test-only review). */
export function stopAndroidPlatformSync(): void {
  stopCurrent?.();
}
