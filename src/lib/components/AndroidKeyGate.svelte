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
     one action there is.

     The prompt firing by itself used to be unconditional (ticket 18's first
     finding: nobody was ever asked). It still has to fire eventually - a
     device-bound key can only be unwrapped by the platform saying who is
     here, and that stays true whatever `bioOptIn` says (out of scope: the
     crypto). Consent only decides whether it fires the moment this screen
     mounts, or waits behind the primary button below, which already existed
     and was simply redundant with the auto-fire before this. */

  import { m } from '$lib/paraglide/messages';
  import { bootState, openAndroidJournal, resetApp } from '$lib/stores/boot.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { bioGateDecision } from '$lib/lock/bio-consent';
  import GateScreen, { gateBodyClass } from './GateScreen.svelte';
  import RecoveryKeyEntry from './RecoveryKeyEntry.svelte';
  import { recoveryKeyPresence, refreshRecoveryKeyPresence } from '$lib/data/recoveryKeyPresence.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';

  let busy = $state(false);
  let resetOpen = $state(false);
  let resetting = $state(false);
  let resetError = $state('');
  /* Read once on mount, like the web gate's (ADR-0054, ticket sec-02). It
     matters more here: the invalidated screen below is the state
     JournalKeystore.java calls the cliff, and a recovery key is the one
     thing that gets a journal back off it. */
  refreshRecoveryKeyPresence();
  let usingRecoveryKey = $state(false);
  /* "There is no way to bring it back" is true of the Keystore alias and
     false about the journal once a recovery key exists, and this screen is
     the one that says it hardest. One body per state. */
  let invalidatedBody = $derived(
    recoveryKeyPresence.exists ? m.ak_invalidated_body_recoverable() : m.ak_invalidated_body()
  );
  let consentOpen = $state(false);

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

  function answerConsent(optIn: boolean) {
    prefs.bioOptIn = optIn;
    consentOpen = false;
    if (optIn) void authenticate(false);
  }

  /* Once only, and guarded by a plain variable rather than by reading
     `busy`: an effect that reads what it writes re-runs itself until Svelte
     gives up, which is a mistake this codebase has already made once
     (boot.svelte.ts). Never answered asks first, rather than firing or
     waiting - answering is what the other two decisions are for. */
  let asked = false;
  $effect(() => {
    if (asked) return;
    asked = true;
    const decision = bioGateDecision(prefs.bioOptIn);
    if (decision === 'auto') void authenticate(false);
    else if (decision === 'ask') consentOpen = true;
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

{#if usingRecoveryKey}
  <RecoveryKeyEntry onBack={() => (usingRecoveryKey = false)} />
{:else if invalidated}
  <!-- The state JournalKeystore.java calls the cliff: the platform destroyed
       the key when the screen lock came off, and this file has nothing left
       to give. Until ADR-0054 that made it the one state with no way back
       into the journal, and the screen offered a reset and nothing else.
       A recovery key is a different file that no alias is involved in, so
       where one exists the way back goes first and the reset stops being the
       only thing on offer. -->
  <GateScreen icon="alert" tone="alert" title={m.ak_invalidated_title()}>
    <!-- Held back until the answer is in, for the reason
         DeviceBoundRecovery states: this body is the harder of the two to
         be wrong about, since it tells somebody their journal is gone. -->
    {#if recoveryKeyPresence.known}
      <p class={gateBodyClass(invalidatedBody)} data-key-invalidated>{invalidatedBody}</p>
    {/if}
    {#if recoveryKeyPresence.exists}
      <div class="gate-actions">
        <button class="btn btn-primary" data-use-recovery-key onclick={() => (usingRecoveryKey = true)}>
          <span>{m.rke_open()}</span>
        </button>
      </div>
    {/if}
    <div class="gate-actions">
      <button class="btn btn-danger" data-open-reset onclick={() => (resetOpen = true)}>
        <span>{m.reset_confirm()}</span>
      </button>
    </div>
  </GateScreen>
{:else if refusal?.wayForward === 'setDeviceLock'}
  <!-- No screen lock at all, so there is nothing for Keystore to bind a key
       to. The only screen here that asks for something outside the app, and
       the only one whose action is "look again". -->
  <GateScreen icon="lock" title={m.ak_no_lock_title()}>
    <p class={gateBodyClass(m.ak_no_lock_body())} data-needs-device-lock>{m.ak_no_lock_body()}</p>
    <div class="gate-actions">
      <button class="btn btn-primary" data-check-again disabled={busy} onclick={() => authenticate(false)}>
        <span>{busy ? m.ak_unlocking() : m.ak_check_again()}</span>
      </button>
    </div>
  </GateScreen>
{:else}
  <!-- No name in the greeting, for the same reason the passphrase gate has
       none: the display name lives in the encrypted journal, and this screen
       renders before it can be read. -->
  <GateScreen icon="fingerprint" title={m.ak_unlock_title()}>
    <!-- Polite rather than an alert: the prompt is Android's own dialog and
         takes the focus, so this line is what is waiting underneath when it
         goes, not something that interrupts. -->
    <p class={gateBodyClass(explanation)} aria-live="polite" data-key-status>{explanation}</p>

    <div class="gate-actions">
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

    <div class="gate-foot">
      {#if recoveryKeyPresence.exists}
        <button class="btn btn-ghost" data-use-recovery-key onclick={() => (usingRecoveryKey = true)}>
          <span>{m.rke_open()}</span>
        </button>
      {/if}
      <button class="btn btn-ghost" data-forgot-key onclick={() => (resetOpen = true)}>
        <span>{m.ak_forgot()}</span>
      </button>
      {#if resetError}
        <p class="pin-status small" role="alert" data-key-reset-failed>{resetError}</p>
      {/if}
    </div>
  </GateScreen>
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

<Sheet bind:open={consentOpen} title={m.bio_ask_boot_title()}>
  <h3>{m.bio_ask_boot_title()}</h3>
  <p class="ob-text">{m.bio_ask_boot_body()}</p>
  <div class="stack-3" style="margin-top:var(--space-4)">
    <button class="btn btn-primary" data-bio-consent-yes onclick={() => answerConsent(true)}>
      <span>{m.bio_ask_boot_yes()}</span>
    </button>
    <button class="btn btn-ghost" data-bio-consent-no onclick={() => answerConsent(false)}>
      <span>{m.bio_ask_boot_no()}</span>
    </button>
  </div>
</Sheet>
