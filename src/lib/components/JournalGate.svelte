<script lang="ts">
  /* Setup and unlock render before journal data can appear. Unsupported
     legacy storage reaches the same refusal screen without changing files. */

  import { m } from '$lib/paraglide/messages';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { appWordmark } from '$lib/disguise/identity';
  import {
    bootState,
    submitAccessModeSetup,
    submitPassphraseSetup,
    submitPassphraseUnlock,
    submitPinUnlock,
    submitBiometricUnlock,
    resetApp
  } from '$lib/stores/boot.svelte';
  import { passphraseMode, passphraseScreen } from '$lib/stores/boot-state';
  import { MIN_PASSPHRASE_LENGTH } from '$lib/data/journal-passphrase';
  import { DeviceBindingUnavailableError } from '$lib/data/device-secret';
  import GateScreen from './GateScreen.svelte';
  import RecoveryKeyEntry from './RecoveryKeyEntry.svelte';
  import { recoveryKeyPresence, refreshRecoveryKeyPresence } from '$lib/data/recoveryKeyPresence.svelte';
  import AccessModeSetup, { accessModeSetupErrorMessage, accessModeTitle, type AccessSetupMode } from './AccessModeSetup.svelte';
  import PinEntry, { type PinAttempt } from './PinEntry.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import { disclose } from '$lib/motion/reveal';

  let passphrase = $state('');
  let error = $state('');
  let busy = $state(false);
  let resetOpen = $state(false);
  let resetting = $state(false);
  let resetError = $state('');
  /* A failure belongs to the attempt it reports. Kept while the sheet is
     open, so a second failed press does not blink it out and back; let go
     once the sheet closes, so reopening starts clean. */
  $effect(() => {
    if (!resetOpen) resetError = '';
  });
  /* Which row of the module is open, so this gate's own title can name it
     rather than leaving "How should your journal open?" over a screen where
     that has already been answered. */
  let chosenMode = $state<AccessSetupMode | null>(null);
  /* Whether this journal has a recovery key, read once when the gate mounts
     (ADR-0054, ticket sec-02). Asked before anything is typed, because the
     entry must not be offered where there is none - a door onto nothing
     would send somebody looking for paper they never had. False until the
     read answers, so the way out appears rather than disappearing. */
  refreshRecoveryKeyPresence();
  let usingRecoveryKey = $state(false);

  let mode = $derived(passphraseMode(bootState));
  let screen = $derived(passphraseScreen(bootState));
  /** Which secret an unlock is asking for, read off the keystore rather than
      guessed: boot recorded it during the survey. */
  let unlockingPin = $derived(mode === 'unlock' && bootState.accessMode === 'pin');
  /** The one unlock with nothing to type: the platform's own prompt is the
      secret, and this screen is a button and a sentence around it. */
  let unlockingBiometric = $derived(mode === 'unlock' && bootState.accessMode === 'biometric');
  let choosingMode = $derived(mode === 'setup');

  /* Hoisted out of the template so its length can decide whether it is a
     line to centre or a paragraph to left-align (GateScreen). */
  let formBody = $derived(
    unlockingPin ? m.su_pin_body() : unlockingBiometric ? m.bm_unlock_body() : m.pp_unlock_body()
  );

  /* The way-out sheet says which secret is missing, and biometric mode has
     none to have forgotten - what it has is a device that will not answer.
     One derived value rather than the same conditional in three places: the
     sheet's title, its heading and the button that opens it have to agree,
     and the button already said "Forgotten your PIN?" over a sheet that said
     passphrase. */
  let wayOut = $derived(
    unlockingPin ? m.pin_forgot() : unlockingBiometric ? m.bm_no_way_in() : m.pp_forgot()
  );

  /* The wordmark on the unlock, its own words on the four screens that are
     not one - GateScreen.svelte argues both, for all six gates at once. This
     gate can never greet by name: it renders before the journal the name
     lives in can be read. */
  let gateTitle = $derived(
    choosingMode
      ? chosenMode === null ? m.am_setup_title() : accessModeTitle(chosenMode)
      : appWordmark(prefs.disguise, m.app_name(), m.disguise_name())
  );

  /** The setup module's answer, wired through boot.svelte.ts's own submit
      path (ticket 54: onboarding's lock step hands a chosen mode to the same
      function, so the mapping from a mode to a submit call and a failure
      lives in one place rather than two). Device-bound mode is the one that
      can be refused by the platform rather than by the person, so it is the
      one with an outcome besides ok or a throw to render. */
  async function choose(chosen: AccessSetupMode, secret: string) {
    if (busy) return;
    busy = true;
    error = '';
    const result = await submitAccessModeSetup(chosen, secret);
    busy = false;
    if (result !== 'ok') error = accessModeSetupErrorMessage(result);
  }

  async function submitPassphrase(event: SubmitEvent) {
    event.preventDefault();
    if (busy || mode === null) return;
    error = '';

    if (mode === 'setup') {
      if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
        error = m.pp_too_short({ min: String(MIN_PASSPHRASE_LENGTH) });
        return;
      }
    }

    busy = true;
    try {
      if (mode === 'setup') await submitPassphraseSetup(passphrase);
      else await submitPassphraseUnlock(passphrase);
      passphrase = '';
    } catch {
      // DecryptionFailedError, deliberately undiagnosed (see header).
      error = m.pp_wrong();
    } finally {
      busy = false;
    }
  }

  /* PinEntry owns the pad, the growing delay and the status line; this only
     has to say what an attempt came to. The device-key failure is reported
     rather than thrown away because it is the one outcome retyping cannot
     fix, and PinEntry keeps it off the throttle for the same reason. */
  async function submitPin(entered: string): Promise<PinAttempt> {
    try {
      await submitPinUnlock(entered);
      return 'ok';
    } catch (e) {
      return e instanceof DeviceBindingUnavailableError ? 'device-gone' : 'wrong';
    }
  }

  /* No throttle and no attempt count: the authenticator does its own, and
     there is nothing here a person could get wrong twice. */
  async function useBiometric() {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await submitBiometricUnlock();
    } catch (e) {
      console.error('the biometric unlock failed', e);
      error = m.bm_unlock_failed();
    } finally {
      busy = false;
    }
  }

  async function confirmReset() {
    resetting = true;
    try {
      await resetApp();
    } catch (e) {
      console.error('the app reset failed', e);
      resetting = false;
      resetError = m.reset_failed();
    }
  }
