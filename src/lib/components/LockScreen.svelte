<script lang="ts">
  /* The PIN pad, in both of its jobs: the gate the layout renders instead
     of the app (ticket 17), and the setup flow reached from Settings and
     from onboarding. One component, because the keypad, the throttle and
     the reset action are the same in both and had already drifted once
     when they were two.

     Copy rule for this screen (ADR-0014): the PIN keeps the app shut, it
     does not encrypt anything. Nothing here may suggest otherwise. */

  import { m } from '$lib/paraglide/messages';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { hashPin, verifyPin } from '$lib/lock/pin';
  import { localStorageAttempts } from '$lib/lock/attempt-store';
  import { createAttemptThrottle } from '$lib/lock/throttle';
  import { markUnlocked } from '$lib/stores/lock.svelte';
  import { resetApp } from '$lib/stores/boot.svelte';
  import { confirmWithBiometrics } from '$lib/lock/android-key';
  import { androidKeystore } from '$lib/lock/keystore-bridge';
  import { bioGateDecision } from '$lib/lock/bio-consent';
  import { isAndroid } from '$lib/platform';
  import Icon from './Icon.svelte';
  import PrideAurora from './PrideAurora.svelte';
  import Sheet from './Sheet.svelte';

  /* onCancel is what makes setup optional: without it, a toggle flipped by
     mistake ends on a chromeless screen whose only other button deletes
     everything. The gate itself passes neither prop - there is nothing to
     cancel back to. */
  let {
    mode = 'unlock',
    onDone,
    onCancel
  }: { mode?: 'unlock' | 'setup'; onDone?: () => void; onCancel?: () => void } = $props();

  const PIN_LENGTH = 4;

  let pin = $state('');
  let chosen = $state('');
  let error = $state('');
  let busy = $state(false);
  let resetOpen = $state(false);
  let resetting = $state(false);
  let waitMs = $state(0);
  let bioConsentOpen = $state(false);

  const throttle = createAttemptThrottle(localStorageAttempts());
  let countdown: ReturnType<typeof setInterval> | null = null;

  let confirming = $derived(mode === 'setup' && chosen !== '');
  let android = $derived(isAndroid());
  let bioDecision = $derived(bioGateDecision(prefs.bioOptIn));

  /* First time this gate shows on Android with a PIN already set, whether
     that PIN was just chosen or has existed since before this ticket - the
     rule is "first encounter", not "right after setup", so an existing
     PIN-lock user meets the ask on their next lock rather than never (ticket
     18). Once only per mount, same reasoning as AndroidKeyGate's own guard. */
  let bioAsked = false;
  $effect(() => {
    if (bioAsked || mode !== 'unlock' || !android) return;
    bioAsked = true;
    if (bioDecision === 'ask') bioConsentOpen = true;
  });

  function answerBioConsent(optIn: boolean) {
    prefs.bioOptIn = optIn;
    bioConsentOpen = false;
  }

  /* These write `waitMs` and never read it. An effect that reads it would
     re-run on every tick of the interval it started, tear that interval
     down and, holding a handle it no longer owns, decline to start
     another - which is how the countdown froze at the first second. */
  function stopCountdown() {
    if (countdown) clearInterval(countdown);
    countdown = null;
  }

  function tickWait() {
    const remaining = throttle.remainingMs(Date.now());
    waitMs = remaining;
    if (remaining === 0) stopCountdown();
  }

  function startCountdown() {
    const remaining = throttle.remainingMs(Date.now());
    waitMs = remaining;
    if (remaining > 0 && !countdown) countdown = setInterval(tickWait, 250);
  }

  /* A wait the last page load earned is still owed - reloading is the
     cheapest thing a guesser can do. Setup never asks: nothing there is
     being guessed at. */
  $effect(() => {
    if (mode === 'unlock') startCountdown();
    return stopCountdown;
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
      error = m.pin_mismatch();
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
    error = m.pin_wrong();
    startCountdown();
  }

  /* The biometric key on the pad (ticket 13). Nothing cryptographic happens
     here and nothing should: this gate is reached mid-session, so the data
     key is already unwrapped and in memory, and app lock is a casual-access
     layer rather than an encryption credential (ADR-0014). The prompt is
     asking the platform the same question the four digits beside it ask.

     Only an explicit success unlocks. Every other outcome puts a line on the
     status row and leaves the pad exactly where it was, which is the way
     forward here - there is always one, because the PIN never went away. */
  async function useBiometrics() {
    if (busy || waitMs > 0) return;
    busy = true;
    error = '';
    try {
      const result = await confirmWithBiometrics(androidKeystore, {
        title: m.ak_prompt_title(),
        subtitle: m.ak_prompt_subtitle(),
        cancel: m.ak_prompt_cancel(),
        deviceCredential: false
      });
      if (result.unlocksJournal) {
        markUnlocked();
        onDone?.();
        return;
      }
      /* Not counted against the PIN throttle: it throttles guesses at a
         four-digit number, and a finger the sensor did not recognise is not
         one. The platform does its own rate limiting, which is where
         `lockedOut` comes from. */
      error =
        result.outcome === 'unenrolled' ? m.ak_unenrolled()
        : result.outcome === 'unavailable' ? m.ak_unavailable()
        : result.outcome === 'lockedOut' ? m.ak_locked_out()
        : result.outcome === 'cancelled' ? m.ak_cancelled()
        : m.ak_failed();
    } catch (e) {
      console.error('the biometric prompt failed', e);
      error = m.ak_failed();
    } finally {
      busy = false;
    }
  }

  async function confirmReset() {
    resetting = true;
    try {
      await resetApp();
    } catch (e) {
      // The reason belongs in the console, not on a lock screen: "could
      // not remove entry" tells the person holding the phone nothing they
      // can act on.
      console.error('the app reset failed', e);
      resetting = false;
      resetOpen = false;
      error = m.reset_failed();
    }
  }

  let title = $derived(
    mode === 'setup'
      ? confirming
        ? m.pin_again_title()
        : m.pin_choose_title()
      : prefs.name
        ? m.pin_greeting_named({ name: prefs.name })
        : m.pin_greeting()
  );
</script>

<div class="screen">
  <PrideAurora />
  <div class="applock">
    <div class="applock-badge"><Icon name="lock" size={30} /></div>
    <h1 class="ob-title" style="text-align:center">{title}</h1>
    <p class="ob-text" style="text-align:center">
      {#if mode === 'setup'}
        {#if confirming}{m.pin_confirm_body()}{:else}{m.pin_setup_body()}{/if}
      {:else}
        {m.pin_unlock_body()}
      {/if}
    </p>
    <div class="pin-dots" aria-label={m.pin_progress({ typed: String(pin.length), total: String(PIN_LENGTH) })}>
      {#each Array.from({ length: PIN_LENGTH }) as _, i (i)}<span
          class="pin-dot"
          class:is-filled={i < pin.length}
        ></span>{/each}
    </div>
    <p class="pin-status small" role="alert" data-pin-status>
      {#if waitMs > 0}
        {m.pin_throttled({ seconds: String(Math.ceil(waitMs / 1000)) })}
      {:else}{error}{/if}
    </p>
    <div class="pin-pad" class:is-waiting={waitMs > 0}>
      {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as n (n)}
        <button class="pin-key" data-key={n} disabled={waitMs > 0} onclick={() => press(n)}>{n}</button>
      {/each}
      {#if android && mode === 'unlock' && bioDecision === 'auto'}
        <!-- Only on Android, where there is a prompt behind it (ticket 13);
             on web there is nothing, so it stays out of the tab order
             entirely. Throttled with the digits: a wait the PIN earned is not
             one a fingerprint gets to skip. Gone entirely rather than merely
             inert when consent is missing (ticket 18) - unlike the boot
             gate, a PIN always works underneath, so there is nothing this
             key needs to wait behind. -->
        <button
          class="pin-key is-ghost"
          data-bio
          aria-label={m.pin_bio_label()}
          disabled={busy || waitMs > 0}
          onclick={useBiometrics}
        >
          <Icon name="fingerprint" size={26} />
        </button>
      {:else}
        <span></span>
      {/if}
      <button class="pin-key" data-key="0" disabled={waitMs > 0} onclick={() => press('0')}>0</button>
      <button
        class="pin-key is-ghost"
        data-backspace
        aria-label={m.pin_backspace()}
        disabled={waitMs > 0}
        onclick={() => (pin = pin.slice(0, -1))}
      >
        <Icon name="backspace" size={24} />
      </button>
    </div>

    {#if mode === 'setup' && onCancel}
      <div style="text-align:center;margin-top:var(--space-6)">
        <button class="btn btn-ghost" data-cancel-setup onclick={onCancel}>
          <span>{m.not_now()}</span>
        </button>
      </div>
    {/if}

    {#if mode === 'unlock'}
      <div style="text-align:center;margin-top:var(--space-6)">
        <button class="btn btn-ghost" data-forgot onclick={() => (resetOpen = true)}>
          <span>{m.pin_forgot()}</span>
        </button>
      </div>
      {#if prefs.lockOnLeave || prefs.quickExit}
        <p class="muted small" style="text-align:center;margin-top:var(--space-3)">
          {prefs.lockOnLeave ? m.lock_auto_note() + ' ' : ''}
          {prefs.quickExit ? m.lock_quick_exit_note() : ''}
        </p>
      {/if}
    {/if}
  </div>
</div>

<Sheet bind:open={resetOpen} title={m.pin_forgot()}>
  <h3>{m.pin_forgot()}</h3>
  <div class="notice notice-danger" style="margin-bottom:var(--space-4)">
    <Icon name="alert" size={20} />
    <div class="notice-body">
      <span class="notice-title">{m.pin_forgot_no_recovery()}</span>
      {m.pin_forgot_hash_note()}
    </div>
  </div>
  <p class="ob-text">{m.reset_offer()}</p>
  <div class="stack-3" style="margin-top:var(--space-4)">
    <button class="btn btn-danger" data-confirm-reset disabled={resetting} onclick={confirmReset}>
      <span>{resetting ? m.reset_running() : m.reset_confirm()}</span>
    </button>
    <button class="btn btn-ghost" disabled={resetting} onclick={() => (resetOpen = false)}>
      <span>{m.reset_keep_trying()}</span>
    </button>
  </div>
</Sheet>

<Sheet bind:open={bioConsentOpen} title={m.bio_ask_pin_title()}>
  <h3>{m.bio_ask_pin_title()}</h3>
  <p class="ob-text">{m.bio_ask_pin_body()}</p>
  <div class="stack-3" style="margin-top:var(--space-4)">
    <button class="btn btn-primary" data-bio-consent-yes onclick={() => answerBioConsent(true)}>
      <span>{m.bio_ask_pin_yes()}</span>
    </button>
    <button class="btn btn-ghost" data-bio-consent-no onclick={() => answerBioConsent(false)}>
      <span>{m.not_now()}</span>
    </button>
  </div>
</Sheet>
