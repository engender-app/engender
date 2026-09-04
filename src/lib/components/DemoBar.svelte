<script lang="ts">
  import { goto } from '$app/navigation';
  import Icon from './Icon.svelte';
  import { resetDemo, resetDemoFull, resetDemoComingBack, markFirstRun } from '$lib/data/demo/controls';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { frame, SIMULATED_INSETS } from '$lib/data/demo/frame.svelte';

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
    ['/wrapped/range', 'Wrapped range'],
    ['/settings', 'Settings'],
    ['/settings/tags', 'Manage tags'],
    ['/settings/reminders', 'Reminders'],
    ['/settings/reminders/new', 'Reminder editor'],
    ['/settings/milestones', 'New milestone'],
    ['/settings/dimension', 'Custom dimension'],
    ['/settings/export', 'Export & import'],
    ['/settings/photos', 'Progress photos'],
    ['/settings/labs', 'Lab results'],
    ['/timeline', 'Transition timeline'],
  ];

  function setTheme(t: 'light' | 'dark') {
    prefs.theme = t;
  }

  /* The first-run jump does not navigate. Emptying the demo journal is 150
     days of deletes through the worker and takes a second or more, and a
     goto after that await is aimed at wherever the app was when the jump
     started - so a reviewer who had walked onboarding and reached Home in
     the meantime was thrown back into it a second later (32.1).

     What moves the app is `onboarded` going false, which markFirstRun does
     on this tap: the first-run gate in +layout.svelte owns the rule that an
     app which has not been onboarded belongs on /onboarding, and it applies
     it the moment the preference changes rather than when the clear ends.
     Onboarding over a journal that is still emptying is fine - the flow
     draws no entries - and it is what has actually happened here since the
     clear became a round trip. */
  async function jump(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value;
    (e.currentTarget as HTMLSelectElement).value = '';
    if (!v) return;
    if (v === 'first-run') await markFirstRun();
    else goto(v);
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

  let failMisgendered = $state(false);
  $effect(() => {
    const root = document.documentElement;
    if (failMisgendered) root.dataset.demoFail = 'tally-misgendered';
    else delete root.dataset.demoFail;
    return () => delete root.dataset.demoFail;
  });

  /* Written onto <html> as inline custom properties, which outrank the
     env() defaults in theme/base.css without the stylesheet knowing this
     control exists. Removing them puts the app back on the real device's
     insets rather than on a hardcoded zero. */
  $effect(() => {
    const root = document.documentElement;
    const sides = ['top', 'right', 'bottom', 'left'] as const;
    if (frame.insets) {
      for (const side of sides) root.style.setProperty(`--inset-${side}`, SIMULATED_INSETS[side]);
    }
    return () => {
      for (const side of sides) root.style.removeProperty(`--inset-${side}`);
    };
  });
</script>

<div class="demo-bar">
  <span class="demo-title">Demo controls · R7</span>
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
  <!-- Forces quick add's misgendered row to fail, so the landed and the
       failed confirmations can be watched one after the other. Review only:
       QuickAdd reads it behind `__DEMO__`, and this bar is dropped from a
       production build. -->
  <div class="demo-group" role="group" aria-label="Quick add">
    <button
      class="demo-btn"
      aria-pressed={failMisgendered}
      class:is-active={failMisgendered}
      onclick={() => (failMisgendered = !failMisgendered)}>Fail misgendered</button
    >
  </div>
  <div class="demo-group" role="group" aria-label="Safe area">
    <button
      class="demo-btn"
      aria-pressed={frame.insets}
      class:is-active={frame.insets}
      onclick={() => (frame.insets = !frame.insets)}>Simulate cutout</button
    >
  </div>
  <button
    class="demo-btn"
    onclick={async () => {
      await resetDemo();
      goto('/');
    }}>Reset demo state</button
  >
  <!-- Ticket 36: the persona alone leaves most of the More hub empty, which
       is the state "Reset demo state" above still gives on purpose - this is
       the second jump, layering every other area on top for a pass that
       needs real content everywhere rather than the designed empty states. -->
  <button
    class="demo-btn"
    data-fill-every-feature
    onclick={async () => {
      await resetDemoFull();
      goto('/more');
    }}>Fill every feature</button
  >
  <!-- Ticket 05: the one state neither jump above can produce, because both
       stop on today and the return surface only exists after three weeks of
       nothing. Lands on Home rather than on /coming-back, because being
       taken there is the feature - the shell's own gate is what a reviewer
       is here to see.

       A reload rather than the `goto` its two neighbours use, and the reason
       is the gate rather than the seed. It runs when somebody arrives at
       Home, so replacing the journal underneath a page that is *already* on
       Home leaves it with nothing to react to; the other two jumps get away
       with `goto` because what they feed is live queries, which their own
       writes invalidate. A state jump that wants a boot is also the honest
       shape here: this one is pretending the app was opened after five weeks
       away. -->
  <button
    class="demo-btn"
    data-fill-coming-back
    onclick={async () => {
      await resetDemoComingBack();
      location.assign('/');
    }}>Five weeks away</button
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
