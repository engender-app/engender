<script lang="ts">
  /* The PIN pad, in both of its jobs: the gate the layout renders instead
     of the app (ticket 17), and the setup flow reached from Settings and
     from onboarding. One component, because the keypad, the throttle and
     the reset action are the same in both and had already drifted once
     when they were two.

     Copy rule for this screen (ADR-0014): the PIN keeps the app shut, it
     does not encrypt anything. Nothing here may suggest otherwise. */

  import { prefs } from '$lib/data/prefs/store.svelte';
  import { hashPin, verifyPin } from '$lib/lock/pin';
  import { createAttemptThrottle } from '$lib/lock/throttle';
  import { markUnlocked } from '$lib/stores/lock.svelte';
  import { resetApp } from '$lib/stores/boot.svelte';
  import { isAndroid } from '$lib/platform';
  import Icon from './Icon.svelte';
  import PrideAurora from './PrideAurora.svelte';
  import Sheet from './Sheet.svelte';

  let { mode = 'unlock', onDone }: { mode?: 'unlock' | 'setup'; onDone?: () => void } = $props();

  const PIN_LENGTH = 4;

  let pin = $state('');
  let chosen = $state('');
  let error = $state('');
  let busy = $state(false);
  let resetOpen = $state(false);
  let resetting = $state(false);
  let waitMs = $state(0);

  const throttle = createAttemptThrottle();
  let countdown: ReturnType<typeof setInterval> | null = null;

  let confirming = $derived(mode === 'setup' && chosen !== '');
  let android = $derived(isAndroid());

  function tickWait() {
    waitMs = throttle.remainingMs(Date.now());
    if (waitMs === 0 && countdown) {
      clearInterval(countdown);
      countdown = null;
    }
  }

  $effect(() => () => {
    if (countdown) clearInterval(countdown);
  });

  function press(key: string) {
    if (busy || waitMs > 0 || pin.length >= PIN_LENGTH) return;
    error = '';
    pin += key;
    if (pin.length === PIN_LENGTH) submit();
  }

  async function submit() {
    busy = true;
    try {
      if (mode === 'setup') await submitSetup();
      else await submitUnlock();
    } finally {
      busy = false;
    }
  }

  async function submitSetup() {
    if (!confirming) {
      chosen = pin;
      pin = '';
      return;
    }
    if (pin !== chosen) {
      error = 'Those two did not match. Start again.';
      chosen = '';
      pin = '';
      return;
    }
    prefs.pinHash = await hashPin(pin);
    prefs.appLock = true;
    pin = '';
    chosen = '';
    // The gate reads the same pinHash that was just written, so without
    // this the screen that set the PIN would be locked out by it.
    markUnlocked();
    onDone?.();
  }

  async function submitUnlock() {
    if (await verifyPin(pin, prefs.pinHash)) {
      throttle.reset();
      pin = '';
      markUnlocked();
      onDone?.();
      return;
    }

    throttle.recordWrong(Date.now());
    pin = '';
    error = 'That PIN is not right.';
    tickWait();
    if (waitMs > 0 && !countdown) countdown = setInterval(tickWait, 250);
  }

  async function confirmReset() {
    resetting = true;
    try {
      await resetApp();
    } catch (e) {
      resetting = false;
      resetOpen = false;
      error = `Could not reset: ${(e as Error).message}`;
    }
  }

  let title = $derived(
    mode === 'setup'
      ? confirming
        ? 'Type it once more'
        : 'Choose a PIN'
      : `Hi${prefs.name ? ', ' + prefs.name : ''}`
  );
</script>

<div class="screen">
  <PrideAurora />
  <div class="applock">
    <div class="applock-badge"><Icon name="lock" size={30} /></div>
    <h1 class="ob-title" style="text-align:center">{title}</h1>
    <p class="ob-text" style="text-align:center">
      {#if mode === 'setup'}
        {#if confirming}
          The same four digits again, so a slip of the thumb doesn’t lock you out.
        {:else}
          Four digits, asked for every time the app opens. It keeps the app shut to a casual look; what is on
          the device is not encrypted either way. Forget it and the only way back in is to reset the app and
          lose everything on here, so pick one you will remember.
        {/if}
      {:else}
        Enter your PIN to open your journal.
      {/if}
    </p>
    <div class="pin-dots" aria-label="PIN progress: {pin.length} of {PIN_LENGTH} digits">
      {#each Array.from({ length: PIN_LENGTH }) as _, i (i)}<span
          class="pin-dot"
          class:is-filled={i < pin.length}
        ></span>{/each}
    </div>
    <p class="pin-status small" role="alert" data-pin-status>
      {#if waitMs > 0}
        Too many wrong tries. Try again in {Math.ceil(waitMs / 1000)}s.
      {:else}{error}{/if}
    </p>
    <div class="pin-pad" class:is-waiting={waitMs > 0}>
      {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as n (n)}
        <button class="pin-key" data-key={n} disabled={waitMs > 0} onclick={() => press(n)}>{n}</button>
      {/each}
      {#if android && mode === 'unlock'}
        <!-- The Android shell fills this in; on web there is nothing behind
             it, so it stays out of the tab order entirely. -->
        <button class="pin-key is-ghost" data-bio aria-label="Unlock with biometrics" disabled>
          <Icon name="fingerprint" size={26} />
        </button>
      {:else}
        <span></span>
      {/if}
      <button class="pin-key" data-key="0" disabled={waitMs > 0} onclick={() => press('0')}>0</button>
      <button
        class="pin-key is-ghost"
        data-backspace
        aria-label="Delete digit"
        disabled={waitMs > 0}
        onclick={() => (pin = pin.slice(0, -1))}
      >
        <Icon name="backspace" size={24} />
      </button>
    </div>

    {#if mode === 'unlock'}
      <div style="text-align:center;margin-top:var(--space-6)">
        <button class="btn btn-ghost" data-forgot onclick={() => (resetOpen = true)}>
          <span>Forgotten your PIN?</span>
        </button>
      </div>
      {#if prefs.lockOnLeave || prefs.quickExit}
        <p class="muted small" style="text-align:center;margin-top:var(--space-3)">
          {prefs.lockOnLeave ? 'Locks automatically when the app goes to background. ' : ''}
          {prefs.quickExit ? 'Two-finger swipe down locks instantly.' : ''}
        </p>
      {/if}
    {/if}
  </div>
</div>

<Sheet bind:open={resetOpen} title="Forgotten your PIN?">
  <h3>Forgotten your PIN?</h3>
  <div class="notice notice-danger" style="margin-bottom:var(--space-4)">
    <Icon name="alert" size={20} />
    <div class="notice-body">
      <span class="notice-title">There is no way to recover it</span>
      The PIN is stored as a hash, so nobody, including this app, can read it back.
    </div>
  </div>
  <p class="ob-text">
    You can start over instead. That deletes every entry, photo and setting on this device and takes you back
    to the welcome screen. If you have an export file, you can restore from it afterwards.
  </p>
  <div class="stack-3" style="margin-top:var(--space-4)">
    <button class="btn btn-danger" data-confirm-reset disabled={resetting} onclick={confirmReset}>
      <span>{resetting ? 'Deleting…' : 'Delete everything and start over'}</span>
    </button>
    <button class="btn btn-ghost" disabled={resetting} onclick={() => (resetOpen = false)}>
      <span>Keep trying</span>
    </button>
  </div>
</Sheet>