</script>

{#if usingRecoveryKey}
  <!-- Instead of the gate, not over it: the same rule the layout follows for
       the gates themselves, so there is one screen at a time and no field
       behind this one holding a half-typed secret. -->
  <RecoveryKeyEntry onBack={() => (usingRecoveryKey = false)} />
{:else if screen === 'legacy-refused'}
  <GateScreen title={m.pp_legacy_refused_title()}>
    <p class="gate-body" data-legacy-refusal>{m.pp_legacy_refused_body()}</p>
  </GateScreen>
{:else if screen === 'form'}
  <GateScreen title={gateTitle}>
    {#if choosingMode}
      <AccessModeSetup purpose="setup" {busy} {error} onChoose={choose} bind:chosen={chosenMode} />
    {:else}
      <p class="gate-body">{formBody}</p>

      {#if unlockingPin}
        <PinEntry onVerify={submitPin} />
      {:else if unlockingBiometric}
        <div class="gate-actions">
          <button class="btn btn-primary" data-biometric-submit disabled={busy} onclick={useBiometric}>
            <span>{busy ? m.pp_decrypting() : m.bm_unlock_action()}</span>
          </button>
        </div>
        <p class="pin-status small" role="alert" data-passphrase-status>{error}</p>
      {:else}
        <form class="gate-form" onsubmit={submitPassphrase}>
          <!-- A typed answer sits on the rule (rule 13), and a passphrase is
               that shape with its characters hidden. The same drawing setup's
               name step wears; `.typed` is what draws the rule in from the
               left on focus. -->
          <div class="typed">
            <label class="field-label" for="journal-passphrase">
              {mode === 'setup' ? m.pp_label_setup() : m.pp_label_unlock()}
            </label>
            <input
              class="rule-input"
              type="password"
              id="journal-passphrase"
              name="passphrase"
              autocomplete={mode === 'setup' ? 'new-password' : 'current-password'}
              bind:value={passphrase}
              disabled={busy}
            />
          </div>
          <p class="pin-status small" role="alert" data-passphrase-status>{error}</p>
          <button class="btn btn-primary" type="submit" data-passphrase-submit disabled={busy}>
            <span>
              {#if busy}{mode === 'setup' ? m.pp_encrypting() : m.pp_decrypting()}
              {:else if mode === 'setup'}{m.pp_submit_setup()}
              {:else}{m.pp_submit_unlock()}{/if}
            </span>
          </button>
        </form>
      {/if}

      {#if mode === 'unlock'}
        <div class="gate-foot">
          <!-- Not the primary action and not styled like one: this is the
               door somebody looks for after the first one failed, so it sits
               with the way out rather than competing with the field above. -->
          {#if recoveryKeyPresence.exists}
            <button class="btn btn-ghost" data-use-recovery-key onclick={() => (usingRecoveryKey = true)}>
              <span>{m.rke_open()}</span>
            </button>
          {/if}
          <button class="btn btn-ghost" data-forgot-passphrase onclick={() => (resetOpen = true)}>
            <span>{wayOut}</span>
          </button>
        </div>
      {/if}
    {/if}
  </GateScreen>
{/if}

<Sheet bind:open={resetOpen} title={wayOut}>
  <h3>{wayOut}</h3>
  <div class="notice notice-danger" style="margin-bottom:var(--space-4)">
    <Icon name="alert" size={20} />
    <div class="notice-body">
      <!-- "There is no way to recover it" is false on a journal that has a
           recovery key, and this sheet is the one place it was being said in
           front of a reset (ADR-0054). Where one exists the notice points at
           it instead, because the alternative is telling somebody to delete
           a journal they could still open. -->
      <!-- The no-recovery line only once it is known to be true. This sheet
           sits in front of a reset, so a sentence that is briefly wrong here
           is a sentence that tells somebody to delete a journal they could
           still open. -->
      {#if recoveryKeyPresence.known}
        <span class="notice-title"
          >{recoveryKeyPresence.exists ? m.dbr_recovery_offer() : m.pp_forgot_no_recovery()}</span
        >
      {/if}
      <!-- The gate's own notes, not the mid-session ones: those send
           somebody to reopen the app for the recovery key, and this gate
           already offers it beside the button that opened this sheet
           (after-release ticket 09). -->
      {unlockingPin
        ? m.pin_forgot_gate_note()
        : unlockingBiometric
          ? m.bm_forgot_gate_note()
          : m.pp_forgot_gate_note()}
    </div>
  </div>
  <p class="ob-text">{m.reset_offer_archive_password()}</p>
  {#if resetError}
    <!-- In the sheet, which stays open: the sheet is where the button was
         pressed, and closing it on a failure left the gate looking as if
         nothing had happened (after-release ticket 09). -->
    <p class="reset-failed small" role="alert" data-reset-failed transition:disclose>{resetError}</p>
  {/if}
  <div class="stack-3" style="margin-top:var(--space-4)">
    <button class="btn btn-danger" data-confirm-reset disabled={resetting} onclick={confirmReset}>
      <span>{resetting ? m.reset_running() : m.reset_confirm()}</span>
    </button>
    <button class="btn btn-ghost" disabled={resetting} onclick={() => (resetOpen = false)}>
      <span>{m.reset_keep_trying()}</span>
    </button>
  </div>
</Sheet>
