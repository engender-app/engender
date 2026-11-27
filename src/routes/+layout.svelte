<script lang="ts">
  import '$lib/theme/fonts.css';
  import '$lib/theme/base.css';
  import '$lib/theme/palettes.css';
  import '$lib/styles/app.css';
  import '$lib/styles/components.css';
  import '$lib/styles/screens.css';
  import '$lib/styles/kit.css';
  /* $lib/motion last, after the sheets it applies over.
     Both files are opt-in classes a screen puts on top of a component's own
     class - .press-add on the add button, .scrim-withdraw on a scrim - and
     each declares a resting value the material animates away from. At equal
     specificity the later sheet wins, so a material that arrived before
     components.css would lose its own resting shadow or tint to whatever the
     shell declares, and animate between two states that were never designed
     as a pair. */
  import '$lib/motion/press.css';
  import '$lib/motion/materials.css';

  import { navigating, page } from '$app/state';
  import type { DoorPath } from '$lib/navigation/RetainedDoors.svelte';
  import { onMount, tick } from 'svelte';
  import { dropJournalScreens, dropRetainedDoors } from '$lib/motion/outgoingScreen';
  import { countPageLoad } from '$lib/document/page-load';
  import { assets } from '$app/paths';
  import { afterNavigate, goto, onNavigate } from '$app/navigation';
  import { MediaQuery } from 'svelte/reactivity';
  import { m } from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { journal, onTablesWritten } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { documentChrome } from '$lib/data/prefs/documentChrome';
  import { applyStatusBarAppearance } from '$lib/android/status-bar-bridge';
  import { leaveCovers, syncLeaveCover } from '$lib/lock/leave-cover';
  import { accessModeHasSecret } from '$lib/data/journal-access-mode';
  import { outsideDisguise, tabIdentity } from '$lib/disguise/identity';
  import { saveBar, ui } from '$lib/stores/ui.svelte';
  import { speech } from '$lib/stores/announcer.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import { bootState, browserSession, closeJournalForLock, recoveryUnlock, startBoot, watchBrowserSession } from '$lib/stores/boot.svelte';
  import {
    bootGate,
    isErrorState,
    isReadyState,
    midSessionLockApplies,
    needsOnboardingAccessMode
  } from '$lib/stores/boot-state';
  import { registerServiceWorkerAfterBoot } from '$lib/pwa/register';
  import { takeInstallRequest } from '$lib/pwa/installRequest';
  import { answerSplash, splashMayLeave } from '$lib/splash';
  import { isLocked, watchLock } from '$lib/stores/lock.svelte';
  import { isValidAndroidLaunchRoute } from '$lib/android/launch-routes';
  import { moodName } from '$lib/data/vocabulary/labels';
  import { hoverHints } from '$lib/a11y/hoverHint';
  import { trackPointerFocus } from '$lib/a11y/pointerFocus';
  import { barlessPath, chromelessPath } from '$lib/navigation/chromeless';
  import { currentDay } from '$lib/stores/today.svelte';
  import { routeGate } from '$lib/navigation/routeGates';
  import { navigateWithTransition } from '$lib/navigation/navigationTransition';
  import { startBackgroundSchedulers } from '$lib/data/backgroundSchedulers';
  import { markScreenArrival } from '$lib/motion/screenArrival';

  /* Mark screen arrival at layout script execution time so initial cold-mount
     components rendering during boot treat their mount as part of screen
     arrival rather than as a panel change on a settled screen. */
  markScreenArrival();
  import { depthAfter, navigationDepth, recordNavigation, replaceRoute, sameUrl } from '$lib/navigation/smart-back';
  import { borrowsTab, litTabKey } from '$lib/navigation/active-tab';
  import { chromeTabOrigin, noteBorrowingArrival, noteTabVisit } from '$lib/navigation/chrome-tab-origin';
  import { restoreScroll } from '$lib/navigation/scroll-region';
  import { arriveWithoutJournalText, withoutJournalText } from '$lib/navigation/journalTextParams';
  import { ACTIVE_DOOR_CONTENT } from '$lib/navigation/doorActivity';
  import { focusArrivedScreen } from '$lib/navigation/arrivalFocus';
  import { refreshActiveFlag } from '$lib/theme/activeFlag.svelte';
  import AppNav from '$lib/components/AppNav.svelte';
  import QuickAdd from '$lib/components/QuickAdd.svelte';
  import { isAndroid } from '$lib/platform';
  import AndroidKeyGate from '$lib/components/AndroidKeyGate.svelte';
  import BootFailureNotice from '$lib/components/BootFailureNotice.svelte';
  import SessionUnlock from '$lib/components/SessionUnlock.svelte';
  import JournalGate from '$lib/components/JournalGate.svelte';
  import Toasts from '$lib/components/Toasts.svelte';

  let { children } = $props();

  /* The landing site's install hand-off (installRequest.ts): read and taken
     off the address before anything can navigate, so the prompt it holds
     is listened for from the start. */
  const installAsked = takeInstallRequest();

  let RetainedDoors = $state<typeof import('$lib/navigation/RetainedDoors.svelte').default | null>(null);
  let retainedFrom = $state<string | null>(null);
  let retaining = $state(false);
  let retainedSession = $state(Symbol());

  function isMainDoor(path: string): path is DoorPath {
    return path === '/' || path === '/calendar' || path === '/stats' || path === '/more';
  }

  onMount(countPageLoad);
  onMount(() => trackPointerFocus());

  if (isAndroid()) {
    void import('$lib/android/plugin-registry').then(({ assertAndroidRuntimePluginRegistry }) => {
      assertAndroidRuntimePluginRegistry();
    });
  }

  /* Started here rather than from an $effect so that boot's first step -
     reading the mirrored theme and palette - has run before the
     effect below stamps them on <html>. From an effect it would land one
     step too late and briefly undo what app.html's pre-paint script did. */
  startBoot();

  /* The gate (F13). It is asked here rather than in a route guard because
     a guard runs after navigation: `locked` has to decide what renders,
     not where the app navigates to, or the first paint of a cold start
     shows the journal for as long as the redirect takes. */
  let locked = $derived(midSessionLockApplies(bootState) && isLocked(bootState.accessMode));
  $effect(() => {
    const stopLock = watchLock(closeJournalForLock);
    const stopSession = watchBrowserSession();
    return () => { stopSession(); stopLock(); };
  });

  /* A side effect with nothing above it to order against, unlike startBoot(): the
     registration is not awaited and the worker precaches the shell in the background,
     whenever it gets there - which is after boot has answered and the browser is idle, so
     the precache does not compete with the first screen for the connection. */
  $effect(() => {
    registerServiceWorkerAfterBoot(bootState.status);
  });

  /* The passphrase gate renders before the database can even
     open, the same way the lock renders instead of the app: no route shows
     journal content, because there is no journal to show yet. Unsupported
     legacy storage meets this gate's refusal screen. */
  let gate = $derived(bootGate(bootState));

  let path = $derived(page.url.pathname);
  let retainedPath = $derived(isMainDoor(path) ? path : null);
  // Start at the next route commit, without remounting a screen someone is using.
  $effect.pre(() => {
    if (RetainedDoors && path !== retainedFrom) retaining = true;
  });

  /* A brand new install; routeGates.ts says why onboarding
     renders over this one gate state instead of meeting it. */
  let onboardingFirstRun = $derived(needsOnboardingAccessMode(bootState));
  let needsPassphrase = $derived(gate === 'passphrase' && !onboardingFirstRun);

  /* The same moment on Android, where nothing is typed: Keystore is holding
     the data key and wants the platform's word for who is here first.
     Its own gate rather than a branch inside the passphrase
     one - they share the job and none of the words. */
  let needsAuthentication = $derived(gate === 'authentication');

  let needsDeviceRecovery = $derived(gate === 'device-recovery');

  /* A recovery unlock owes the person a new access mode before the app shows them anything
     (ADR-0054). Not a gate - the journal is open behind this - so it sits with the lock in
     the chain below rather than with the gates above, and for the lock's own reason:
     instead of the route, not over it, so no screen mounts and no query runs behind a
     screen somebody has not finished. */
  let needsAccessModeAfterRecovery = $derived(isReadyState(bootState) && recoveryUnlock.used);
  /* Older code against a newer Journal. Its own screen rather
     than the boot-error notice: nothing is wrong with the Journal, and there
     is something the person can do. */
  let schemaTooNew = $derived(gate === 'schema-too-new');
  /* A boot that failed has no journal behind it, so nothing a booted app draws belongs on
     screen: the notice above <main> and its ways out are the whole page. no gate claimed
     this state and Today mounted under the notice, greeting and mood row and all, which
     read as a boot to a person and to every walk keyed on the greeting. */
  let bootFailed = $derived(isErrorState(bootState));

  /* What is being drawn instead of the app: the gate states, which depend
     on how boot went and are this file's own. Held apart from the routes
     below because two different questions are asked of it - what chrome to
     paint, and whether a navigation happened at all
     (navigation/chromeless.ts says why). */
  let replacesApp = $derived(
    browserSession.recovering ||
    locked ||
      needsAccessModeAfterRecovery ||
      needsPassphrase ||
      needsAuthentication ||
      needsDeviceRecovery ||
      schemaTooNew ||
      bootFailed ||
      onboardingFirstRun
  );

  // Keep the lazy host between openings so a gate unmount skips sheet outros.
  let managersRequested = $state(false);
  $effect(() => {
    if (replacesApp) ui.raisedManager = null;
    else if (ui.raisedManager) managersRequested = true;
  });

  $effect.pre(() => {
    if (locked || browserSession.recovering) retainedSession = Symbol();
    // The gate cuts journal DOM immediately. End panel outros before that
    // removal, or a quick unlock can resume their detached route subtree.
    if (locked) markScreenArrival();
  });
  $effect(() => {
    if (locked) dropJournalScreens();
    else if (browserSession.recovering) dropRetainedDoors();
  });
  /* The lock screen keeps the address it locked on, so whatever journal text that address
     still carried goes before the gate shows. */
  $effect(() => {
    if (!locked) return;
    const clean = withoutJournalText(new URL(location.href));
    if (clean) void replaceRoute(clean, { noScroll: true, keepFocus: true });
  });

  /* Those, plus the routes that render without chrome whoever is looking at
     them - which now includes a step the app does navigate to. */
  let restoredDeliveryReporter = $state<ReturnType<typeof import('$lib/data/archive/restored-file-delivery').restoredFileDelivery> | null>(null);
  onMount(() => {
    if (!isAndroid()) return;
    let stopped = false;
    let removeListener: (() => Promise<void>) | undefined;
    void Promise.all([
      import('@capacitor/app'),
      import('$lib/data/archive/android-file-delivery-bridge'),
      import('$lib/data/archive/restored-file-delivery')
    ]).then(async ([{ App }, { androidFileDelivery }, { restoredFileDelivery }]) => {
      if (stopped) return;
      const reporter = restoredFileDelivery(androidFileDelivery,
        () => isReadyState(bootState) && !replacesApp,
        (result) => {
          if (result.backupAt !== undefined) {
            prefs.lastBackupAt = Math.max(prefs.lastBackupAt ?? 0, result.backupAt);
            prefs.backupNoticeDismissed = false;
          }
          toast(result.outcome === 'saved' ? m.exp_file_saved()
            : result.outcome === 'cancelled' ? m.exp_cancelled()
            : result.outcome === 'cleanup-pending' ? m.exp_cleanup_pending() : m.exp_failed());
        }, () => bootState.journal);
      restoredDeliveryReporter = reporter;
      const listener = await App.addListener('appRestoredResult', reporter.accept);
      if (stopped) { reporter.stop(); await listener.remove(); }
      else removeListener = () => listener.remove();
    });
    return () => {
      stopped = true;
      restoredDeliveryReporter?.stop();
      void removeListener?.();
    };
  });
  $effect(() => {
    if (isReadyState(bootState) && !replacesApp) void restoredDeliveryReporter?.flush();
  });

  let chromeless = $derived(replacesApp || chromelessPath(path));
  let journalShown = $derived(bootState.status === 'ready' && !replacesApp);
  /* No bottom bar: every chromeless screen, and a new entry, which is a step
     but keeps Today's retained doors mounted under it (chromeless.ts). The
     desktop rail stays for a new entry (app.css, .is-barless). */
  let barless = $derived(chromeless || barlessPath(path, currentDay()));

  /* How deep the app is in its own history, for the back controls that ask
     whether there is anything behind them (`smartBack`). Counted here rather
     than read off `history.state`, which carries SvelteKit's own bookkeeping
     and stopped carrying an index. After the navigation rather than before,
     so a cancelled one is never counted. */
  afterNavigate((navigation) => {
    recordNavigation(navigation.type, navigation.delta, sameUrl(navigation));
    /* An address naming a medication or a search (journalTextParams.ts)
       that got past hooks.client.ts - history-back onto an entry written
       before Care carried episode ids - is replaced as it lands. */
    const clean = navigation.to && arriveWithoutJournalText(navigation.to.url);
    if (clean) void replaceRoute(clean, { noScroll: true, keepFocus: true });
    /* What the gear will borrow next time it opens settings chrome - noted from every
       settled navigation, not only ones into a tab, since a screen already inside settings
       can still carry the tab it borrowed forward (chrome-tab-origin.ts). */
    if (navigation.to) noteTabVisit(litTabKey(navigation.to.url.pathname, chromeTabOrigin()));
    /* A borrowing page opened cold has no onNavigate to key it, so it keeps the tab it just
       resolved to here: back to it from Today, it lights that tab again rather than Today
       (review). */
    if (navigation.type === 'enter' && navigation.to && borrowsTab(navigation.to.url.pathname)) {
      noteBorrowingArrival(`0:${navigation.to.url.pathname}`, false);
    }
    /* A screen you go forward to starts at the top; one history brings you
       back to starts where you left it. The scroll region is the layout's own
       element, so nothing else in the stack does this for us. */
    if (navigation.to) restoreScroll(navigation.to.url, navigation.type);
    /* And a screen that just arrived is not a screen changing. Its panels are gated on reads that answer a few
       dozen milliseconds from here, so without this every one of them would
       play an entrance on the way back from the calendar and the screen
       would assemble itself in front of you. The shell is the only thing
       that knows a screen arrived; `collapse` is what asks. */
    markScreenArrival();
    /* And it says which screen it is, by focusing the screen's heading
       rather than leaving focus on the body (arrivalFocus.ts). Not on the
       first load, which is the browser's own arrival. */
    if (navigation.type !== 'enter') focusArrivedScreen(document.getElementById('app-main'));
  });

  /* The other way a screen arrives: boot handing one over. `afterNavigate`
     fires on the first load too, but that is before the journal is open, so
     the window it opens has long closed by the time Home has anything to
     draw - which would make opening the app the one arrival that yanked. */
  $effect(() => {
    void bootState.status;
    markScreenArrival();
  });

  // Gate removal is an arrival even when the URL stays unchanged. A retained
  // door can mount after the shell, so wait for its heading before handing over.
  $effect(() => {
    if (replacesApp || bootState.status !== 'ready') return;
    let cancelled = false;
    let observer: MutationObserver | undefined;
    void tick().then(() => {
      if (cancelled) return;
      const region = document.getElementById('app-main');
      if (!region) return;
      const arrive = () => {
        if (!region.querySelector(`h1${ACTIVE_DOOR_CONTENT}`)) return;
        focusArrivedScreen(region);
        observer?.disconnect();
      };
      observer = new MutationObserver(arrive);
      observer.observe(region, { childList: true, subtree: true });
      arrive();
    });
    return () => { cancelled = true; observer?.disconnect(); };
  });

  /* The width the scroll region's scrollbar takes, which is 0 now that none is drawn
     (app.css) but is still measured rather than assumed, published for the toast, which
     centres on the content column and so has to leave that strip out too (review: 5px off
     centre at 1280). Measured, since a classic scrollbar has a width only the browser knows
     and an overlay one has none. */
  function publishScrollGutter(node: HTMLElement) {
    const publish = () =>
      document.documentElement.style.setProperty('--scroll-gutter', `${node.offsetWidth - node.clientWidth}px`);
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    publish();
    return { destroy: () => observer.disconnect() };
  }

  /* Tier 2, one screen becoming another (navigationTransition.ts). */
  onNavigate((navigation) => {
    /* Before the page changes, so the nav lights the borrowed tab from the
       first frame: a page reached through history gets back the tab it was
       opened from rather than the last one lit (chrome-tab-origin.ts). */
    const to = navigation.to?.url.pathname;
    if (to && borrowsTab(to)) {
      const entry = `${depthAfter(navigation.type, navigation.delta, sameUrl(navigation))}:${to}`;
      noteBorrowingArrival(entry, navigation.type === 'popstate');
    }
    return navigateWithTransition(navigation, replacesApp);
  });

  /* Theme, palette, disguise → document. */
  const systemDark = new MediaQuery('(prefers-color-scheme: dark)');
  const systemReducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)');
  $effect(() => {
    const root = document.documentElement;
    /* The eight stamps app.html also writes before first paint, from the
       rule both adapters are held to case for case
       (prefs/documentChrome.ts, fixtures/document-chrome.json). This side
       has the live preferences and the media queries; that side has a
       mirror in localStorage and the same two queries. */
    const chrome = documentChrome(
      prefs,
      { prefersDark: systemDark.current, prefersReducedMotion: systemReducedMotion.current },
      /* Disguised, the person's flag waits for the journal. The unlock flips this inside
         openApp's view transition, so the gate is photographed in the neutral palette and
         the app in its own, and the change happens under the opening rather than as a frame
         of its own. */
      journalShown
    );
    root.dataset.palette = chrome.palette;
    root.dataset.moodPreset = chrome.moodPreset;
    root.dataset.theme = chrome.theme;
    root.dataset.a11yTextSize = chrome.a11yTextSize;
    root.dataset.a11yLegibility = chrome.a11yLegibility;
    root.dataset.a11yMotion = chrome.a11yMotion;
    /* The tab's identity, from the module every surface that names the app
       reads (disguise/identity.ts) - the rule and its reasons are there,
       and this is the wiring. */
    const tab = tabIdentity({
      disguised: outsideDisguise(prefs),
      appName: m.app_name(),
      decoyName: m.disguise_name(),
      icon: chrome.icon
    });
    document.title = tab.title;
    document.querySelector('link[rel="icon"]')?.setAttribute('href', `${assets}/${tab.icon}`);
    document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute('href', `${assets}/apple-touch-icon${outsideDisguise(prefs) ? '-notes' : ''}.png`);
    /* The installed app's identity follows the disguise preference. */
    const manifest = getLocale() === 'pl' ? chrome.manifest.replace('.webmanifest', '-pl.webmanifest') : chrome.manifest;
    document.querySelector('link[rel="manifest"]')?.setAttribute('href', `${assets}/${manifest}`);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', getComputedStyle(document.body).backgroundColor);
    /* The same answer for the native bar, which the meta above cannot reach:
       theme-color is the installed PWA's, and the
       Capacitor shell draws an edge-to-edge window whose status bar icons
       Android tints from its own DayNight resolution unless the app says
       otherwise. Here rather than beside this effect, because the value is
       `chrome.theme` - the resolution this block just made - and a second
       reader would be racing the same stamp activeFlag does below. */
    applyStatusBarAppearance(chrome.theme);
    /* Last, and inside this effect rather than beside it: the flag's stripes
       and the section colours derived from them are read off the palette and
       the theme this block has just stamped, and anything that read them for
       itself would be racing that stamp (activeFlag.svelte.ts). */
    refreshActiveFlag(document);
  });

  /* What the activity covers the window with whenever a lock is set
     (lock/leave-cover.ts): Android photographs the window before the page
     can draw its gate, so the activity has to know ahead of the leave, and
     cover with the page's own ground. After the effect above, which stamps
     the theme and palette that ground is read from. */
  $effect(() => {
    if (!isAndroid()) return;
    documentChrome(prefs, { prefersDark: systemDark.current, prefersReducedMotion: systemReducedMotion.current }, journalShown);
    const cover = leaveCovers(accessModeHasSecret(bootState.accessMode, true));
    syncLeaveCover(cover, getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  });

  /* Document language (pre-production). app.html ships `lang="en"` as a valid fallback;
     this stamps the resolved locale so assistive technology pronounces in the right
     language after a cold start on a Polish preference or a browser whose
     navigator.language is Polish. setLocale() reloads the page, so a language switch
     re-enters here with the new value rather than needing a reactive update. */
  $effect(() => {
    document.documentElement.lang = getLocale();
  });

  /* The four things owed before the route (routeGates.ts has the order
     and the reasons); the layout only does what the gate names. */
  let pendingGate = $derived(
    routeGate({
      path,
      firstRunSetup: onboardingFirstRun,
      owesAccessMode: needsAccessModeAfterRecovery,
      ready: isReadyState(bootState),
      locked,
      onboarded: prefs.onboarded
    })
  );
  let redirectingToOnboarding = $derived(onboardingFirstRun && pendingGate === 'onboarding');
  /* The first frame in app.html leaves once boot has something to show
     and the layout is showing it: a journal, a gate, onboarding or a
     failure, but not the empty step on the way to onboarding
     (lib/splash.ts). */
  $effect(() => {
    if (splashMayLeave(bootState.status, redirectingToOnboarding)) answerSplash();
  });
  $effect(() => {
    if (pendingGate === 'close-chooser') ui.chooserOpen = false;
    else if (pendingGate === 'onboarding') goto('/onboarding');
    else if (pendingGate === 'coming-back') offerComingBack();
  });

  /* comingBackSeenSince is the only repeat guard. Recheck
     on each Home arrival, including when demo replaces the journal.
     readReturnGap uses 18 bounded MAX queries. Only run the five
     readWhatIsWaiting queries for an unseen gap of at least three
     weeks. Recheck path after awaiting and stay on Home if nothing
     is waiting. */
  function offerComingBack() {
    const day = todayEpochDay();
    void import('$lib/data/comingBackReads').then(async ({ readReturnGap, readWhatIsWaiting }) => {
      const since = await readReturnGap(journal, day);
      if (since === null || prefs.comingBackSeenSince === since) return;
      if (!(await readWhatIsWaiting(journal, day, since))) return;
      if (page.url.pathname !== '/') return;
      goto('/coming-back');
    });
  }

  /* Auto-export runs while an Android journal is open and unlocked. */
  $effect(() => {
    if (isReadyState(bootState) && !locked && isAndroid()) return startBackgroundSchedulers();
  });

  $effect(() => {
    if (!isReadyState(bootState) || chromeless || ui.appOpening ||
        ui.tabMoving || navigating.to || !isAndroid()) return;
    const controller = new AbortController();
    void import('$lib/navigation/preloadDoors').then(async ({ preloadDoors, loadRetainedDoors }) => {
      await preloadDoors(controller.signal);
      if (controller.signal.aborted || RetainedDoors) return;
      const module = await loadRetainedDoors();
      if (controller.signal.aborted) return;
      retainedFrom = page.url.pathname;
      RetainedDoors = module.default;
    }).catch(() => {});
    return () => controller.abort();
  });

  /* Every Android-only effect that used to live here one at a time -
     reminder schedule sync, stock run-out reconciliation, launch-route
     consumption, visibility/focus resync, the back button, the disguise
     alias and the lock-timing mirror - now lives behind platform-sync.ts.
     This effect is what makes it reactive:
     the module itself takes no runes (ADR-0017, so it can run in the Node
     tier), so watching a preference like `disguise` for a change has to
     happen here and be handed to the module as a fresh start. Restarting
     on a preference change also re-runs the reminder resync and re-attaches
     the visibility and back-button listeners, not only the one preference
     that changed; see platform-sync.ts's own comment for why that is safe,
     and for why its two table-write subscriptions are the one thing this
     does not restart. */
  $effect(() => {
    if (!isAndroid()) return;
    // Track readiness even though Back is registered before the key arrives.
    isReadyState(bootState);
    const checkInEnabled = prefs.checkInEnabled;
    const checkInTime = prefs.checkInTime;
    const checkInPausedThrough = prefs.checkInPausedThrough;
    const hideNotificationTitles = prefs.hideNotificationTitles;
    /* Read here rather than inside platform-sync.ts for the same reason every preference
       above is: only a .svelte file has the reactivity that re-runs this effect, and so
       re-syncs the schedule, when one of them changes. */
    const remindersEnabled = prefs.remindersEnabled;
    const wearElapsedEnabled = prefs.wearElapsedEnabled;
    const quietHoursEnabled = prefs.quietHoursEnabled;
    const quietHoursStart = prefs.quietHoursStart;
    const quietHoursEnd = prefs.quietHoursEnd;
    const disguise = outsideDisguise(prefs);
    /* Read here for the same reason, and it is the one preference on this
       list that reaches the native side purely to be looked at: the
       launcher icon follows the flag. */
    const palette = prefs.palette;
    const launcherIconShape = prefs.launcherIconShape;
    const lockAfter = prefs.lockAfter;
    const allowScreenCapture = prefs.allowScreenCapture;

    let cleanup: (() => void) | undefined;
    let unmounted = false;
    void Promise.all([
      import('$lib/android/platform-sync'),
      import('@capacitor/app'),
      import('$lib/reminders/android-bridge'),
      import('$lib/disguise/android-bridge'),
      import('$lib/lock/lock-timing-bridge'),
      import('$lib/lock/screen-capture-bridge'),
      import('$lib/android/step-back-bridge'),
      import('$lib/reminders/doseActions'),
      import('$lib/reminders/doseActionToast'),
      import('$lib/data/vocabulary/doseLabels'),
      import('$lib/data/vocabulary/doseReminderLabel'),
    ]).then(
      ([
        { startAndroidPlatformSync },
        { App: androidBackButton },
        { androidReminders },
        { androidDisguise },
        { androidLockTiming },
        { androidScreenCapture },
        { androidStepBack },
        { applyPendingDoseAction, resolveDoseReminderRoute },
        { confirmDoseAction },
        { ROUTE_OPTIONS },
        { reminderNotification }
      ]) => {
        if (unmounted) return;
        cleanup = startAndroidPlatformSync({
          isAndroid,
          isReady: () => isReadyState(bootState),
          todayEpochDay,
          prefs: {
            checkInEnabled,
            checkInTime,
            checkInPausedThrough,
            hideNotificationTitles,
            remindersEnabled,
            wearElapsedEnabled,
            quietHoursEnabled,
            quietHoursStart,
            quietHoursEnd,
            disguise,
            palette,
            launcherIconShape,
            lockAfter,
            allowScreenCapture
          },
          journal: {
            reminders: journal.reminders,
            entries: journal.entries,
            stock: journal.stock,
            doses: journal.doses,
            regimen: journal.regimen,
            areaStates: journal.areaStates
          },
          onTablesWritten,
          androidReminders,
          androidDisguise,
          androidLockTiming,
          androidScreenCapture,
          doseActions: {
            apply: (action) => applyPendingDoseAction(journal, action, ROUTE_OPTIONS),
            confirm: (outcome) => confirmDoseAction(outcome, (href) => void goto(href)),
            resolveLaunchRoute: (route) => resolveDoseReminderRoute(route, journal, Date.now())
          },
          androidBackButton,
          androidStepBack,
          isGateActive: () => locked || needsPassphrase || needsAuthentication ||
            needsDeviceRecovery || needsAccessModeAfterRecovery,
          reminderTexts: () => ({
            channelReminders: m.reminders(),
            channelCheckIn: m.checkin_title(),
            checkInTitle: m.checkin_title(),
            /* The question itself, not the Settings row's subtitle: that one
               ends in the mechanic ("skipped on days you already logged"),
               which is what a person reading the row needs and not what a
               notification should say. */
            checkInBody: m.checkin_notification_body(),
            checkInMoods: [1, 2, 3, 4, 5].map(moodName),
            doseTaken: m.rem_dose_taken(),
            doseDone: m.done(),
            doseSkip: m.skip(),
            doseNoted: m.rem_dose_noted()
          }),
          reminderNotification,
          isValidLaunchRoute: isValidAndroidLaunchRoute,
          currentPathname: () => page.url.pathname,
          goto,
          replaceRoute,
          navigationDepth
        });
      }
    );

    return () => {
      unmounted = true;
      cleanup?.();
    };
  });
</script>

{#if __DEMO__}
  <!-- Imported dynamically, not at the top of the script. A static import
       binds the component's <style> to this route node's stylesheet, so
       dropping its JavaScript still left the demo bar's CSS in the
       production build. Inside a branch Rollup folds away, the import
       expression goes too, and with it the chunk and its CSS. -->
  {#await import('$lib/components/DemoBar.svelte') then { default: DemoBar }}
    <DemoBar />
  {/await}
{/if}

<div class="app-viewport" data-app-viewport>
  <!-- data-boot is what the error notice below already branches on, published
       so it can be waited for: the walkthrough suite has to let a cold start
       finish before it clears storage, or it interrupts the very writes it
       then asserts against (tests/walkthrough.test.mjs). -->
  <!-- is-chromeless is what tells the scroll region there is no bar floating
       over it. The clearance below the content is sized
       for the bar, its float gap and the system inset, and on a screen with
       no bar that is room held for nothing: it pushed a vertically-centred
       gate up by most of a bar's height. -->
  <!-- Recovery keeps forms mounted, so conceal portalled sheets with the app.
       Root opacity never transitions, including under the reduced-motion 1ms clamp. -->
  <div
    class="app"
    data-app-root
    {@attach (node) => hoverHints(node)?.destroy}
    class:is-chromeless={chromeless}
    class:is-barless={barless && !chromeless}
    data-boot={bootState.status}
    inert={browserSession.recovering}
    style:opacity={browserSession.recovering ? '0' : undefined}
    style:transition-property="none"
  >
    {#if isErrorState(bootState)}
      <!-- What happened, in the person's words, and the doors that failure
           leaves. -->
      <BootFailureNotice />
    {/if}
    <!-- Before <main>, which is what puts the rail to the left of the
         content at desktop width without an `order` (order moves boxes and
         leaves tab order where it was, so the two would disagree). On a
         phone the same markup is the floating bar, absolutely positioned,
         so its place in the document does not decide where it sits - only
         that a keyboard reaches the tabs before the screen. -->
    {#if !chromeless}
      <AppNav />
    {/if}

    <!-- The scroll region and the foot a screen may ask for, stacked. The box is what lets
         the column reserve the foot's room by layout rather than by arithmetic: the foot is
         the region's flex sibling rather than a second pinned thing inside it, so no screen
         can end up with a control under it (and $lib/stores/saveBar.svelte for what that
         cost before). It is also what puts the pair beside the rail rather than under it at
         desktop width, where `.app` itself is a row.

         The landmark is on this box rather than on the scroll region inside it, because the
         foot moved: a screen's one commitment is part of the screen, and left outside
         <main> it would be a group of controls belonging to no landmark at all. -->
    <main class="app-column" class:has-savebar={saveBar.count > 0} data-app-column>
      <div class="app-main" data-app-scroll-region id="app-main" tabindex="-1" use:publishScrollGutter
        inert={browserSession.recovering} style:display={browserSession.recovering ? 'none' : undefined}>
        {#if schemaTooNew}
          {#await import('$lib/components/SchemaTooNew.svelte') then { default: SchemaTooNew }}
            <SchemaTooNew />
          {/await}
        {:else if bootFailed}
          <!-- Instead of the route, like the gates: the notice is above. -->
        {:else if needsPassphrase}
          <JournalGate />
        {:else if needsAuthentication}
          <AndroidKeyGate />
        {:else if needsDeviceRecovery}
          {#await import('$lib/components/DeviceBoundRecovery.svelte') then { default: DeviceBoundRecovery }}
            <DeviceBoundRecovery missingAccess={bootState.status === 'needs-device-recovery' && bootState.recoveryReason === 'missing-access'} />
          {/await}
        {:else if needsAccessModeAfterRecovery}
          <!-- Before the lock rather than after it: a session that has just
               been recovered has nothing for a re-entry screen to ask, since
               the secret it would ask for is the one that failed. -->
          {#await import('$lib/components/PostRecoveryAccessMode.svelte') then { default: PostRecoveryAccessMode }}
            <PostRecoveryAccessMode />
          {/await}
        {:else if locked}
          <!-- The locked route unmounts, so its reads stop and unlocking
               returns to the same URL at the top of the screen. -->
          <SessionUnlock mode={bootState.accessMode} />
        {:else if redirectingToOnboarding}
          <!-- The effect above is already navigating here; nothing renders
               for the frame that takes, so a brand new install's first paint
               is never whatever route the URL happened to be. -->
        {:else if retaining && RetainedDoors && (!chromeless || browserSession.recovering)}
          <!-- Recovery keeps the route someone is using mounted, hidden and
               inert above, so an unsaved draft survives a BFCache restore.
               The retained doors are cached instances instead: they go
               until the journal has reopened, and come back as a new
               session, and a door being shown goes with them. Recovery
               counts as chromeless (replacesApp), so it is named here, or a
               door's page would mount afresh behind the hidden main. -->
          {#if !browserSession.recovering}
            {#key retainedSession}<RetainedDoors path={retainedPath} />{/key}
          {/if}
          {#if !retainedPath}{@render children()}{/if}
        {:else}
          {@render children()}
        {/if}
      </div>
    </main>

    <!-- The status strip (app.css): an element rather than .app's ::before,
         so a navigation's view transition can give it a group of its own. -->
    <div class="app-strip" aria-hidden="true"></div>

    <div inert={browserSession.recovering} style:display={browserSession.recovering ? 'none' : 'contents'}>
    <!-- Not while locked. The lock used to close the fan and leave quick add mounted, so
         its cards stayed in the document for their fade and a tap there in the lock's first
         frame opened the backdate sheet over the gate or queued a tally for the next
         session. Unmounted, what is still fading is inert and goes with it, and its sheets
         go at once. -->
    {#if !locked}<QuickAdd />{/if}
    {#if managersRequested && !replacesApp}
      {#await import('$lib/components/VocabularyManagerSheets.svelte') then { default: VocabularyManagerSheets }}
        <VocabularyManagerSheets />
      {/await}
    {/if}
    <!-- Over an open journal with its chrome, and never over a gate, setup
         or the unlock's opening: a new person meets it on Today once setup
         is done. Onboarded as well as chromeless, because a journal that is
         not onboarded is drawn at / for a moment before the gate moves it
         to setup. Loaded on demand, since almost no visit asks for it. -->
    {#if installAsked && isReadyState(bootState) && prefs.onboarded && !chromeless && !ui.appOpening}
      {#await import('$lib/components/InstallSheet.svelte') then { default: InstallSheet }}
        <InstallSheet />
      {/await}
    {/if}
    </div>

    <Toasts />
  </div>
  <!-- The app's voice (announcer.ts): a toast is drawn in Toasts.svelte and
       said here, because a region inserted already holding its words is often
       not read at all. These two never leave the page.

       Outside [data-app-root] on purpose. A sheet makes every child of the
       root inert while it is open (overlayLock.ts), and an inert region is
       not read, which is exactly when a failure has to be heard. Out here
       they are not part of the background at all, so the lock needs no
       exception for them.

       The urgent one is aria-live="assertive" rather than role="alert". It
       speaks the same way (an alert is an assertive, atomic live region), but
       an alert is also something a screen reader lists and a test finds by
       role, and a permanent empty one is an alert that is not there: it sat
       beside every real error notice as a second, blank "alert". -->
  <div data-live-regions style="display: contents">
    <p class="visually-hidden" role="status" data-announce>{speech.polite}</p>
    <p class="visually-hidden" aria-live="assertive" aria-atomic="true" data-announce-urgent>{speech.assertive}</p>
  </div>
</div>

<style>
  /* A toast centres in what the rail leaves, the strip the column and the sheets centre in
     too. A chromeless screen (/coming-back) has no rail to leave room for, and its column
     centres in the whole width. Here rather than in components.css because .app and
     .is-chromeless are this file's own classes. */
  @container app (min-width: 1024px) {
    .app:not(.is-chromeless) :global(.toast-stack) {
      left: calc(var(--rail-width) + var(--inset-left));
    }
  }
</style>
