<script lang="ts">
  import { goto } from '$app/navigation';
  import Icon from './Icon.svelte';
  import { resetDemo, markFirstRun } from '$lib/data/db.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { ui } from '$lib/stores/ui.svelte';

  /* Review-only controls (dev/demo builds): theme, phone frame, reset, jump.
     The palette picker is NOT here — it lives in Settings, as in the real app. */

  const JUMPS: [string, string][] = [
    ['first-run', 'Onboarding (first run)'],
    ['/', 'Home'],
    ['/?celebrate=1', 'Home · milestone celebration'],
    ['/entry/new/today', 'Entry editor (today)'],
    ['/calendar', 'Calendar'],
    ['/day/today', 'Day detail (today)'],
    ['/search', 'Search'],
    ['/stats', 'Stats'],
    ['/recap', 'Recap'],
    ['/settings', 'Settings'],
    ['/settings/tags', 'Manage tags'],
    ['/settings/reminders', 'Reminders'],
    ['/settings/reminders/new', 'Reminder editor'],
    ['/settings/milestones', 'New milestone'],
    ['/settings/dimension', 'Custom dimension'],
    ['/settings/export', 'Export & import'],
    ['/settings/lock', 'App lock'],
    ['/settings/photos', 'Progress photos'],
    ['/settings/labs', 'Lab results'],
    ['/timeline', 'Transition timeline'],
  ];

  function setTheme(t: 'light' | 'dark') {
    prefs.theme = t;
  }

  function jump(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value;
    (e.currentTarget as HTMLSelectElement).value = '';
    if (!v) return;
    if (v === 'first-run') {
      markFirstRun();
      goto('/onboarding');
    } else {
      goto(v);
    }
  }
</script>

<div class="demo-bar">
  <span class="demo-title">Demo controls</span>
  <div class="demo-group" role="group" aria-label="Theme">
    <button class="demo-btn" class:is-active={prefs.theme === 'light'} onclick={() => setTheme('light')}>
      <Icon name="sun" size={15} /> Light
    </button>
    <button class="demo-btn" class:is-active={prefs.theme === 'dark'} onclick={() => setTheme('dark')}>
      <Icon name="moon" size={15} /> Dark
    </button>
  </div>
  <div class="demo-group" role="group" aria-label="Viewport">
    <button class="demo-btn" class:is-active={ui.frame === 'phone'} onclick={() => (ui.frame = 'phone')}>Phone</button>
    <button class="demo-btn" class:is-active={ui.frame === 'responsive'} onclick={() => (ui.frame = 'responsive')}>Web</button>
  </div>
  <button
    class="demo-btn"
    onclick={() => {
      resetDemo();
      goto('/');
    }}>Reset demo state</button
  >
  <div class="demo-jump">
    <label class="visually-hidden" for="demo-jump">Jump to screen</label>
    <select id="demo-jump" onchange={jump}>
      <option value="">Jump to screen…</option>
      {#each JUMPS as [href, label] (href)}<option value={href}>{label}</option>{/each}
    </select>
  </div>
</div>
