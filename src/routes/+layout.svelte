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
  import { m } from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { journal, onTablesWritten } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { documentChrome } from '$lib/data/prefs/documentChrome';
  import { tabIdentity } from '$lib/disguise/identity';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { ui } from '$lib/stores/ui.svelte';
  import { bootState, recoveryUnlock, restorePreviousJournal, startBoot } from '$lib/stores/boot.svelte';
  import {
    bootGate,
    isErrorState,
    isReadyState,
    midSessionLockApplies,
    needsOnboardingAccessMode
  } from '$lib/stores/boot-state';
  import { registerServiceWorker } from '$lib/pwa/register';
  import { isLocked, lockState, watchLock } from '$lib/stores/lock.svelte';
  import { App as AndroidAppPlugin } from '@capacitor/app';
  import { assertAndroidRuntimePluginRegistry } from '$lib/android/plugin-registry';
  import { startAndroidPlatformSync } from '$lib/android/platform-sync';
  import { isValidAndroidLaunchRoute } from '$lib/android/launch-routes';
  import { chromelessPath } from '$lib/navigation/chromeless';
  import { screenTransition } from '$lib/navigation/screen-transition';
  import { closeEntryContainer } from '$lib/motion/container.svelte';
  import { recordNavigation } from '$lib/navigation/smart-back';
  import { rememberScroll, restoreScroll } from '$lib/navigation/scroll-region';
  import { refreshActiveFlag } from '$lib/theme/activeFlag.svelte';
  import AppNav from '$lib/components/AppNav.svelte';
  import QuickAdd from '$lib/components/QuickAdd.svelte';
  import DeviceBoundRecovery from '$lib/components/DeviceBoundRecovery.svelte';
  import { isAndroid } from '$lib/platform';
  import { androidReminders } from '$lib/reminders/android-bridge';
  import { affirmationLines } from '$lib/reminders/affirmations';
  import { androidDisguise } from '$lib/disguise/android-bridge';
  import { androidQuickExit } from '$lib/lock/quick-exit-bridge';
  import AndroidKeyGate from '$lib/components/AndroidKeyGate.svelte';
  import DecoyNotes from '$lib/components/DecoyNotes.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import SessionUnlock from '$lib/components/SessionUnlock.svelte';
  import JournalGate from '$lib/components/JournalGate.svelte';
  import PostRecoveryAccessMode from '$lib/components/PostRecoveryAccessMode.svelte';
  import SchemaTooNew from '$lib/components/SchemaTooNew.svelte';
  import Toasts from '$lib/components/Toasts.svelte';
  import UpdateNotice from '$lib/components/UpdateNotice.svelte';
  import { startAutoExportScheduler, stopAutoExportScheduler } from '$lib/data/archive/auto-export-scheduler';
  import {
    startRetrospectiveNotificationsScheduler,
    stopRetrospectiveNotificationsScheduler
  } from '$lib/data/retrospective-notifications-scheduler';

  let { children } = $props();

  if (isAndroid()) {
    assertAndroidRuntimePluginRegistry();
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
  $effect(() => watchLock());

  /* A side effect with nothing above it to order against, unlike startBoot():
     the registration is not awaited and the worker precaches the shell in the
     background, whenever it gets there. */
  $effect(() => {
    registerServiceWorker();
  });

  /* The passphrase gate (ticket 09) renders before the database can even
     open, the same way the lock renders instead of the app: no route shows
     journal content, because there is no journal to show yet. Ticket 10's
     two states belong to the same gate - a conversion running, and one
     that could not start - because both are the same "there is no journal
     open yet, and here is why". */
  let gate = $derived(bootGate(bootState));

  let path = $derived(page.url.pathname);

  /* The first-run exception (ticket 54): a brand new install's very first
     boot state is `needs-setup` - nothing to unlock, nothing chosen yet -
     which used to mean the gate above painted before onboarding's own
     first-run redirect ever got a chance to run, since `prefs.onboarded`
     lives in the encrypted database this state has no database for.

     Held for the whole of `needs-setup` rather than only up to onboarding's
     own access-mode step: that step wires the same four-mode module in
     directly (ticket 53's AccessModeSetup, inside onboarding/+page.svelte)
     rather than asking this layout to hand the screen to JournalGate and
     back. Trying the handoff first is what found the reason not to - the
     `{#if}` chain below unmounts `children()` while a sibling branch
     renders, so a route given back after a detour through JournalGate
     remounts from scratch and loses every local answer onboarding was
     holding, `step` included. One route, one component instance, for the
     whole flow is what this simpler condition buys. */
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

  /* The routes that render without chrome whoever is looking at them
     (navigation/chromeless.ts) folded together with the gate states, which
     depend on how boot went and are this file's own. */
  let chromeless = $derived(
    locked ||
      needsAccessModeAfterRecovery ||
      needsPassphrase ||
      needsAuthentication ||
      needsDeviceRecovery ||
      schemaTooNew ||
      onboardingFirstRun ||
      chromelessPath(path)
  );

  /* The other half of the exception above: onboarding is a route like any
     other, so getting there needs the same redirect the returning-user
     first-run gate below uses - except this one cannot wait for
     `isReadyState`, since a state with no database is exactly what it is
     for. */
  let redirectingToOnboarding = $derived(onboardingFirstRun && !path.startsWith('/onboarding'));
  $effect(() => {
    if (redirectingToOnboarding) goto('/onboarding');
  });

  /* Tier 2 (phase 5 ticket 18): one screen becoming another.

     Driven by the View Transitions API rather than by a keyed block with
     Svelte transitions on it. A keyed block is the usual way to get an
     outgoing and an incoming screen on screen together, and it would have
     cost a remount of every page component on every navigation - including
     the ones SvelteKit deliberately reuses across a parameter change. The
     view transition captures the old frame as an image instead, so nothing
     unmounts, nothing re-queries, and the whole pair composites off the
     main thread, which is the performance contract on a mid-range phone.

     Where the API is missing the guard below returns immediately and the
     navigation is an instant cut, which is a fair substitute and the same
     one reduced motion asks for.

     The pattern itself is chosen by screen-transition.ts and lands on
     <html> as a data attribute for app.css to read - the decision is a
     table, and this is only the wiring. */
  /* How deep the app is in its own history, for the back controls that ask
     whether there is anything behind them (`smartBack`). Counted here rather
     than read off `history.state`, which carries SvelteKit's own bookkeeping
     and stopped carrying an index. After the navigation rather than before,
     so a cancelled one is never counted. */
  afterNavigate((navigation) => {
    recordNavigation(navigation.type, navigation.delta);
    /* A screen you have not read starts at the top; one you are coming back
       to starts where you left it. The scroll region is the layout's own
       element, so nothing else in the stack does this for us. */
    if (navigation.to) restoreScroll(navigation.to.url.pathname);
  });

  onNavigate((navigation) => {
    /* The bar sits above quick add's scrim so the add control stays sharp
       while the fan is up, which leaves the four tabs pressable behind it.
       Rather than making them inert - which would need the button to escape
       the bar's own stacking context - any navigation closes the fan. That
       is the right answer for every other way out of it too: a deep link, a
       notification, the back button. */
    ui.chooserOpen = false;

    /* Before the capture, while the outgoing screen can still be measured. */
    rememberScroll(navigation.from?.url.pathname);

    if (!navigation.to) return;
    const pattern = screenTransition({
      from: navigation.from?.url.pathname ?? null,
      to: navigation.to.url.pathname,
      type: navigation.type,
      delta: navigation.delta,
      isAndroid: isAndroid(),
      isChromeless: chromeless || chromelessPath(navigation.to.url.pathname)
    });
    /* Before the capture below, and on every navigation rather than only the
       animated ones: a card left wearing the container name is pulled out of
       the screen's own snapshot, so it would hold still while the rest of
       the screen slid past it. Computed first because the pattern is what
       says whether this navigation is the transform. */
    if (pattern !== 'container') closeEntryContainer();
    if (!document.startViewTransition || pattern === 'none') return;

    return new Promise((resolve) => {
      document.documentElement.dataset.nav = pattern;
      const transition = document.startViewTransition(async () => {
        resolve();
        /* Both of these reject rather than resolve when a navigation is
           superseded - a redirect landing on top of it, a second tap, a
           screen that rewrites its own URL as it mounts - and neither
           rejection means anything went wrong. Swallowed here rather than
           left to the window: an unhandled rejection per aborted navigation
           is noise that buries a real one, and the walkthrough fails the
           whole run on it. */
        await navigation.complete.catch(() => {});
        /* Before the "new" side is captured, not after: a view transition
           photographs the incoming screen the instant this callback's own
           promise resolves, and `afterNavigate` below - the only other
           caller of restoreScroll - fires as its own separate SvelteKit
           lifecycle callback with no ordering promised against that
           capture. Losing the race meant the photograph was always taken
           at scroll 0, and the real scroll position only snapped in once
           afterNavigate ran a moment later - on a screen with anything to
           scroll, the fade-in's last frame and that snap landed close
           enough together to read as one motion (Alicja, 2026-08-27, on
           the transition roadmap: "the fade-in jumps a lot of pixels").
           Restoring here as well as there is not a race fixed by luck -
           this one is provably before the capture, and afterNavigate's own
           call becomes a harmless no-op restoring the same value again. */
        if (navigation.to) restoreScroll(navigation.to.url.pathname);
      });
      void transition.finished
        .catch(() => {})
        .finally(() => delete document.documentElement.dataset.nav);
    });
  });

  /* Theme, palette, disguise → document. */
  let systemDark = $state(false);
  let systemReducedMotion = $state(false);
  $effect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    systemDark = mq.matches;
    const onChange = (e: MediaQueryListEvent) => (systemDark = e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  });
  $effect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    systemReducedMotion = mq.matches;
    const onChange = (e: MediaQueryListEvent) => (systemReducedMotion = e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  });
  $effect(() => {
    const root = document.documentElement;
    /* The eight stamps app.html also writes before first paint, from the
       rule both adapters are held to case for case
       (prefs/documentChrome.ts, fixtures/document-chrome.json). This side
       has the live preferences and the media queries; that side has a
       mirror in localStorage and the same two queries. */
    const chrome = documentChrome(prefs, {
      prefersDark: systemDark,
      prefersReducedMotion: systemReducedMotion
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
      blanked: lockState.blanked,
      appName: m.app_name(),
      icon: chrome.icon
    });
    document.title = tab.title;
    document.querySelector('link[rel="icon"]')?.setAttribute('href', `${assets}/${tab.icon}`);
    /* The installed app's identity (ticket 25). Follows the preference and
       not the blank, because quick exit is a moment and an install is not:
       what a launcher calls this app should change when someone asks for a
       disguise, not for as long as a tab is held blank. */
    document.querySelector('link[rel="manifest"]')?.setAttribute('href', `${assets}/${chrome.manifest}`);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', getComputedStyle(document.body).backgroundColor);
    /* Last, and inside this effect rather than beside it: the flag's stripes
       and the section colours derived from them are read off the palette and
       the theme this block has just stamped, and anything that read them for
       itself would be racing that stamp (activeFlag.svelte.ts). */
    refreshActiveFlag(document, prefs.disguise);
  });

  /* First-run gate: onboarding is the entire first-run experience (F16).
     Held until boot is ready, because `onboarded` lives in SQLite (ticket
     06) and is not in the small set mirrored outside it - before the
     database opens it reads as its default, which would send every
     returning user through onboarding again. */
  $effect(() => {
    if (!isReadyState(bootState) || locked) return;
    if (!prefs.onboarded && !path.startsWith('/onboarding')) goto('/onboarding');
  });

  $effect(() => {
    if (isReadyState(bootState) && !locked) {
      startAutoExportScheduler();
      return () => stopAutoExportScheduler();
    }
    stopAutoExportScheduler();
  });

  $effect(() => {
    if (isReadyState(bootState) && !locked) {
      startRetrospectiveNotificationsScheduler();
      return () => stopRetrospectiveNotificationsScheduler();
    }
    stopRetrospectiveNotificationsScheduler();
  });
  /* Putting the pre-migration copy back (ticket 04). Only reachable from the
     boot-failure notice, and only when boot found a copy to put back. */
  let restoring = $state(false);
  let restoreFailed = $state(false);
  async function restore() {
    restoring = true;
    restoreFailed = false;
    try {
      // Reloads on success, so nothing after this runs.
      await restorePreviousJournal();
    } catch (e) {
      console.error('restoring the pre-migration copy failed', e);
      restoring = false;
      restoreFailed = true;
    }
  }

  /* Every Android-only effect that used to live here one at a time -
     reminder schedule sync, stock run-out reconciliation, launch-route
     consumption, visibility/focus resync, the back button, the disguise
     alias and the quick-exit mirror - now lives behind platform-sync.ts
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
    const quickExit = prefs.quickExit;
    if (!ready) return;

    return startAndroidPlatformSync({
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
        quickExit
      },
      journal: {
        reminders: journal.reminders,
        entries: journal.entries,
        stock: journal.stock,
        journalingPauses: journal.journalingPauses
      },
      onTablesWritten,
      androidReminders,
      androidDisguise,
      androidQuickExit,
      androidBackButton: AndroidAppPlugin,
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
      goto
    });
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
    class:disguised={prefs.disguise}
    class:is-chromeless={chromeless}
    data-boot={bootState.status}
  >
    {#if isErrorState(bootState)}
      <div class="notice notice-danger" role="alert" style="margin:var(--space-3)">
        <Icon name="alert" size={20} />
        <div class="notice-body">
          <span class="notice-title">{m.boot_db_failed_title()}</span>
          {bootState.error === 'android-plaintext-journal' ? m.ak_plaintext_journal() : bootState.error}
          <!-- The way back out of a migration that could not finish (ticket
               04, ADR-0006): the copy taken before it started is still on the
               device, and this puts it back. Offered only when there is one,
               so the button never lies about having something to restore. -->
          {#if bootState.recoverable}
            <p style="margin-top:var(--space-2)" data-restore-offer>{m.boot_restore_offer()}</p>
            <button class="btn btn-soft" data-restore-previous disabled={restoring} onclick={restore}>
              <span>{restoring ? m.boot_restore_running() : m.boot_restore_action()}</span>
            </button>
            {#if restoreFailed}
              <p style="margin-top:var(--space-2)" data-restore-failed>{m.boot_restore_failed()}</p>
            {/if}
          {/if}
        </div>
      </div>
    {/if}
    <!-- Only over a Journal that is open and unlocked. The notice is not
         urgent enough to sit above a passphrase gate or a lock screen, and
         those two screens have one job each. -->
    {#if isReadyState(bootState) && !locked}
      <UpdateNotice />
    {/if}
    <!-- SH-004: without this, a keyboard user tabbed through the whole rail
         before reaching content on desktop. -->
    <a href="#app-main" class="skip-link" data-skip-link>{m.skip_to_content()}</a>
    <!-- Before <main>, which is what puts the rail to the left of the
         content at desktop width without an `order` (order moves boxes and
         leaves tab order where it was, so the two would disagree). On a
         phone the same markup is the floating bar, absolutely positioned,
         so its place in the document does not decide where it sits - only
         that a keyboard reaches the tabs before the screen, which is what
         the skip link above exists to answer. -->
    {#if !chromeless}
      <AppNav />
    {/if}

    <main class="app-main" data-app-scroll-region id="app-main" tabindex="-1">
      {#if schemaTooNew}
        <SchemaTooNew />
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
        <!-- Instead of the route, not over it: nothing below this renders,
             so no screen mounts and no query runs while the app is locked. -->
        <SessionUnlock mode={bootState.accessMode} />
      {:else if redirectingToOnboarding}
        <!-- The effect above is already navigating here; nothing renders
             for the frame that takes, so a brand new install's first paint
             is never whatever route the URL happened to be (ticket 54). -->
      {:else}
        {@render children()}
      {/if}
    </main>

    <QuickAdd />

    <Toasts />
  </div>
</div>

{#if lockState.blanked}
  {#if prefs.disguise}
    <!-- Disguised, quick exit shows the decoy home screen (ticket 30): the
         notes app the tab's name and icon already claim to be. -->
    <DecoyNotes />
  {:else}
    <!-- Quick exit (F24): the whole tab, blank, over everything. Dismissing
         it does not unlock anything - with a PIN set, what is underneath is
         the lock screen. -->
    <button
      class="quick-exit-blank"
      data-blank
      aria-label={m.quick_exit_back()}
      onclick={() => (lockState.blanked = false)}
    ></button>
  {/if}
{/if}
