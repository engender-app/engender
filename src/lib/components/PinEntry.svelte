<script lang="ts">
  /* Typing a PIN at a gate: the pad, the growing delay, and the one status
     line the three outcomes share (ticket 53).

     Two surfaces ask for a PIN and both are places somebody could be
     guessing at four digits: the cold start, where the journal has not been
     opened yet, and the mid-session lock, where it has. The throttle has to
     be on both. It was on neither for a moment during this ticket - the pad
     went in first and the delay only came with the mid-session screen - which
     is exactly the gap this component exists to make impossible.

     What the throttle is and is not. Ten thousand candidates typed by hand is
     what it prices out, and it does that well. It is worth nothing against
     the offline attack, because that one never loads this code
     (data/device-secret.ts explains what covers that instead). So this is a
     real defence against a real attacker, and not the reason four digits are
     allowed to encrypt.

     Choosing a PIN does not come through here. Nothing is being guessed at
     when a PIN is being picked, so AccessModeSetup mounts the bare pad. */

  import { m } from '$lib/paraglide/messages';
  import { isAndroid } from '$lib/platform';
  import { localStorageAttempts } from '$lib/lock/attempt-store';
  import { createPinThrottle } from '$lib/lock/pin-throttle';
  import { pinWaitSpeech } from '$lib/lock/pin-wait-speech';
  import { announce } from '$lib/stores/announcer.svelte';
  import type { Snippet } from 'svelte';
  import PinPad from './PinPad.svelte';

  /** What the caller's attempt came to. `device-gone` is PIN mode's own
      failure: this browser has lost the key the PIN was bound to, so the PIN
      is not wrong and retyping will never help. `unopened`: the PIN was
      right but the journal would not open again after a web lock
      (after-release ticket 10); not counted as a guess either. */
  export type PinAttempt = 'ok' | 'wrong' | 'device-gone' | 'unopened';

  let {
    onVerify,
    /** Android's biometric key, where there is a prompt behind it. */
    aux,
    statusHandle = 'data-pin-status'
  }: {
    onVerify: (pin: string) => Promise<PinAttempt>;
    aux?: Snippet;
    statusHandle?: string;
  } = $props();

  let pin = $state('');
  let error = $state('');
  let busy = $state(true);
  /** Set once an attempt let the person in; nothing resets the pad after. */
  let opening = false;
  let refusals = $state(0);
  let waitMs = $state(0);
  /** The whole wait, taken the moment it starts, so the rail under the status
      line can draw the share of it that is left. Read off the throttle's
      first reading rather than added to its API: the countdown always begins
      at the top of a penalty, so its first reading is the penalty. */
  let waitTotalMs = $state(0);

  let throttle: Awaited<ReturnType<typeof createPinThrottle>> | null = null;
  let countdown: ReturnType<typeof setInterval> | null = null;

  /* These write `waitMs` and never read it. An effect that reads it would
     re-run on every tick of the interval it started, tear that interval down
     and, holding a handle it no longer owns, decline to start another - which
     is how the countdown froze at the first second. */
  function stopCountdown() {
    if (countdown) clearInterval(countdown);
    countdown = null;
  }

  /* The line under the pad redraws the seconds every tick and is not a live
     region; only the wait starting and the wait ending are said, as an
     interruption and then politely (after-release 21). */
  function setWait(remaining: number) {
    const said = pinWaitSpeech(waitMs, remaining);
    waitMs = remaining;
    if (said === 'start') announce(m.pin_throttled({ seconds: String(Math.ceil(remaining / 1000)) }), true);
    else if (said === 'end') announce(m.pin_wait_over());
  }

  /** An error is drawn on the status line and said once, here. */
  function fail(message: string) {
    error = message;
    announce(message, true);
  }

  function tickWait() {
    const remaining = throttle?.remainingMs(Date.now()) ?? 0;
    setWait(remaining);
    if (remaining === 0) stopCountdown();
  }

  function startCountdown() {
    const remaining = throttle?.remainingMs(Date.now()) ?? 0;
    setWait(remaining);
    if (remaining > 0 && !countdown) {
      waitTotalMs = remaining;
      countdown = setInterval(tickWait, 250);
    }
  }

  /* A wait the last page load earned is still owed: reloading is the cheapest
     thing a guesser can do, so the count outlives the page rather than the
     attempt. */
  $effect(() => {
    let mounted = true;
    void createPinThrottle(localStorageAttempts()).then((ready) => {
      if (!mounted) return;
      throttle = ready;
      startCountdown();
      busy = false;
    }).catch(() => { if (mounted) fail(m.ak_failed()); });
    return () => { mounted = false; stopCountdown(); };
  });

  async function submit(entered: string) {
    if (busy || !throttle || throttle.remainingMs(Date.now()) > 0) return;
    busy = true;
    error = '';
    try {
      const outcome = await onVerify(entered);
      if (outcome === 'ok') {
        /* The pad stays as it is, full and disabled, while the gate leaves:
           emptying it and enabling it again painted for a frame or two
           before the opening took the screen (after-release ticket 10). */
        opening = true;
        await throttle.reset();
        return;
      }
      pin = '';
      if (outcome === 'unopened') {
        fail(m.su_reopen_failed());
        return;
      }
      if (outcome === 'device-gone') {
        /* Not counted against the throttle: nothing was guessed and no
           number of tries would get anywhere. */
        /* Two sentences for one state, because the key is in two different
           places: the browser's own store on the web, and Android Keystore
           on a phone (ticket sec-02-06). "This browser" on a phone would be
           telling somebody about a store their PIN was never bound to. */
        fail(isAndroid() ? m.su_device_key_gone_android() : m.su_device_key_gone());
        return;
      }
      await throttle.recordWrong(Date.now());
      error = m.pin_wrong();
      refusals++;
      startCountdown();
      /* A wrong PIN that starts a wait is said by the wait, which names the
         seconds as well. */
      if (waitMs === 0) announce(error, true);
    } finally {
      if (!opening) busy = false;
    }
  }
</script>

<PinPad bind:value={pin} disabled={busy || waitMs > 0} {refusals} onComplete={submit} {aux} />

{#if waitMs > 0}
  <!-- The seconds on the line below are the information; this is their shape.
       Keyed on the total so a second penalty restarts the drain rather than
       continuing the first one's. -->
  {#key waitTotalMs}
    <div class="rail pin-wait" aria-hidden="true"><i style={`--wait:${waitTotalMs}ms`}></i></div>
  {/key}
{/if}

<p class="pin-status small" {...{ [statusHandle]: waitMs > 0 ? 'throttled' : error ? 'wrong' : 'idle' }}>
  {#if waitMs > 0}
    {m.pin_throttled({ seconds: String(Math.ceil(waitMs / 1000)) })}
  {:else}{error}{/if}
</p>
