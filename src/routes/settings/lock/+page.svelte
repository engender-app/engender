<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import PrideAurora from '$lib/components/PrideAurora.svelte';
  import { isAndroid } from '$lib/platform';

  let pin = $state('');
  let setup = $derived(page.url.searchParams.get('setup') === '1');
  let android = $derived(isAndroid());

  function unlock() {
    pin = '';
    goto(setup ? '/settings' : '/');
  }

  function press(k: string) {
    if (pin.length >= 4) return;
    pin += k;
    if (pin.length === 4) setTimeout(unlock, 250);
  }
</script>

<div class="screen">
  <PrideAurora />
  <div class="applock">
    <div class="applock-badge"><Icon name="lock" size={30} /></div>
    <h1 class="ob-title" style="text-align:center">{setup ? 'Choose a PIN' : `Hi${prefs.name ? ', ' + prefs.name : ''}`}</h1>
    <p class="ob-text" style="text-align:center">
      {setup ? 'Four digits. You will need it every time the app opens.' : 'Enter your PIN to open your journal.'}
    </p>
    <div class="pin-dots" aria-label="PIN progress: {pin.length} of 4 digits">
      {#each [0, 1, 2, 3] as i (i)}<span class="pin-dot" class:is-filled={i < pin.length}></span>{/each}
    </div>
    <div class="pin-pad">
      {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as n (n)}
        <button class="pin-key" data-key={n} onclick={() => press(n)}>{n}</button>
      {/each}
      {#if android && !setup}
        <button class="pin-key is-ghost" data-bio aria-label="Unlock with biometrics" onclick={unlock}>
          <Icon name="fingerprint" size={26} />
        </button>
      {:else}
        <span></span>
      {/if}
      <button class="pin-key" data-key="0" onclick={() => press('0')}>0</button>
      <button class="pin-key is-ghost" data-backspace aria-label="Delete digit" onclick={() => (pin = pin.slice(0, -1))}>
        <Icon name="backspace" size={24} />
      </button>
    </div>
    {#if !setup && (prefs.lockOnLeave || prefs.quickExit)}
      <p class="muted small" style="text-align:center;margin-top:var(--space-6)">
        {prefs.lockOnLeave ? 'Locks automatically when the app goes to background. ' : ''}
        {prefs.quickExit ? 'Two-finger swipe down locks instantly.' : ''}
      </p>
    {/if}
  </div>
</div>
