<script lang="ts">
  import '$lib/theme/fonts.css';
  import '$lib/theme/base.css';
  import '$lib/theme/palettes.css';
  import '$lib/styles/app.css';
  import '$lib/styles/components.css';
  import '$lib/styles/screens.css';

  import { page } from '$app/state';
  import { assets } from '$app/paths';
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { journal, onTablesWritten } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { bootState, restorePreviousJournal, startBoot } from '$lib/stores/boot.svelte';
  import { registerServiceWorker } from '$lib/pwa/register';
  import { isLocked, lockState, watchLock } from '$lib/stores/lock.svelte';
  import DeviceBoundRecovery from '$lib/components/DeviceBoundRecovery.svelte';
  import { isAndroid } from '$lib/platform';
  import { androidReminders } from '$lib/reminders/android-bridge';
  import { buildAndroidReminderPayload } from '$lib/reminders/payload';
  import AndroidKeyGate from '$lib/components/AndroidKeyGate.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import LockScreen from '$lib/components/LockScreen.svelte';
  import PassphraseGate from '$lib/components/PassphraseGate.svelte';
  import SchemaTooNew from '$lib/components/SchemaTooNew.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Toasts from '$lib/components/Toasts.svelte';
  import UpdateNotice from '$lib/components/UpdateNotice.svelte';
  import { startAutoExportScheduler, stopAutoExportScheduler } from '$lib/data/archive/auto-export-scheduler';

  let { children } = $props();

  /* Started here rather than from an $effect so that boot's first step -
     reading the mirrored theme and palette (ticket 06) - has run before the
     effect below stamps them on <html>. From an effect it would land one
     step too late and briefly undo what app.html's pre-paint script did. */
  startBoot();

  const NAV = [
    { href: '/', key: 'home', icon: 'home', label: () => m.nav_home() },
    { href: '/calendar', key: 'calendar', icon: 'calendar', label: () => m.nav_calendar() },
    { href: '/stats', key: 'stats', icon: 'stats', label: () => m.nav_stats() },
    { href: '/settings', key: 'settings', icon: 'settings', label: () => m.nav_settings() },
  ];

  /* The gate (F13). It is asked here rather than in a route guard because
     a guard runs after navigation: `locked` has to decide what renders,
     not where the app navigates to, or the first paint of a cold start
     shows the journal for as long as the redirect takes. */
  let locked = $derived(isLocked());
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
  let needsPassphrase = $derived(
    bootState.status === 'needs-setup' ||
      bootState.status === 'needs-unlock' ||
      bootState.status === 'converting' ||
      bootState.status === 'conversion-refused'
  );

  /* The same moment on Android, where nothing is typed: Keystore is holding
     the data key and wants the platform's word for who is here first
     (ticket 13). Its own gate rather than a branch inside the passphrase
     one - they share the job and none of the words. */
  let needsAuthentication = $derived(bootState.status === 'needs-authentication');

  let needsDeviceRecovery = $derived(bootState.status === 'needs-device-recovery');
  /* Older code against a newer Journal (ticket 04). Its own screen rather
     than the boot-error notice: nothing is wrong with the Journal, and there
     is something the person can do. */
  let schemaTooNew = $derived(bootState.status === 'schema-too-new');

  let path = $derived(page.url.pathname);
  let chromeless = $derived(
    locked ||
      needsPassphrase ||
      needsAuthentication ||
      needsDeviceRecovery ||
      schemaTooNew ||
      path.startsWith('/onboarding') ||
      path === '/settings/lock'
  );
  let activeKey = $derived(
    path === '/' ? 'home'
    : path.startsWith('/calendar') || path.startsWith('/day') || path.startsWith('/search') ? 'calendar'
    : path.startsWith('/stats') || path.startsWith('/recap') ? 'stats'
    : path.startsWith('/settings') ? 'settings'
    : ''
  );

  /* Theme, palette, disguise → document. */
  let systemDark = $state(false);
  $effect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    systemDark = mq.matches;
    const onChange = (e: MediaQueryListEvent) => (systemDark = e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  });
  $effect(() => {
    const root = document.documentElement;
    root.dataset.palette = prefs.palette;
    root.dataset.theme = prefs.theme === 'system' ? (systemDark ? 'dark' : 'light') : prefs.theme;
    /* The tab's identity, decided once: a tab called "Notes" next to a trans
       flag is not disguised at all, and the icon is the half of it that
       survives a narrow tab strip, a background tab and the bookmark list.
       app.html stamps the same icon before first paint, from the same
       mirrored preference, so a disguised cold start never shows the flag. */
    const tab = lockState.blanked
      ? { title: 'New tab', icon: 'favicon-notes.svg' }
      : prefs.disguise
        ? { title: 'Notes', icon: 'favicon-notes.svg' }
        : { title: 'Gender Diary', icon: 'favicon.svg' };
    document.title = tab.title;
    document.querySelector('link[rel="icon"]')?.setAttribute('href', `${assets}/${tab.icon}`);
    /* The installed app's identity (ticket 25). Follows the preference and
       not the blank, because quick exit is a moment and an install is not:
       what a launcher calls this app should change when someone asks for a
       disguise, not for as long as a tab is held blank. */
    document
      .querySelector('link[rel="manifest"]')
      ?.setAttribute(
        'href',
        `${assets}/${prefs.disguise ? 'manifest-notes.webmanifest' : 'manifest.webmanifest'}`
      );
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', getComputedStyle(document.body).backgroundColor);
  });

  /* First-run gate: onboarding is the entire first-run experience (F16).
     Held until boot is ready, because `onboarded` lives in SQLite (ticket
     06) and is not in the small set mirrored outside it - before the
     database opens it reads as its default, which would send every
     returning user through onboarding again. */
  $effect(() => {
    if (bootState.status !== 'ready' || locked) return;
    if (!prefs.onboarded && !path.startsWith('/onboarding')) goto('/onboarding');
  });

  $effect(() => {
    if (bootState.status === 'ready' && !locked) {
      startAutoExportScheduler();
      return () => stopAutoExportScheduler();
    }
    stopAutoExportScheduler();
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

  /* New-entry chooser (F1). */
  let backdate = $state(dateInputValueFromEpochDay(todayEpochDay() - 1));
  let remindersListenerAttached = false;
  let reminderSyncRunning = false;
  let reminderSyncQueued = false;

  async function syncAndroidReminderSchedules() {
    if (!isAndroid() || bootState.status !== 'ready') return;
    if (reminderSyncRunning) {
      reminderSyncQueued = true;
      return;
    }
    reminderSyncRunning = true;
    try {
      const [reminders, recent] = await Promise.all([
        journal.reminders.getReminders(),
        journal.entries.recentDays(1)
      ]);
      await androidReminders.sync(
        buildAndroidReminderPayload({
          reminders,
          checkInEnabled: prefs.checkInEnabled,
          checkInTime: prefs.checkInTime,
          latestEntryEpochDay: recent[0]?.epochDay ?? null,
          texts: {
            channelReminders: m.reminders(),
            channelCheckIn: m.checkin_title(),
            checkInTitle: m.checkin_title(),
            checkInBody: m.checkin_sub()
          }
        })
      );
    } catch (error) {
      console.error('Could not sync Android reminder schedules', error);
    } finally {
      reminderSyncRunning = false;
      if (reminderSyncQueued) {
        reminderSyncQueued = false;
        void syncAndroidReminderSchedules();
      }
    }
  }

  async function consumeReminderLaunchRoute() {
    if (!isAndroid() || bootState.status !== 'ready') return;
    try {
      const { route } = await androidReminders.consumeLaunchRoute();
      if (!route || !isValidReminderLaunchRoute(route) || route === page.url.pathname) return;
      await goto(route);
    } catch (error) {
      console.error('Could not consume reminder launch route', error);
    }
  }

  function isValidReminderLaunchRoute(route: string) {
    return /^\/settings\/reminders(?:\/[^/]+)?$/.test(route) || /^\/entry\/new\/\d+$/.test(route);
  }

  function chooseToday() {
    ui.chooserOpen = false;
    goto(`/entry/new/${todayEpochDay()}`);
  }
  function chooseDate() {
    const day = epochDayFromDateInputValue(backdate);
    if (day == null) return;
    ui.chooserOpen = false;
    goto(`/entry/new/${day}`);
  }

  $effect(() => {
    if (!isAndroid() || bootState.status !== 'ready' || remindersListenerAttached) return;
    remindersListenerAttached = true;
    onTablesWritten((tables) => {
      if (tables.includes('reminder') || tables.includes('entry')) void syncAndroidReminderSchedules();
    });
    void syncAndroidReminderSchedules();
    void consumeReminderLaunchRoute();
  });

  $effect(() => {
    if (!isAndroid() || bootState.status !== 'ready') return;
    void prefs.checkInEnabled;
    void prefs.checkInTime;
    void syncAndroidReminderSchedules();
  });

  $effect(() => {
    if (!isAndroid() || bootState.status !== 'ready') return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void syncAndroidReminderSchedules();
      void consumeReminderLaunchRoute();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
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

<div class="app-viewport">
  <!-- data-boot is what the error notice below already branches on, published
       so it can be waited for: the walkthrough suite has to let a cold start
       finish before it clears storage, or it interrupts the very writes it
       then asserts against (tests/walkthrough.test.mjs). -->
  <div class="app" class:disguised={prefs.disguise} data-boot={bootState.status}>
    {#if bootState.status === 'error'}
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
    {#if bootState.status === 'ready' && !locked}
      <UpdateNotice />
    {/if}
    {#if !chromeless}
      <nav class="app-rail" aria-label={m.nav_main()}>
        <div class="rail-brand">
          <span class="brand-mark"></span><span translate="no">{prefs.disguise ? 'Notes' : m.app_name()}</span>
        </div>
        <div class="rail-new">
          <button class="btn btn-primary" style="width:100%" onclick={() => (ui.chooserOpen = true)}>
            <Icon name="plus" size={20} /><span>{m.new_entry()}</span>
          </button>
        </div>
        {#each NAV as item (item.key)}
          <a
            class="rail-item"
            class:is-active={activeKey === item.key}
            href={item.href}
            aria-current={activeKey === item.key ? 'page' : undefined}
          >
            <Icon name={item.icon} size={22} /><span>{item.label()}</span>
          </a>
        {/each}
      </nav>
    {/if}

    <main class="app-main">
      {#if schemaTooNew}
        <SchemaTooNew />
      {:else if needsPassphrase}
        <PassphraseGate />
      {:else if needsAuthentication}
        <AndroidKeyGate />
      {:else if needsDeviceRecovery}
        <DeviceBoundRecovery />
      {:else if locked}
        <!-- Instead of the route, not over it: nothing below this renders,
             so no screen mounts and no query runs while the app is locked. -->
        <LockScreen />
      {:else}
        {@render children()}
      {/if}
    </main>

    {#if !chromeless}
      <nav class="app-nav" aria-label={m.nav_main()}>
        {#each NAV.slice(0, 2) as item (item.key)}
          <a
            class="nav-item"
            class:is-active={activeKey === item.key}
            href={item.href}
            aria-current={activeKey === item.key ? 'page' : undefined}
          >
            <Icon name={item.icon} size={24} /><span>{item.label()}</span>
          </a>
        {/each}
        <div class="nav-fab-slot">
          <button class="nav-fab" aria-label={m.new_entry()} onclick={() => (ui.chooserOpen = true)}>
            <Icon name="plus" size={26} />
          </button>
        </div>
        {#each NAV.slice(2) as item (item.key)}
          <a
            class="nav-item"
            class:is-active={activeKey === item.key}
            href={item.href}
            aria-current={activeKey === item.key ? 'page' : undefined}
          >
            <Icon name={item.icon} size={24} /><span>{item.label()}</span>
          </a>
        {/each}
      </nav>
    {/if}

    <Sheet bind:open={ui.chooserOpen} title={m.new_entry()}>
      <h3>{m.new_entry()}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.new_entry_when()}</p>
      <div class="stack-3">
        <button class="btn btn-primary" data-choose="today" onclick={chooseToday}>
          <Icon name="sun" size={20} /><span>{m.today()}</span>
        </button>
        <div class="card" style="box-shadow:none;background:var(--surface-2)">
          <label class="field-label" for="backdate">{m.another_day()}</label>
          <div class="spread" style="margin-top:var(--space-2)">
            <input
              class="input"
              type="date"
              id="backdate"
              name="backdate"
              max={dateInputValueFromEpochDay(todayEpochDay())}
              bind:value={backdate}
            />
            <button class="btn btn-soft" data-choose="date" onclick={chooseDate}>{m.go()}</button>
          </div>
        </div>
      </div>
    </Sheet>

    <Toasts />
  </div>
</div>

{#if lockState.blanked}
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
