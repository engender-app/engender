<script lang="ts">
  import '$lib/theme/fonts.css';
  import '$lib/theme/base.css';
  import '$lib/theme/palettes.css';
  import '$lib/styles/app.css';
  import '$lib/styles/components.css';
  import '$lib/styles/screens.css';

  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { bootState, startBoot } from '$lib/stores/boot.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Toasts from '$lib/components/Toasts.svelte';

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

  let path = $derived(page.url.pathname);
  let chromeless = $derived(path.startsWith('/onboarding') || path === '/settings/lock');
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
    document.title = prefs.disguise ? 'Notes' : 'Gender Diary';
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
    if (bootState.status !== 'ready') return;
    if (!prefs.onboarded && !path.startsWith('/onboarding')) goto('/onboarding');
  });
  /* New-entry chooser (F1). */
  let backdate = $state(dateInputValueFromEpochDay(todayEpochDay() - 1));
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
          <span class="notice-title">Couldn't open the database</span>
          {bootState.error}
        </div>
      </div>
    {/if}
    {#if !chromeless}
      <nav class="app-rail" aria-label="Main">
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
      {@render children()}
    </main>

    {#if !chromeless}
      <nav class="app-nav" aria-label="Main">
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
