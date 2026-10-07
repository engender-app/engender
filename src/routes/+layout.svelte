<script lang="ts">
  import '$lib/theme/fonts.css';
  import '$lib/theme/base.css';
  import '$lib/theme/palettes.css';
  import '$lib/styles/app.css';
  import '$lib/styles/components.css';
  import '$lib/styles/screens.css';
  import '$lib/styles/kit.css';
  /* $lib/motion last, after the sheets it applies over (phase 5 ticket 28).
     Both files are opt-in classes a screen puts on top of a component's own
     class - .press-add on the add button, .scrim-withdraw on a scrim - and
     each declares a resting value the material animates away from. At equal
     specificity the later sheet wins, so a material that arrived before
     components.css would lose its own resting shadow or tint to whatever the
     shell declares, and animate between two states that were never designed
     as a pair. */
  import '$lib/motion/press.css';
  import '$lib/motion/materials.css';

  import { page } from '$app/state';
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
  import { tabIdentity } from '$lib/disguise/identity';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { saveBar, ui } from '$lib/stores/ui.svelte';
  import { bootState, closeJournalForLock, recoveryUnlock, startBoot } from '$lib/stores/boot.svelte';
  import {
    bootGate,
    isErrorState,
    isReadyState,
    midSessionLockApplies,
    needsOnboardingAccessMode
  } from '$lib/stores/boot-state';
  import { registerServiceWorkerAfterBoot } from '$lib/pwa/register';
  import { answerSplash, splashMayLeave } from '$lib/splash';
  import { isLocked, watchLock } from '$lib/stores/lock.svelte';
  import { isValidAndroidLaunchRoute } from '$lib/android/launch-routes';
  import { hoverHints } from '$lib/a11y/hoverHint';
  import { chromelessPath } from '$lib/navigation/chromeless';
  import { routeGate } from '$lib/navigation/routeGates';
  import { navigateWithTransition } from '$lib/navigation/navigationTransition';
  import { startBackgroundSchedulers } from '$lib/data/backgroundSchedulers';
  import { markScreenArrival } from '$lib/motion/screenArrival';

  /* Mark screen arrival at layout script execution time so initial cold-mount
     components rendering during boot treat their mount as part of screen
     arrival rather than as a panel change on a settled screen (ticket 111). */
  markScreenArrival();
  import { navigationDepth, recordNavigation, replaceRoute } from '$lib/navigation/smart-back';
  import { borrowsTab, litTabKey } from '$lib/navigation/active-tab';
  import { chromeTabOrigin, noteBorrowingArrival, noteTabVisit } from '$lib/navigation/chrome-tab-origin';
  import { restoreScroll } from '$lib/navigation/scroll-region';
  import { focusArrivedScreen } from '$lib/navigation/arrivalFocus';
  import { refreshActiveFlag } from '$lib/theme/activeFlag.svelte';
  import AppNav from '$lib/components/AppNav.svelte';
  import QuickAdd from '$lib/components/QuickAdd.svelte';
  import DeviceBoundRecovery from '$lib/components/DeviceBoundRecovery.svelte';
  import { isAndroid } from '$lib/platform';
  import AndroidKeyGate from '$lib/components/AndroidKeyGate.svelte';
  import BootFailureNotice from '$lib/components/BootFailureNotice.svelte';
  import SessionUnlock from '$lib/components/SessionUnlock.svelte';
  import JournalGate from '$lib/components/JournalGate.svelte';
  import PostRecoveryAccessMode from '$lib/components/PostRecoveryAccessMode.svelte';
  import SchemaTooNew from '$lib/components/SchemaTooNew.svelte';
  import Toasts from '$lib/components/Toasts.svelte';
  import UpdateNotice from '$lib/components/UpdateNotice.svelte';

  let { children } = $props();

  if (isAndroid()) {
    void import('$lib/android/plugin-registry').then(({ assertAndroidRuntimePluginRegistry }) => {
      assertAndroidRuntimePluginRegistry();
    });
  }

  /* Started here rather than from an $effect so that boot's first step -
     reading the mirrored theme and palette (ticket 06) - has run before the
     effect below stamps them on <html>. From an effect it would land one
     step too late and briefly undo what app.html's pre-paint script did. */
  startBoot();

  /* The gate (F13). It is asked here rather than in a route guard because
     a guard runs after navigation: `locked` has to decide what renders,
     not where the app navigates to, or the first paint of a cold start
     shows the journal for as long as the redirect takes. */
  let locked = $derived(midSessionLockApplies(bootState) && isLocked(bootState.accessMode));
  $effect(() => watchLock(closeJournalForLock));

  /* A side effect with nothing above it to order against, unlike startBoot():
     the registration is not awaited and the worker precaches the shell in the
     background, whenever it gets there - which is after boot has answered and
     the browser is idle, so the precache does not compete with the first
     screen for the connection (phase 14 pre-release ticket 13). */
  $effect(() => {
    registerServiceWorkerAfterBoot(bootState.status);
  });

  /* The passphrase gate (ticket 09) renders before the database can even
     open, the same way the lock renders instead of the app: no route shows
     journal content, because there is no journal to show yet. Unsupported
     legacy storage meets this gate's refusal screen. */
  let gate = $derived(bootGate(bootState));

  let path = $derived(page.url.pathname);

  /* A brand new install (ticket 54); routeGates.ts says why onboarding
     renders over this one gate state instead of meeting it. */
  let onboardingFirstRun = $derived(needsOnboardingAccessMode(bootState));
  let needsPassphrase = $derived(gate === 'passphrase' && !onboardingFirstRun);

  /* The same moment on Android, where nothing is typed: Keystore is holding
     the data key and wants the platform's word for who is here first
     (ticket 13). Its own gate rather than a branch inside the passphrase
     one - they share the job and none of the words. */
  let needsAuthentication = $derived(gate === 'authentication');

  let needsDeviceRecovery = $derived(gate === 'device-recovery');

  /* A recovery unlock owes the person a new access mode before the app shows
     them anything (ADR-0054, ticket sec-02). Not a gate - the journal is
     open behind this - so it sits with the lock in the chain below rather
     than with the gates above, and for the lock's own reason: instead of the
     route, not over it, so no screen mounts and no query runs behind a
     screen somebody has not finished. */
  let needsAccessModeAfterRecovery = $derived(isReadyState(bootState) && recoveryUnlock.used);
  /* Older code against a newer Journal (ticket 04). Its own screen rather
     than the boot-error notice: nothing is wrong with the Journal, and there
     is something the person can do. */
  let schemaTooNew = $derived(gate === 'schema-too-new');
  /* A boot that failed has no journal behind it, so nothing a booted app
     draws belongs on screen: the notice above <main> and its ways out are
     the whole page. Until ux-carpet 213 no gate claimed this state and
     Today mounted under the notice, greeting and mood row and all, which
     read as a boot to a person and to every walk keyed on the greeting. */
  let bootFailed = $derived(isErrorState(bootState));

  /* What is being drawn instead of the app: the gate states, which depend
     on how boot went and are this file's own. Held apart from the routes
     below because two different questions are asked of it - what chrome to
     paint, and whether a navigation happened at all
     (navigation/chromeless.ts says why). */
  let replacesApp = $derived(
    locked ||
      needsAccessModeAfterRecovery ||
      needsPassphrase ||
      needsAuthentication ||
      needsDeviceRecovery ||
      schemaTooNew ||
      bootFailed ||
      onboardingFirstRun
  );

  /* Those, plus the routes that render without chrome whoever is looking at
     them - which now includes a step the app does navigate to. */
  let chromeless = $derived(replacesApp || chromelessPath(path));

  /* How deep the app is in its own history, for the back controls that ask
     whether there is anything behind them (`smartBack`). Counted here rather
     than read off `history.state`, which carries SvelteKit's own bookkeeping
     and stopped carrying an index. After the navigation rather than before,
     so a cancelled one is never counted. */
  afterNavigate((navigation) => {
    recordNavigation(navigation.type, navigation.delta);
    /* What the gear will borrow next time it opens settings chrome
       (ADR-0076, audit item 4) - noted from every settled navigation, not
       only ones into a tab, since a screen already inside settings can
       still carry the tab it borrowed forward (chrome-tab-origin.ts). */
    if (navigation.to) noteTabVisit(litTabKey(navigation.to.url.pathname, chromeTabOrigin()));
    /* A screen you go forward to starts at the top; one history brings you
       back to starts where you left it. The scroll region is the layout's own
       element, so nothing else in the stack does this for us. */
    if (navigation.to) restoreScroll(navigation.to.url.pathname, navigation.type);
    /* And a screen that just arrived is not a screen changing (phase 9
       carpet ticket 04). Its panels are gated on reads that answer a few
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

  /* Tier 2, one screen becoming another (navigationTransition.ts). */
  onNavigate((navigation) => {
    /* Before the page changes, so the nav lights the borrowed tab from the
       first frame: a page reached through history gets back the tab it was
       opened from rather than the last one lit (chrome-tab-origin.ts). */
    const to = navigation.to?.url.pathname;
    if (to && borrowsTab(to)) noteBorrowingArrival(to, navigation.type === 'popstate');
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
    const chrome = documentChrome(prefs, {
      prefersDark: systemDark.current,
      prefersReducedMotion: systemReducedMotion.current
    });
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
      disguised: prefs.disguise,
      appName: m.app_name(),
      decoyName: m.disguise_name(),
      icon: chrome.icon
    });
    document.title = tab.title;
    document.querySelector('link[rel="icon"]')?.setAttribute('href', `${assets}/${tab.icon}`);
    document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute('href', `${assets}/apple-touch-icon${prefs.disguise ? '-notes' : ''}.png`);
    /* The installed app's identity follows the disguise preference. */
    const manifest = getLocale() === 'pl' ? chrome.manifest.replace('.webmanifest', '-pl.webmanifest') : chrome.manifest;
    document.querySelector('link[rel="manifest"]')?.setAttribute('href', `${assets}/${manifest}`);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', getComputedStyle(document.body).backgroundColor);
    /* The same answer for the native bar, which the meta above cannot reach
       (carpet ticket 154): theme-color is the installed PWA's, and the
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
    refreshActiveFlag(document, prefs.disguise);
  });

  /* Document language (pre-production audit U1). app.html ships `lang="en"`
     as a valid fallback; this stamps the resolved locale so assistive
     technology pronounces in the right language after a cold start on a
     Polish preference or a browser whose navigator.language is Polish.
     setLocale() reloads the page, so a language switch re-enters here
     with the new value rather than needing a reactive update. */
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

  /* What stops the return moment opening twice is the preference and
     nothing else (ADR-0062). The surface stamps `comingBackSeenSince` as it
     draws, so this has an answer before the person could have left it, and
     a flag latching the decision for the page load would only add a second
     guard that disagrees - it also has to be wrong for a demo build, where
     the journal underneath can be replaced without a reload.

     So this does re-read on every arrival at Home, and what makes that
     affordable is that the first read answers on its own for almost
     everybody: `readReturnGap` is eighteen bounded `MAX`es, the same read
     AreaFinish already makes on eight screens, and the five behind
     `readWhatIsWaiting` are only paid for once three weeks have passed and
     the gap is one this person has not met. The `path` check runs again
     after the awaits, because a slow read must not pull somebody off a
     screen they navigated to in the meantime.

     Nothing is navigated to on an empty answer: a gap with nothing waiting
     in it is not a return worth a screen, and the person is left on Home. */
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

  /* Auto-export and the retrospective notifications, for as long as an
     Android journal is open and unlocked (backgroundSchedulers.ts). */
  $effect(() => {
    if (isReadyState(bootState) && !locked && isAndroid()) return startBackgroundSchedulers();
  });

  /* Every Android-only effect that used to live here one at a time -
     reminder schedule sync, stock run-out reconciliation, launch-route
     consumption, visibility/focus resync, the back button, the disguise
     alias and the lock-timing mirror - now lives behind platform-sync.ts
     (phase 5 deepening ticket 04). This effect is what makes it reactive:
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
    const ready = isReadyState(bootState);
    const checkInEnabled = prefs.checkInEnabled;
    const checkInTime = prefs.checkInTime;
    const checkInAffirmationsEnabled = prefs.checkInAffirmationsEnabled;
    const hideNotificationTitles = prefs.hideNotificationTitles;
    /* Read here rather than inside platform-sync.ts for the same reason every
       preference above is: only a .svelte file has the reactivity that
       re-runs this effect, and so re-syncs the schedule, when one of them
       changes (phase 6 ticket 04's registry switches and quiet window). */
    const remindersEnabled = prefs.remindersEnabled;
    const wearElapsedEnabled = prefs.wearElapsedEnabled;
    const quietHoursEnabled = prefs.quietHoursEnabled;
    const quietHoursStart = prefs.quietHoursStart;
    const quietHoursEnd = prefs.quietHoursEnd;
    const disguise = prefs.disguise;
    /* Read here for the same reason, and it is the one preference on this
       list that reaches the native side purely to be looked at: the
       launcher icon follows the flag (ticket 50). */
    const palette = prefs.palette;
    const launcherIconShape = prefs.launcherIconShape;
    const lockAfter = prefs.lockAfter;
    const allowScreenCapture = prefs.allowScreenCapture;
    if (!ready || !isAndroid()) return;

    let cleanup: (() => void) | undefined;
    let unmounted = false;
    void Promise.all([
      import('$lib/android/platform-sync'),
      import('@capacitor/app'),
      import('$lib/reminders/android-bridge'),
      import('$lib/disguise/android-bridge'),
      import('$lib/lock/lock-timing-bridge'),
      import('$lib/lock/screen-capture-bridge'),
      import('$lib/reminders/affirmations')
    ]).then(
      ([
        { startAndroidPlatformSync },
        { App: androidBackButton },
        { androidReminders },
        { androidDisguise },
        { androidLockTiming },
        { androidScreenCapture },
        { affirmationLines }
      ]) => {
        if (unmounted) return;
        cleanup = startAndroidPlatformSync({
          isAndroid,
          isReady: () => isReadyState(bootState),
          todayEpochDay,
          prefs: {
            checkInEnabled,
            checkInTime,
            checkInAffirmationsEnabled,
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
            journalingPauses: journal.journalingPauses,
            areaStates: journal.areaStates
          },
          onTablesWritten,
          androidReminders,
          androidDisguise,
          androidLockTiming,
          androidScreenCapture,
          androidBackButton,
          // Hidden built-ins and this language's custom lines are read fresh on
          // every call (phase 5 ticket 15) rather than captured once here, so a
          // change lands on the next sync without needing this effect to restart.
          affirmationLines: () =>
            affirmationLines(
              new Set(vocabulary.affirmations.filter((a) => a.builtIn && a.hidden).map((a) => a.id)),
              vocabulary.customAffirmations(getLocale()).map((a) => a.text)
            ),
          reminderTexts: () => ({
            channelReminders: m.reminders(),
            channelCheckIn: m.checkin_title(),
            checkInTitle: m.checkin_title(),
            /* The question itself, not the Settings row's subtitle: that one
               ends in the mechanic ("skipped on days you already logged"),
               which is what a person reading the row needs and not what a
               notification should say. */
            checkInBody: m.checkin_notification_body()
          }),
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
       over it (phase 5 ticket 26). The clearance below the content is sized
       for the bar, its float gap and the system inset, and on a screen with
       no bar that is room held for nothing: it pushed a vertically-centred
       gate up by most of a bar's height. -->
  <div
    class="app"
    data-app-root
    {@attach (node) => hoverHints(node)?.destroy}
    class:disguised={prefs.disguise}
    class:is-chromeless={chromeless}
    data-boot={bootState.status}
  >
    {#if isErrorState(bootState)}
      <!-- What happened, in the person's words, and the doors that failure
           leaves (after-release ticket 09). -->
      <BootFailureNotice />
    {/if}
    <!-- Only over a Journal that is open and unlocked. The notice is not
         urgent enough to sit above a passphrase gate or a lock screen, and
         those two screens have one job each. -->
    {#if isReadyState(bootState) && !locked}
      <UpdateNotice />
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

    <!-- The scroll region and the foot a screen may ask for, stacked. The
         box is what lets the column reserve the foot's room by layout
         rather than by arithmetic: the foot is the region's flex sibling
         rather than a second pinned thing inside it, so no screen can end
         up with a control under it (carpet 26, and
         $lib/stores/saveBar.svelte for what that cost before). It is also
         what puts the pair beside the rail rather than under it at desktop
         width, where `.app` itself is a row.

         The landmark is on this box rather than on the scroll region
         inside it, because the foot moved: a screen's one commitment is
         part of the screen, and left outside <main> it would be a group of
         controls belonging to no landmark at all. -->
    <main class="app-column" class:has-savebar={saveBar.count > 0} data-app-column>
      <div class="app-main" data-app-scroll-region id="app-main" tabindex="-1">
        {#if schemaTooNew}
          <SchemaTooNew />
        {:else if bootFailed}
          <!-- Instead of the route, like the gates: the notice is above. -->
        {:else if needsPassphrase}
          <JournalGate />
        {:else if needsAuthentication}
          <AndroidKeyGate />
        {:else if needsDeviceRecovery}
          <DeviceBoundRecovery />
        {:else if needsAccessModeAfterRecovery}
          <!-- Before the lock rather than after it: a session that has just
               been recovered has nothing for a re-entry screen to ask, since
               the secret it would ask for is the one that failed. -->
          <PostRecoveryAccessMode />
        {:else if locked}
          <!-- The locked route unmounts, so its reads stop and unlocking
               returns to the same URL at the top of the screen. -->
          <SessionUnlock mode={bootState.accessMode} />
        {:else if redirectingToOnboarding}
          <!-- The effect above is already navigating here; nothing renders
               for the frame that takes, so a brand new install's first paint
               is never whatever route the URL happened to be (ticket 54). -->
        {:else}
          {@render children()}
        {/if}
      </div>
    </main>

    <QuickAdd />
    {#if ui.raisedManager}
      {#await import('$lib/components/VocabularyManagerSheets.svelte') then { default: VocabularyManagerSheets }}
        <VocabularyManagerSheets />
      {/await}
    {/if}

    <Toasts />
  </div>
</div>
