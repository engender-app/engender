<script lang="ts">
  import { goto } from '$app/navigation';
  import Icon from './Icon.svelte';
  import { resetDemo, markFirstRun } from '$lib/data/demo/controls';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { frame } from '$lib/data/demo/frame.svelte';

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

  /* Both jumps that touch data await it before navigating: clearing the
     journal is a round trip through the worker now, and onboarding rendering
     over a journal still emptying itself would show the state the jump exists
     to leave. */
  async function jump(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value;
    (e.currentTarget as HTMLSelectElement).value = '';
    if (!v) return;
    if (v === 'first-run') {
      await markFirstRun();
      goto('/onboarding');
    } else {
      goto(v);
    }
  }

  /* Both classes exist for this component: one makes room for the bar, the
     other constrains the app to a phone frame. They were toggled from
     +layout.svelte, which is the last thing outside the demo module that
     read the frame state. */
  $effect(() => {
    document.body.classList.add('has-demo-bar');
    return () => document.body.classList.remove('has-demo-bar');
  });
  $effect(() => {
    document.body.classList.toggle('demo-phone-frame', frame.mode === 'phone');
    return () => document.body.classList.remove('demo-phone-frame');
  });
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
    <button class="demo-btn" class:is-active={frame.mode === 'phone'} onclick={() => (frame.mode = 'phone')}>Phone</button>
    <button class="demo-btn" class:is-active={frame.mode === 'responsive'} onclick={() => (frame.mode = 'responsive')}>Web</button>
  </div>
  <button
    class="demo-btn"
    onclick={async () => {
      await resetDemo();
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

<style>
  /* Lived in styles/app.css, which ships. Here it belongs to the component,
     so a production build that drops DemoBar drops its styling too (ticket
     05) - verify-build.mjs greps the emitted CSS as well as the JavaScript.
     Every selector reaches outside this component, hence :global(). */
  :global(body.has-demo-bar) { display: flex; flex-direction: column; height: 100dvh; }
  :global(body.has-demo-bar .app-viewport) { flex: 1; min-height: 0; }
  :global(.demo-bar) {
  display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-sm);
  background: light-dark(#e9e5e0, #26221f);
  color: light-dark(#4a443e, #c9c2ba);
  border-bottom: 1px solid light-dark(#d0cbc4, #3a3530);
  position: relative; z-index: 60;
  }
  :global(.demo-bar .demo-title) { font-weight: var(--weight-bold); }
  :global(.demo-group) { display: inline-flex; gap: 2px; background: light-dark(#d7d2cb, #37322d); border-radius: 10px; padding: 3px; }
  :global(.demo-btn) {
  border: none; background: none; cursor: pointer;
  font: inherit; font-size: var(--text-sm); color: inherit;
  padding: 4px 12px; border-radius: 8px;
  display: inline-flex; align-items: center; gap: 6px;
  }
  :global(.demo-btn:hover) { background: light-dark(#e8e4df, #45403a); }
  :global(.demo-btn.is-active) { background: light-dark(#fdfcfb, #57504a); font-weight: var(--weight-bold); }
  :global(.demo-jump) { margin-left: auto; }
  :global(.demo-jump select) {
  font: inherit; font-size: var(--text-sm);
  padding: 5px 10px; border-radius: 8px;
  border: 1px solid light-dark(#c5bfb8, #4a443e);
  background: light-dark(#fdfcfb, #37322d); color: inherit;
  max-width: 220px;
  }

  /* phone-frame emulation: constrain the container, container queries do the rest */
  :global(body.demo-phone-frame .app-viewport) {
  width: 390px; max-height: 844px;
  margin: var(--space-4) auto;
  border-radius: 44px;
  border: 10px solid light-dark(#3a352f, #0c0a09);
  overflow: hidden;
  box-shadow: 0 24px 80px rgb(0 0 0 / 0.35);
  }
  :global(body.demo-phone-frame) { background: light-dark(#e5e1dc, #1b1815); }
</style>
