<script lang="ts">
  /* The Android side of the passphrase gate (ticket 13). Rendered by the
     layout instead of the app, like PassphraseGate and LockScreen, so no
     route shows journal content before there is a journal to show.

     Nothing is typed here: the data key is wrapped by a key Android Keystore
     holds and will not use until the platform says somebody authenticated
     (ADR-0018). So the screen is a prompt with a way back to it, and its real
     work is the ticket's third box - every refusal leaves something to do.
     `wayForward` on each outcome is where that comes from, and the buttons
     below are one per value of it, which is what keeps a state the platform
     grows tomorrow from arriving with no button at all.

     Copy rules, same as the passphrase gate's: this key IS the wall in front
     of the data, so the copy may say so. The lost-key screen is a risk screen
     (docs/ui-copy.md) and states the whole consequence before offering the
     one action there is. */

  import { m } from '$lib/paraglide/messages';
  import { bootState, openAndroidJournal, resetApp } from '$lib/stores/boot.svelte';
  import Icon from './Icon.svelte';
  import PrideAurora from './PrideAurora.svelte';
  import Sheet from './Sheet.svelte';

  let busy = $state(false);
  let resetOpen = $state(false);
  let resetting = $state(false);
  let resetError = $state('');

  let refusal = $derived(bootState.androidKey?.kind === 'refused' ? bootState.androidKey.authentication : null);
  let invalidated = $derived(bootState.androidKey?.kind === 'invalidated');

  async function authenticate(deviceCredential: boolean) {
    if (busy) return;
    busy = true;
    try {
      await openAndroidJournal({
        title: m.ak_prompt_title(),
        subtitle: m.ak_prompt_subtitle(),
        cancel: m.ak_prompt_cancel(),
        deviceCredential
      });
    } finally {
      busy = false;
    }
  }

  /* The prompt goes up by itself when the gate first appears, so the common
     case is one gesture rather than a tap and then a gesture. Once only, and
     guarded by a plain variable rather than by reading `busy`: an effect that
     reads what it writes re-runs itself until Svelte gives up, which is a
     mistake this codebase has already made once (boot.svelte.ts). */
  let asked = false;
  $effect(() => {
    if (asked) return;
    asked = true;
    void authenticate(false);
  });

  let explanation = $derived(
    refusal === null
      ? m.ak_unlock_body()
      : refusal.outcome === 'cancelled'
        ? m.ak_cancelled()
        : refusal.outcome === 'lockedOut'
          ? m.ak_locked_out()
          : refusal.outcome === 'unavailable'
            ? m.ak_unavailable()
            : refusal.outcome === 'unenrolled'
              ? m.ak_unenrolled()
              : m.ak_failed()
  );

  async function confirmReset() {
    resetting = true;
    try {
      await resetApp();
    } catch (e) {
      console.error('the app reset failed', e);
      resetting = false;
      resetOpen = false;
      resetError = m.reset_failed();
    }
  }
</script>

{#if invalidated}
  <!-- The one state with no way back into this journal (JournalKeystore's
       header says why the platform does this). A risk screen: the whole
       consequence, then the single action there is. -->
  <div class="screen">
    <PrideAurora />
    <div class="applock">
      <div class="applock-badge"><Icon name="alert" size={30} /></div>
      <h1 class="ob-title" style="text-align:center">{m.ak_invalidated_title()}</h1>
      <p class="ob-text" style="text-align:center" data-key-invalidated>{m.ak_invalidated_body()}</p>
      <div style="text-align:center;margin-top:var(--space-6)">
        <button class="btn btn-danger" data-open-reset onclick={() => (resetOpen = true)}>
          <span>{m.reset_confirm()}</span>
        </button>
      </div>
    </div>
  </div>
{:else if refusal?.wayForward === 'setDeviceLock'}
  <!-- No screen lock at all, so there is nothing for Keystore to bind a key
       to. The only screen here that asks for something outside the app, and
       the only one whose action is "look again". -->
  <div class="screen">
    <PrideAurora />
    <div class="applock">
      <div class="applock-badge"><Icon name="lock" size={30} /></div>
      <h1 class="ob-title" style="text-align:center">{m.ak_no_lock_title()}</h1>
      <p class="ob-text" style="text-align:center" data-needs-device-lock>{m.ak_no_lock_body()}</p>
      <div style="text-align:center;margin-top:var(--space-6)">
        <button class="btn btn-primary" data-check-again disabled={busy} onclick={() => authenticate(false)}>
          <span>{busy ? m.ak_unlocking() : m.ak_check_again()}</span>
        </button>
      </div>
    </div>
  </div>
{:else}
  <div class="screen">
    <PrideAurora />
    <div class="applock">
      <div class="applock-badge"><Icon name="fingerprint" size={30} /></div>
      <!-- No name in the greeting, for the same reason the passphrase gate
           has none: the display name lives in the encrypted journal, and this
           screen renders before it can be read. -->
      <h1 class="ob-title" style="text-align:center">{m.ak_unlock_title()}</h1>
      <!-- Polite rather than an alert: the prompt is Android's own dialog and
           takes the focus, so this line is what is waiting underneath when it
           goes, not something that interrupts. -->
      <p class="ob-text" style="text-align:center" aria-live="polite" data-key-status>{explanation}</p>

      <div class="stack-3" style="margin-top:var(--space-4)">
        {#if refusal === null || refusal.wayForward === 'retry'}
          <button class="btn btn-primary" data-key-retry disabled={busy} onclick={() => authenticate(false)}>
            <span>{busy ? m.ak_unlocking() : m.ak_unlock_action()}</span>
          </button>
        {/if}
        {#if refusal !== null}
          <!-- Offered after every refusal, not only after the ones whose way
               forward names it: a sensor that just said no is a reason to
               reach for the device credential whatever the reason was, and
               this is the button that is never wrong to have. -->
          <button
            class="btn"
            class:btn-primary={refusal.wayForward === 'deviceCredential'}
            class:btn-soft={refusal.wayForward !== 'deviceCredential'}
            data-key-device-credential
            disabled={busy}
            onclick={() => authenticate(true)}
          >
            <span>{m.ak_use_device_lock()}</span>
          </button>
        {/if}
      </div>

      <div style="text-align:center;margin-top:var(--space-6)">
        <button class="btn btn-ghost" data-forgot-key onclick={() => (resetOpen = true)}>
          <span>{m.ak_forgot()}</span>
        </button>
      </div>
      {#if resetError}
        <p class="pin-status small" role="alert" data-key-reset-failed>{resetError}</p>
      {/if}
    </div>
  </div>
{/if}

<Sheet bind:open={resetOpen} title={m.ak_forgot()}>
  <h3>{m.ak_forgot()}</h3>
  <div class="notice notice-danger" style="margin-bottom:var(--space-4)">
    <Icon name="alert" size={20} />
    <div class="notice-body">
      <span class="notice-title">{m.pp_forgot_no_recovery()}</span>
      {m.ak_forgot_key_note()}
    </div>
  </div>
  <p class="ob-text">{m.reset_offer_archive_password()}</p>
  <div class="stack-3" style="margin-top:var(--space-4)">
    <button class="btn btn-danger" data-confirm-reset disabled={resetting} onclick={confirmReset}>
      <span>{resetting ? m.reset_running() : m.reset_confirm()}</span>
    </button>
    <button class="btn btn-ghost" disabled={resetting} onclick={() => (resetOpen = false)}>
      <span>{m.reset_keep_trying()}</span>
    </button>
  </div>
</Sheet>
