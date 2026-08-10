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
  import { db, todayEpochDay } from '$lib/data/db.svelte';
  import { epochDayFromISO, isoFromEpochDay } from '$lib/data/dates';
  import { ui } from '$lib/stores/ui.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Toasts from '$lib/components/Toasts.svelte';
  import DemoBar from '$lib/components/DemoBar.svelte';

  let { children } = $props();

  const DEMO = import.meta.env.DEV || import.meta.env.VITE_DEMO === '1';

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
    root.dataset.palette = db.prefs.palette;
    root.dataset.theme = db.prefs.theme === 'system' ? (systemDark ? 'dark' : 'light') : db.prefs.theme;
    document.title = db.prefs.disguise ? 'Notes' : 'Gender Diary';
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', getComputedStyle(document.body).backgroundColor);
  });

  /* First-run gate: onboarding is the entire first-run experience (F16). */
  $effect(() => {
    if (!db.prefs.onboarded && !path.startsWith('/onboarding')) goto('/onboarding');
  });

  /* Dev demo bar frame emulation via body classes. */
  $effect(() => {
    document.body.classList.toggle('has-demo-bar', DEMO);
    document.body.classList.toggle('demo-phone-frame', DEMO && ui.frame === 'phone');
  });

  /* New-entry chooser (F1). */
  let backdate = $state(isoFromEpochDay(todayEpochDay() - 1));
  function chooseToday() {
    ui.chooserOpen = false;
    goto(`/entry/new/${todayEpochDay()}`);
  }
  function chooseDate() {
    if (!backdate) return;
    ui.chooserOpen = false;
    goto(`/entry/new/${epochDayFromISO(backdate)}`);
  }
</script>

{#if DEMO}
  <DemoBar />
{/if}

<div class="app-viewport">
  <div class="app" class:disguised={db.prefs.disguise}>
    {#if !chromeless}
      <nav class="app-rail" aria-label="Main">
        <div class="rail-brand">
          <span class="brand-mark"></span><span translate="no">{db.prefs.disguise ? 'Notes' : m.app_name()}</span>
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
              max={isoFromEpochDay(todayEpochDay())}
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
